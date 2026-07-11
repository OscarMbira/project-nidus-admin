-- ============================================================================
-- v94: Yearly subscription plan catalog rows (Platform Enterprise + Simulator Professional)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v77 catalog_scope, v78 simulator isolation
-- Idempotent: fixed UUIDs + ON CONFLICT (plan_type, billing_cycle, catalog_scope). Safe to re-run.
--
-- Adds missing yearly tiers visible in Plan Catalog:
--   Platform:  Enterprise Yearly (enterprise monthly exists; yearly was absent)
--   Simulator: Professional Yearly (professional monthly exists; yearly was absent)
--
-- Yearly price = monthly price × platform Professional yearly/monthly ratio (same discount curve).
-- Run: pnpm run admin:seed-subscription-plans-yearly
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v94: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- Shared yearly discount multiplier from live Platform Professional rows (fallback ~9.875× monthly).
WITH yearly_ratio AS (
    SELECT COALESCE(
        (
            SELECT y.price / NULLIF(m.price, 0)
            FROM public.subscription_plans m
            JOIN public.subscription_plans y
              ON y.plan_type = 'professional'
             AND y.billing_cycle = 'yearly'
             AND y.catalog_scope = 'platform'
            WHERE m.plan_type = 'professional'
              AND m.billing_cycle = 'monthly'
              AND m.catalog_scope = 'platform'
            LIMIT 1
        ),
        9.875
    )::numeric(12, 6) AS multiplier
)
INSERT INTO public.subscription_plans (
    id,
    plan_name,
    plan_type,
    billing_cycle,
    price,
    original_price,
    currency,
    member_limit,
    project_limit,
    additional_member_price,
    features,
    platform_included,
    simulator_included,
    is_popular,
    is_active,
    display_order,
    catalog_scope
)
SELECT
    'a7940001-0001-4000-8000-000000000001'::uuid,
    'Enterprise Yearly',
    'enterprise',
    'yearly',
    ROUND(m.price * r.multiplier, 2),
    ROUND(m.price * 12, 2),
    m.currency,
    m.member_limit,
    m.project_limit,
    m.additional_member_price,
    COALESCE(m.features, '[]'::jsonb)
        || '["Save 17% vs monthly"]'::jsonb,
    TRUE,
    FALSE,
    FALSE,
    TRUE,
    5,
    'platform'
FROM public.subscription_plans m
CROSS JOIN yearly_ratio r
WHERE m.plan_type = 'enterprise'
  AND m.billing_cycle = 'monthly'
  AND m.catalog_scope = 'platform'
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    currency = EXCLUDED.currency,
    member_limit = EXCLUDED.member_limit,
    project_limit = EXCLUDED.project_limit,
    additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features,
    platform_included = EXCLUDED.platform_included,
    simulator_included = EXCLUDED.simulator_included,
    is_popular = EXCLUDED.is_popular,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

WITH yearly_ratio AS (
    SELECT COALESCE(
        (
            SELECT y.price / NULLIF(m.price, 0)
            FROM public.subscription_plans m
            JOIN public.subscription_plans y
              ON y.plan_type = 'professional'
             AND y.billing_cycle = 'yearly'
             AND y.catalog_scope = 'platform'
            WHERE m.plan_type = 'professional'
              AND m.billing_cycle = 'monthly'
              AND m.catalog_scope = 'platform'
            LIMIT 1
        ),
        9.875
    )::numeric(12, 6) AS multiplier
)
INSERT INTO public.subscription_plans (
    id,
    plan_name,
    plan_type,
    billing_cycle,
    price,
    original_price,
    currency,
    member_limit,
    project_limit,
    additional_member_price,
    features,
    platform_included,
    simulator_included,
    is_popular,
    is_active,
    display_order,
    catalog_scope
)
SELECT
    'a7940002-0001-4000-8000-000000000001'::uuid,
    'Professional Yearly',
    'professional',
    'yearly',
    ROUND(m.price * r.multiplier, 2),
    ROUND(m.price * 12, 2),
    m.currency,
    m.member_limit,
    m.project_limit,
    m.additional_member_price,
    COALESCE(m.features, '[]'::jsonb)
        || '["Save 17% vs monthly"]'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    4,
    'simulator'
FROM public.subscription_plans m
CROSS JOIN yearly_ratio r
WHERE m.plan_type = 'professional'
  AND m.billing_cycle = 'monthly'
  AND m.catalog_scope = 'simulator'
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    currency = EXCLUDED.currency,
    member_limit = EXCLUDED.member_limit,
    project_limit = EXCLUDED.project_limit,
    additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features,
    platform_included = EXCLUDED.platform_included,
    simulator_included = EXCLUDED.simulator_included,
    is_popular = EXCLUDED.is_popular,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- Keep lifetime rows after yearly tiers on both catalogs
UPDATE public.subscription_plans
SET display_order = 6,
    updated_at = NOW()
WHERE catalog_scope = 'platform'
  AND plan_type = 'lifetime'
  AND billing_cycle = 'lifetime';

UPDATE public.subscription_plans
SET display_order = 5,
    updated_at = NOW()
WHERE catalog_scope = 'simulator'
  AND plan_type = 'lifetime'
  AND billing_cycle = 'lifetime';
