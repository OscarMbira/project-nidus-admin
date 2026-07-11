-- ============================================================================
-- v736_08: Admin System — role-based dashboard stats function
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01..v735_07, simulator core tables
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.get_dashboard_stats
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_dashboard_stats(p_admin_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_result JSONB := '{}'::JSONB;
    v_active_users BIGINT := 0;
    v_mrr NUMERIC := 0;
    v_pending_activations BIGINT := 0;
    v_critical_errors BIGINT := 0;
    v_recent_audit JSONB := '[]'::JSONB;
    v_subscription_summary JSONB := '{}'::JSONB;
    v_open_tickets BIGINT := 0;
    v_feature_flags_count BIGINT := 0;
    v_assigned_tickets BIGINT := 0;
    v_recent_errors JSONB := '[]'::JSONB;
    v_impersonation_count BIGINT := 0;
    v_scenario_count BIGINT := 0;
    v_active_scenarios BIGINT := 0;
    v_recent_certificates JSONB := '[]'::JSONB;
    v_leaderboard_top JSONB := '[]'::JSONB;
BEGIN
    IF p_admin_role IS NULL THEN
        RAISE EXCEPTION 'p_admin_role is required';
    END IF;

    IF p_admin_role NOT IN ('super_admin', 'system_admin', 'support_admin', 'content_admin') THEN
        RAISE EXCEPTION 'Invalid admin role: %', p_admin_role;
    END IF;

    SELECT COUNT(*)::BIGINT
    INTO v_active_users
    FROM auth.users;

    SELECT COALESCE(
        SUM(ps.amount_paid) FILTER (
            WHERE ps.status IN ('active', 'trialing')
              AND ps.billing_cycle = 'monthly'
        ),
        0
    )
    INTO v_mrr
    FROM public.platform_subscriptions ps;

    SELECT COUNT(*)::BIGINT
    INTO v_pending_activations
    FROM admin.admin_users au
    WHERE au.activation_status IN ('invited', 'pending_activation');

    SELECT COUNT(*)::BIGINT
    INTO v_critical_errors
    FROM admin.error_aggregations ea
    WHERE ea.severity = 'critical'
      AND ea.status NOT IN ('resolved', 'ignored');

    SELECT COALESCE(
        jsonb_agg(row_to_json(t)),
        '[]'::JSONB
    )
    INTO v_recent_audit
    FROM (
        SELECT
            aal.id,
            aal.action,
            aal.admin_user_id,
            aal.admin_role,
            aal.target_type,
            aal.target_id,
            aal.created_at
        FROM admin.admin_audit_log aal
        ORDER BY aal.created_at DESC
        LIMIT 10
    ) t;

    SELECT jsonb_build_object(
        'active', COUNT(*) FILTER (WHERE ps.status = 'active'),
        'trialing', COUNT(*) FILTER (WHERE ps.status = 'trialing'),
        'past_due', COUNT(*) FILTER (WHERE ps.status = 'past_due'),
        'cancelled', COUNT(*) FILTER (WHERE ps.status = 'cancelled'),
        'expired', COUNT(*) FILTER (WHERE ps.status = 'expired'),
        'monthly_mrr', COALESCE(
            SUM(ps.amount_paid) FILTER (
                WHERE ps.status IN ('active', 'trialing')
                  AND ps.billing_cycle = 'monthly'
            ),
            0
        )
    )
    INTO v_subscription_summary
    FROM public.platform_subscriptions ps;

    SELECT COUNT(*)::BIGINT
    INTO v_open_tickets
    FROM admin.support_tickets st
    WHERE st.status IN ('open', 'in_progress', 'waiting_user');

    SELECT COUNT(*)::BIGINT
    INTO v_feature_flags_count
    FROM admin.feature_flags;

    SELECT COUNT(*)::BIGINT
    INTO v_assigned_tickets
    FROM admin.support_tickets st
    WHERE st.assigned_to IS NOT NULL
      AND st.status IN ('open', 'in_progress', 'waiting_user');

    SELECT COALESCE(
        jsonb_agg(row_to_json(t)),
        '[]'::JSONB
    )
    INTO v_recent_errors
    FROM (
        SELECT
            ea.id,
            ea.error_type,
            ea.error_message,
            ea.system,
            ea.severity,
            ea.status,
            ea.occurrence_count,
            ea.last_seen_at
        FROM admin.error_aggregations ea
        ORDER BY ea.last_seen_at DESC
        LIMIT 10
    ) t;

    SELECT COUNT(*)::BIGINT
    INTO v_impersonation_count
    FROM admin.impersonation_log il
    WHERE il.started_at >= NOW() - INTERVAL '30 days';

    SELECT COUNT(*)::BIGINT
    INTO v_scenario_count
    FROM sim.scenarios;

    SELECT COUNT(*)::BIGINT
    INTO v_active_scenarios
    FROM sim.scenarios s
    WHERE s.is_active = TRUE;

    SELECT COALESCE(
        jsonb_agg(row_to_json(t)),
        '[]'::JSONB
    )
    INTO v_recent_certificates
    FROM (
        SELECT
            c.id,
            c.user_id,
            c.certificate_type,
            c.certificate_name,
            c.is_verified,
            c.issue_date
        FROM sim.certificates c
        ORDER BY c.issue_date DESC
        LIMIT 10
    ) t;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'sim'
          AND table_name = 'leaderboard_entries'
          AND column_name = 'total_points'
    ) THEN
        SELECT COALESCE(
            jsonb_agg(row_to_json(t)),
            '[]'::JSONB
        )
        INTO v_leaderboard_top
        FROM (
            SELECT
                le.id,
                le.user_id,
                le.display_name,
                le.period,
                le.total_points,
                le.rank
            FROM sim.leaderboard_entries le
            ORDER BY le.total_points DESC NULLS LAST
            LIMIT 10
        ) t;
    ELSE
        SELECT COALESCE(
            jsonb_agg(row_to_json(t)),
            '[]'::JSONB
        )
        INTO v_leaderboard_top
        FROM (
            SELECT
                le.id,
                le.user_id,
                le.leaderboard_type,
                le.category,
                le.score,
                le.rank
            FROM sim.leaderboard_entries le
            ORDER BY le.score DESC NULLS LAST
            LIMIT 10
        ) t;
    END IF;

    IF p_admin_role = 'super_admin' THEN
        v_result := jsonb_build_object(
            'active_users', v_active_users,
            'mrr', v_mrr,
            'pending_activations', v_pending_activations,
            'critical_errors', v_critical_errors,
            'recent_audit', v_recent_audit
        );
    ELSIF p_admin_role = 'system_admin' THEN
        v_result := jsonb_build_object(
            'active_users', v_active_users,
            'subscription_summary', v_subscription_summary,
            'open_tickets', v_open_tickets,
            'feature_flags_count', v_feature_flags_count
        );
    ELSIF p_admin_role = 'support_admin' THEN
        v_result := jsonb_build_object(
            'open_tickets', v_open_tickets,
            'assigned_tickets', v_assigned_tickets,
            'recent_errors', v_recent_errors,
            'impersonation_count', v_impersonation_count
        );
    ELSE
        v_result := jsonb_build_object(
            'scenario_count', v_scenario_count,
            'active_scenarios', v_active_scenarios,
            'recent_certificates', v_recent_certificates,
            'leaderboard_top', v_leaderboard_top
        );
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.get_dashboard_stats(TEXT) TO authenticated, service_role;
