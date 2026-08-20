-- ============================================================================
-- v152: Error release readiness RPC + settings seed
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v151_error_dashboard_permission_fix.sql
-- Run: pnpm run admin:migrate-error-release-readiness
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.get_error_readiness_summary(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(severity TEXT, open_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'p_admin_user_id is required';
    END IF;

    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.dashboard.view') THEN
        RAISE EXCEPTION 'Permission denied: errors.dashboard.view required';
    END IF;

    RETURN QUERY
    SELECT
        ea.severity::TEXT,
        COUNT(*)::INTEGER AS open_count
    FROM admin.error_aggregations ea
    WHERE ea.status IN ('new', 'acknowledged', 'investigating', 'recurring')
    GROUP BY ea.severity
    ORDER BY CASE ea.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.get_error_readiness_summary(UUID) TO authenticated, service_role;

INSERT INTO admin.system_settings (
    setting_key,
    setting_value,
    setting_type,
    category,
    description
)
VALUES
    (
        'errors.release_gate_severity_threshold',
        'critical',
        'text',
        'errors',
        'Comma-separated severities that block release readiness (e.g. critical or critical,high)'
    ),
    (
        'errors.auto_ticket_user_threshold',
        '3',
        'integer',
        'errors',
        'Unique users hitting the same error within the window to trigger an auto-ticket'
    ),
    (
        'errors.auto_ticket_count_threshold',
        '10',
        'integer',
        'errors',
        'Error occurrences within the window to trigger an auto-ticket'
    ),
    (
        'errors.auto_ticket_window_minutes',
        '60',
        'integer',
        'errors',
        'Time window in minutes for auto-ticket threshold evaluation'
    )
ON CONFLICT (setting_key) DO UPDATE SET
    setting_type = EXCLUDED.setting_type,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

DO $$
BEGIN
    RAISE NOTICE 'v152: Error release readiness RPC and settings seed applied.';
END $$;
