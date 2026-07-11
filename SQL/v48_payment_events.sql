-- ============================================================================
-- v48: Payment events infrastructure (Transaction Monitor + Payment Journey)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v46_payment_configuration.sql, v25_billing.sql (invoices)
-- Plan: projectplans/v8.0_payment_flow_visibility_plan.md (Phase 1)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- admin.payment_events — immutable event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID,
    user_id UUID,
    gateway_id UUID REFERENCES admin.payment_gateways(id),
    payment_method_id UUID REFERENCES admin.payment_methods(id),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'initiated', 'success', 'failed', 'retry_scheduled',
        'retry_attempt', 'refunded', 'cancelled', 'invoice_issued'
    )),
    target_system TEXT CHECK (target_system IN ('platform', 'simulator')),
    amount NUMERIC(12, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    country_code CHAR(2),
    attempt_number INTEGER DEFAULT 1,
    transaction_id TEXT,
    failure_code TEXT,
    failure_message TEXT,
    duration_ms INTEGER,
    gateway_response JSONB,
    invoice_id UUID REFERENCES admin.invoices(id),
    retry_rule_id UUID REFERENCES admin.payment_retry_rules(id),
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_subscription_id
    ON admin.payment_events (subscription_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_user_id
    ON admin.payment_events (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_gateway_id
    ON admin.payment_events (gateway_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_type
    ON admin.payment_events (event_type);

CREATE INDEX IF NOT EXISTS idx_payment_events_created_at
    ON admin.payment_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_events_country_code
    ON admin.payment_events (country_code);

COMMENT ON TABLE admin.payment_events IS
    'Immutable payment lifecycle events for admin monitoring and analytics';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE admin.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_select ON admin.payment_events;
CREATE POLICY payment_events_select ON admin.payment_events
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.payment_events TO authenticated;
GRANT ALL ON admin.payment_events TO service_role;

-- Realtime (Supabase)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE admin.payment_events;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- support_admin needs read RPCs for monitor/dashboard/reports
INSERT INTO admin.role_permissions (role, permission_key)
VALUES ('support_admin', 'billing.payment_config.view')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- admin.list_payment_events
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_payment_events(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
    p_gateway_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_country_code CHAR(2) DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    subscription_id UUID,
    user_id UUID,
    user_email TEXT,
    gateway_id UUID,
    gateway_name TEXT,
    gateway_provider TEXT,
    payment_method_id UUID,
    method_type TEXT,
    method_display_name TEXT,
    event_type TEXT,
    display_status TEXT,
    target_system TEXT,
    amount NUMERIC,
    currency VARCHAR,
    country_code CHAR(2),
    attempt_number INTEGER,
    transaction_id TEXT,
    failure_code TEXT,
    failure_message TEXT,
    duration_ms INTEGER,
    gateway_response JSONB,
    invoice_id UUID,
    retry_rule_id UUID,
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
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        e.id,
        e.subscription_id,
        e.user_id,
        u.email::TEXT AS user_email,
        e.gateway_id,
        g.display_name AS gateway_name,
        g.provider_key AS gateway_provider,
        e.payment_method_id,
        m.method_type,
        m.display_name AS method_display_name,
        e.event_type,
        CASE
            WHEN e.event_type IN ('success', 'invoice_issued') THEN 'success'
            WHEN e.event_type = 'failed' THEN 'failed'
            WHEN e.event_type IN ('retry_scheduled', 'retry_attempt') THEN 'retrying'
            WHEN e.event_type = 'refunded' THEN 'refunded'
            WHEN e.event_type = 'cancelled' THEN 'failed'
            ELSE 'pending'
        END AS display_status,
        e.target_system,
        e.amount,
        e.currency,
        e.country_code,
        e.attempt_number,
        e.transaction_id,
        e.failure_code,
        e.failure_message,
        e.duration_ms,
        e.gateway_response,
        e.invoice_id,
        e.retry_rule_id,
        e.next_retry_at,
        e.created_at
    FROM admin.payment_events e
    LEFT JOIN admin.payment_gateways g ON g.id = e.gateway_id
    LEFT JOIN admin.payment_methods m ON m.id = e.payment_method_id
    LEFT JOIN public.users u ON u.id = e.user_id
    WHERE (p_from IS NULL OR e.created_at >= p_from)
      AND (p_to IS NULL OR e.created_at <= p_to)
      AND (p_gateway_id IS NULL OR e.gateway_id = p_gateway_id)
      AND (p_country_code IS NULL OR e.country_code = p_country_code)
      AND (
          p_status IS NULL
          OR (p_status = 'success' AND e.event_type IN ('success', 'invoice_issued'))
          OR (p_status = 'failed' AND e.event_type IN ('failed', 'cancelled'))
          OR (p_status = 'pending' AND e.event_type = 'initiated')
          OR (p_status = 'retrying' AND e.event_type IN ('retry_scheduled', 'retry_attempt'))
          OR (p_status = 'refunded' AND e.event_type = 'refunded')
      )
      AND (
          p_search IS NULL OR p_search = ''
          OR e.transaction_id ILIKE '%' || p_search || '%'
          OR u.email ILIKE '%' || p_search || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_payment_journey
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_payment_journey(
    p_subscription_id UUID,
    p_target_system TEXT DEFAULT 'platform',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    subscription_id UUID,
    user_id UUID,
    user_email TEXT,
    gateway_id UUID,
    gateway_name TEXT,
    payment_method_id UUID,
    method_type TEXT,
    method_display_name TEXT,
    event_type TEXT,
    target_system TEXT,
    amount NUMERIC,
    currency VARCHAR,
    country_code CHAR(2),
    attempt_number INTEGER,
    transaction_id TEXT,
    failure_code TEXT,
    failure_message TEXT,
    duration_ms INTEGER,
    gateway_response JSONB,
    invoice_id UUID,
    invoice_number TEXT,
    retry_rule_id UUID,
    retry_rule_name TEXT,
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
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    RETURN QUERY
    SELECT
        e.id,
        e.subscription_id,
        e.user_id,
        u.email::TEXT AS user_email,
        e.gateway_id,
        g.display_name AS gateway_name,
        e.payment_method_id,
        m.method_type,
        m.display_name AS method_display_name,
        e.event_type,
        e.target_system,
        e.amount,
        e.currency,
        e.country_code,
        e.attempt_number,
        e.transaction_id,
        e.failure_code,
        e.failure_message,
        e.duration_ms,
        e.gateway_response,
        e.invoice_id,
        i.invoice_number,
        e.retry_rule_id,
        rr.rule_name AS retry_rule_name,
        e.next_retry_at,
        e.created_at
    FROM admin.payment_events e
    LEFT JOIN admin.payment_gateways g ON g.id = e.gateway_id
    LEFT JOIN admin.payment_methods m ON m.id = e.payment_method_id
    LEFT JOIN public.users u ON u.id = e.user_id
    LEFT JOIN admin.invoices i ON i.id = e.invoice_id
    LEFT JOIN admin.payment_retry_rules rr ON rr.id = e.retry_rule_id
    WHERE e.subscription_id = p_subscription_id
      AND (p_target_system IS NULL OR e.target_system = p_target_system OR e.target_system IS NULL)
    ORDER BY e.created_at ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_payment_monitor_stats
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_payment_monitor_stats(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL,
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
    v_from TIMESTAMPTZ;
    v_to TIMESTAMPTZ;
    v_total BIGINT;
    v_success BIGINT;
    v_active_retries BIGINT;
    v_gateway_alerts BIGINT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    v_from := COALESCE(p_from, date_trunc('day', NOW()));
    v_to := COALESCE(p_to, NOW());

    SELECT COUNT(*) INTO v_total
    FROM admin.payment_events e
    WHERE e.event_type = 'initiated'
      AND e.created_at >= v_from
      AND e.created_at <= v_to;

    SELECT COUNT(*) INTO v_success
    FROM admin.payment_events e
    WHERE e.event_type = 'success'
      AND e.created_at >= v_from
      AND e.created_at <= v_to;

    SELECT COUNT(*) INTO v_active_retries
    FROM admin.payment_events rs
    WHERE rs.event_type = 'retry_scheduled'
      AND rs.created_at >= v_from - INTERVAL '7 days'
      AND NOT EXISTS (
          SELECT 1 FROM admin.payment_events later
          WHERE later.subscription_id = rs.subscription_id
            AND later.created_at > rs.created_at
            AND later.event_type IN ('success', 'cancelled')
      );

    WITH hourly AS (
        SELECT
            e.gateway_id,
            COUNT(*) FILTER (WHERE e.event_type = 'initiated') AS attempts,
            COUNT(*) FILTER (WHERE e.event_type = 'failed') AS failures
        FROM admin.payment_events e
        WHERE e.created_at >= NOW() - INTERVAL '1 hour'
          AND e.gateway_id IS NOT NULL
        GROUP BY e.gateway_id
    )
    SELECT COUNT(*) INTO v_gateway_alerts
    FROM hourly h
    WHERE h.attempts >= 5
      AND (h.failures::NUMERIC / NULLIF(h.attempts, 0)) > 0.10;

    RETURN jsonb_build_object(
        'total_today', COALESCE(v_total, 0),
        'success_rate', CASE WHEN COALESCE(v_total, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(v_success, 0)::NUMERIC / v_total) * 100, 2) END,
        'active_retries', COALESCE(v_active_retries, 0),
        'gateway_alerts', COALESCE(v_gateway_alerts, 0),
        'from_ts', v_from,
        'to_ts', v_to
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.log_payment_event — service_role only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.log_payment_event(
    p_event_type TEXT,
    p_subscription_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_gateway_id UUID DEFAULT NULL,
    p_payment_method_id UUID DEFAULT NULL,
    p_target_system TEXT DEFAULT 'platform',
    p_amount NUMERIC DEFAULT NULL,
    p_currency VARCHAR DEFAULT 'USD',
    p_country_code CHAR(2) DEFAULT NULL,
    p_attempt_number INTEGER DEFAULT 1,
    p_transaction_id TEXT DEFAULT NULL,
    p_failure_code TEXT DEFAULT NULL,
    p_failure_message TEXT DEFAULT NULL,
    p_duration_ms INTEGER DEFAULT NULL,
    p_gateway_response JSONB DEFAULT NULL,
    p_invoice_id UUID DEFAULT NULL,
    p_retry_rule_id UUID DEFAULT NULL,
    p_next_retry_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Forbidden: service_role only';
    END IF;

    INSERT INTO admin.payment_events (
        event_type, subscription_id, user_id, gateway_id, payment_method_id,
        target_system, amount, currency, country_code, attempt_number,
        transaction_id, failure_code, failure_message, duration_ms,
        gateway_response, invoice_id, retry_rule_id, next_retry_at
    ) VALUES (
        p_event_type, p_subscription_id, p_user_id, p_gateway_id, p_payment_method_id,
        p_target_system, p_amount, p_currency, p_country_code, p_attempt_number,
        p_transaction_id, p_failure_code, p_failure_message, p_duration_ms,
        p_gateway_response, p_invoice_id, p_retry_rule_id, p_next_retry_at
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.list_payment_events(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, CHAR(2), TEXT, INTEGER, INTEGER, UUID)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_payment_journey(UUID, TEXT, UUID)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_payment_monitor_stats(TIMESTAMPTZ, TIMESTAMPTZ, UUID)
    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.log_payment_event(TEXT, UUID, UUID, UUID, UUID, TEXT, NUMERIC, VARCHAR, CHAR(2), INTEGER, TEXT, TEXT, TEXT, INTEGER, JSONB, UUID, UUID, TIMESTAMPTZ)
    TO service_role;

DO $$
BEGIN
    RAISE NOTICE 'v48: Payment events infrastructure applied.';
END $$;
