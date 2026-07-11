-- ============================================================================
-- v42: Backfill empty subscription features from subscription_plans catalog
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v38 subscription_plans catalog, v16 features column
-- Idempotent: only updates rows with missing/empty feature arrays. Safe to re-run.
-- ============================================================================

-- Platform — match plan_type + billing_cycle; lifetime_* aliases use lifetime catalog row
UPDATE public.platform_subscriptions ps
SET custom_features = jsonb_build_object('features', sp.features),
    updated_at = NOW()
FROM public.subscription_plans sp
WHERE sp.is_active = TRUE
  AND sp.platform_included IS NOT FALSE
  AND jsonb_array_length(COALESCE(sp.features, '[]'::jsonb)) > 0
  AND (
    (ps.plan_type = sp.plan_type AND sp.billing_cycle = COALESCE(ps.billing_cycle, 'monthly'))
    OR (ps.plan_type = 'lifetime_enterprise' AND sp.plan_type = 'lifetime' AND sp.billing_cycle = 'lifetime')
  )
  AND (
    ps.custom_features IS NULL
    OR ps.custom_features -> 'features' IS NULL
    OR jsonb_typeof(ps.custom_features -> 'features') IS DISTINCT FROM 'array'
    OR jsonb_array_length(COALESCE(ps.custom_features -> 'features', '[]'::jsonb)) = 0
  );

-- Simulator — align features JSONB with catalog where simulator_included
UPDATE sim.simulator_subscriptions ss
SET features = sp.features,
    updated_at = NOW()
FROM public.subscription_plans sp
WHERE sp.is_active = TRUE
  AND sp.simulator_included = TRUE
  AND jsonb_array_length(COALESCE(sp.features, '[]'::jsonb)) > 0
  AND ss.plan_type = sp.plan_type
  AND sp.billing_cycle = COALESCE(ss.billing_cycle, 'monthly')
  AND (
    ss.features IS NULL
    OR jsonb_array_length(COALESCE(ss.features, '[]'::jsonb)) = 0
  );

-- Enterprise v40 seed row — ensure catalog features when still empty
UPDATE public.platform_subscriptions ps
SET custom_features = jsonb_build_object('features', sp.features),
    updated_at = NOW()
FROM public.subscription_plans sp
WHERE ps.id = 'b7360001-0001-4000-8000-000000000007'::uuid
  AND sp.plan_type = 'enterprise'
  AND sp.billing_cycle = 'monthly'
  AND sp.is_active = TRUE
  AND (
    ps.custom_features IS NULL
    OR jsonb_array_length(COALESCE(ps.custom_features -> 'features', '[]'::jsonb)) = 0
  );
