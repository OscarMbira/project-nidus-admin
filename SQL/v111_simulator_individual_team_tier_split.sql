-- ============================================================================
-- v111: Split Simulator Professional into an individual tier + a new Team tier
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v110 (simulator pricing fix), v44 (plan_type constraint)
-- Idempotent: fixed UUIDs + ON CONFLICT on (plan_type, billing_cycle,
--             catalog_scope). Safe to re-run.
-- Run: node scripts/run-admin-sql.js SQL/v111_simulator_individual_team_tier_split.sql
--
-- WHY
-- v110 priced Professional as a bulk licence (up to 100 seats for $99/mo) —
-- the same flat/capacity shape Platform uses. But the Simulator's actual use
-- case, per the product description, is one learner stepping into a single
-- role (Portfolio / Programme / Project Manager) while the AI plays every
-- other role and injects scenarios. That's an individual professional-
-- development subscription, not a team collaboration tool — its real
-- competitive set is LinkedIn Learning (~$40/mo), Pluralsight (~$29-45/mo),
-- Coursera Plus (~$59/mo), not Platform's own tiers. Bundling 100 seats
-- into one price made it simultaneously too expensive for the solo learner
-- who is the primary buyer, and arguably still too cheap for a genuine
-- 100-seat corporate buyer.
--
-- THE FIX: split the shapes apart instead of picking one price for both.
--   - Professional and Lifetime become INDIVIDUAL tiers (member_limit = 1),
--     priced against the individual-subscription market above.
--   - A new TEAM tier (plan_type = 'team') takes over the seat-based/bulk
--     shape for orgs training multiple PMs/PgMs/PfMs, with a real bulk
--     discount per seat vs. paying for individual seats separately.
-- plan_type = 'professional' and 'lifetime' are NOT renamed — only their
-- catalog numbers change — so nothing elsewhere that keys off those plan
-- types breaks. 'team' is a new plan_type value and requires widening the
-- CHECK constraint (same pattern v44 used to add 'free').
--
-- CHECK APPLICATION CODE: if anything outside this catalog (billing/seat-
-- provisioning logic) hardcodes "simulator professional = 100 seats", that
-- assumption needs updating too — this file only fixes the catalog/pricing
-- data, not application logic that may have baked in the old seat count.
--
-- PRICING SUMMARY
-- ┌───────────────────────┬────────────┬──────────────┬────────────────────┐
-- │ Plan                   │ Was (v110) │ Now           │ Positioning        │
-- ├───────────────────────┼────────────┼──────────────┼────────────────────┤
-- │ Free                   │ $0/mo, 1   │ unchanged     │ individual         │
-- │ Professional           │ $99/mo,100 │ $29/mo, 1     │ individual         │
-- │ Team (new)             │ —          │ $299/mo, 25,  │ org / bulk seats   │
-- │                        │            │ +$12/extra    │                    │
-- │ Lifetime               │ $799, 100  │ $399, 1       │ individual         │
-- └───────────────────────┴────────────┴──────────────┴────────────────────┘
-- Yearly rows use the catalog's existing "17% off annual" convention:
-- yearly_price = ROUND(monthly_price * 12 * 5/6, 2), original_price = monthly_price * 12.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v111: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Widen plan_type to allow 'team'
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_plans
    DROP CONSTRAINT IF EXISTS subscription_plans_plan_type_check;

ALTER TABLE public.subscription_plans
    ADD CONSTRAINT subscription_plans_plan_type_check
    CHECK (plan_type IN (
        'free', 'starter', 'basic', 'professional', 'enterprise', 'lifetime',
        'team',
        'lifetime_starter', 'lifetime_professional', 'lifetime_enterprise',
        'lifetime_basic', 'lifetime_ultimate'
    ));

COMMENT ON COLUMN public.subscription_plans.plan_type IS
    'Plan tier key — platform: free/starter/professional/enterprise/lifetime*; simulator: free/basic/professional/team/lifetime*';

-- ---------------------------------------------------------------------------
-- Free — unchanged, re-asserted for consistency
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
    price = EXCLUDED.price, member_limit = EXCLUDED.member_limit,
    additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Professional Monthly / Yearly — repositioned to an INDIVIDUAL tier
-- (member_limit 100 -> 1, price $99 -> $29/mo)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780002-0001-4000-8000-000000000001'::uuid, 'Professional', 'professional', 'monthly',
    29.00, NULL, 'USD', 1, NULL, 0.00,
    '["All three simulation roles (Portfolio, Programme, Project Manager)", "All scenarios (including expert)", "Advanced AI feedback", "Full progress tracking & analytics", "All certificates (discounted)", "Custom scenarios", "Priority support"]'::jsonb,
    FALSE, TRUE, TRUE, TRUE, 2, 'simulator'
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
    290.00, 348.00, 'USD', 1, NULL, 0.00,
    '["All three simulation roles (Portfolio, Programme, Project Manager)", "All scenarios (including expert)", "Advanced AI feedback", "Full progress tracking & analytics", "All certificates (discounted)", "Custom scenarios", "Priority support", "Save 17% vs monthly"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 2, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Team Monthly / Yearly (new) — the bulk/seat-based shape Professional used
-- to be. 25 seats base, real bulk discount vs 25x individual Professional
-- ($725/mo if bought separately) -> $299/mo, +$12/extra seat.
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780004-0001-4000-8000-000000000001'::uuid, 'Team', 'team', 'monthly',
    299.00, NULL, 'USD', 25, NULL, 12.00,
    '["Everything in Professional, per seat", "Bulk seat licensing for your PM/PgM/PfM team", "Centralized progress reporting across learners", "Dedicated onboarding session", "Priority support"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 3, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780004-0002-4000-8000-000000000001'::uuid, 'Team Yearly', 'team', 'yearly',
    2990.00, 3588.00, 'USD', 25, NULL, 12.00,
    '["Everything in Professional, per seat", "Bulk seat licensing for your PM/PgM/PfM team", "Centralized progress reporting across learners", "Dedicated onboarding session", "Priority support", "Save 17% vs monthly"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 3, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Lifetime — repositioned to an INDIVIDUAL tier (member_limit 100 -> 1,
-- price $799 -> $399 one-time)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780003-0001-4000-8000-000000000001'::uuid, 'Lifetime Access', 'lifetime', 'lifetime',
    399.00, 798.00, 'USD', 1, NULL, 0.00,
    '["All three simulation roles, forever", "All scenarios (forever)", "All future updates", "No recurring fees", "Priority support"]'::jsonb,
    FALSE, TRUE, FALSE, TRUE, 4, 'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features, simulator_included = TRUE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Force clean 'live' record_status + withdraw any pending authorisation
-- requests, same as v109/v110.
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
          AND plan_type IN ('free', 'professional', 'team', 'lifetime');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'record_authorisation_requests'
    ) THEN
        UPDATE admin.record_authorisation_requests r
        SET status = 'withdrawn', decided_at = NOW(),
            decision_notes = COALESCE(decision_notes, 'Superseded by v111 individual/team tier split')
        WHERE r.table_name = 'subscription_plans'
          AND r.status IN ('pending', 'waiting')
          AND EXISTS (
              SELECT 1 FROM public.subscription_plans sp
              WHERE sp.id = r.record_id AND sp.catalog_scope = 'simulator'
          );
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'v111_simulator_individual_team_tier_split.sql completed'; END $$;
