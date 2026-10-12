-- ============================================================================
-- v229: Admin can see INACTIVE subscription plans in the Plan Catalog
-- (found while pricing the Project Planner plans — monorepo plan v1239, Admin plan v211)
--
-- public.subscription_plans has a single read policy, subscription_plans_public_read
-- (is_active = TRUE), for anon and authenticated. Admin users sign in as `authenticated`, so the
-- Plan Catalog list (fetchAllSubscriptionPlans) never showed inactive plans: a plan seeded
-- inactive (e.g. the two Project Planner rows from monorepo SQL v1248) or deactivated in Admin
-- disappeared from the list, and could not be edited or re-activated there.
--
-- Fix: an extra permissive SELECT policy for signed-in Admin users only. Platform/Simulator
-- users and anonymous visitors still see active plans only. Writes are unchanged (Admin RPCs).
-- Idempotent.
-- ============================================================================

-- TRUE when the caller is an Admin user (same resolution the Admin RPCs use).
CREATE OR REPLACE FUNCTION public.auth_is_admin_user()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
  RETURN admin.current_admin_user_id() IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE; -- no admin context for this session
END;
$$;
REVOKE ALL ON FUNCTION public.auth_is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_admin_user() TO authenticated;

DROP POLICY IF EXISTS subscription_plans_admin_read ON public.subscription_plans;
CREATE POLICY subscription_plans_admin_read ON public.subscription_plans
  FOR SELECT TO authenticated
  USING ((SELECT public.auth_is_admin_user()));

NOTIFY pgrst, 'reload schema';

-- Check (as the SQL editor role this always shows every row; sign in to Admin to see the effect):
SELECT plan_name, plan_type, billing_cycle, price, is_active, catalog_scope
  FROM public.subscription_plans WHERE plan_type = 'planner';
