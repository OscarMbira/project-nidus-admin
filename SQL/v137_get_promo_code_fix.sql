-- ============================================================================
-- v137: Fix get_promo_code — direct table query (avoid list_promo_codes wrapper)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v46 (payment config), v47 (promo seed)
-- ============================================================================

DROP FUNCTION IF EXISTS admin.get_promo_code(UUID, UUID);

CREATE OR REPLACE FUNCTION admin.get_promo_code(
    p_promo_code_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    code TEXT,
    name TEXT,
    description TEXT,
    discount_type TEXT,
    discount_value NUMERIC(10, 2),
    currency_code VARCHAR(3),
    max_uses INTEGER,
    current_uses INTEGER,
    remaining_uses INTEGER,
    redemption_rate_pct NUMERIC(5, 2),
    applicable_plan_keys TEXT[],
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.promo_codes WHERE id = p_promo_code_id) THEN
        RAISE EXCEPTION 'Promo code not found: %', p_promo_code_id;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.code,
        p.name,
        p.description,
        p.discount_type,
        p.discount_value,
        p.currency_code,
        p.max_uses,
        p.current_uses,
        CASE
            WHEN p.max_uses IS NULL THEN NULL
            ELSE GREATEST(p.max_uses - p.current_uses, 0)
        END AS remaining_uses,
        CASE
            WHEN p.max_uses IS NULL OR p.max_uses = 0 THEN NULL
            ELSE ROUND((p.current_uses::NUMERIC / p.max_uses::NUMERIC) * 100, 2)
        END AS redemption_rate_pct,
        p.applicable_plan_keys,
        p.valid_from,
        p.valid_until,
        p.is_active,
        p.created_by,
        p.updated_by,
        p.created_at,
        p.updated_at
    FROM admin.promo_codes p
    WHERE p.id = p_promo_code_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.get_promo_code(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v137: get_promo_code fixed (direct query).';
END $$;
