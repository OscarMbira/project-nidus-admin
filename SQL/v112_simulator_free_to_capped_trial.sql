-- ============================================================================
-- v112: Replace Simulator's recurring Free plan with a capped one-time trial
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v111 (individual/team tier split)
-- Idempotent: fixed UUIDs + ON CONFLICT on (plan_type, billing_cycle,
--             catalog_scope). Safe to re-run.
-- Run: node scripts/run-admin-sql.js SQL/v112_simulator_free_to_capped_trial.sql
--
-- WHY
-- Every Simulator scenario session is real AI inference (role-play,
-- scenario injection, feedback) — unlike Platform's free tier (cheap
-- CRUD/task management to serve), a recurring "N scenarios every month,
-- forever, for $0" plan carries open-ended compute cost with no revenue to
-- offset it, and unlike Platform's team-collaboration free tier, an
-- individual training solo doesn't pull colleagues in behind them, so there's
-- no network-effect payoff to subsidizing it either. Decision: drop the
-- recurring Free plan; keep a bounded, non-renewing trial so people can still
-- sample the product before paying — the AI-cost exposure per signup is now
-- fixed instead of open-ended monthly.
--
-- HOW "ONE-TIME, NOT RECURRING" IS EXPRESSED
-- billing_cycle = 'lifetime' (not 'monthly') — the same value already used by
-- the paid Lifetime plan to mean "one-time, no renewal." This reuses an
-- existing, already-understood convention instead of inventing a new
-- plan_type or column. It also means the trial card always shows alongside
-- "Lifetime Access" regardless of the Monthly/Yearly toggle (same rendering
-- rule that already applies to Lifetime — see buildSimulatorPreviewPlans in
-- packages/shared/src/subscriptionPreviewCatalog.js).
--
-- WHAT THIS FILE DOES NOT DO
-- subscription_plans is a catalog/pricing table, not a usage-tracking
-- engine — this row describes the entitlement ("2 free scenarios, one-time")
-- in its features text and price, but nothing here enforces that a given
-- user has used up their 2 trial scenarios. That enforcement is application
-- logic (wherever scenario sessions are granted/started) and is NOT covered
-- by this SQL file — check that path separately before relying on the cap.
--
-- Also: mapDbPlanToPreview() only sets the "One-time payment" subtitle for
-- plan_type = 'lifetime', not 'free' — so this trial card won't get that
-- subtitle automatically. Worked around here by naming the plan "Free Trial"
-- and leading the features list with "2 free scenarios (one-time)" so the
-- one-time nature is clear from the card text itself; a frontend follow-up
-- to extend that subtitle rule to trial rows would be cleaner long-term.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v112: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Retire the old recurring Free plan (plan_type='free', billing_cycle=
-- 'monthly', catalog_scope='simulator'). Deactivated, not deleted, so any
-- historical subscription rows that reference it are unaffected.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET is_active = FALSE,
    updated_at = NOW()
WHERE plan_type = 'free'
  AND billing_cycle = 'monthly'
  AND catalog_scope = 'simulator';

-- ---------------------------------------------------------------------------
-- New capped, one-time Free Trial
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7780001-0002-4000-8000-000000000001'::uuid,
    'Free Trial',
    'free',
    'lifetime',
    0.00,
    NULL,
    'USD',
    1,
    NULL,
    0.00,
    '["2 free scenarios (one-time)", "Basic scoring and feedback", "Community access"]'::jsonb,
    FALSE,
    TRUE,
    FALSE,
    TRUE,
    1,
    'simulator'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    price = EXCLUDED.price,
    member_limit = EXCLUDED.member_limit,
    additional_member_price = EXCLUDED.additional_member_price,
    features = EXCLUDED.features,
    simulator_included = TRUE,
    is_active = TRUE,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Force clean 'live' record_status + withdraw any pending authorisation
-- requests, same as v109/v110/v111.
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
            decision_notes = COALESCE(decision_notes, 'Superseded by v112 capped trial')
        WHERE r.table_name = 'subscription_plans'
          AND r.status IN ('pending', 'waiting')
          AND EXISTS (
              SELECT 1 FROM public.subscription_plans sp
              WHERE sp.id = r.record_id AND sp.catalog_scope = 'simulator'
          );
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'v112_simulator_free_to_capped_trial.sql completed'; END $$;
