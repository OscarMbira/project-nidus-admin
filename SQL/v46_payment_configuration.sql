-- ============================================================================
-- v46: Payment configuration infrastructure
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v18 (admin.currencies), v735 admin schema
-- Plan: projectplans/v7.0_payment_configuration_plan.md (Phase 1)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- admin.payment_gateways
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.payment_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider_key TEXT NOT NULL
        CHECK (provider_key IN ('paynow', 'flutterwave', 'paddle', 'razorpay', 'dlocal')),
    display_name TEXT NOT NULL,
    environment TEXT NOT NULL
        CHECK (environment IN ('sandbox', 'production')),
    api_key_masked TEXT,
    api_secret_hash TEXT,
    webhook_secret_hash TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    notes TEXT,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_provider_key
    ON admin.payment_gateways (provider_key);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_is_active
    ON admin.payment_gateways (is_active);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_is_default
    ON admin.payment_gateways (is_default)
    WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_payment_gateways_created_at
    ON admin.payment_gateways (created_at DESC);

COMMENT ON TABLE admin.payment_gateways IS
    'Payment processor gateway credentials and configuration';

-- ---------------------------------------------------------------------------
-- admin.payment_methods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_id UUID NOT NULL REFERENCES admin.payment_gateways(id) ON DELETE RESTRICT,
    method_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    supported_currencies TEXT[] NOT NULL DEFAULT '{USD}',
    min_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    max_amount NUMERIC(12, 2),
    fee_type TEXT NOT NULL DEFAULT 'none'
        CHECK (fee_type IN ('none', 'fixed', 'percentage')),
    fee_value NUMERIC(8, 4) NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_gateway_id
    ON admin.payment_methods (gateway_id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_is_enabled
    ON admin.payment_methods (is_enabled);

CREATE INDEX IF NOT EXISTS idx_payment_methods_created_at
    ON admin.payment_methods (created_at DESC);

COMMENT ON TABLE admin.payment_methods IS
    'Payment instruments supported by each gateway';

-- ---------------------------------------------------------------------------
-- admin.payment_method_routing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.payment_method_routing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_label TEXT NOT NULL,
    payment_method_id UUID NOT NULL REFERENCES admin.payment_methods(id) ON DELETE RESTRICT,
    primary_gateway_id UUID NOT NULL REFERENCES admin.payment_gateways(id) ON DELETE RESTRICT,
    fallback_gateway_id UUID REFERENCES admin.payment_gateways(id) ON DELETE SET NULL,
    region_scope TEXT NOT NULL
        CHECK (region_scope IN ('local', 'africa', 'global')),
    supported_countries TEXT[],
    display_order INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_method_routing_payment_method_id
    ON admin.payment_method_routing (payment_method_id);

CREATE INDEX IF NOT EXISTS idx_payment_method_routing_primary_gateway_id
    ON admin.payment_method_routing (primary_gateway_id);

CREATE INDEX IF NOT EXISTS idx_payment_method_routing_fallback_gateway_id
    ON admin.payment_method_routing (fallback_gateway_id)
    WHERE fallback_gateway_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_method_routing_is_enabled
    ON admin.payment_method_routing (is_enabled);

CREATE INDEX IF NOT EXISTS idx_payment_method_routing_created_at
    ON admin.payment_method_routing (created_at DESC);

COMMENT ON TABLE admin.payment_method_routing IS
    'Country-scoped routing from customer payment choices to gateways';

-- ---------------------------------------------------------------------------
-- admin.promo_codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (upper(code) = code),
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL
        CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    currency_code VARCHAR(3) REFERENCES admin.currencies(currency_code),
    max_uses INTEGER,
    current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
    applicable_plan_keys TEXT[],
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (max_uses IS NULL OR max_uses >= 0),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_is_active
    ON admin.promo_codes (is_active);

CREATE INDEX IF NOT EXISTS idx_promo_codes_created_at
    ON admin.promo_codes (created_at DESC);

COMMENT ON TABLE admin.promo_codes IS
    'Checkout discount codes with usage limits and plan scoping';

-- ---------------------------------------------------------------------------
-- admin.payment_retry_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.payment_retry_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL,
    gateway_id UUID REFERENCES admin.payment_gateways(id) ON DELETE SET NULL,
    failure_code TEXT,
    retry_schedule JSONB NOT NULL,
    max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1 AND max_attempts <= 6),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_retry_rules_gateway_id
    ON admin.payment_retry_rules (gateway_id)
    WHERE gateway_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_retry_rules_is_active
    ON admin.payment_retry_rules (is_active);

CREATE INDEX IF NOT EXISTS idx_payment_retry_rules_created_at
    ON admin.payment_retry_rules (created_at DESC);

COMMENT ON TABLE admin.payment_retry_rules IS
    'Automated retry schedules for failed payment attempts';

-- ---------------------------------------------------------------------------
-- admin.settlement_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.settlement_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name TEXT NOT NULL,
    gateway_id UUID REFERENCES admin.payment_gateways(id) ON DELETE SET NULL,
    bank_name TEXT NOT NULL,
    account_number_masked TEXT,
    routing_code_masked TEXT,
    currency_code VARCHAR(3) NOT NULL REFERENCES admin.currencies(currency_code),
    account_type TEXT NOT NULL DEFAULT 'checking'
        CHECK (account_type IN ('checking', 'savings', 'merchant')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_accounts_gateway_id
    ON admin.settlement_accounts (gateway_id)
    WHERE gateway_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_settlement_accounts_currency_code
    ON admin.settlement_accounts (currency_code);

CREATE INDEX IF NOT EXISTS idx_settlement_accounts_is_active
    ON admin.settlement_accounts (is_active);

CREATE INDEX IF NOT EXISTS idx_settlement_accounts_is_default
    ON admin.settlement_accounts (currency_code, is_default)
    WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_settlement_accounts_created_at
    ON admin.settlement_accounts (created_at DESC);

COMMENT ON TABLE admin.settlement_accounts IS
    'Bank and merchant settlement accounts for gateway reconciliation';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_payment_gateways_updated_at ON admin.payment_gateways;
CREATE TRIGGER trg_payment_gateways_updated_at
    BEFORE UPDATE ON admin.payment_gateways
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_methods_updated_at ON admin.payment_methods;
CREATE TRIGGER trg_payment_methods_updated_at
    BEFORE UPDATE ON admin.payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_method_routing_updated_at ON admin.payment_method_routing;
CREATE TRIGGER trg_payment_method_routing_updated_at
    BEFORE UPDATE ON admin.payment_method_routing
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_promo_codes_updated_at ON admin.promo_codes;
CREATE TRIGGER trg_promo_codes_updated_at
    BEFORE UPDATE ON admin.promo_codes
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_payment_retry_rules_updated_at ON admin.payment_retry_rules;
CREATE TRIGGER trg_payment_retry_rules_updated_at
    BEFORE UPDATE ON admin.payment_retry_rules
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_settlement_accounts_updated_at ON admin.settlement_accounts;
CREATE TRIGGER trg_settlement_accounts_updated_at
    BEFORE UPDATE ON admin.settlement_accounts
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.payment_method_routing ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.payment_retry_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.settlement_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_gateways_select ON admin.payment_gateways;
CREATE POLICY payment_gateways_select ON admin.payment_gateways
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS payment_methods_select ON admin.payment_methods;
CREATE POLICY payment_methods_select ON admin.payment_methods
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS payment_method_routing_select ON admin.payment_method_routing;
CREATE POLICY payment_method_routing_select ON admin.payment_method_routing
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS promo_codes_select ON admin.promo_codes;
CREATE POLICY promo_codes_select ON admin.promo_codes
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS payment_retry_rules_select ON admin.payment_retry_rules;
CREATE POLICY payment_retry_rules_select ON admin.payment_retry_rules
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS settlement_accounts_select ON admin.settlement_accounts;
CREATE POLICY settlement_accounts_select ON admin.settlement_accounts
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.payment_gateways TO authenticated;
GRANT SELECT ON admin.payment_methods TO authenticated;
GRANT SELECT ON admin.payment_method_routing TO authenticated;
GRANT SELECT ON admin.promo_codes TO authenticated;
GRANT SELECT ON admin.payment_retry_rules TO authenticated;
GRANT SELECT ON admin.settlement_accounts TO authenticated;
GRANT ALL ON admin.payment_gateways TO service_role;
GRANT ALL ON admin.payment_methods TO service_role;
GRANT ALL ON admin.payment_method_routing TO service_role;
GRANT ALL ON admin.promo_codes TO service_role;
GRANT ALL ON admin.payment_retry_rules TO service_role;
GRANT ALL ON admin.settlement_accounts TO service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers — credential masking and hashing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._mask_last_four(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_value IS NULL OR trim(p_value) = '' THEN NULL
        WHEN length(trim(p_value)) <= 4 THEN '****' || trim(p_value)
        ELSE '****' || right(trim(p_value), 4)
    END;
$$;

CREATE OR REPLACE FUNCTION admin._hash_sha256_secret(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_value IS NULL OR trim(p_value) = '' THEN NULL
        ELSE encode(digest(trim(p_value), 'sha256'), 'hex')
    END;
$$;

CREATE OR REPLACE FUNCTION admin._payment_config_safe_row(p_row JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT p_row - 'api_secret_hash' - 'webhook_secret_hash' - 'routing_code_masked';
$$;

-- ---------------------------------------------------------------------------
-- Payment gateway RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_payment_gateways(
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
            SELECT COUNT(*)
            FROM admin.payment_method_routing r
            WHERE r.is_enabled = TRUE
              AND (r.primary_gateway_id = g.id OR r.fallback_gateway_id = g.id)
        )::BIGINT AS routing_rule_count,
        g.created_by,
        g.updated_by,
        g.created_at,
        g.updated_at
    FROM admin.payment_gateways g
    ORDER BY g.is_default DESC, g.name;
END;
$$;

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

    IF NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_gateway_id) THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    RETURN QUERY
    SELECT *
    FROM admin.list_payment_gateways(v_admin_user_id) lg
    WHERE lg.id = p_gateway_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.create_payment_gateway(
    p_name TEXT,
    p_provider_key TEXT,
    p_display_name TEXT,
    p_environment TEXT,
    p_api_key TEXT DEFAULT NULL,
    p_api_secret TEXT DEFAULT NULL,
    p_webhook_secret TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT FALSE,
    p_is_default BOOLEAN DEFAULT FALSE,
    p_metadata JSONB DEFAULT '{}'::JSONB,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_new admin.payment_gateways%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    IF trim(COALESCE(p_name, '')) = '' OR trim(COALESCE(p_display_name, '')) = '' THEN
        RAISE EXCEPTION 'name and display_name are required';
    END IF;

    IF COALESCE(p_provider_key, '') NOT IN ('paynow', 'flutterwave', 'paddle', 'razorpay', 'dlocal') THEN
        RAISE EXCEPTION 'Invalid provider_key: %', p_provider_key;
    END IF;

    IF COALESCE(p_environment, '') NOT IN ('sandbox', 'production') THEN
        RAISE EXCEPTION 'Invalid environment: %', p_environment;
    END IF;

    IF COALESCE(p_is_default, FALSE) THEN
        UPDATE admin.payment_gateways
        SET is_default = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_default = TRUE;
    END IF;

    INSERT INTO admin.payment_gateways (
        name,
        provider_key,
        display_name,
        environment,
        api_key_masked,
        api_secret_hash,
        webhook_secret_hash,
        is_active,
        is_default,
        metadata,
        notes,
        created_by,
        updated_by
    )
    VALUES (
        trim(p_name),
        p_provider_key,
        trim(p_display_name),
        p_environment,
        admin._mask_last_four(p_api_key),
        admin._hash_sha256_secret(p_api_secret),
        admin._hash_sha256_secret(p_webhook_secret),
        COALESCE(p_is_active, FALSE),
        COALESCE(p_is_default, FALSE),
        COALESCE(p_metadata, '{}'::JSONB),
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.payment_gateways WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_gateway.create',
        'payment_gateway',
        v_id,
        jsonb_build_object('name', v_new.name, 'provider_key', v_new.provider_key),
        NULL,
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_payment_gateway(
    p_gateway_id UUID,
    p_name TEXT DEFAULT NULL,
    p_display_name TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT NULL,
    p_api_key TEXT DEFAULT NULL,
    p_api_secret TEXT DEFAULT NULL,
    p_webhook_secret TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_is_default BOOLEAN DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_gateways%ROWTYPE;
    v_new admin.payment_gateways%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_gateways
    WHERE id = p_gateway_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    IF p_environment IS NOT NULL AND p_environment NOT IN ('sandbox', 'production') THEN
        RAISE EXCEPTION 'Invalid environment: %', p_environment;
    END IF;

    IF COALESCE(p_is_default, FALSE) THEN
        UPDATE admin.payment_gateways
        SET is_default = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE is_default = TRUE
          AND id <> p_gateway_id;
    END IF;

    UPDATE admin.payment_gateways
    SET name = COALESCE(NULLIF(trim(p_name), ''), name),
        display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
        environment = COALESCE(p_environment, environment),
        api_key_masked = CASE
            WHEN p_api_key IS NULL OR trim(p_api_key) = '' THEN api_key_masked
            ELSE admin._mask_last_four(p_api_key)
        END,
        api_secret_hash = CASE
            WHEN p_api_secret IS NULL OR trim(p_api_secret) = '' THEN api_secret_hash
            ELSE admin._hash_sha256_secret(p_api_secret)
        END,
        webhook_secret_hash = CASE
            WHEN p_webhook_secret IS NULL OR trim(p_webhook_secret) = '' THEN webhook_secret_hash
            ELSE admin._hash_sha256_secret(p_webhook_secret)
        END,
        is_active = COALESCE(p_is_active, is_active),
        is_default = COALESCE(p_is_default, is_default),
        metadata = COALESCE(p_metadata, metadata),
        notes = CASE
            WHEN p_notes IS NULL THEN notes
            ELSE NULLIF(trim(p_notes), '')
        END,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_gateway_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_gateway.update',
        'payment_gateway',
        p_gateway_id,
        jsonb_build_object('name', v_new.name, 'provider_key', v_new.provider_key),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_payment_gateway(
    p_gateway_id UUID,
    p_active BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_gateways%ROWTYPE;
    v_new admin.payment_gateways%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_gateways
    WHERE id = p_gateway_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    UPDATE admin.payment_gateways
    SET is_active = COALESCE(p_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_gateway_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_gateway.toggle',
        'payment_gateway',
        p_gateway_id,
        jsonb_build_object('is_active', v_new.is_active),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.set_default_gateway(
    p_gateway_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_gateways%ROWTYPE;
    v_new admin.payment_gateways%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_gateways
    WHERE id = p_gateway_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    UPDATE admin.payment_gateways
    SET is_default = FALSE,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE is_default = TRUE;

    UPDATE admin.payment_gateways
    SET is_default = TRUE,
        is_active = TRUE,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_gateway_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_gateway.set_default',
        'payment_gateway',
        p_gateway_id,
        jsonb_build_object('name', v_new.name),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_payment_gateway(
    p_gateway_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_gateways%ROWTYPE;
    v_active_refs BIGINT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_gateways
    WHERE id = p_gateway_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    SELECT COUNT(*)
    INTO v_active_refs
    FROM admin.payment_method_routing r
    WHERE r.is_enabled = TRUE
      AND (r.primary_gateway_id = p_gateway_id OR r.fallback_gateway_id = p_gateway_id);

    IF v_active_refs > 0 THEN
        RAISE EXCEPTION 'Cannot delete gateway referenced by % active routing rule(s)', v_active_refs;
    END IF;

    DELETE FROM admin.payment_gateways
    WHERE id = p_gateway_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_gateway.delete',
        'payment_gateway',
        p_gateway_id,
        jsonb_build_object('name', v_prev.name, 'provider_key', v_prev.provider_key),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Payment method RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_payment_methods(
    p_gateway_id UUID DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    gateway_id UUID,
    gateway_name TEXT,
    gateway_provider_key TEXT,
    method_type TEXT,
    display_name TEXT,
    supported_currencies TEXT[],
    min_amount NUMERIC(12, 2),
    max_amount NUMERIC(12, 2),
    fee_type TEXT,
    fee_value NUMERIC(8, 4),
    display_order INTEGER,
    is_enabled BOOLEAN,
    routing_rule_count BIGINT,
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

    RETURN QUERY
    SELECT
        m.id,
        m.gateway_id,
        g.name AS gateway_name,
        g.provider_key AS gateway_provider_key,
        m.method_type,
        m.display_name,
        m.supported_currencies,
        m.min_amount,
        m.max_amount,
        m.fee_type,
        m.fee_value,
        m.display_order,
        m.is_enabled,
        (
            SELECT COUNT(*)
            FROM admin.payment_method_routing r
            WHERE r.payment_method_id = m.id
        )::BIGINT AS routing_rule_count,
        m.created_by,
        m.updated_by,
        m.created_at,
        m.updated_at
    FROM admin.payment_methods m
    JOIN admin.payment_gateways g ON g.id = m.gateway_id
    WHERE p_gateway_id IS NULL OR m.gateway_id = p_gateway_id
    ORDER BY g.name, m.display_order, m.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_payment_method(
    p_gateway_id UUID,
    p_method_type TEXT,
    p_display_name TEXT,
    p_id UUID DEFAULT NULL,
    p_supported_currencies TEXT[] DEFAULT '{USD}',
    p_min_amount NUMERIC DEFAULT 0,
    p_max_amount NUMERIC DEFAULT NULL,
    p_fee_type TEXT DEFAULT 'none',
    p_fee_value NUMERIC DEFAULT 0,
    p_display_order INTEGER DEFAULT 0,
    p_is_enabled BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_prev admin.payment_methods%ROWTYPE;
    v_new admin.payment_methods%ROWTYPE;
    v_action TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    IF p_gateway_id IS NULL THEN
        RAISE EXCEPTION 'gateway_id is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_gateway_id) THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    IF trim(COALESCE(p_method_type, '')) = '' OR trim(COALESCE(p_display_name, '')) = '' THEN
        RAISE EXCEPTION 'method_type and display_name are required';
    END IF;

    IF COALESCE(p_fee_type, 'none') NOT IN ('none', 'fixed', 'percentage') THEN
        RAISE EXCEPTION 'Invalid fee_type: %', p_fee_type;
    END IF;

    IF p_max_amount IS NOT NULL AND p_max_amount < COALESCE(p_min_amount, 0) THEN
        RAISE EXCEPTION 'max_amount must be greater than or equal to min_amount';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO admin.payment_methods (
            gateway_id,
            method_type,
            display_name,
            supported_currencies,
            min_amount,
            max_amount,
            fee_type,
            fee_value,
            display_order,
            is_enabled,
            created_by,
            updated_by
        )
        VALUES (
            p_gateway_id,
            lower(trim(p_method_type)),
            trim(p_display_name),
            COALESCE(p_supported_currencies, '{USD}'),
            COALESCE(p_min_amount, 0),
            p_max_amount,
            COALESCE(p_fee_type, 'none'),
            COALESCE(p_fee_value, 0),
            COALESCE(p_display_order, 0),
            COALESCE(p_is_enabled, TRUE),
            v_admin_user_id,
            v_admin_user_id
        )
        RETURNING id INTO v_id;

        v_action := 'payment_method.create';
    ELSE
        SELECT * INTO v_prev
        FROM admin.payment_methods
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Payment method not found: %', p_id;
        END IF;

        UPDATE admin.payment_methods
        SET gateway_id = p_gateway_id,
            method_type = lower(trim(p_method_type)),
            display_name = trim(p_display_name),
            supported_currencies = COALESCE(p_supported_currencies, supported_currencies),
            min_amount = COALESCE(p_min_amount, min_amount),
            max_amount = p_max_amount,
            fee_type = COALESCE(p_fee_type, fee_type),
            fee_value = COALESCE(p_fee_value, fee_value),
            display_order = COALESCE(p_display_order, display_order),
            is_enabled = COALESCE(p_is_enabled, is_enabled),
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;

        v_action := 'payment_method.update';
    END IF;

    SELECT * INTO v_new FROM admin.payment_methods WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        v_action,
        'payment_method',
        v_id,
        jsonb_build_object(
            'gateway_id', v_new.gateway_id,
            'method_type', v_new.method_type,
            'display_name', v_new.display_name
        ),
        CASE WHEN v_action = 'payment_method.update' THEN to_jsonb(v_prev) ELSE NULL END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_payment_method(
    p_method_id UUID,
    p_enabled BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_methods%ROWTYPE;
    v_new admin.payment_methods%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_methods
    WHERE id = p_method_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment method not found: %', p_method_id;
    END IF;

    UPDATE admin.payment_methods
    SET is_enabled = COALESCE(p_enabled, is_enabled),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_method_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_method.toggle',
        'payment_method',
        p_method_id,
        jsonb_build_object('is_enabled', v_new.is_enabled),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_payment_method(
    p_method_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_methods%ROWTYPE;
    v_refs BIGINT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_methods
    WHERE id = p_method_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment method not found: %', p_method_id;
    END IF;

    SELECT COUNT(*)
    INTO v_refs
    FROM admin.payment_method_routing r
    WHERE r.payment_method_id = p_method_id;

    IF v_refs > 0 THEN
        RAISE EXCEPTION 'Cannot delete payment method referenced by % routing rule(s)', v_refs;
    END IF;

    DELETE FROM admin.payment_methods
    WHERE id = p_method_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_method.delete',
        'payment_method',
        p_method_id,
        jsonb_build_object('method_type', v_prev.method_type, 'display_name', v_prev.display_name),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Method routing RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_routing_rules(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    display_label TEXT,
    payment_method_id UUID,
    method_type TEXT,
    method_display_name TEXT,
    primary_gateway_id UUID,
    primary_gateway_name TEXT,
    primary_gateway_provider TEXT,
    fallback_gateway_id UUID,
    fallback_gateway_name TEXT,
    fallback_gateway_provider TEXT,
    region_scope TEXT,
    supported_countries TEXT[],
    display_order INTEGER,
    is_enabled BOOLEAN,
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

    RETURN QUERY
    SELECT
        r.id,
        r.display_label,
        r.payment_method_id,
        m.method_type,
        m.display_name AS method_display_name,
        r.primary_gateway_id,
        pg.name AS primary_gateway_name,
        pg.provider_key AS primary_gateway_provider,
        r.fallback_gateway_id,
        fg.name AS fallback_gateway_name,
        fg.provider_key AS fallback_gateway_provider,
        r.region_scope,
        r.supported_countries,
        r.display_order,
        r.is_enabled,
        r.created_by,
        r.updated_by,
        r.created_at,
        r.updated_at
    FROM admin.payment_method_routing r
    JOIN admin.payment_methods m ON m.id = r.payment_method_id
    JOIN admin.payment_gateways pg ON pg.id = r.primary_gateway_id
    LEFT JOIN admin.payment_gateways fg ON fg.id = r.fallback_gateway_id
    ORDER BY r.display_order, r.display_label;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_routing_rule(
    p_display_label TEXT,
    p_payment_method_id UUID,
    p_primary_gateway_id UUID,
    p_id UUID DEFAULT NULL,
    p_fallback_gateway_id UUID DEFAULT NULL,
    p_region_scope TEXT DEFAULT 'global',
    p_supported_countries TEXT[] DEFAULT NULL,
    p_display_order INTEGER DEFAULT 0,
    p_is_enabled BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_prev admin.payment_method_routing%ROWTYPE;
    v_new admin.payment_method_routing%ROWTYPE;
    v_action TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    IF trim(COALESCE(p_display_label, '')) = '' THEN
        RAISE EXCEPTION 'display_label is required';
    END IF;

    IF p_payment_method_id IS NULL OR p_primary_gateway_id IS NULL THEN
        RAISE EXCEPTION 'payment_method_id and primary_gateway_id are required';
    END IF;

    IF COALESCE(p_region_scope, 'global') NOT IN ('local', 'africa', 'global') THEN
        RAISE EXCEPTION 'Invalid region_scope: %', p_region_scope;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.payment_methods WHERE id = p_payment_method_id) THEN
        RAISE EXCEPTION 'Payment method not found: %', p_payment_method_id;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_primary_gateway_id) THEN
        RAISE EXCEPTION 'Primary gateway not found: %', p_primary_gateway_id;
    END IF;

    IF p_fallback_gateway_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_fallback_gateway_id) THEN
        RAISE EXCEPTION 'Fallback gateway not found: %', p_fallback_gateway_id;
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO admin.payment_method_routing (
            display_label,
            payment_method_id,
            primary_gateway_id,
            fallback_gateway_id,
            region_scope,
            supported_countries,
            display_order,
            is_enabled,
            created_by,
            updated_by
        )
        VALUES (
            trim(p_display_label),
            p_payment_method_id,
            p_primary_gateway_id,
            p_fallback_gateway_id,
            p_region_scope,
            p_supported_countries,
            COALESCE(p_display_order, 0),
            COALESCE(p_is_enabled, TRUE),
            v_admin_user_id,
            v_admin_user_id
        )
        RETURNING id INTO v_id;

        v_action := 'payment_routing.create';
    ELSE
        SELECT * INTO v_prev
        FROM admin.payment_method_routing
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Routing rule not found: %', p_id;
        END IF;

        UPDATE admin.payment_method_routing
        SET display_label = trim(p_display_label),
            payment_method_id = p_payment_method_id,
            primary_gateway_id = p_primary_gateway_id,
            fallback_gateway_id = p_fallback_gateway_id,
            region_scope = p_region_scope,
            supported_countries = p_supported_countries,
            display_order = COALESCE(p_display_order, display_order),
            is_enabled = COALESCE(p_is_enabled, is_enabled),
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;

        v_action := 'payment_routing.update';
    END IF;

    SELECT * INTO v_new FROM admin.payment_method_routing WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        v_action,
        'payment_routing',
        v_id,
        jsonb_build_object('display_label', v_new.display_label),
        CASE WHEN v_action = 'payment_routing.update' THEN to_jsonb(v_prev) ELSE NULL END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_routing_rule(
    p_rule_id UUID,
    p_enabled BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_method_routing%ROWTYPE;
    v_new admin.payment_method_routing%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_method_routing
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Routing rule not found: %', p_rule_id;
    END IF;

    UPDATE admin.payment_method_routing
    SET is_enabled = COALESCE(p_enabled, is_enabled),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_routing.toggle',
        'payment_routing',
        p_rule_id,
        jsonb_build_object('is_enabled', v_new.is_enabled),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.reorder_routing_rules(
    p_ids UUID[],
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_i INTEGER;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'p_ids must be a non-empty UUID array';
    END IF;

    FOR v_i IN 1..array_length(p_ids, 1) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM admin.payment_method_routing WHERE id = p_ids[v_i]
        ) THEN
            RAISE EXCEPTION 'Routing rule not found: %', p_ids[v_i];
        END IF;

        UPDATE admin.payment_method_routing
        SET display_order = v_i - 1,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_ids[v_i];
    END LOOP;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_routing.reorder',
        'payment_routing',
        NULL,
        jsonb_build_object('ordered_ids', to_jsonb(p_ids)),
        NULL,
        NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_routing_rule(
    p_rule_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_method_routing%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_method_routing
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Routing rule not found: %', p_rule_id;
    END IF;

    DELETE FROM admin.payment_method_routing
    WHERE id = p_rule_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_routing.delete',
        'payment_routing',
        p_rule_id,
        jsonb_build_object('display_label', v_prev.display_label),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.resolve_payment_methods(
    p_country_code TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    routing_rule_id UUID,
    display_label TEXT,
    method_type TEXT,
    payment_method_id UUID,
    method_display_name TEXT,
    primary_gateway_id UUID,
    primary_gateway_name TEXT,
    primary_gateway_provider TEXT,
    fallback_gateway_id UUID,
    fallback_gateway_name TEXT,
    fallback_gateway_provider TEXT,
    region_scope TEXT,
    supported_countries TEXT[],
    display_order INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_country TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.view') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.view required';
    END IF;

    v_country := upper(trim(COALESCE(p_country_code, '')));
    IF length(v_country) <> 2 THEN
        RAISE EXCEPTION 'country_code must be a 2-character ISO code';
    END IF;

    RETURN QUERY
    SELECT
        r.id AS routing_rule_id,
        r.display_label,
        m.method_type,
        m.id AS payment_method_id,
        m.display_name AS method_display_name,
        pg.id AS primary_gateway_id,
        pg.name AS primary_gateway_name,
        pg.provider_key AS primary_gateway_provider,
        fg.id AS fallback_gateway_id,
        fg.name AS fallback_gateway_name,
        fg.provider_key AS fallback_gateway_provider,
        r.region_scope,
        r.supported_countries,
        r.display_order
    FROM admin.payment_method_routing r
    JOIN admin.payment_methods m ON m.id = r.payment_method_id AND m.is_enabled = TRUE
    JOIN admin.payment_gateways pg ON pg.id = r.primary_gateway_id AND pg.is_active = TRUE
    LEFT JOIN admin.payment_gateways fg ON fg.id = r.fallback_gateway_id AND fg.is_active = TRUE
    WHERE r.is_enabled = TRUE
      AND (
          r.supported_countries IS NULL
          OR v_country = ANY(r.supported_countries)
      )
      AND NOT (m.method_type = 'paypal' AND v_country = 'ZW')
    ORDER BY r.display_order, r.display_label;
END;
$$;

-- ---------------------------------------------------------------------------
-- Promo code RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_promo_codes(
    p_active_only BOOLEAN DEFAULT NULL,
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
    WHERE p_active_only IS NULL OR p.is_active = p_active_only
    ORDER BY p.created_at DESC;
END;
$$;

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
    SELECT *
    FROM admin.list_promo_codes(NULL, v_admin_user_id) lp
    WHERE lp.id = p_promo_code_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.create_promo_code(
    p_code TEXT,
    p_name TEXT,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_description TEXT DEFAULT NULL,
    p_currency_code VARCHAR(3) DEFAULT NULL,
    p_max_uses INTEGER DEFAULT NULL,
    p_applicable_plan_keys TEXT[] DEFAULT NULL,
    p_valid_from TIMESTAMPTZ DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_code TEXT;
    v_currency VARCHAR(3);
    v_id UUID;
    v_new admin.promo_codes%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    v_code := upper(trim(COALESCE(p_code, '')));
    IF v_code = '' OR trim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'code and name are required';
    END IF;

    IF COALESCE(p_discount_type, '') NOT IN ('percentage', 'fixed_amount') THEN
        RAISE EXCEPTION 'Invalid discount_type: %', p_discount_type;
    END IF;

    IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
        RAISE EXCEPTION 'discount_value must be greater than zero';
    END IF;

    IF p_discount_type = 'percentage' AND p_discount_value > 100 THEN
        RAISE EXCEPTION 'percentage discount cannot exceed 100';
    END IF;

    IF p_currency_code IS NOT NULL THEN
        v_currency := upper(trim(p_currency_code));
        IF NOT EXISTS (SELECT 1 FROM admin.currencies WHERE currency_code = v_currency) THEN
            RAISE EXCEPTION 'Currency not found: %', v_currency;
        END IF;
    END IF;

    IF p_valid_until IS NOT NULL AND p_valid_from IS NOT NULL AND p_valid_until < p_valid_from THEN
        RAISE EXCEPTION 'valid_until must be on or after valid_from';
    END IF;

    INSERT INTO admin.promo_codes (
        code,
        name,
        description,
        discount_type,
        discount_value,
        currency_code,
        max_uses,
        applicable_plan_keys,
        valid_from,
        valid_until,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        v_code,
        trim(p_name),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        p_discount_type,
        p_discount_value,
        v_currency,
        p_max_uses,
        p_applicable_plan_keys,
        p_valid_from,
        p_valid_until,
        COALESCE(p_is_active, TRUE),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.promo_codes WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'promo_code.create',
        'promo_code',
        v_id,
        jsonb_build_object('code', v_new.code),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_promo_code(
    p_promo_code_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_discount_type TEXT DEFAULT NULL,
    p_discount_value NUMERIC DEFAULT NULL,
    p_currency_code VARCHAR(3) DEFAULT NULL,
    p_max_uses INTEGER DEFAULT NULL,
    p_applicable_plan_keys TEXT[] DEFAULT NULL,
    p_valid_from TIMESTAMPTZ DEFAULT NULL,
    p_valid_until TIMESTAMPTZ DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_currency VARCHAR(3);
    v_prev admin.promo_codes%ROWTYPE;
    v_new admin.promo_codes%ROWTYPE;
    v_valid_from TIMESTAMPTZ;
    v_valid_until TIMESTAMPTZ;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.promo_codes
    WHERE id = p_promo_code_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Promo code not found: %', p_promo_code_id;
    END IF;

    IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('percentage', 'fixed_amount') THEN
        RAISE EXCEPTION 'Invalid discount_type: %', p_discount_type;
    END IF;

    IF p_discount_value IS NOT NULL AND p_discount_value <= 0 THEN
        RAISE EXCEPTION 'discount_value must be greater than zero';
    END IF;

    IF COALESCE(p_discount_type, v_prev.discount_type) = 'percentage'
       AND COALESCE(p_discount_value, v_prev.discount_value) > 100 THEN
        RAISE EXCEPTION 'percentage discount cannot exceed 100';
    END IF;

    IF p_currency_code IS NOT NULL THEN
        v_currency := upper(trim(p_currency_code));
        IF NOT EXISTS (SELECT 1 FROM admin.currencies WHERE currency_code = v_currency) THEN
            RAISE EXCEPTION 'Currency not found: %', v_currency;
        END IF;
    END IF;

    v_valid_from := COALESCE(p_valid_from, v_prev.valid_from);
    v_valid_until := CASE
        WHEN p_valid_until IS NULL AND p_valid_from IS NULL THEN v_prev.valid_until
        ELSE p_valid_until
    END;

    IF v_valid_until IS NOT NULL AND v_valid_from IS NOT NULL AND v_valid_until < v_valid_from THEN
        RAISE EXCEPTION 'valid_until must be on or after valid_from';
    END IF;

    UPDATE admin.promo_codes
    SET name = COALESCE(NULLIF(trim(p_name), ''), name),
        description = CASE
            WHEN p_description IS NULL THEN description
            ELSE NULLIF(trim(p_description), '')
        END,
        discount_type = COALESCE(p_discount_type, discount_type),
        discount_value = COALESCE(p_discount_value, discount_value),
        currency_code = COALESCE(v_currency, currency_code),
        max_uses = COALESCE(p_max_uses, max_uses),
        applicable_plan_keys = COALESCE(p_applicable_plan_keys, applicable_plan_keys),
        valid_from = v_valid_from,
        valid_until = v_valid_until,
        is_active = COALESCE(p_is_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_promo_code_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'promo_code.update',
        'promo_code',
        p_promo_code_id,
        jsonb_build_object('code', v_new.code),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_promo_code(
    p_promo_code_id UUID,
    p_active BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.promo_codes%ROWTYPE;
    v_new admin.promo_codes%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.promo_codes
    WHERE id = p_promo_code_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Promo code not found: %', p_promo_code_id;
    END IF;

    UPDATE admin.promo_codes
    SET is_active = COALESCE(p_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_promo_code_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'promo_code.toggle',
        'promo_code',
        p_promo_code_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_promo_code(
    p_promo_code_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.promo_codes%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.promo_codes
    WHERE id = p_promo_code_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Promo code not found: %', p_promo_code_id;
    END IF;

    IF v_prev.current_uses > 0 THEN
        RAISE EXCEPTION 'Cannot delete promo code with existing redemptions (current_uses = %)', v_prev.current_uses;
    END IF;

    DELETE FROM admin.promo_codes
    WHERE id = p_promo_code_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'promo_code.delete',
        'promo_code',
        p_promo_code_id,
        jsonb_build_object('code', v_prev.code),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Payment retry rule RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_retry_rules(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    rule_name TEXT,
    gateway_id UUID,
    gateway_name TEXT,
    gateway_provider_key TEXT,
    failure_code TEXT,
    retry_schedule JSONB,
    max_attempts INTEGER,
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

    RETURN QUERY
    SELECT
        rr.id,
        rr.rule_name,
        rr.gateway_id,
        g.name AS gateway_name,
        g.provider_key AS gateway_provider_key,
        rr.failure_code,
        rr.retry_schedule,
        rr.max_attempts,
        rr.is_active,
        rr.created_by,
        rr.updated_by,
        rr.created_at,
        rr.updated_at
    FROM admin.payment_retry_rules rr
    LEFT JOIN admin.payment_gateways g ON g.id = rr.gateway_id
    ORDER BY rr.rule_name;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_retry_rule(
    p_rule_name TEXT,
    p_retry_schedule JSONB,
    p_id UUID DEFAULT NULL,
    p_gateway_id UUID DEFAULT NULL,
    p_failure_code TEXT DEFAULT NULL,
    p_max_attempts INTEGER DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_prev admin.payment_retry_rules%ROWTYPE;
    v_new admin.payment_retry_rules%ROWTYPE;
    v_action TEXT;
    v_schedule_len INTEGER;
    v_attempts INTEGER;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    IF trim(COALESCE(p_rule_name, '')) = '' THEN
        RAISE EXCEPTION 'rule_name is required';
    END IF;

    IF p_retry_schedule IS NULL OR jsonb_typeof(p_retry_schedule) <> 'array' THEN
        RAISE EXCEPTION 'retry_schedule must be a JSON array';
    END IF;

    v_schedule_len := jsonb_array_length(p_retry_schedule);
    IF v_schedule_len < 1 OR v_schedule_len > 6 THEN
        RAISE EXCEPTION 'retry_schedule must contain between 1 and 6 rows';
    END IF;

    v_attempts := COALESCE(p_max_attempts, v_schedule_len);
    IF v_attempts < 1 OR v_attempts > 6 THEN
        RAISE EXCEPTION 'max_attempts must be between 1 and 6';
    END IF;

    IF p_gateway_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_gateway_id) THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO admin.payment_retry_rules (
            rule_name,
            gateway_id,
            failure_code,
            retry_schedule,
            max_attempts,
            is_active,
            created_by,
            updated_by
        )
        VALUES (
            trim(p_rule_name),
            p_gateway_id,
            NULLIF(trim(COALESCE(p_failure_code, '')), ''),
            p_retry_schedule,
            v_attempts,
            COALESCE(p_is_active, TRUE),
            v_admin_user_id,
            v_admin_user_id
        )
        RETURNING id INTO v_id;

        v_action := 'payment_retry_rule.create';
    ELSE
        SELECT * INTO v_prev
        FROM admin.payment_retry_rules
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Retry rule not found: %', p_id;
        END IF;

        UPDATE admin.payment_retry_rules
        SET rule_name = trim(p_rule_name),
            gateway_id = p_gateway_id,
            failure_code = NULLIF(trim(COALESCE(p_failure_code, '')), ''),
            retry_schedule = p_retry_schedule,
            max_attempts = v_attempts,
            is_active = COALESCE(p_is_active, is_active),
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;

        v_action := 'payment_retry_rule.update';
    END IF;

    SELECT * INTO v_new FROM admin.payment_retry_rules WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        v_action,
        'payment_retry_rule',
        v_id,
        jsonb_build_object('rule_name', v_new.rule_name),
        CASE WHEN v_action = 'payment_retry_rule.update' THEN to_jsonb(v_prev) ELSE NULL END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_retry_rule(
    p_rule_id UUID,
    p_active BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_retry_rules%ROWTYPE;
    v_new admin.payment_retry_rules%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_retry_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Retry rule not found: %', p_rule_id;
    END IF;

    UPDATE admin.payment_retry_rules
    SET is_active = COALESCE(p_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_retry_rule.toggle',
        'payment_retry_rule',
        p_rule_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_retry_rule(
    p_rule_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.payment_retry_rules%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.payment_retry_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Retry rule not found: %', p_rule_id;
    END IF;

    DELETE FROM admin.payment_retry_rules
    WHERE id = p_rule_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'payment_retry_rule.delete',
        'payment_retry_rule',
        p_rule_id,
        jsonb_build_object('rule_name', v_prev.rule_name),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Settlement account RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_settlement_accounts(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    account_name TEXT,
    gateway_id UUID,
    gateway_name TEXT,
    gateway_provider_key TEXT,
    bank_name TEXT,
    account_number_masked TEXT,
    currency_code VARCHAR(3),
    account_type TEXT,
    is_default BOOLEAN,
    is_active BOOLEAN,
    notes TEXT,
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

    RETURN QUERY
    SELECT
        sa.id,
        sa.account_name,
        sa.gateway_id,
        g.name AS gateway_name,
        g.provider_key AS gateway_provider_key,
        sa.bank_name,
        sa.account_number_masked,
        sa.currency_code,
        sa.account_type,
        sa.is_default,
        sa.is_active,
        sa.notes,
        sa.created_by,
        sa.updated_by,
        sa.created_at,
        sa.updated_at
    FROM admin.settlement_accounts sa
    LEFT JOIN admin.payment_gateways g ON g.id = sa.gateway_id
    ORDER BY sa.currency_code, sa.is_default DESC, sa.account_name;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_settlement_account(
    p_account_name TEXT,
    p_bank_name TEXT,
    p_currency_code VARCHAR(3),
    p_id UUID DEFAULT NULL,
    p_gateway_id UUID DEFAULT NULL,
    p_account_number TEXT DEFAULT NULL,
    p_routing_code TEXT DEFAULT NULL,
    p_account_type TEXT DEFAULT 'checking',
    p_is_default BOOLEAN DEFAULT FALSE,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_currency VARCHAR(3);
    v_id UUID;
    v_prev admin.settlement_accounts%ROWTYPE;
    v_new admin.settlement_accounts%ROWTYPE;
    v_action TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    IF trim(COALESCE(p_account_name, '')) = '' OR trim(COALESCE(p_bank_name, '')) = '' THEN
        RAISE EXCEPTION 'account_name and bank_name are required';
    END IF;

    v_currency := upper(trim(COALESCE(p_currency_code, '')));
    IF length(v_currency) <> 3 THEN
        RAISE EXCEPTION 'currency_code must be a 3-character ISO 4217 code';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.currencies WHERE currency_code = v_currency) THEN
        RAISE EXCEPTION 'Currency not found: %', v_currency;
    END IF;

    IF COALESCE(p_account_type, 'checking') NOT IN ('checking', 'savings', 'merchant') THEN
        RAISE EXCEPTION 'Invalid account_type: %', p_account_type;
    END IF;

    IF p_gateway_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM admin.payment_gateways WHERE id = p_gateway_id) THEN
        RAISE EXCEPTION 'Payment gateway not found: %', p_gateway_id;
    END IF;

    IF COALESCE(p_is_default, FALSE) THEN
        UPDATE admin.settlement_accounts
        SET is_default = FALSE,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE currency_code = v_currency
          AND is_default = TRUE
          AND (p_id IS NULL OR id <> p_id);
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO admin.settlement_accounts (
            account_name,
            gateway_id,
            bank_name,
            account_number_masked,
            routing_code_masked,
            currency_code,
            account_type,
            is_default,
            is_active,
            notes,
            created_by,
            updated_by
        )
        VALUES (
            trim(p_account_name),
            p_gateway_id,
            trim(p_bank_name),
            admin._mask_last_four(p_account_number),
            admin._mask_last_four(p_routing_code),
            v_currency,
            COALESCE(p_account_type, 'checking'),
            COALESCE(p_is_default, FALSE),
            COALESCE(p_is_active, TRUE),
            NULLIF(trim(COALESCE(p_notes, '')), ''),
            v_admin_user_id,
            v_admin_user_id
        )
        RETURNING id INTO v_id;

        v_action := 'settlement_account.create';
    ELSE
        SELECT * INTO v_prev
        FROM admin.settlement_accounts
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Settlement account not found: %', p_id;
        END IF;

        UPDATE admin.settlement_accounts
        SET account_name = trim(p_account_name),
            gateway_id = p_gateway_id,
            bank_name = trim(p_bank_name),
            account_number_masked = CASE
                WHEN p_account_number IS NULL OR trim(p_account_number) = '' THEN account_number_masked
                ELSE admin._mask_last_four(p_account_number)
            END,
            routing_code_masked = CASE
                WHEN p_routing_code IS NULL OR trim(p_routing_code) = '' THEN routing_code_masked
                ELSE admin._mask_last_four(p_routing_code)
            END,
            currency_code = v_currency,
            account_type = COALESCE(p_account_type, account_type),
            is_default = COALESCE(p_is_default, is_default),
            is_active = COALESCE(p_is_active, is_active),
            notes = CASE
                WHEN p_notes IS NULL THEN notes
                ELSE NULLIF(trim(p_notes), '')
            END,
            updated_by = v_admin_user_id,
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;

        v_action := 'settlement_account.update';
    END IF;

    SELECT * INTO v_new FROM admin.settlement_accounts WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        v_action,
        'settlement_account',
        v_id,
        jsonb_build_object('account_name', v_new.account_name, 'currency_code', v_new.currency_code),
        CASE WHEN v_action = 'settlement_account.update' THEN admin._payment_config_safe_row(to_jsonb(v_prev)) ELSE NULL END,
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_settlement_account(
    p_account_id UUID,
    p_active BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.settlement_accounts%ROWTYPE;
    v_new admin.settlement_accounts%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.settlement_accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement account not found: %', p_account_id;
    END IF;

    UPDATE admin.settlement_accounts
    SET is_active = COALESCE(p_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_account_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'settlement_account.toggle',
        'settlement_account',
        p_account_id,
        jsonb_build_object('is_active', v_new.is_active),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.set_default_settlement_account(
    p_account_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.settlement_accounts%ROWTYPE;
    v_new admin.settlement_accounts%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.settlement_accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement account not found: %', p_account_id;
    END IF;

    UPDATE admin.settlement_accounts
    SET is_default = FALSE,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE currency_code = v_prev.currency_code
      AND is_default = TRUE;

    UPDATE admin.settlement_accounts
    SET is_default = TRUE,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_account_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'settlement_account.set_default',
        'settlement_account',
        p_account_id,
        jsonb_build_object('currency_code', v_new.currency_code),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        admin._payment_config_safe_row(to_jsonb(v_new))
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_settlement_account(
    p_account_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.settlement_accounts%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'billing.payment_config.edit') THEN
        RAISE EXCEPTION 'Permission denied: billing.payment_config.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.settlement_accounts
    WHERE id = p_account_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement account not found: %', p_account_id;
    END IF;

    IF v_prev.is_active THEN
        RAISE EXCEPTION 'Cannot delete active settlement account; deactivate first';
    END IF;

    DELETE FROM admin.settlement_accounts
    WHERE id = p_account_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'settlement_account.delete',
        'settlement_account',
        p_account_id,
        jsonb_build_object('account_name', v_prev.account_name),
        admin._payment_config_safe_row(to_jsonb(v_prev)),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('billing.payment_config.view', 'View Payment Config', 'billing', 'View payment gateways, methods, routing, promo codes, retry rules, and settlement accounts'),
    ('billing.payment_config.edit', 'Edit Payment Config', 'billing', 'Create and manage payment configuration')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('billing.payment_config.view', 'billing.payment_config.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'billing.payment_config.view'),
    ('system_admin', 'billing.payment_config.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._mask_last_four(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._hash_sha256_secret(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._payment_config_safe_row(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_payment_gateways(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_payment_gateway(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_payment_gateway(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_payment_gateway(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_payment_gateway(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_default_gateway(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_payment_gateway(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_payment_methods(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_payment_method(UUID, TEXT, TEXT, UUID, TEXT[], NUMERIC, NUMERIC, TEXT, NUMERIC, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_payment_method(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_payment_method(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_routing_rules(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_routing_rule(TEXT, UUID, UUID, UUID, UUID, TEXT, TEXT[], INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_routing_rule(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reorder_routing_rules(UUID[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_routing_rule(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.resolve_payment_methods(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_promo_codes(BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_promo_code(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_promo_code(TEXT, TEXT, TEXT, NUMERIC, TEXT, VARCHAR, INTEGER, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_promo_code(UUID, TEXT, TEXT, TEXT, NUMERIC, VARCHAR, INTEGER, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_promo_code(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_promo_code(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_retry_rules(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_retry_rule(TEXT, JSONB, UUID, UUID, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_retry_rule(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_retry_rule(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_settlement_accounts(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_settlement_account(TEXT, TEXT, VARCHAR, UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_settlement_account(UUID, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_default_settlement_account(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_settlement_account(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v46: Payment configuration applied.';
END $$;
