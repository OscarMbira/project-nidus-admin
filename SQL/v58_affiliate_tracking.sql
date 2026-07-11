-- ============================================================================
-- v58: Affiliate click and conversion tracking (public schema)
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v10.0_affiliate_program_plan.md (Phase 2)
-- Prerequisites: v56_affiliate_program.sql (admin.affiliates)
-- Run: pnpm run admin:migrate-affiliate-tracking
-- ============================================================================

-- ---------------------------------------------------------------------------
-- public.affiliate_clicks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_code TEXT NOT NULL,
    target_system TEXT NOT NULL CHECK (target_system IN ('platform', 'simulator', 'both')),
    referral_url TEXT,
    landing_path TEXT,
    ip_hash TEXT,
    user_agent_hash TEXT,
    session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_code ON public.affiliate_clicks (affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created ON public.affiliate_clicks (created_at DESC);

COMMENT ON TABLE public.affiliate_clicks IS 'Affiliate referral click events from platform/simulator landing pages';

-- ---------------------------------------------------------------------------
-- public.affiliate_conversions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_code TEXT NOT NULL,
    click_id UUID REFERENCES public.affiliate_clicks(id),
    user_id UUID REFERENCES auth.users(id),
    target_system TEXT NOT NULL CHECK (target_system IN ('platform', 'simulator')),
    conversion_type TEXT NOT NULL CHECK (conversion_type IN ('signup', 'subscription', 'upgrade')),
    subscription_id UUID,
    gross_amount NUMERIC(12, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    commission_amount NUMERIC(12, 2),
    commission_rate_pct NUMERIC(5, 2),
    credited_to_payout_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_code ON public.affiliate_conversions (affiliate_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_user ON public.affiliate_conversions (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_created ON public.affiliate_conversions (created_at DESC);

COMMENT ON TABLE public.affiliate_conversions IS 'Affiliate signup/subscription conversion events';

-- ---------------------------------------------------------------------------
-- Admin console read helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.can_view_affiliate_tracking()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(
           admin.current_admin_user_id(),
           'affiliate:view'
       );
$$;

COMMENT ON FUNCTION admin.can_view_affiliate_tracking() IS
    'TRUE when the authenticated session is an active admin with affiliate:view';

GRANT EXECUTE ON FUNCTION admin.can_view_affiliate_tracking() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_clicks_admin_select ON public.affiliate_clicks;
CREATE POLICY affiliate_clicks_admin_select ON public.affiliate_clicks
    FOR SELECT TO authenticated
    USING (admin.can_view_affiliate_tracking());

DROP POLICY IF EXISTS affiliate_conversions_admin_select ON public.affiliate_conversions;
CREATE POLICY affiliate_conversions_admin_select ON public.affiliate_conversions
    FOR SELECT TO authenticated
    USING (admin.can_view_affiliate_tracking());

DROP POLICY IF EXISTS affiliate_conversions_own_select ON public.affiliate_conversions;
CREATE POLICY affiliate_conversions_own_select ON public.affiliate_conversions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

GRANT SELECT ON public.affiliate_clicks TO authenticated, service_role;
GRANT SELECT ON public.affiliate_conversions TO authenticated, service_role;
GRANT ALL ON public.affiliate_clicks TO service_role;
GRANT ALL ON public.affiliate_conversions TO service_role;

-- ---------------------------------------------------------------------------
-- public.track_affiliate_click
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_affiliate_click(
    p_code TEXT,
    p_target_system TEXT,
    p_referral_url TEXT DEFAULT NULL,
    p_landing_path TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_id UUID;
BEGIN
    v_code := upper(regexp_replace(trim(COALESCE(p_code, '')), '[^A-Za-z0-9]', '', 'g'));
    IF length(v_code) < 4 OR length(v_code) > 20 THEN
        RAISE EXCEPTION 'Invalid affiliate code format';
    END IF;

    IF p_target_system NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    INSERT INTO public.affiliate_clicks (
        affiliate_code, target_system, referral_url, landing_path, session_id
    )
    VALUES (
        v_code,
        p_target_system,
        NULLIF(trim(p_referral_url), ''),
        NULLIF(trim(p_landing_path), ''),
        NULLIF(trim(p_session_id), '')
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.track_affiliate_click(TEXT, TEXT, TEXT, TEXT, TEXT) IS
    'Record an affiliate referral click (anon-safe). Returns click_id UUID.';

-- ---------------------------------------------------------------------------
-- public.record_affiliate_conversion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_affiliate_conversion(
    p_affiliate_code TEXT,
    p_click_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_target_system TEXT DEFAULT 'platform',
    p_conversion_type TEXT DEFAULT 'signup',
    p_subscription_id UUID DEFAULT NULL,
    p_gross_amount NUMERIC DEFAULT NULL,
    p_currency VARCHAR DEFAULT 'USD'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
    v_code TEXT;
    v_id UUID;
    v_rate NUMERIC(5, 2);
    v_commission NUMERIC(12, 2);
BEGIN
    v_code := upper(regexp_replace(trim(COALESCE(p_affiliate_code, '')), '[^A-Za-z0-9]', '', 'g'));
    IF length(v_code) < 4 OR length(v_code) > 20 THEN
        RAISE EXCEPTION 'Invalid affiliate code format';
    END IF;

    IF p_target_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    IF p_conversion_type NOT IN ('signup', 'subscription', 'upgrade') THEN
        RAISE EXCEPTION 'Invalid conversion_type: %', p_conversion_type;
    END IF;

    SELECT commission_rate_pct INTO v_rate
    FROM admin.affiliates
    WHERE code = v_code AND status = 'active'
    LIMIT 1;

    IF v_rate IS NULL THEN
        v_rate := 10.00;
    END IF;

    IF p_gross_amount IS NOT NULL AND p_gross_amount > 0 THEN
        v_commission := round(p_gross_amount * v_rate / 100.0, 2);
    END IF;

    INSERT INTO public.affiliate_conversions (
        affiliate_code, click_id, user_id, target_system, conversion_type,
        subscription_id, gross_amount, currency, commission_amount, commission_rate_pct
    )
    VALUES (
        v_code,
        p_click_id,
        p_user_id,
        p_target_system,
        p_conversion_type,
        p_subscription_id,
        p_gross_amount,
        COALESCE(p_currency, 'USD'),
        v_commission,
        v_rate
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_affiliate_conversion(TEXT, UUID, UUID, TEXT, TEXT, UUID, NUMERIC, VARCHAR) IS
    'Record an affiliate conversion event (signup/subscription). Returns conversion_id UUID.';

GRANT EXECUTE ON FUNCTION public.track_affiliate_click(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_affiliate_conversion(TEXT, UUID, UUID, TEXT, TEXT, UUID, NUMERIC, VARCHAR) TO anon, authenticated, service_role;

DO $$ BEGIN
    RAISE NOTICE 'v58: Affiliate tracking tables and RPCs applied.';
END $$;
