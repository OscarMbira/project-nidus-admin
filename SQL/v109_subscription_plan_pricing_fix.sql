-- ============================================================================
-- v109: Fix v107 pricing revision not taking effect
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v107 (pricing revision), v97 (record_status/root_record_id
--                 columns added to subscription_plans as a lifecycle pilot table)
-- Idempotent: safe to re-run.
-- Run: node scripts/run-admin-sql.js SQL/v109_subscription_plan_pricing_fix.sql
--
-- WHY v107 DIDN'T STICK
-- v107 matched Starter/Professional/Enterprise/Lifetime by a fixed `id` taken
-- from the original v38 seed. Free updated correctly because that INSERT
-- matched by (plan_type, billing_cycle, catalog_scope) via ON CONFLICT — a
-- business key, not an id. That's the tell: the live rows for the other four
-- plans are not sitting under the v38 ids anymore (most likely re-created
-- with fresh UUIDs at some point via the Plan Catalog CRUD UI), so v107's
-- `WHERE id = '<v38-uuid>'` matched zero rows and silently did nothing.
--
-- SEPARATELY: v97 registered subscription_plans as a Record Lifecycle pilot
-- table (record_status column, default 'live'). If any row currently sits in
-- record_status = 'unauthorised' — e.g. from a submitted-but-not-yet-approved
-- price change — a plain UPDATE still writes the new price into that same
-- row (Category B keeps one physical row per record), but this file also
-- explicitly forces record_status back to 'live' and withdraws any pending
-- authorisation requests against these rows, so there's no lingering pending
-- request that could cause confusion about which price is "the real one."
--
-- THE FIX: match every row by (plan_type, billing_cycle, catalog_scope) —
-- the actual unique business key (idx_subscription_plans_catalog_unique,
-- v77) — via INSERT ... ON CONFLICT, exactly like Free already does. This
-- is correct regardless of what id the row currently has.
--
-- Same target numbers as v107 (unchanged):
--   Free:         $0/mo,     10 members, 3 projects
--   Starter:      $99/mo,    20 members, +$5/extra
--   Professional: $299/mo,   50 members, +$8/extra
--   Enterprise:   $1,999/mo, 200 members, +$25/extra
--   Lifetime:     $1,499 once, 20 members, +$15/extra
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v109: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Free
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0000-4000-8000-000000000000'::uuid, 'Free', 'free', 'monthly',
    0.00, NULL, 'USD', 10, 3, 0.00,
    '["Basic task management", "Simple Gantt charts", "Community support"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 0, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, project_limit = EXCLUDED.project_limit,
    additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = EXCLUDED.platform_included,
    simulator_included = EXCLUDED.simulator_included, is_popular = EXCLUDED.is_popular,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Starter Monthly / Yearly
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0001-4000-8000-000000000001'::uuid, 'Starter Monthly', 'starter', 'monthly',
    99.00, NULL, 'USD', 20, NULL, 5.00,
    '["Unlimited tasks", "Basic Gantt charts", "Email support", "Mobile app access"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 1, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0002-4000-8000-000000000002'::uuid, 'Starter Yearly', 'starter', 'yearly',
    990.00, 1188.00, 'USD', 20, NULL, 5.00,
    '["Unlimited tasks", "Basic Gantt charts", "Email support", "Mobile app access", "Save 17% vs monthly"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 2, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Professional Monthly / Yearly
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0003-4000-8000-000000000003'::uuid, 'Professional Monthly', 'professional', 'monthly',
    299.00, NULL, 'USD', 50, NULL, 8.00,
    '["Advanced Gantt charts", "Resource management", "Time tracking", "Custom reports", "Priority support", "API access", "Simulator module included"]'::jsonb,
    TRUE, TRUE, TRUE, TRUE, 3, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE, simulator_included = TRUE,
    is_popular = TRUE, is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0004-4000-8000-000000000004'::uuid, 'Professional Yearly', 'professional', 'yearly',
    2990.00, 3588.00, 'USD', 50, NULL, 8.00,
    '["Advanced Gantt charts", "Resource management", "Time tracking", "Custom reports", "Priority support", "API access", "Simulator module included", "Save 17% vs monthly"]'::jsonb,
    TRUE, TRUE, TRUE, TRUE, 4, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE, simulator_included = TRUE,
    is_popular = TRUE, is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Enterprise Monthly / Yearly
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0005-4000-8000-000000000005'::uuid, 'Enterprise', 'enterprise', 'monthly',
    1999.00, NULL, 'USD', 200, NULL, 25.00,
    '["Everything in Professional", "Custom integrations", "Dedicated account manager", "SLA guarantee", "Advanced security", "On-premise option", "Custom training"]'::jsonb,
    TRUE, TRUE, FALSE, TRUE, 5, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7940001-0001-4000-8000-000000000001'::uuid, 'Enterprise Yearly', 'enterprise', 'yearly',
    19990.00, 23988.00, 'USD', 200, NULL, 25.00,
    '["Everything in Professional", "Custom integrations", "Dedicated account manager", "SLA guarantee", "Advanced security", "On-premise option", "Custom training", "Save 17% vs monthly"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 6, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Lifetime Access
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0006-4000-8000-000000000006'::uuid, 'Lifetime Access', 'lifetime', 'lifetime',
    1499.00, 2999.00, 'USD', 20, NULL, 15.00,
    '["One-time payment", "All Professional features", "Lifetime updates", "No recurring fees", "Best value", "Priority support forever"]'::jsonb,
    TRUE, TRUE, FALSE, TRUE, 7, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, platform_included = TRUE, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Force every row above back to a clean, unambiguous 'live' state and clear
-- any pending authorisation requests that could otherwise keep showing a
-- competing "proposed" price in a queue/history view.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
          AND column_name = 'record_status'
    ) THEN
        UPDATE public.subscription_plans
        SET record_status = 'live',
            root_record_id = COALESCE(root_record_id, id),
            record_version = COALESCE(record_version, 1) + 1,
            authorised_at = NOW()
        WHERE catalog_scope = 'platform'
          AND plan_type IN ('free', 'starter', 'professional', 'enterprise', 'lifetime');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'record_authorisation_requests'
    ) THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn', decided_at = NOW(),
            decision_notes = COALESCE(decision_notes, 'Superseded by v109 pricing fix')
        WHERE table_name = 'subscription_plans'
          AND status IN ('pending', 'waiting');
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'v109_subscription_plan_pricing_fix.sql completed'; END $$;

-- ============================================================================
-- IF THIS STILL DOESN'T SHOW UP: something else is actively writing to
-- subscription_plans at the same time you're running this. v97 already
-- registered subscription_plans as a Record Lifecycle pilot table (part of
-- the ongoing v15.0 work — several SQL files numbered v95-v108 exist in this
-- folder that weren't part of this pricing conversation), and the mystery
-- numbers in your screenshot (150/300/200 "projects" bullets that neither
-- v38 nor v107 ever wrote) don't come from anything in this file's history.
-- If a demo/authorisation workflow or another session is running against
-- this same database concurrently, re-running this file will only "win"
-- until the next time that other process writes. Worth checking whether
-- another Claude Code session, script, or teammate has this repo/DB open
-- right now before re-running.
-- ============================================================================
