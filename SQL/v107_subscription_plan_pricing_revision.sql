-- ============================================================================
-- v107: Platform subscription_plans pricing revision
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v38 (plan catalog seed), v44 (plan_type incl. 'free'), v77/v78
--                 (catalog_scope column + platform/simulator isolation)
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Run: node scripts/run-admin-sql.js SQL/v107_subscription_plan_pricing_revision.sql
--
-- WHY THIS FILE EXISTS
-- The live "User Pricing Preview" page was showing Professional $30/mo,
-- Enterprise $300/mo, a Free tier, and a $1,000 Lifetime tier. None of those
-- numbers exist in any committed seed file (v38 here or v113 in project-nidus)
-- — both agree on Starter $29 / Professional $79 / Enterprise $199 / Lifetime
-- $999, and neither seeds a Free row. The live catalog was therefore edited
-- directly through the Plan Catalog CRUD UI (admin.update_subscription_plan,
-- v92) without ever being captured as a versioned seed file — pricing has
-- silently drifted out of source control. This file re-establishes a single
-- versioned source of truth for Platform pricing and gives the Free tier a
-- real seed row for the first time.
--
-- WHY THE NUMBERS ARE CHANGING (not just re-stating old ones)
-- At the OLD prices, effective $/user was $1.00–$1.58 across Starter/
-- Professional/Enterprise, against a market of $10–25/user (Asana, ClickUp,
-- Wrike, monday.com) and $30–80/user for PPM-grade tools with the same
-- feature set this product has (Stage Gates, Benefits Management,
-- Configuration Items, PMO — Planview/Clarizen territory, not Trello
-- territory). Enterprise specifically bundled a dedicated account manager +
-- on-premise option + SLA guarantee for $1/user/month, which cannot fund
-- those commitments. This revision keeps the flat/capacity-based pricing
-- model (a genuine differentiator vs. competitors' per-seat pricing) but
-- moves effective $/user into a defensible range: still well below the
-- per-seat market, but no longer giving enterprise-grade governance away
-- near-free. See projectplans for the full comparison if one is written up.
--
-- PRICING CHANGE SUMMARY (review before running)
-- ┌──────────────┬────────────┬────────────┬───────────────┬───────────────┐
-- │ Plan          │ Old price  │ New price  │ Old $/user    │ New $/user    │
-- ├──────────────┼────────────┼────────────┼───────────────┼───────────────┤
-- │ Free (new)    │ —          │ $0/mo      │ —             │ —             │
-- │ Starter       │ $29/mo     │ $99/mo     │ $1.45 (20)    │ $4.95 (20)    │
-- │ Professional  │ $79/mo     │ $299/mo    │ $1.58 (50)    │ $5.98 (50)    │
-- │ Enterprise    │ $199/mo    │ $1,999/mo  │ $1.00 (200)   │ $9.995 (200)  │
-- │ Lifetime      │ $999 once  │ $1,499 once│ up to 100 mem │ up to 20 mem  │
-- └──────────────┴────────────┴────────────┴───────────────┴───────────────┘
-- Yearly rows use this catalog's existing "17% off annual" convention:
-- yearly_price = ROUND(monthly_price * 12 * 5/6, 2), original_price = monthly_price * 12.
--
-- WHY FREE IS THE ACCESSIBILITY LEVER, NOT THE PAID TIERS
-- Cost-to-build and price-to-charge are different axes — what it costs to
-- serve a user (hosting, support, uptime) doesn't shrink because the product
-- was built by one person with AI tooling, so the paid tiers above stay
-- priced to cover that regardless. "Accessible to many without a cost
-- barrier" is better served by making Free itself generous — enough for a
-- small team to run real projects on, not just kick the tyres — while
-- Professional/Enterprise keep funding the business. Free below is sized
-- against Asana's free tier (10 members) as the benchmark for "generous,"
-- with 3 projects (not 1) so a team can actually experience Gantt/task
-- management across more than a single project before deciding to upgrade.
--
-- SCOPE: only Platform-facing rows (catalog_scope = 'platform'), matched by
-- fixed id — Simulator's independently-isolated catalog rows (v78) are
-- untouched.
--
-- Member/project-limit feature bullets ("Up to N team members", "Unlimited
-- projects") are removed from the stored `features` array below. The
-- frontend (packages/shared/src/subscriptionPreviewCatalog.js,
-- syncPlanLimitFeatures) already regenerates those bullets from the
-- member_limit/project_limit columns on every render — storing them
-- separately in `features` is what caused the header-vs-bullet mismatches
-- ("Up to 2" vs "5 team members") seen on the live preview page. This is
-- the structural fix: one column drives both, permanently.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v107: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Free (new — Platform catalog never had a versioned Free row before this)
-- ---------------------------------------------------------------------------
INSERT INTO public.subscription_plans (
    id, plan_name, plan_type, billing_cycle, price, original_price, currency,
    member_limit, project_limit, additional_member_price, features,
    platform_included, simulator_included, is_popular, is_active, display_order,
    catalog_scope
) VALUES (
    'a7380001-0000-4000-8000-000000000000'::uuid,
    'Free',
    'free',
    'monthly',
    0.00,
    NULL,
    'USD',
    10,
    3,
    0.00,
    '[
        "Basic task management",
        "Simple Gantt charts",
        "Community support"
    ]'::jsonb,
    TRUE,
    FALSE,
    FALSE,
    TRUE,
    0,
    'platform'
)
ON CONFLICT (plan_type, billing_cycle, catalog_scope) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
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

-- ---------------------------------------------------------------------------
-- Starter Monthly / Yearly — $29 → $99/mo (20 members, +$5/extra, unchanged)
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET price = 99.00,
    features = '[
        "Unlimited tasks",
        "Basic Gantt charts",
        "Email support",
        "Mobile app access"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7380001-0001-4000-8000-000000000001'::uuid;

UPDATE public.subscription_plans
SET price = 990.00,
    original_price = 1188.00,
    features = '[
        "Unlimited tasks",
        "Basic Gantt charts",
        "Email support",
        "Mobile app access",
        "Save 17% vs monthly"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7380001-0002-4000-8000-000000000002'::uuid;

-- ---------------------------------------------------------------------------
-- Professional Monthly / Yearly — $79 → $299/mo (50 members, +$3 → +$8/extra)
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET price = 299.00,
    additional_member_price = 8.00,
    features = '[
        "Advanced Gantt charts",
        "Resource management",
        "Time tracking",
        "Custom reports",
        "Priority support",
        "API access",
        "Simulator module included"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7380001-0003-4000-8000-000000000003'::uuid;

UPDATE public.subscription_plans
SET price = 2990.00,
    original_price = 3588.00,
    additional_member_price = 8.00,
    features = '[
        "Advanced Gantt charts",
        "Resource management",
        "Time tracking",
        "Custom reports",
        "Priority support",
        "API access",
        "Simulator module included",
        "Save 17% vs monthly"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7380001-0004-4000-8000-000000000004'::uuid;

-- ---------------------------------------------------------------------------
-- Enterprise Monthly / Yearly — $199 → $1,999/mo (200 members, +$2 → +$25/extra)
-- See the commented-out "Contact us" alternative at the bottom of this file
-- if you'd rather not self-serve Enterprise at a fixed sticker price.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET price = 1999.00,
    additional_member_price = 25.00,
    features = '[
        "Everything in Professional",
        "Custom integrations",
        "Dedicated account manager",
        "SLA guarantee",
        "Advanced security",
        "On-premise option",
        "Custom training"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7380001-0005-4000-8000-000000000005'::uuid;

UPDATE public.subscription_plans
SET price = 19990.00,
    original_price = 23988.00,
    additional_member_price = 25.00,
    features = '[
        "Everything in Professional",
        "Custom integrations",
        "Dedicated account manager",
        "SLA guarantee",
        "Advanced security",
        "On-premise option",
        "Custom training",
        "Save 17% vs monthly"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7940001-0001-4000-8000-000000000001'::uuid;

-- ---------------------------------------------------------------------------
-- Lifetime Access — $999 (100 members, forever) → $1,499 (20 members, forever)
-- Cutting the seat cap is the important change here, not just the price:
-- an uncapped-scale lifetime deal has no ceiling on future hosting/support
-- cost. $1,499 for a 20-person team, one time, is a sustainable version of
-- the same offer.
-- ---------------------------------------------------------------------------
UPDATE public.subscription_plans
SET price = 1499.00,
    original_price = 2999.00,
    member_limit = 20,
    additional_member_price = 15.00,
    features = '[
        "One-time payment",
        "All Professional features",
        "Lifetime updates",
        "No recurring fees",
        "Best value",
        "Priority support forever"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'a7380001-0006-4000-8000-000000000006'::uuid;

DO $$ BEGIN RAISE NOTICE 'v107_subscription_plan_pricing_revision.sql completed'; END $$;

-- ============================================================================
-- OPTIONAL ALTERNATIVE — Enterprise as "Contact us" instead of a fixed price
-- ----------------------------------------------------------------------------
-- The codebase already renders price = NULL as "Contact us" / "Custom"
-- (packages/shared/src/subscriptionPreviewCatalog.js: formatPreviewPrice,
-- formatSubscriptionAmount) and this is how every competitor prices their
-- true enterprise tier (Asana, monday.com, Wrike, Smartsheet, Zoho all use
-- "Contact Sales" rather than a fixed self-serve number). Uncomment the two
-- statements below INSTEAD OF the Enterprise UPDATE blocks above if you'd
-- rather not commit to a fixed Enterprise sticker price. This requires
-- relaxing the NOT NULL constraint the table currently has on `price`.
--
-- ALTER TABLE public.subscription_plans ALTER COLUMN price DROP NOT NULL;
--
-- UPDATE public.subscription_plans SET price = NULL, updated_at = NOW()
-- WHERE id = 'a7380001-0005-4000-8000-000000000005'::uuid;
--
-- UPDATE public.subscription_plans SET price = NULL, updated_at = NOW()
-- WHERE id = 'a7940001-0001-4000-8000-000000000001'::uuid;
-- ============================================================================
