-- ============================================================================
-- v75: Public effective pricing hints (mirrors admin preview price overlay)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: platform_subscriptions, sim.simulator_subscriptions, subscription_plans
--
-- Returns the latest amount_paid per plan_type for Platform and Simulator so
-- customer-facing pricing pages match admin User Pricing Preview / subscription list.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_effective_pricing_hints()
RETURNS TABLE (
    target_system TEXT,
    plan_type TEXT,
    billing_cycle TEXT,
    amount_paid NUMERIC,
    currency TEXT,
    started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, sim
AS $$
    SELECT
        'platform'::TEXT,
        ps.plan_type,
        ps.billing_cycle,
        ps.amount_paid,
        ps.currency,
        ps.started_at,
        ps.created_at,
        ps.updated_at
    FROM (
        SELECT DISTINCT ON (p.plan_type)
            p.plan_type,
            p.billing_cycle,
            p.amount_paid,
            p.currency,
            p.started_at,
            p.created_at,
            p.updated_at
        FROM public.platform_subscriptions p
        WHERE p.amount_paid IS NOT NULL
          AND p.plan_type IS NOT NULL
        ORDER BY
            p.plan_type,
            COALESCE(p.started_at, p.created_at, p.updated_at) DESC NULLS LAST,
            p.created_at DESC NULLS LAST
    ) ps

    UNION ALL

    SELECT
        'simulator'::TEXT,
        ss.plan_type,
        ss.billing_cycle,
        ss.amount_paid,
        ss.currency,
        ss.started_at,
        ss.created_at,
        ss.updated_at
    FROM (
        SELECT DISTINCT ON (s.plan_type)
            s.plan_type,
            s.billing_cycle,
            s.amount_paid,
            s.currency,
            s.started_at,
            s.created_at,
            s.updated_at
        FROM sim.simulator_subscriptions s
        WHERE s.amount_paid IS NOT NULL
          AND s.plan_type IS NOT NULL
        ORDER BY
            s.plan_type,
            COALESCE(s.started_at, s.created_at, s.updated_at) DESC NULLS LAST,
            s.created_at DESC NULLS LAST
    ) ss;
$$;

COMMENT ON FUNCTION public.get_effective_pricing_hints IS
    'Latest subscription amount per plan_type for public pricing pages (no PII).';

GRANT EXECUTE ON FUNCTION public.get_effective_pricing_hints() TO anon, authenticated, service_role;
