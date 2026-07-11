-- ============================================================================
-- v38: Platform subscription_plans catalog seed (incl. Enterprise)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: public.subscription_plans table (platform v113)
-- Idempotent: fixed UUIDs + ON CONFLICT (plan_type, billing_cycle). Safe to re-run.
--
-- Admin User Pricing Preview reads this table via fetchSubscriptionPlansCatalog().
-- Enterprise was previously only in platform v113 — not in admin seed files.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v38: Skipping — public.subscription_plans does not exist (run platform v113 first).';
        RETURN;
    END IF;
END $$;

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
        'a7380001-0001-4000-8000-000000000001'::uuid,
        'Starter Monthly',
        'starter',
        'monthly',
        29.00,
        NULL,
        'USD',
        20,
        NULL,
        5.00,
        '[
            "Up to 20 team members",
            "Unlimited projects",
            "Unlimited tasks",
            "Basic Gantt charts",
            "Email support",
            "Mobile app access"
        ]'::jsonb,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        1
    ),
    (
        'a7380001-0002-4000-8000-000000000002'::uuid,
        'Starter Yearly',
        'starter',
        'yearly',
        290.00,
        348.00,
        'USD',
        20,
        NULL,
        5.00,
        '[
            "Up to 20 team members",
            "Unlimited projects",
            "Unlimited tasks",
            "Basic Gantt charts",
            "Email support",
            "Mobile app access",
            "Save 17% vs monthly"
        ]'::jsonb,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        2
    ),
    (
        'a7380001-0003-4000-8000-000000000003'::uuid,
        'Professional Monthly',
        'professional',
        'monthly',
        79.00,
        NULL,
        'USD',
        50,
        NULL,
        3.00,
        '[
            "Up to 50 team members",
            "Unlimited projects",
            "Advanced Gantt charts",
            "Resource management",
            "Time tracking",
            "Custom reports",
            "Priority support",
            "API access",
            "Simulator module included"
        ]'::jsonb,
        TRUE,
        TRUE,
        TRUE,
        TRUE,
        3
    ),
    (
        'a7380001-0004-4000-8000-000000000004'::uuid,
        'Professional Yearly',
        'professional',
        'yearly',
        790.00,
        948.00,
        'USD',
        50,
        NULL,
        3.00,
        '[
            "Up to 50 team members",
            "Unlimited projects",
            "Advanced Gantt charts",
            "Resource management",
            "Time tracking",
            "Custom reports",
            "Priority support",
            "API access",
            "Simulator module included",
            "Save 17% vs monthly"
        ]'::jsonb,
        TRUE,
        TRUE,
        TRUE,
        TRUE,
        4
    ),
    (
        'a7380001-0005-4000-8000-000000000005'::uuid,
        'Enterprise',
        'enterprise',
        'monthly',
        199.00,
        NULL,
        'USD',
        200,
        NULL,
        2.00,
        '[
            "Up to 200 team members",
            "Everything in Professional",
            "Custom integrations",
            "Dedicated account manager",
            "SLA guarantee",
            "Advanced security",
            "On-premise option",
            "Custom training"
        ]'::jsonb,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        5
    ),
    (
        'a7380001-0006-4000-8000-000000000006'::uuid,
        'Lifetime Access',
        'lifetime',
        'lifetime',
        999.00,
        1999.00,
        'USD',
        100,
        NULL,
        4.00,
        '[
            "One-time payment",
            "100 team members",
            "All Professional features",
            "Lifetime updates",
            "No recurring fees",
            "Best value",
            "Priority support forever"
        ]'::jsonb,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        6
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

COMMENT ON TABLE public.subscription_plans IS
    'Platform pricing catalog. Seed: SQL/v38_subscription_plans_seed_data.sql (admin) / v113 (platform).';
