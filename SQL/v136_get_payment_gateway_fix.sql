-- ============================================================================
-- v136: Fix get_payment_gateway — direct table query + lifecycle columns
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v46 (payment config), v97 (lifecycle columns on payment_gateways)
-- ============================================================================

DROP FUNCTION IF EXISTS admin.get_payment_gateway(UUID, UUID);

CREATE OR REPLACE FUNCTION admin.get_payment_gateway(
    p_gateway_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    provider_key TEXT,
    display_name TEXT,
    environment TEXT,
    api_key_masked TEXT,
    is_active BOOLEAN,
    is_default BOOLEAN,
    metadata JSONB,
    notes TEXT,
    routing_rule_count BIGINT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    record_status TEXT,
    root_record_id UUID
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

    IF NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_gateway_id) THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    RETURN QUERY
    SELECT
        g.id,
        g.name,
        g.provider_key,
        g.display_name,
        g.environment,
        g.api_key_masked,
        g.is_active,
        g.is_default,
        g.metadata,
        g.notes,
        (
            SELECT COUNT(*)::BIGINT
            FROM admin.payment_method_routing r
            WHERE r.is_enabled = TRUE
              AND (r.primary_gateway_id = g.id OR r.fallback_gateway_id = g.id)
        ) AS routing_rule_count,
        g.created_by,
        g.updated_by,
        g.created_at,
        g.updated_at,
        g.record_status,
        COALESCE(g.root_record_id, g.id) AS root_record_id
    FROM admin.payment_gateways g
    WHERE g.id = p_gateway_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.get_payment_gateway(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v136: get_payment_gateway fixed (direct query + lifecycle columns).';
END $$;
