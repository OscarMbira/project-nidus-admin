-- ============================================================================
-- v43: subscription_plans rows for Free + Simulator Basic (DB-backed features)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: public.subscription_plans (platform v113 / v38)
-- Idempotent: constraint widen + ON CONFLICT upsert. Safe to re-run.
--
-- Ensures admin UI reads plan features from subscription_plans only (no JS hardcoding).
-- Note: plan_type + billing_cycle is unique — one row per tier/cycle (shared across systems when applicable).
-- ============================================================================

-- v113 only allows starter | professional | enterprise | lifetime — widen before seeding free/basic.
ALTER TABLE public.subscription_plans
    DROP CONSTRAINT IF EXISTS subscription_plans_plan_type_check;

ALTER TABLE public.subscription_plans
    ADD CONSTRAINT subscription_plans_plan_type_check
    CHECK (plan_type IN (
        'free',
        'starter',
        'basic',
        'professional',
        'enterprise',
        'lifetime',
        'lifetime_starter',
        'lifetime_professional',
        'lifetime_enterprise',
        'lifetime_basic',
        'lifetime_ultimate'
    ));

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
    display_order
) VALUES
    (
        'a7430001-0001-4000-8000-000000000001'::uuid,
        'Free',
        'free',
        'monthly',
        0.00,
        NULL,
        'USD',
        5,
        1,
        0.00,
        '[
            "1 project",
            "5 team members",
            "Basic task management",
            "Simple Gantt charts",
            "Community support"
        ]'::jsonb,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        0
    ),
    (
        'a7430002-0001-4000-8000-000000000001'::uuid,
        'Simulator Basic',
        'basic',
        'monthly',
        19.00,
        NULL,
        'USD',
        20,
        NULL,
        0.00,
        '[
            "All beginner & intermediate scenarios",
            "Advanced scoring and feedback",
            "Progress tracking & analytics",
            "Community access",
            "Basic certificates"
        ]'::jsonb,
        FALSE,
        TRUE,
        FALSE,
        TRUE,
        10
    )
ON CONFLICT (plan_type, billing_cycle) DO UPDATE SET
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
