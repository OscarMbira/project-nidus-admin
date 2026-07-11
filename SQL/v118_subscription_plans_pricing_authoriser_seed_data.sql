-- ============================================================================
-- v118: Activate maker/checker authorisation for subscription_plans
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v95-v99 (record lifecycle infra/functions/gate),
--                v101 (record_lifecycle_config seed — subscription_plans
--                already has approval_enabled = TRUE), v100 (lifecycle.*
--                permissions granted to super_admin/system_admin)
-- Run: node scripts/run-admin-sql.js SQL/v118_subscription_plans_pricing_authoriser_seed_data.sql
--
-- WHY THIS FILE EXISTS
-- admin.update_subscription_plan (v98) only actually routes a change through
-- the approval queue when BOTH are true: record_lifecycle_config.approval_enabled
-- (already TRUE for subscription_plans since v101) AND at least one active row
-- exists in admin.record_authorisers for table_name = 'subscription_plans'.
-- v105 seeded a demo authoriser for cancellation_reason_categories only —
-- subscription_plans has never had one. So despite approval_enabled = TRUE,
-- v_governance_active has always evaluated to FALSE and every price/limit/
-- feature edit made through the Plan Catalog CRUD UI has applied instantly,
-- with no maker/checker separation. This file closes that gap.
--
-- WHO IS THE CHECKER
-- Maker = whoever holds subscriptions.edit or pricing.edit and edits a plan
-- via the Plan Catalog UI (this is already gated by admin.update_subscription_plan's
-- existing permission check). Checker = the authoriser seeded below. For a
-- real maker/checker split we want the checker to be a different admin than
-- whoever routinely edits prices day-to-day — this prefers the first active
-- system_admin, and only falls back to super_admin if no system_admin exists
-- yet (dev/QA environments typically only have the seeded super_admin from
-- `pnpm run admin:seed-super`). Both roles already hold lifecycle.authorise
-- (v100), so either can decide a pending request via
-- admin.process_authoriser_decision.
--
-- SCOPE NOTE — a known gap this file does NOT fix
-- admin.create_subscription_plan (v92) never calls admin.submit_for_authorisation
-- — only admin.update_subscription_plan does. So creating a brand-new plan row
-- (e.g. the Basic plan added in v117) still goes live immediately regardless
-- of this authoriser; only edits to an EXISTING row made via the Plan Catalog
-- UI's update path are gated. Extending create_subscription_plan to also
-- submit for authorisation would be a behavioural change to that RPC's
-- contract and is out of scope here — flagging it in case maker/checker on
-- plan creation (not just plan edits) turns out to matter.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'record_authorisers'
    ) THEN
        RAISE NOTICE 'v118: Skipping — admin.record_authorisers does not exist (run v95 first).';
        RETURN;
    END IF;
END $$;

INSERT INTO admin.record_authorisers (
    id,
    table_name,
    authoriser_admin_user_id,
    approval_level,
    role_label,
    is_active,
    created_by
)
SELECT
    'b8180001-0001-4118-8118-000000000001'::uuid,
    'subscription_plans',
    au.id,
    1,
    'Pricing Authoriser',
    TRUE,
    au.id
FROM admin.admin_users au
WHERE au.activation_status = 'active'
ORDER BY
    CASE WHEN au.role = 'system_admin' THEN 0 WHEN au.role = 'super_admin' THEN 1 ELSE 2 END,
    au.created_at
LIMIT 1
ON CONFLICT (table_name, authoriser_admin_user_id) DO UPDATE SET
    approval_level = EXCLUDED.approval_level,
    role_label = EXCLUDED.role_label,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM admin.record_authorisers
    WHERE table_name = 'subscription_plans' AND is_active = TRUE;

    IF v_count = 0 THEN
        RAISE NOTICE 'v118: No active admin user found — authoriser skipped. Run pnpm run admin:seed-super first, then re-run this file.';
    ELSE
        RAISE NOTICE 'v118: subscription_plans now has % active authoriser(s) — maker/checker is live for plan edits via admin.update_subscription_plan.', v_count;
    END IF;
END $$;
