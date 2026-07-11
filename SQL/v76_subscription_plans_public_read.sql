-- ============================================================================
-- v76: Public read access to subscription_plans for Platform/Simulator pricing
-- PostgreSQL 15+ / Supabase
-- Prerequisites: public.subscription_plans (platform v113)
--
-- Fixes: "permission denied for table subscription_plans" on customer pricing pages.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v76: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

GRANT SELECT ON public.subscription_plans TO anon, authenticated;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_public_read ON public.subscription_plans;
CREATE POLICY subscription_plans_public_read ON public.subscription_plans
    FOR SELECT
    TO anon, authenticated
    USING (is_active = TRUE);

CREATE OR REPLACE FUNCTION public.get_public_subscription_plans()
RETURNS SETOF public.subscription_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT sp.*
    FROM public.subscription_plans sp
    WHERE sp.is_active = TRUE
    ORDER BY sp.display_order ASC NULLS LAST, sp.plan_name ASC;
$$;

COMMENT ON FUNCTION public.get_public_subscription_plans IS
    'Active subscription_plans rows for public pricing pages (Platform + Simulator).';

GRANT EXECUTE ON FUNCTION public.get_public_subscription_plans() TO anon, authenticated, service_role;
