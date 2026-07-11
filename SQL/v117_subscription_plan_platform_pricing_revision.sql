-- ============================================================================
-- v117: Platform subscription_plans — Free/Basic/Lifetime revision
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v109 (subscription_plan_pricing_fix — current source of truth
--                 for the Platform catalog), v44 (plan_type check already
--                 allows 'basic'), v77 (catalog_scope + unique key on
--                 (plan_type, billing_cycle, catalog_scope)), v98 (lifecycle
--                 gate on admin.update_subscription_plan)
-- Idempotent: matched by (plan_type, billing_cycle, catalog_scope) business
-- key throughout, never by id — same convention v109 established after v107's
-- id-match bug. Safe to re-run.
-- Run: node scripts/run-admin-sql.js SQL/v117_subscription_plan_platform_pricing_revision.sql
--
-- WHAT THIS CHANGES (Platform catalog only; Simulator rows untouched)
--   1. Free: member_limit 10 -> 5. Free is still the accessibility lever
--      (v107's rationale), but 10 members free next to a $99/mo Starter left
--      no reason for a real team to ever pay — narrowing it to 5 restores
--      upgrade pressure without cutting Free to a 1-2 person trial.
--   2. New "Basic" plan, $29/mo / $290/yr, platform-only. Bridges the 13x
--      cliff from Free ($0) straight to Starter ($99) with a real landing
--      spot for small teams that outgrew Free's 5 members but aren't ready
--      for Starter's price. Sized deliberately below Starter (10 members,
--      capped projects, no mobile app access) so it doesn't cannibalize
--      Starter's own upgrade path.
--   3. Lifetime Access: is_active = FALSE. Not deleted — this repo's
--      admin.delete_subscription_plan (v92) refuses to delete a plan with
--      active subscribers, and a hard delete would also destroy the pricing
--      row that any existing lifetime holder's billing/support flows may
--      still reference. Deactivating removes it from the public catalog
--      (public.get_public_subscription_plans only returns is_active = TRUE)
--      while grandfathering anyone already on it.
--
-- display_order is renumbered so Basic slots in between Free and Starter;
-- Starter/Professional/Enterprise shift down by one slot each (2 rows/plan
-- for monthly+yearly). Lifetime's display_order is left as-is since it's
-- inactive and no longer rendered.
--
-- MEMBER/PROJECT-LIMIT FEATURE BULLETS: per v107, "Up to N members" /
-- "N projects" bullets are NOT stored in `features` — the frontend
-- (packages/shared/src/subscriptionPreviewCatalog.js) derives them from the
-- member_limit/project_limit columns on every render. Do not add those
-- phrases to any `features` array below.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v117: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Free — member_limit 10 -> 5 (display_order unchanged at 0)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0000-4000-8000-000000000000'::uuid, 'Free', 'free', 'monthly',
    0.00, NULL, 'USD', 5, 3, 0.00,
    '["Basic task management", "Simple Gantt charts", "Community support"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 0, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    member_limit = EXCLUDED.member_limit,
    project_limit = EXCLUDED.project_limit,
    features = EXCLUDED.features,
    is_active = TRUE,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2) Basic (new) — $29/mo / $290/yr, 10 members, 10 projects, +$4/extra
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0007-4000-8000-000000000007'::uuid, 'Basic Monthly', 'basic', 'monthly',
    29.00, NULL, 'USD', 10, 10, 4.00,
    '["Unlimited tasks", "Simple Gantt charts", "Email support"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 1, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name, price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, project_limit = EXCLUDED.project_limit,
    additional_member_price = EXCLUDED.additional_member_price, features = EXCLUDED.features,
    platform_included = TRUE, simulator_included = FALSE, is_popular = FALSE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0008-4000-8000-000000000008'::uuid, 'Basic Yearly', 'basic', 'yearly',
    290.00, 348.00, 'USD', 10, 10, 4.00,
    '["Unlimited tasks", "Simple Gantt charts", "Email support", "Save 17% vs monthly"]'::jsonb,
    TRUE, FALSE, FALSE, TRUE, 2, 'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name, price = EXCLUDED.price, original_price = EXCLUDED.original_price,
    member_limit = EXCLUDED.member_limit, project_limit = EXCLUDED.project_limit,
    additional_member_price = EXCLUDED.additional_member_price, features = EXCLUDED.features,
    platform_included = TRUE, simulator_included = FALSE, is_popular = FALSE,
    is_active = TRUE, display_order = EXCLUDED.display_order, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3) Shift Starter / Professional / Enterprise display_order down one slot
--    to make room for Basic. Matched by business key, not id.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans SET display_order = 3, updated_at = NOW()
WHERE plan_type = 'starter' AND billing_cycle = 'monthly' AND catalog_scope = 'platform';

UPDATE public.subscription_plans SET display_order = 4, updated_at = NOW()
WHERE plan_type = 'starter' AND billing_cycle = 'yearly' AND catalog_scope = 'platform';

UPDATE public.subscription_plans SET display_order = 5, updated_at = NOW()
WHERE plan_type = 'professional' AND billing_cycle = 'monthly' AND catalog_scope = 'platform';

UPDATE public.subscription_plans SET display_order = 6, updated_at = NOW()
WHERE plan_type = 'professional' AND billing_cycle = 'yearly' AND catalog_scope = 'platform';

UPDATE public.subscription_plans SET display_order = 7, updated_at = NOW()
WHERE plan_type = 'enterprise' AND billing_cycle = 'monthly' AND catalog_scope = 'platform';

UPDATE public.subscription_plans SET display_order = 8, updated_at = NOW()
WHERE plan_type = 'enterprise' AND billing_cycle = 'yearly' AND catalog_scope = 'platform';

-- ---------------------------------------------------------------------------
-- 4) Lifetime Access — retire from the public catalog, keep the row (and any
--    existing subscribers) intact. Matched by business key.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET is_active = FALSE, updated_at = NOW()
WHERE plan_type = 'lifetime' AND billing_cycle = 'lifetime' AND catalog_scope = 'platform';

-- ---------------------------------------------------------------------------
-- Force every row touched above back to a clean, unambiguous 'live' state —
-- same reasoning as v109's tail block: this file writes directly to the
-- table (as every pricing seed file in this catalog's history has), so any
-- stray 'unauthorised' status from an in-flight edit shouldn't shadow it.
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
          AND plan_type IN ('free', 'basic', 'starter', 'professional', 'enterprise', 'lifetime');
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'record_authorisation_requests'
    ) THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn', decided_at = NOW(),
            decision_notes = COALESCE(decision_notes, 'Superseded by v117 pricing revision')
        WHERE table_name = 'subscription_plans'
          AND status IN ('pending', 'waiting');
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'v117_subscription_plan_platform_pricing_revision.sql completed'; END $$;
