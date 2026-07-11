-- ============================================================================
-- v110: Simulator subscription_plans pricing revision + drift fix
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v78 (simulator catalog isolation), v94 (simulator yearly rows)
-- Idempotent: fixed UUIDs + ON CONFLICT on (plan_type, billing_cycle,
--             catalog_scope) — matches the same business key used by v109
--             for Platform, not `id`. Safe to re-run.
-- Run: node scripts/run-admin-sql.js SQL/v110_simulator_subscription_plan_pricing_fix.sql
--
-- SAME BUG AS PLATFORM (v109), PLUS ONE MORE
-- The live Simulator preview shows Professional $20/mo and Lifetime $900 —
-- neither matches any seed file. v78's Simulator Professional insert used a
-- fixed id (a7780002-...) with a computed fallback price of $57/mo, so $20
-- is itself drifted (almost certainly edited later via the Plan Catalog CRUD
-- UI, same as Platform). Worse: v78's "Ensure simulator lifetime row exists"
-- INSERT never specified an `id` column at all — that row has been running
-- under a random gen_random_uuid() this whole time, so any id-based UPDATE
-- targeting it was always going to silently no-op. This file matches every
-- row by (plan_type, billing_cycle, catalog_scope) instead, exactly like the
-- Platform fix, so it corrects the live row regardless of its current id.
--
-- WHY THE NEW NUMBERS ARE LOWER THAN THE PLATFORM EQUIVALENT
-- Requested explicitly: Simulator should price below Platform. That also
-- holds up on the economics — Simulator serves pre-built scenario content +
-- AI feedback rather than live multi-user project data, so marginal
-- cost-per-learner is structurally lower than Platform's cost-per-active
-- team-member. Numbers below raise Professional off its unsustainable
-- $0.20/licensed-learner floor, but stay well under Platform's tiers, and
-- Lifetime is nudged DOWN (not up) since a training-content lifetime deal
-- carries much less long-run hosting/support risk than Platform's did.
--
-- PRICING CHANGE SUMMARY
-- ┌──────────────┬────────────┬────────────┬──────────────────┬──────────────────┐
-- │ Plan          │ Old price  │ New price  │ Old $/licence    │ New $/licence    │
-- ├──────────────┼────────────┼────────────┼──────────────────┼──────────────────┤
-- │ Free          │ $0/mo      │ $0/mo      │ —                │ —                │
-- │ Professional  │ $20/mo     │ $99/mo     │ $0.20 (100)      │ $0.99 (100)      │
-- │ Lifetime      │ $900 once  │ $799 once  │ up to 100 learn. │ up to 100 learn. │
-- └──────────────┴────────────┴────────────┴──────────────────┴──────────────────┘
-- Free tier made more generous (5 → 10 beginner scenarios), same rationale
-- as the Platform Free tier: accessibility lever, not a paid-tier discount.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v110: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Free — kept at $0, made more generous (5 -> 10 beginner scenarios)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780001-0001-4000-8000-000000000001'::uuid, 'Free', 'free', 'monthly',
    0.00, NULL, 'USD', 1, NULL, 0.00,
    '["10 beginner scenarios", "Basic scoring and feedback", "Progress tracking", "Community access"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 1, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Professional Monthly / Yearly — $20 -> $99/mo (100 licensed learners)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780002-0001-4000-8000-000000000001'::uuid, 'Professional', 'professional', 'monthly',
    99.00, NULL, 'USD', 100, NULL, 0.00,
    '["All scenarios (including expert)", "Advanced AI feedback", "Full progress tracking & analytics", "All certificates (discounted)", "Custom scenarios", "Priority support"]'::jsonb,
    FALSE, TRUE, TRUE, TRUE, 3, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE, is_popular = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7940002-0001-4000-8000-000000000001'::uuid, 'Professional Yearly', 'professional', 'yearly',
    990.00, 1188.00, 'USD', 100, NULL, 0.00,
    '["All scenarios (including expert)", "Advanced AI feedback", "Full progress tracking & analytics", "All certificates (discounted)", "Custom scenarios", "Priority support", "Save 17% vs monthly"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 4, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Lifetime Access — $900 -> $799 one-time (100 learners, unchanged cap —
-- content-based product, marginal cost per extra learner is low)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780003-0001-4000-8000-000000000001'::uuid, 'Lifetime Access', 'lifetime', 'lifetime',
    799.00, 1599.00, 'USD', 100, NULL, 0.00,
    '["All scenarios (forever)", "All Professional features", "All future updates", "No recurring fees", "Priority support"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 5, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Force clean 'live' record_status + withdraw any pending authorisation
-- requests, same as the Platform fix (v109) — subscription_plans is a
-- Record Lifecycle pilot table regardless of catalog_scope.
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
        WHERE catalog_scope = 'simulator'
          AND plan_type IN ('free', 'professional', 'lifetime');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'record_authorisation_requests'
    ) THEN
        UPDATE admin.record_authorisation_requests r
        SET status = 'withdrawn', decided_at = NOW(),
            decision_notes = COALESCE(decision_notes, 'Superseded by v110 simulator pricing fix')
        WHERE r.table_name = 'subscription_plans'
          AND r.status IN ('pending', 'waiting')
          AND EXISTS (
              SELECT 1 FROM public.subscription_plans sp
              WHERE sp.id = r.record_id AND sp.catalog_scope = 'simulator'
          );
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'v110_simulator_subscription_plan_pricing_fix.sql completed'; END $$;

-- ============================================================================
-- NOTE: 'basic' (plan_type = 'basic') is intentionally left untouched — it
-- doesn't appear on the live 3-plan preview ("Showing 3 plans for
-- Simulator"), and v80/v81's file names ("...catalog_hidden" /
-- "...catalog_publish") suggest its visibility was a deliberate earlier
-- product decision, not a bug. If you want it revisited, say so explicitly
-- rather than assuming this file should touch it.
-- ============================================================================
