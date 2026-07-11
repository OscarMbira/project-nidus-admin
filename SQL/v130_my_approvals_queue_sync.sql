-- ============================================================================
-- v130: My Approvals queue sync and visibility fix
-- PostgreSQL 15+ / Supabase
-- Plan: fix empty My Approvals when records are unauthorised with pending changes
-- Prerequisites: v123-v124 (record_pending_changes, defer-apply functions)
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.sync_authorisation_requests_from_pending()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_inserted INTEGER := 0;
    v_batch_inserted INTEGER;
    v_first_level INTEGER;
    v_row RECORD;
BEGIN
    FOR v_row IN
        SELECT
            pc.table_name,
            pc.record_id,
            pc.root_record_id,
            pc.submission_batch_id,
            pc.submitted_by,
            pc.submitted_at
        FROM admin.record_pending_changes pc
    LOOP
        SELECT MIN(ra.approval_level)
        INTO v_first_level
        FROM admin.record_authorisers ra
        WHERE ra.table_name = v_row.table_name
          AND ra.is_active = TRUE;

        IF v_first_level IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO admin.record_authorisation_requests (
            table_name,
            root_record_id,
            record_id,
            submission_batch_id,
            submitted_by,
            authoriser_id,
            approval_level,
            role_label,
            status,
            submission_notes,
            submitted_at,
            activated_at
        )
        SELECT
            v_row.table_name,
            v_row.root_record_id,
            v_row.record_id,
            v_row.submission_batch_id,
            v_row.submitted_by,
            ra.authoriser_admin_user_id,
            ra.approval_level,
            ra.role_label,
            CASE WHEN ra.approval_level = v_first_level THEN 'pending' ELSE 'waiting' END,
            'Synced from pending changes queue',
            COALESCE(v_row.submitted_at, NOW()),
            CASE WHEN ra.approval_level = v_first_level THEN COALESCE(v_row.submitted_at, NOW()) ELSE NULL END
        FROM admin.record_authorisers ra
        WHERE ra.table_name = v_row.table_name
          AND ra.is_active = TRUE
          AND NOT EXISTS (
              SELECT 1
              FROM admin.record_authorisation_requests ar
              WHERE ar.table_name = v_row.table_name
                AND ar.record_id = v_row.record_id
                AND ar.authoriser_id = ra.authoriser_admin_user_id
                AND ar.status IN ('pending', 'waiting')
          );

        GET DIAGNOSTICS v_batch_inserted = ROW_COUNT;
        v_inserted := v_inserted + v_batch_inserted;
    END LOOP;

    RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION admin.summarise_pending_changes(p_changes JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_summary TEXT;
BEGIN
    IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
        RETURN NULL;
    END IF;

    SELECT string_agg(format('%s → %s', key, value #>> '{}'), '; ' ORDER BY key)
    INTO v_summary
    FROM jsonb_each(p_changes);

    RETURN NULLIF(v_summary, '');
END;
$$;

DROP FUNCTION IF EXISTS admin.list_pending_authorisation_requests(UUID);

CREATE OR REPLACE FUNCTION admin.list_pending_authorisation_requests(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    request_id UUID,
    submission_batch_id UUID,
    table_name TEXT,
    root_record_id UUID,
    record_id UUID,
    approval_level INTEGER,
    role_label TEXT,
    submitted_by UUID,
    authoriser_id UUID,
    status TEXT,
    submission_notes TEXT,
    submitted_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    record_label TEXT,
    change_summary TEXT,
    assigned_to_me BOOLEAN,
    can_decide BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_is_configure BOOLEAN := FALSE;
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT (
        admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure')
    ) THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.authorise or lifecycle.configure required';
    END IF;

    v_is_configure := admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure');

    PERFORM admin.sync_authorisation_requests_from_pending();

    RETURN QUERY
    SELECT
        ar.id AS request_id,
        ar.submission_batch_id,
        ar.table_name,
        ar.root_record_id,
        ar.record_id,
        ar.approval_level,
        ar.role_label,
        ar.submitted_by,
        ar.authoriser_id,
        ar.status,
        ar.submission_notes,
        ar.submitted_at,
        ar.activated_at,
        CASE
            WHEN ar.table_name = 'subscription_plans' THEN (
                SELECT sp.plan_name FROM public.subscription_plans sp WHERE sp.id = ar.record_id
            )
            WHEN ar.table_name = 'affiliates' THEN (
                SELECT a.name FROM admin.affiliates a WHERE a.id = ar.record_id
            )
            WHEN ar.table_name = 'payment_gateways' THEN (
                SELECT pg.display_name FROM admin.payment_gateways pg WHERE pg.id = ar.record_id
            )
            WHEN ar.table_name = 'cancellation_reason_categories' THEN (
                SELECT c.label FROM admin.cancellation_reason_categories c WHERE c.id = ar.record_id
            )
            ELSE NULL
        END AS record_label,
        admin.summarise_pending_changes(pc.proposed_changes) AS change_summary,
        (ar.authoriser_id = v_admin_user_id) AS assigned_to_me,
        (
            ar.authoriser_id = v_admin_user_id
            OR v_is_configure
        ) AS can_decide
    FROM admin.record_authorisation_requests ar
    LEFT JOIN admin.record_pending_changes pc
        ON pc.table_name = ar.table_name
       AND pc.record_id = ar.record_id
    WHERE ar.status = 'pending'
      AND (
          ar.authoriser_id = v_admin_user_id
          OR v_is_configure
      )
    ORDER BY ar.activated_at NULLS LAST, ar.submitted_at;
END;
$$;

CREATE OR REPLACE FUNCTION admin.process_authoriser_decision(
    p_request_id UUID,
    p_decision TEXT,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_decision TEXT := lower(trim(COALESCE(p_decision, '')));
    v_request admin.record_authorisation_requests%ROWTYPE;
    v_table_name TEXT;
    v_level_mode TEXT := 'any';
    v_batch_pending INTEGER;
    v_same_level_pending INTEGER;
    v_next_level INTEGER;
    v_result JSONB;
    v_can_configure BOOLEAN := FALSE;
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.authorise required';
    END IF;

    v_can_configure := admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure');

    IF v_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected';
    END IF;

    SELECT *
    INTO v_request
    FROM admin.record_authorisation_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authorisation request not found: %', p_request_id;
    END IF;

    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'Authorisation request is not pending (current: %)', v_request.status;
    END IF;

    IF v_request.authoriser_id <> v_admin_user_id AND NOT v_can_configure THEN
        RAISE EXCEPTION 'Only assigned authoriser can decide this request';
    END IF;

    v_table_name := v_request.table_name;
    v_level_mode := COALESCE((
        SELECT c.level_approval_mode
        FROM admin.record_lifecycle_config c
        WHERE c.table_name = v_table_name
          AND c.is_active = TRUE
        LIMIT 1
    ), 'any');

    UPDATE admin.record_authorisation_requests
    SET status = v_decision,
        decision_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
        decided_at = NOW()
    WHERE id = v_request.id;

    IF v_decision = 'rejected' THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn',
            decided_at = NOW(),
            decision_notes = COALESCE(
                decision_notes,
                'Withdrawn after rejection'
            )
        WHERE submission_batch_id = v_request.submission_batch_id
          AND id <> v_request.id
          AND status IN ('waiting', 'pending');

        v_result := admin.transition_record_status(
            v_table_name,
            v_request.record_id,
            'reject',
            v_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Rejected by authoriser')
        );

        RETURN jsonb_build_object(
            'ok', TRUE,
            'request_id', p_request_id,
            'decision', v_decision,
            'submission_batch_id', v_request.submission_batch_id,
            'transition', v_result
        );
    END IF;

    IF v_level_mode = 'any' THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn',
            decided_at = NOW(),
            decision_notes = COALESCE(decision_notes, 'Superseded by same-level approval')
        WHERE submission_batch_id = v_request.submission_batch_id
          AND approval_level = v_request.approval_level
          AND id <> v_request.id
          AND status = 'pending';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_same_level_pending
    FROM admin.record_authorisation_requests ar
    WHERE ar.submission_batch_id = v_request.submission_batch_id
      AND ar.approval_level = v_request.approval_level
      AND ar.status = 'pending';

    IF v_level_mode = 'all' AND v_same_level_pending > 0 THEN
        RETURN jsonb_build_object(
            'ok', TRUE,
            'request_id', p_request_id,
            'decision', v_decision,
            'submission_batch_id', v_request.submission_batch_id,
            'waiting_for_same_level', v_same_level_pending
        );
    END IF;

    SELECT MIN(ar.approval_level)
    INTO v_next_level
    FROM admin.record_authorisation_requests ar
    WHERE ar.submission_batch_id = v_request.submission_batch_id
      AND ar.status = 'waiting';

    IF v_next_level IS NOT NULL THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'pending',
            activated_at = COALESCE(activated_at, NOW())
        WHERE submission_batch_id = v_request.submission_batch_id
          AND approval_level = v_next_level
          AND status = 'waiting';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_batch_pending
    FROM admin.record_authorisation_requests ar
    WHERE ar.submission_batch_id = v_request.submission_batch_id
      AND ar.status IN ('waiting', 'pending');

    IF v_batch_pending = 0 THEN
        v_result := admin.transition_record_status(
            v_table_name,
            v_request.record_id,
            'validate',
            v_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Approved by authoriser')
        );
    ELSE
        v_result := jsonb_build_object('ok', TRUE, 'message', 'Awaiting further approvals');
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'request_id', p_request_id,
        'decision', v_decision,
        'submission_batch_id', v_request.submission_batch_id,
        'pending_remaining', v_batch_pending,
        'transition', v_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.sync_authorisation_requests_from_pending() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.summarise_pending_changes(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_pending_authorisation_requests(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.process_authoriser_decision(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
