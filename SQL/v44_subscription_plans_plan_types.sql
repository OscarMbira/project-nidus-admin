-- ============================================================================
-- v44: Expand subscription_plans.plan_type allowed values
-- PostgreSQL 15+ / Supabase
-- NOTE: This logic is included at the top of v43_subscription_plan_features_catalog.sql.
--       Run v43 alone, or this file if you only need the constraint change.
-- Idempotent: DROP + ADD constraint. Safe to re-run.
-- ============================================================================

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

COMMENT ON COLUMN public.subscription_plans.plan_type IS
    'Plan tier key — platform: free/starter/professional/enterprise/lifetime*; simulator: free/basic/professional/lifetime*';
