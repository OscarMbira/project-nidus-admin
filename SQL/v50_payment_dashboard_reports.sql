-- ============================================================================
-- v50: Payment dashboard & report aggregation RPCs
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v48_payment_events.sql
-- Plan: projectplans/v8.0_payment_flow_visibility_plan.md (Phase 7)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.get_payment_dashboard_kpis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_payment_dashboard_kpis(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_span INTERVAL;
    v_prior_from TIMESTAMPTZ;
    v_prior_to TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    v_span := p_to - p_from;
    v_prior_from := p_from - v_span;
    v_prior_to := p_from;

    WITH current_period AS (
        SELECT
            COALESCE(SUM(amount) FILTER (WHERE event_type = 'success'), 0) AS revenue,
            COUNT(*) FILTER (WHERE event_type = 'initiated') AS attempts,
            COUNT(*) FILTER (WHERE event_type = 'success') AS successes,
            COUNT(*) FILTER (WHERE event_type = 'refunded') AS refunds,
            COALESCE(AVG(amount) FILTER (WHERE event_type = 'success'), 0) AS avg_value
        FROM admin.payment_events
        WHERE created_at >= p_from AND created_at <= p_to
    ),
    prior_period AS (
        SELECT
            COALESCE(SUM(amount) FILTER (WHERE event_type = 'success'), 0) AS revenue,
            COUNT(*) FILTER (WHERE event_type = 'initiated') AS attempts,
            COUNT(*) FILTER (WHERE event_type = 'success') AS successes,
            COUNT(*) FILTER (WHERE event_type = 'refunded') AS refunds,
            COALESCE(AVG(amount) FILTER (WHERE event_type = 'success'), 0) AS avg_value
        FROM admin.payment_events
        WHERE created_at >= v_prior_from AND created_at < v_prior_to
    ),
    active_retries AS (
        SELECT COUNT(*) AS cnt
        FROM admin.payment_events rs
        WHERE rs.event_type = 'retry_scheduled'
          AND rs.created_at >= p_from - INTERVAL '30 days'
          AND NOT EXISTS (
              SELECT 1 FROM admin.payment_events later
              WHERE later.subscription_id = rs.subscription_id
                AND later.created_at > rs.created_at
                AND later.event_type IN ('success', 'cancelled')
          )
    )
    SELECT jsonb_build_object(
        'total_revenue', c.revenue,
        'total_revenue_change_pct', CASE WHEN p.revenue = 0 THEN NULL
            ELSE ROUND(((c.revenue - p.revenue) / p.revenue) * 100, 2) END,
        'success_rate', CASE WHEN c.attempts = 0 THEN 0
            ELSE ROUND((c.successes::NUMERIC / c.attempts) * 100, 2) END,
        'success_rate_change_pct', CASE
            WHEN p.attempts = 0 OR c.attempts = 0 THEN NULL
            ELSE ROUND(
                ((c.successes::NUMERIC / c.attempts) - (p.successes::NUMERIC / p.attempts))
                / NULLIF(p.successes::NUMERIC / p.attempts, 0) * 100, 2)
            END,
        'total_transactions', c.attempts,
        'total_transactions_change_pct', CASE WHEN p.attempts = 0 THEN NULL
            ELSE ROUND(((c.attempts - p.attempts)::NUMERIC / p.attempts) * 100, 2) END,
        'active_retries', (SELECT cnt FROM active_retries),
        'avg_transaction_value', ROUND(c.avg_value, 2),
        'avg_transaction_value_change_pct', CASE WHEN p.avg_value = 0 THEN NULL
            ELSE ROUND(((c.avg_value - p.avg_value) / p.avg_value) * 100, 2) END,
        'refund_rate', CASE WHEN c.successes = 0 THEN 0
            ELSE ROUND((c.refunds::NUMERIC / c.successes) * 100, 2) END,
        'refund_rate_change_pct', CASE
            WHEN p.successes = 0 OR c.successes = 0 THEN NULL
            ELSE ROUND(
                ((c.refunds::NUMERIC / c.successes) - (p.refunds::NUMERIC / p.successes))
                / NULLIF(p.refunds::NUMERIC / p.successes, 0) * 100, 2)
            END
    ) INTO v_result
    FROM current_period c, prior_period p;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_payment_revenue_chart
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_payment_revenue_chart(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_granularity TEXT DEFAULT 'daily',
    p_method_type TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    period_start DATE,
    gateway_provider TEXT,
    gateway_name TEXT,
    revenue NUMERIC,
    transaction_count BIGINT,
    success_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_trunc TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    v_trunc := CASE lower(COALESCE(p_granularity, 'daily'))
        WHEN 'weekly' THEN 'week'
        WHEN 'monthly' THEN 'month'
        ELSE 'day'
    END;

    RETURN QUERY
    WITH periods AS (
        SELECT
            date_trunc(v_trunc, e.created_at)::DATE AS period_start,
            g.provider_key AS gateway_provider,
            g.display_name AS gateway_name,
            COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'success'), 0) AS revenue,
            COUNT(*) FILTER (WHERE e.event_type = 'initiated') AS transaction_count,
            COUNT(*) FILTER (WHERE e.event_type = 'success') AS success_count
        FROM admin.payment_events e
        JOIN admin.payment_gateways g ON g.id = e.gateway_id
        LEFT JOIN admin.payment_methods m ON m.id = e.payment_method_id
        WHERE e.created_at >= p_from AND e.created_at <= p_to
          AND (p_method_type IS NULL OR m.method_type = p_method_type)
        GROUP BY 1, 2, 3
    )
    SELECT
        p.period_start,
        p.gateway_provider,
        p.gateway_name,
        p.revenue,
        p.transaction_count,
        CASE WHEN p.transaction_count = 0 THEN 0
            ELSE ROUND((p.success_count::NUMERIC / p.transaction_count) * 100, 2) END
    FROM periods p
    ORDER BY p.period_start, p.gateway_provider;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_payment_method_breakdown
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_payment_method_breakdown(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    method_type TEXT,
    method_display_name TEXT,
    payment_count BIGINT,
    revenue NUMERIC,
    percentage NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_total BIGINT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    SELECT COUNT(*) INTO v_total
    FROM admin.payment_events e
    WHERE e.event_type = 'success'
      AND e.created_at >= p_from AND e.created_at <= p_to;

    RETURN QUERY
    SELECT
        m.method_type,
        m.display_name AS method_display_name,
        COUNT(*) AS payment_count,
        COALESCE(SUM(e.amount), 0) AS revenue,
        CASE WHEN COALESCE(v_total, 0) = 0 THEN 0
            ELSE ROUND((COUNT(*)::NUMERIC / v_total) * 100, 2) END AS percentage
    FROM admin.payment_events e
    JOIN admin.payment_methods m ON m.id = e.payment_method_id
    WHERE e.event_type = 'success'
      AND e.created_at >= p_from AND e.created_at <= p_to
    GROUP BY m.method_type, m.display_name
    ORDER BY payment_count DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_gateway_performance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_gateway_performance(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    gateway_id UUID,
    gateway_name TEXT,
    gateway_provider TEXT,
    is_active BOOLEAN,
    total_attempts BIGINT,
    success_count BIGINT,
    success_rate NUMERIC,
    failed_count BIGINT,
    failed_rate NUMERIC,
    retried_count BIGINT,
    avg_duration_ms NUMERIC,
    revenue NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        g.id AS gateway_id,
        g.display_name AS gateway_name,
        g.provider_key AS gateway_provider,
        g.is_active,
        COUNT(*) FILTER (WHERE e.event_type = 'initiated') AS total_attempts,
        COUNT(*) FILTER (WHERE e.event_type = 'success') AS success_count,
        CASE WHEN COUNT(*) FILTER (WHERE e.event_type = 'initiated') = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE e.event_type = 'success')::NUMERIC
                / COUNT(*) FILTER (WHERE e.event_type = 'initiated') * 100, 2)
        END AS success_rate,
        COUNT(*) FILTER (WHERE e.event_type = 'failed') AS failed_count,
        CASE WHEN COUNT(*) FILTER (WHERE e.event_type = 'initiated') = 0 THEN 0
            ELSE ROUND(
                COUNT(*) FILTER (WHERE e.event_type = 'failed')::NUMERIC
                / COUNT(*) FILTER (WHERE e.event_type = 'initiated') * 100, 2)
        END AS failed_rate,
        COUNT(*) FILTER (WHERE e.event_type IN ('retry_scheduled', 'retry_attempt')) AS retried_count,
        ROUND(COALESCE(AVG(e.duration_ms) FILTER (WHERE e.duration_ms IS NOT NULL), 0), 0) AS avg_duration_ms,
        COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'success'), 0) AS revenue
    FROM admin.payment_gateways g
    LEFT JOIN admin.payment_events e
        ON e.gateway_id = g.id
       AND e.created_at >= p_from AND e.created_at <= p_to
    GROUP BY g.id, g.display_name, g.provider_key, g.is_active
    ORDER BY revenue DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_payment_geographic_breakdown
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_payment_geographic_breakdown(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    country_code CHAR(2),
    country_name TEXT,
    transaction_count BIGINT,
    revenue NUMERIC,
    success_rate NUMERIC,
    top_method TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    WITH country_stats AS (
        SELECT
            e.country_code,
            COUNT(*) FILTER (WHERE e.event_type = 'initiated') AS attempts,
            COUNT(*) FILTER (WHERE e.event_type = 'success') AS successes,
            COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'success'), 0) AS revenue
        FROM admin.payment_events e
        WHERE e.created_at >= p_from AND e.created_at <= p_to
          AND e.country_code IS NOT NULL
        GROUP BY e.country_code
    ),
    top_methods AS (
        SELECT DISTINCT ON (e.country_code)
            e.country_code,
            m.display_name AS top_method
        FROM admin.payment_events e
        JOIN admin.payment_methods m ON m.id = e.payment_method_id
        WHERE e.event_type = 'success'
          AND e.created_at >= p_from AND e.created_at <= p_to
          AND e.country_code IS NOT NULL
        GROUP BY e.country_code, m.display_name
        ORDER BY e.country_code, COUNT(*) DESC
    )
    SELECT
        cs.country_code,
        COALESCE(c.country_name, cs.country_code::TEXT) AS country_name,
        cs.attempts AS transaction_count,
        cs.revenue,
        CASE WHEN cs.attempts = 0 THEN 0
            ELSE ROUND((cs.successes::NUMERIC / cs.attempts) * 100, 2) END AS success_rate,
        tm.top_method
    FROM country_stats cs
    LEFT JOIN admin.countries c ON c.country_code = cs.country_code
    LEFT JOIN top_methods tm ON tm.country_code = cs.country_code
    ORDER BY cs.revenue DESC
    LIMIT 20;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_recent_failed_payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_recent_failed_payments(
    p_limit INTEGER DEFAULT 10,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    subscription_id UUID,
    user_email TEXT,
    amount NUMERIC,
    currency VARCHAR,
    method_display_name TEXT,
    failure_message TEXT,
    attempt_number INTEGER,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        f.id,
        f.subscription_id,
        u.email::TEXT AS user_email,
        f.amount,
        f.currency,
        m.display_name AS method_display_name,
        f.failure_message,
        f.attempt_number,
        (
            SELECT rs.next_retry_at FROM admin.payment_events rs
            WHERE rs.subscription_id = f.subscription_id
              AND rs.event_type = 'retry_scheduled'
              AND rs.created_at >= f.created_at
            ORDER BY rs.created_at DESC LIMIT 1
        ) AS next_retry_at,
        f.created_at
    FROM admin.payment_events f
    LEFT JOIN public.users u ON u.id = f.user_id
    LEFT JOIN admin.payment_methods m ON m.id = f.payment_method_id
    WHERE f.event_type = 'failed'
      AND NOT EXISTS (
          SELECT 1 FROM admin.payment_events s
          WHERE s.subscription_id = f.subscription_id
            AND s.event_type = 'success'
            AND s.created_at > f.created_at
      )
    ORDER BY f.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 10), 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- Report helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.generate_payment_summary_report(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_granularity TEXT DEFAULT 'daily',
    p_gateway_id UUID DEFAULT NULL,
    p_country_code CHAR(2) DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    period_label TEXT,
    total_attempts BIGINT,
    successful_count BIGINT,
    successful_amount NUMERIC,
    failed_count BIGINT,
    refunded_count BIGINT,
    refunded_amount NUMERIC,
    net_revenue NUMERIC,
    success_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_trunc TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    v_trunc := CASE lower(COALESCE(p_granularity, 'daily'))
        WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' ELSE 'day' END;

    RETURN QUERY
    SELECT
        to_char(date_trunc(v_trunc, e.created_at), 'YYYY-MM-DD') AS period_label,
        COUNT(*) FILTER (WHERE e.event_type = 'initiated'),
        COUNT(*) FILTER (WHERE e.event_type = 'success'),
        COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'success'), 0),
        COUNT(*) FILTER (WHERE e.event_type = 'failed'),
        COUNT(*) FILTER (WHERE e.event_type = 'refunded'),
        COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'refunded'), 0),
        COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'success'), 0)
            - COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'refunded'), 0),
        CASE WHEN COUNT(*) FILTER (WHERE e.event_type = 'initiated') = 0 THEN 0
            ELSE ROUND(COUNT(*) FILTER (WHERE e.event_type = 'success')::NUMERIC
                / COUNT(*) FILTER (WHERE e.event_type = 'initiated') * 100, 2) END
    FROM admin.payment_events e
    WHERE e.created_at >= p_from AND e.created_at <= p_to
      AND (p_gateway_id IS NULL OR e.gateway_id = p_gateway_id)
      AND (p_country_code IS NULL OR e.country_code = p_country_code)
    GROUP BY date_trunc(v_trunc, e.created_at)
    ORDER BY date_trunc(v_trunc, e.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION admin.generate_failed_payments_report(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_gateway_id UUID DEFAULT NULL,
    p_country_code CHAR(2) DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    event_time TIMESTAMPTZ,
    customer_email TEXT,
    country_code CHAR(2),
    method_display_name TEXT,
    gateway_name TEXT,
    amount NUMERIC,
    failure_code TEXT,
    failure_message TEXT,
    attempt_number INTEGER,
    resolved BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        e.created_at,
        u.email::TEXT,
        e.country_code,
        m.display_name,
        g.display_name,
        e.amount,
        e.failure_code,
        e.failure_message,
        e.attempt_number,
        EXISTS (
            SELECT 1 FROM admin.payment_events s
            WHERE s.subscription_id = e.subscription_id
              AND s.event_type = 'success'
              AND s.created_at > e.created_at
        ) AS resolved
    FROM admin.payment_events e
    LEFT JOIN public.users u ON u.id = e.user_id
    LEFT JOIN admin.payment_methods m ON m.id = e.payment_method_id
    LEFT JOIN admin.payment_gateways g ON g.id = e.gateway_id
    WHERE e.event_type = 'failed'
      AND e.created_at >= p_from AND e.created_at <= p_to
      AND (p_gateway_id IS NULL OR e.gateway_id = p_gateway_id)
      AND (p_country_code IS NULL OR e.country_code = p_country_code)
    ORDER BY e.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION admin.generate_gateway_performance_report(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    gateway_name TEXT,
    total_transactions BIGINT,
    success_count BIGINT,
    success_rate NUMERIC,
    failure_count BIGINT,
    failure_rate NUMERIC,
    retry_count BIGINT,
    retry_success_rate NUMERIC,
    avg_transaction_value NUMERIC,
    total_revenue NUMERIC,
    avg_duration_ms NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        gp.gateway_name,
        gp.total_attempts,
        gp.success_count,
        gp.success_rate,
        gp.failed_count,
        gp.failed_rate,
        gp.retried_count,
        CASE WHEN gp.retried_count = 0 THEN 0
            ELSE ROUND(
                (SELECT COUNT(*) FROM admin.payment_events e2
                 WHERE e2.gateway_id = gp.gateway_id
                   AND e2.event_type = 'success'
                   AND e2.attempt_number > 1
                   AND e2.created_at >= p_from AND e2.created_at <= p_to)::NUMERIC
                / gp.retried_count * 100, 2)
        END,
        CASE WHEN gp.success_count = 0 THEN 0
            ELSE ROUND(gp.revenue / gp.success_count, 2) END,
        gp.revenue,
        gp.avg_duration_ms
    FROM admin.get_gateway_performance(p_from, p_to, v_admin_user_id) gp;
END;
$$;

CREATE OR REPLACE FUNCTION admin.generate_retry_analytics_report(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    retry_rule_name TEXT,
    gateway_name TEXT,
    triggered_count BIGINT,
    recovered_attempt_1 BIGINT,
    recovered_attempt_1_pct NUMERIC,
    recovered_attempt_2 BIGINT,
    recovered_attempt_2_pct NUMERIC,
    recovered_attempt_3 BIGINT,
    recovered_attempt_3_pct NUMERIC,
    unrecovered BIGINT,
    unrecovered_pct NUMERIC,
    revenue_recovered NUMERIC,
    revenue_lost NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    WITH triggered AS (
        SELECT
            COALESCE(rr.rule_name, 'Default') AS rule_name,
            g.display_name AS gw_name,
            e.subscription_id,
            e.retry_rule_id,
            e.gateway_id
        FROM admin.payment_events e
        LEFT JOIN admin.payment_retry_rules rr ON rr.id = e.retry_rule_id
        LEFT JOIN admin.payment_gateways g ON g.id = e.gateway_id
        WHERE e.event_type = 'retry_scheduled'
          AND e.created_at >= p_from AND e.created_at <= p_to
    ),
    outcomes AS (
        SELECT
            t.rule_name,
            t.gw_name,
            t.subscription_id,
            MIN(s.attempt_number) FILTER (WHERE s.event_type = 'success') AS success_attempt
        FROM triggered t
        LEFT JOIN admin.payment_events s
            ON s.subscription_id = t.subscription_id
           AND s.created_at >= p_from
           AND s.event_type = 'success'
        GROUP BY t.rule_name, t.gw_name, t.subscription_id
    )
    SELECT
        o.rule_name,
        o.gw_name,
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE o.success_attempt = 1),
        CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE o.success_attempt = 1)::NUMERIC / COUNT(*) * 100, 2) END,
        COUNT(*) FILTER (WHERE o.success_attempt = 2),
        CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE o.success_attempt = 2)::NUMERIC / COUNT(*) * 100, 2) END,
        COUNT(*) FILTER (WHERE o.success_attempt >= 3),
        CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE o.success_attempt >= 3)::NUMERIC / COUNT(*) * 100, 2) END,
        COUNT(*) FILTER (WHERE o.success_attempt IS NULL),
        CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(COUNT(*) FILTER (WHERE o.success_attempt IS NULL)::NUMERIC / COUNT(*) * 100, 2) END,
        COALESCE((
            SELECT SUM(e.amount) FROM admin.payment_events e
            JOIN outcomes o2 ON o2.subscription_id = e.subscription_id
            WHERE e.event_type = 'success' AND e.attempt_number > 1
              AND o2.rule_name = o.rule_name AND o2.gw_name = o.gw_name
              AND e.created_at >= p_from AND e.created_at <= p_to
        ), 0),
        COALESCE((
            SELECT SUM(e.amount) FROM admin.payment_events e
            JOIN outcomes o2 ON o2.subscription_id = e.subscription_id
            WHERE e.event_type = 'failed' AND o2.success_attempt IS NULL
              AND o2.rule_name = o.rule_name AND o2.gw_name = o.gw_name
              AND e.created_at >= p_from AND e.created_at <= p_to
        ), 0)
    FROM outcomes o
    GROUP BY o.rule_name, o.gw_name
    ORDER BY COUNT(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION admin.generate_settlement_report(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    settlement_date DATE,
    gateway_name TEXT,
    settlement_account TEXT,
    transaction_count BIGINT,
    gross_amount NUMERIC,
    fees NUMERIC,
    net_settlement NUMERIC,
    currency_code VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        e.created_at::DATE,
        g.display_name,
        COALESCE(e.gateway_response->>'settlement_account', sa.account_name, '—'),
        COUNT(*)::BIGINT,
        COALESCE(SUM(e.amount), 0),
        COALESCE(SUM((e.gateway_response->>'fee_amount')::NUMERIC), 0),
        COALESCE(SUM(e.amount), 0) - COALESCE(SUM((e.gateway_response->>'fee_amount')::NUMERIC), 0),
        COALESCE(e.currency, 'USD')
    FROM admin.payment_events e
    JOIN admin.payment_gateways g ON g.id = e.gateway_id
    LEFT JOIN admin.settlement_accounts sa ON sa.id = (e.gateway_response->>'settlement_account_id')::UUID
    WHERE e.event_type = 'success'
      AND e.created_at >= p_from AND e.created_at <= p_to
      AND e.gateway_response ? 'settlement_account'
    GROUP BY e.created_at::DATE, g.display_name,
             COALESCE(e.gateway_response->>'settlement_account', sa.account_name, '—'),
             e.currency
    ORDER BY e.created_at::DATE DESC, g.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION admin.generate_promo_redemption_report(
    p_from TIMESTAMPTZ,
    p_to TIMESTAMPTZ,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    promo_code TEXT,
    promo_name TEXT,
    discount_type TEXT,
    redemptions BIGINT,
    revenue_before_discount NUMERIC,
    discount_given NUMERIC,
    revenue_after_discount NUMERIC,
    unique_customers BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        e.gateway_response->>'promo_code',
        COALESCE(pc.name, e.gateway_response->>'promo_code'),
        COALESCE(pc.discount_type, 'percentage'),
        COUNT(*)::BIGINT,
        COALESCE(SUM((e.gateway_response->>'original_amount')::NUMERIC), SUM(e.amount)),
        COALESCE(SUM((e.gateway_response->>'discount_amount')::NUMERIC), 0),
        COALESCE(SUM(e.amount), 0),
        COUNT(DISTINCT e.user_id)::BIGINT
    FROM admin.payment_events e
    LEFT JOIN admin.promo_codes pc ON upper(pc.code) = upper(e.gateway_response->>'promo_code')
    WHERE e.event_type = 'success'
      AND e.created_at >= p_from AND e.created_at <= p_to
      AND e.gateway_response ? 'promo_code'
    GROUP BY e.gateway_response->>'promo_code', pc.name, pc.discount_type
    ORDER BY redemptions DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.get_payment_dashboard_kpis(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_payment_revenue_chart(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_payment_method_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_gateway_performance(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_payment_geographic_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_recent_failed_payments(INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_payment_summary_report(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, CHAR(2), UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_failed_payments_report(TIMESTAMPTZ, TIMESTAMPTZ, UUID, CHAR(2), UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_gateway_performance_report(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_retry_analytics_report(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_settlement_report(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.generate_promo_redemption_report(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v50: Payment dashboard & report RPCs applied.';
END $$;
