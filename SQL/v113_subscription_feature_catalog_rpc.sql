-- ============================================================================
-- v113: SECURITY DEFINER RPC for subscription feature catalog dropdowns
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v33 (admin.subscription_feature_catalog)
-- Idempotent: CREATE OR REPLACE + GRANT. Safe to re-run.
--
-- Fixes admin UI "empty feature dropdown" when direct SELECT on
-- admin.subscription_feature_catalog fails (GRANT/RLS) for federated modules.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'subscription_feature_catalog'
    ) THEN
        RAISE NOTICE 'v113: Skipping — admin.subscription_feature_catalog does not exist (run v33 first).';
        RETURN;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_subscription_feature_catalog(p_target_system TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    feature_key VARCHAR,
    feature_label TEXT,
    description TEXT,
    category TEXT,
    target_system TEXT,
    sort_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT
        sfc.id,
        sfc.feature_key,
        sfc.feature_label,
        sfc.description,
        sfc.category,
        sfc.target_system,
        sfc.sort_order
    FROM admin.subscription_feature_catalog sfc
    WHERE sfc.is_active = TRUE
      AND (
          p_target_system IS NULL
          OR sfc.target_system = p_target_system
          OR sfc.target_system = 'both'
      )
    ORDER BY sfc.sort_order, sfc.feature_label;
$$;

COMMENT ON FUNCTION public.get_subscription_feature_catalog(TEXT) IS
    'Active subscription feature labels for admin plan/subscription forms.';

GRANT EXECUTE ON FUNCTION public.get_subscription_feature_catalog(TEXT) TO anon, authenticated, service_role;
