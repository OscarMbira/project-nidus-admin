-- ============================================================================
-- v132: My Approvals RPC — JSONB return (PostgREST-safe)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v131_my_approvals_rpc_fix.sql (optional)
-- Note: Admin UI uses direct table queries; this fixes RPC for API/PostgREST callers.
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
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'admin'
          AND table_name = 'record_pending_changes'
    ) THEN
        RETURN 0;
    END IF;

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
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(
        string_agg(
            key || ' → ' || CASE
                WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
                ELSE left(value::text, 160)
            END,
            '; ' ORDER BY key
        ),
        ''
    )
    FROM jsonb_each(COALESCE(p_changes, '{}'::jsonb))
    WHERE jsonb_typeof(COALESCE(p_changes, '{}'::jsonb)) = 'object'
      AND COALESCE(p_changes, '{}'::jsonb) <> '{}'::jsonb;
$$;

DROP FUNCTION IF EXISTS admin.list_pending_authorisation_requests(UUID);

CREATE OR REPLACE FUNCTION admin.list_pending_authorisation_requests(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_is_configure BOOLEAN := FALSE;
    v_has_pending_changes BOOLEAN := FALSE;
    v_result JSONB;
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

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'admin'
          AND table_name = 'record_pending_changes'
    )
    INTO v_has_pending_changes;

    IF v_has_pending_changes THEN
        BEGIN
            PERFORM admin.sync_authorisation_requests_from_pending();
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'sync_authorisation_requests_from_pending skipped: %', SQLERRM;
        END;
    END IF;

    SELECT COALESCE(
        jsonb_agg(row_to_json(q) ORDER BY q.activated_at NULLS LAST, q.submitted_at),
        '[]'::jsonb
    )
    INTO v_result
    FROM (
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
            CASE ar.table_name
                WHEN 'subscription_plans' THEN (
                    SELECT sp.plan_name::TEXT FROM public.subscription_plans sp WHERE sp.id = ar.record_id
                )
                WHEN 'affiliates' THEN (
                    SELECT a.name::TEXT FROM admin.affiliates a WHERE a.id = ar.record_id
                )
                WHEN 'payment_gateways' THEN (
                    SELECT pg.display_name::TEXT FROM admin.payment_gateways pg WHERE pg.id = ar.record_id
                )
                WHEN 'cancellation_reason_categories' THEN (
                    SELECT c.label::TEXT FROM admin.cancellation_reason_categories c WHERE c.id = ar.record_id
                )
                ELSE NULL::TEXT
            END AS record_label,
            CASE
                WHEN v_has_pending_changes THEN (
                    SELECT admin.summarise_pending_changes(pc.proposed_changes)
                    FROM admin.record_pending_changes pc
                    WHERE pc.table_name = ar.table_name
                      AND pc.record_id = ar.record_id
                )
                ELSE NULL::TEXT
            END AS change_summary,
            (ar.authoriser_id = v_admin_user_id) AS assigned_to_me,
            (ar.authoriser_id = v_admin_user_id OR v_is_configure) AS can_decide
        FROM admin.record_authorisation_requests ar
        WHERE ar.status = 'pending'
          AND (
              ar.authoriser_id = v_admin_user_id
              OR v_is_configure
          )
    ) q;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.sync_authorisation_requests_from_pending() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.summarise_pending_changes(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_pending_authorisation_requests(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
