-- ============================================================================
-- v80: Fix Simulator Professional catalog price, then hide from public pricing
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v78 simulator catalog isolation
--
-- Professional was seeded at a stale $29.99 (old static tier). Catalog price must
-- follow admin pricing history, paid subscriptions, or Basic × 3 — never the seed.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v80: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- Resolve authoritative Simulator Professional monthly price (before hiding)
WITH prof_plan AS (
    SELECT id
    FROM public.subscription_plans
    WHERE catalog_scope = 'simulator'
      AND plan_type = 'professional'
      AND billing_cycle = 'monthly'
    LIMIT 1
),
history_price AS (
    SELECT pch.new_price
    FROM admin.pricing_change_history pch
    INNER JOIN prof_plan pp ON pp.id = pch.plan_id
    WHERE pch.target_system = 'simulator'
    ORDER BY pch.effective_date DESC NULLS LAST, pch.created_at DESC NULLS LAST
    LIMIT 1
),
subscription_price AS (
    SELECT ss.amount_paid
    FROM sim.simulator_subscriptions ss
    WHERE ss.plan_type = 'professional'
      AND ss.billing_cycle = 'monthly'
      AND ss.amount_paid IS NOT NULL
      AND ss.amount_paid > 0
      AND COALESCE(ss.status, '') NOT IN ('trialing', 'trial', 'canceled', 'cancelled')
    ORDER BY COALESCE(ss.started_at, ss.created_at, ss.updated_at) DESC NULLS LAST
    LIMIT 1
),
basic_price AS (
    SELECT ROUND(bp.price * 3, 2) AS aligned_price
    FROM public.subscription_plans bp
    WHERE bp.catalog_scope = 'simulator'
      AND bp.plan_type = 'basic'
      AND bp.billing_cycle = 'monthly'
    LIMIT 1
),
resolved AS (
    SELECT COALESCE(
        (SELECT new_price FROM history_price),
        (SELECT amount_paid FROM subscription_price),
        (SELECT aligned_price FROM basic_price)
    ) AS price
)
UPDATE public.subscription_plans sp
SET price = resolved.price,
    updated_at = NOW()
FROM resolved, prof_plan pp
WHERE sp.id = pp.id
  AND resolved.price IS NOT NULL;

-- Hide Professional from public pricing until actively offered
UPDATE public.subscription_plans
SET is_active = FALSE,
    is_popular = FALSE,
    updated_at = NOW()
WHERE catalog_scope = 'simulator'
  AND plan_type = 'professional'
  AND billing_cycle = 'monthly';

-- Lifetime is the top tier while Professional is not publicly offered
UPDATE public.subscription_plans
SET display_order = 3,
    features = '[
        "Everything in Simulator Basic",
        "All scenarios (forever)",
        "All future updates",
        "No recurring fees",
        "Priority support"
    ]'::jsonb,
    updated_at = NOW()
WHERE catalog_scope = 'simulator'
  AND plan_type = 'lifetime'
  AND billing_cycle = 'lifetime';

-- Highlight the main paid monthly tier while Professional is hidden
UPDATE public.subscription_plans
SET is_popular = TRUE,
    updated_at = NOW()
WHERE catalog_scope = 'simulator'
  AND plan_type = 'basic'
  AND billing_cycle = 'monthly'
  AND is_active = TRUE;
