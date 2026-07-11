-- ============================================================================
-- v134: decide_pending_record — unified authorisation decision path
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v19.0_approval_justification_and_field_lock_plan.md §2
-- Prerequisites: v133_authoriser_decision_reject_fix.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin._apply_authorisation_decision(
    p_request_id UUID,
    p_decision TEXT,
    p_notes TEXT,
    p_admin_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_decision TEXT := lower(trim(COALESCE(p_decision, '')));
    v_request admin.record_authorisation_requests%ROWTYPE;
    v_table_name TEXT;
    v_level_mode TEXT := 'any';
    v_batch_pending INTEGER;
    v_same_level_pending INTEGER;
    v_next_level INTEGER;
    v_result JSONB;
BEGIN
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
            p_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Rejected by authoriser')
        );

        RETURN jsonb_build_object(
            'ok', TRUE,
            'success', TRUE,
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
            'success', TRUE,
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
            p_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Approved by authoriser')
        );
    ELSE
        v_result := jsonb_build_object('ok', TRUE, 'message', 'Awaiting further approvals');
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'success', TRUE,
        'request_id', p_request_id,
        'decision', v_decision,
        'submission_batch_id', v_request.submission_batch_id,
        'pending_remaining', v_batch_pending,
        'transition', v_result
    );
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

    RETURN admin._apply_authorisation_decision(
        p_request_id,
        v_decision,
        p_notes,
        v_admin_user_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.decide_pending_record(
    p_table_name TEXT,
    p_record_id UUID,
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
    v_can_configure BOOLEAN := FALSE;
    v_operation TEXT;
    v_result JSONB;
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
    FROM admin.record_authorisation_requests ar
    WHERE ar.table_name = p_table_name
      AND ar.record_id = p_record_id
      AND ar.status = 'pending'
      AND (
          ar.authoriser_id = v_admin_user_id
          OR v_can_configure
      )
    ORDER BY ar.activated_at NULLS LAST, ar.submitted_at
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF v_request.authoriser_id <> v_admin_user_id AND NOT v_can_configure THEN
            RAISE EXCEPTION 'Only assigned authoriser can decide this request';
        END IF;

        RETURN admin._apply_authorisation_decision(
            v_request.id,
            v_decision,
            p_notes,
            v_admin_user_id
        );
    END IF;

    IF NOT v_can_configure THEN
        RAISE EXCEPTION 'No pending authorisation request assigned to you for this record';
    END IF;

    UPDATE admin.record_authorisation_requests
    SET status = 'withdrawn',
        decided_at = NOW(),
        decision_notes = COALESCE(decision_notes, 'Withdrawn via break-glass record decision')
    WHERE table_name = p_table_name
      AND record_id = p_record_id
      AND status IN ('waiting', 'pending');

    v_operation := CASE WHEN v_decision = 'approved' THEN 'validate' ELSE 'reject' END;

    v_result := admin.transition_record_status(
        p_table_name,
        p_record_id,
        v_operation,
        v_admin_user_id,
        COALESCE(NULLIF(trim(p_notes), ''), format('Break-glass %s from record page', v_decision))
    );

    RETURN jsonb_build_object(
        'ok', TRUE,
        'success', TRUE,
        'decision', v_decision,
        'break_glass', TRUE,
        'transition', v_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin._apply_authorisation_decision(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.process_authoriser_decision(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.decide_pending_record(TEXT, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'v134_decide_pending_record.sql completed'; END $$;
