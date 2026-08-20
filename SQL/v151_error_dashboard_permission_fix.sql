-- ============================================================================
-- v151: Error dashboard permission fix
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v06_error_functions.sql
-- Fixes: update_error_status / update_error_severity checked errors.edit (never seeded)
--        instead of errors.status.manage (granted to super/system/support admins).
-- Run: pnpm run admin:migrate-error-dashboard-permissions
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.update_error_status(
    p_error_agg_id UUID,
    p_new_status TEXT,
    p_admin_user_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.error_aggregations%ROWTYPE;
    v_new admin.error_aggregations%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.status.manage') THEN
        RAISE EXCEPTION 'Permission denied: errors.status.manage required';
    END IF;

    IF p_new_status NOT IN ('new', 'acknowledged', 'investigating', 'resolved', 'ignored', 'recurring') THEN
        RAISE EXCEPTION 'Invalid error status: %', p_new_status;
    END IF;

    SELECT * INTO v_prev
    FROM admin.error_aggregations
    WHERE id = p_error_agg_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Error aggregation not found: %', p_error_agg_id;
    END IF;

    UPDATE admin.error_aggregations
    SET status = p_new_status,
        resolved_by = CASE WHEN p_new_status = 'resolved' THEN p_admin_user_id ELSE NULL END,
        resolved_at = CASE WHEN p_new_status = 'resolved' THEN NOW() ELSE NULL END,
        resolution_notes = CASE
            WHEN p_new_status = 'resolved' THEN COALESCE(p_notes, resolution_notes)
            ELSE p_notes
        END,
        updated_at = NOW()
    WHERE id = p_error_agg_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.status.update',
        'error_aggregation',
        p_error_agg_id,
        jsonb_build_object('notes', p_notes),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_error_severity(
    p_error_agg_id UUID,
    p_new_severity TEXT,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.error_aggregations%ROWTYPE;
    v_new admin.error_aggregations%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.status.manage') THEN
        RAISE EXCEPTION 'Permission denied: errors.status.manage required';
    END IF;

    IF p_new_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid error severity: %', p_new_severity;
    END IF;

    SELECT * INTO v_prev
    FROM admin.error_aggregations
    WHERE id = p_error_agg_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Error aggregation not found: %', p_error_agg_id;
    END IF;

    UPDATE admin.error_aggregations
    SET severity = p_new_severity,
        updated_at = NOW()
    WHERE id = p_error_agg_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.severity.update',
        'error_aggregation',
        p_error_agg_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_error_status(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_error_severity(UUID, TEXT, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v151: Error dashboard permission fix applied (errors.status.manage).';
END $$;
