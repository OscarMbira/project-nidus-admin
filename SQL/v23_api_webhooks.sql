-- ============================================================================
-- v23: API keys, webhooks, and delivery log
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v5.0_sidebar_completeness_plan.md
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- admin.api_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'all')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60
        CHECK (rate_limit_per_minute >= 1),
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix
    ON admin.api_keys (key_prefix);

CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
    ON admin.api_keys (is_active);

CREATE INDEX IF NOT EXISTS idx_api_keys_target_system
    ON admin.api_keys (target_system);

COMMENT ON TABLE admin.api_keys IS
    'Hashed API keys for external integrations; plain key shown once at creation';

-- ---------------------------------------------------------------------------
-- admin.webhooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_name TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'all')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    retry_count INTEGER NOT NULL DEFAULT 3
        CHECK (retry_count >= 0),
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0
        CHECK (failure_count >= 0),
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (endpoint_url ~* '^https://')
);

CREATE INDEX IF NOT EXISTS idx_webhooks_is_active
    ON admin.webhooks (is_active);

CREATE INDEX IF NOT EXISTS idx_webhooks_target_system
    ON admin.webhooks (target_system);

COMMENT ON TABLE admin.webhooks IS
    'Outbound webhook endpoints for platform and simulator event notifications';

-- ---------------------------------------------------------------------------
-- admin.webhook_delivery_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.webhook_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES admin.webhooks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    response_status INTEGER,
    response_body TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1
        CHECK (attempt_number >= 1),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'delivered', 'failed')),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_webhook
    ON admin.webhook_delivery_log (webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_status
    ON admin.webhook_delivery_log (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log_event_type
    ON admin.webhook_delivery_log (event_type);

COMMENT ON TABLE admin.webhook_delivery_log IS
    'Delivery attempts and outcomes for webhook event dispatches';

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.webhook_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_select ON admin.api_keys;
CREATE POLICY api_keys_select ON admin.api_keys
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS webhooks_select ON admin.webhooks;
CREATE POLICY webhooks_select ON admin.webhooks
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS webhook_delivery_log_select ON admin.webhook_delivery_log;
CREATE POLICY webhook_delivery_log_select ON admin.webhook_delivery_log
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.api_keys TO authenticated;
GRANT SELECT ON admin.webhooks TO authenticated;
GRANT SELECT ON admin.webhook_delivery_log TO authenticated;
GRANT ALL ON admin.api_keys TO service_role;
GRANT ALL ON admin.webhooks TO service_role;
GRANT ALL ON admin.webhook_delivery_log TO service_role;

-- ---------------------------------------------------------------------------
-- admin.create_api_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_api_key(
    p_key_name TEXT,
    p_permissions TEXT[],
    p_target_system TEXT DEFAULT 'all',
    p_rate_limit_per_minute INTEGER DEFAULT 60,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(id UUID, plain_api_key TEXT, key_prefix VARCHAR(8))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_plain_key TEXT;
    v_prefix VARCHAR(8) := 'nds_live';
    v_secret_part TEXT;
    v_new admin.api_keys%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    IF trim(COALESCE(p_key_name, '')) = '' THEN
        RAISE EXCEPTION 'key_name is required';
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    v_secret_part := encode(gen_random_bytes(24), 'hex');
    v_plain_key := v_prefix || '_' || v_secret_part;

    INSERT INTO admin.api_keys (
        key_name,
        api_key_hash,
        key_prefix,
        permissions,
        target_system,
        rate_limit_per_minute,
        expires_at,
        created_by
    )
    VALUES (
        trim(p_key_name),
        crypt(v_plain_key, gen_salt('bf')),
        v_prefix,
        COALESCE(p_permissions, ARRAY[]::TEXT[]),
        COALESCE(p_target_system, 'all'),
        COALESCE(p_rate_limit_per_minute, 60),
        p_expires_at,
        v_admin_user_id
    )
    RETURNING admin.api_keys.id INTO v_id;

    SELECT * INTO v_new FROM admin.api_keys WHERE admin.api_keys.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'api_key.create',
        'api_key',
        v_id,
        jsonb_build_object('key_name', v_new.key_name, 'key_prefix', v_new.key_prefix),
        NULL,
        to_jsonb(v_new) - 'api_key_hash'
    );

    RETURN QUERY
    SELECT v_id, v_plain_key, v_prefix;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.revoke_api_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.revoke_api_key(
    p_api_key_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.api_keys%ROWTYPE;
    v_new admin.api_keys%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.api_keys
    WHERE id = p_api_key_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'API key not found: %', p_api_key_id;
    END IF;

    UPDATE admin.api_keys
    SET is_active = FALSE
    WHERE id = p_api_key_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'api_key.revoke',
        'api_key',
        p_api_key_id,
        jsonb_build_object('key_name', v_new.key_name),
        to_jsonb(v_prev) - 'api_key_hash',
        to_jsonb(v_new) - 'api_key_hash'
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_api_key
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_api_key(
    p_api_key_id UUID,
    p_key_name TEXT DEFAULT NULL,
    p_permissions TEXT[] DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_rate_limit_per_minute INTEGER DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
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
    v_prev admin.api_keys%ROWTYPE;
    v_new admin.api_keys%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.api_keys
    WHERE id = p_api_key_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'API key not found: %', p_api_key_id;
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.api_keys
    SET key_name = COALESCE(NULLIF(trim(p_key_name), ''), key_name),
        permissions = COALESCE(p_permissions, permissions),
        target_system = COALESCE(p_target_system, target_system),
        rate_limit_per_minute = COALESCE(p_rate_limit_per_minute, rate_limit_per_minute),
        expires_at = COALESCE(p_expires_at, expires_at),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_api_key_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'api_key.update',
        'api_key',
        p_api_key_id,
        jsonb_build_object('key_name', v_new.key_name),
        to_jsonb(v_prev) - 'api_key_hash',
        to_jsonb(v_new) - 'api_key_hash'
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Webhook CRUD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_webhook(
    p_webhook_name TEXT,
    p_endpoint_url TEXT,
    p_events TEXT[],
    p_secret TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT 'all',
    p_retry_count INTEGER DEFAULT 3,
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
    v_secret TEXT;
    v_new admin.webhooks%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    IF trim(COALESCE(p_webhook_name, '')) = '' OR trim(COALESCE(p_endpoint_url, '')) = '' THEN
        RAISE EXCEPTION 'webhook_name and endpoint_url are required';
    END IF;

    IF trim(p_endpoint_url) !~* '^https://' THEN
        RAISE EXCEPTION 'endpoint_url must be an HTTPS URL';
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    v_secret := COALESCE(
        NULLIF(trim(COALESCE(p_secret, '')), ''),
        encode(gen_random_bytes(32), 'hex')
    );

    INSERT INTO admin.webhooks (
        webhook_name,
        endpoint_url,
        secret,
        events,
        target_system,
        retry_count,
        is_active,
        created_by
    )
    VALUES (
        trim(p_webhook_name),
        trim(p_endpoint_url),
        v_secret,
        COALESCE(p_events, ARRAY[]::TEXT[]),
        COALESCE(p_target_system, 'all'),
        COALESCE(p_retry_count, 3),
        COALESCE(p_is_active, TRUE),
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.webhooks WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'webhook.create',
        'webhook',
        v_id,
        jsonb_build_object('webhook_name', v_new.webhook_name, 'endpoint_url', v_new.endpoint_url),
        NULL,
        to_jsonb(v_new) - 'secret'
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_webhook(
    p_webhook_id UUID,
    p_webhook_name TEXT DEFAULT NULL,
    p_endpoint_url TEXT DEFAULT NULL,
    p_events TEXT[] DEFAULT NULL,
    p_secret TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_retry_count INTEGER DEFAULT NULL,
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
    v_prev admin.webhooks%ROWTYPE;
    v_new admin.webhooks%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.webhooks
    WHERE id = p_webhook_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook not found: %', p_webhook_id;
    END IF;

    IF p_endpoint_url IS NOT NULL AND trim(p_endpoint_url) !~* '^https://' THEN
        RAISE EXCEPTION 'endpoint_url must be an HTTPS URL';
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.webhooks
    SET webhook_name = COALESCE(NULLIF(trim(p_webhook_name), ''), webhook_name),
        endpoint_url = COALESCE(NULLIF(trim(p_endpoint_url), ''), endpoint_url),
        events = COALESCE(p_events, events),
        secret = COALESCE(NULLIF(trim(COALESCE(p_secret, '')), ''), secret),
        target_system = COALESCE(p_target_system, target_system),
        retry_count = COALESCE(p_retry_count, retry_count),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_webhook_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'webhook.update',
        'webhook',
        p_webhook_id,
        jsonb_build_object('webhook_name', v_new.webhook_name),
        to_jsonb(v_prev) - 'secret',
        to_jsonb(v_new) - 'secret'
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_webhook(
    p_webhook_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.webhooks%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.webhooks
    WHERE id = p_webhook_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook not found: %', p_webhook_id;
    END IF;

    DELETE FROM admin.webhooks
    WHERE id = p_webhook_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'webhook.delete',
        'webhook',
        p_webhook_id,
        jsonb_build_object('webhook_name', v_prev.webhook_name),
        to_jsonb(v_prev) - 'secret',
        NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_webhook(
    p_webhook_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.webhooks%ROWTYPE;
    v_new admin.webhooks%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.webhooks
    WHERE id = p_webhook_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook not found: %', p_webhook_id;
    END IF;

    UPDATE admin.webhooks
    SET is_active = NOT is_active
    WHERE id = p_webhook_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'webhook.toggle',
        'webhook',
        p_webhook_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev) - 'secret',
        to_jsonb(v_new) - 'secret'
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.test_webhook_delivery
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.test_webhook_delivery(
    p_webhook_id UUID,
    p_event_type TEXT DEFAULT 'webhook.test',
    p_payload JSONB DEFAULT '{}'::JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_webhook admin.webhooks%ROWTYPE;
    v_log_id UUID;
    v_new admin.webhook_delivery_log%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.edit') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.edit required';
    END IF;

    SELECT * INTO v_webhook
    FROM admin.webhooks
    WHERE id = p_webhook_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Webhook not found: %', p_webhook_id;
    END IF;

    INSERT INTO admin.webhook_delivery_log (
        webhook_id,
        event_type,
        payload,
        response_status,
        response_body,
        attempt_number,
        status,
        delivered_at
    )
    VALUES (
        p_webhook_id,
        COALESCE(NULLIF(trim(p_event_type), ''), 'webhook.test'),
        jsonb_build_object(
            'test', TRUE,
            'webhook_name', v_webhook.webhook_name,
            'endpoint_url', v_webhook.endpoint_url,
            'payload', COALESCE(p_payload, '{}'::JSONB)
        ),
        200,
        '{"status":"test_delivery_logged_only"}',
        1,
        'delivered',
        NOW()
    )
    RETURNING id INTO v_log_id;

    UPDATE admin.webhooks
    SET last_triggered_at = NOW(),
        failure_count = 0
    WHERE id = p_webhook_id;

    SELECT * INTO v_new FROM admin.webhook_delivery_log WHERE id = v_log_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'webhook.test_delivery',
        'webhook_delivery_log',
        v_log_id,
        jsonb_build_object('webhook_id', p_webhook_id, 'event_type', v_new.event_type),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.list_webhook_delivery_logs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_webhook_delivery_logs(
    p_webhook_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    webhook_id UUID,
    webhook_name TEXT,
    event_type TEXT,
    payload JSONB,
    response_status INTEGER,
    response_body TEXT,
    attempt_number INTEGER,
    status TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'security.integrations.view') THEN
        RAISE EXCEPTION 'Permission denied: security.integrations.view required';
    END IF;

    IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'delivered', 'failed') THEN
        RAISE EXCEPTION 'Invalid status filter: %', p_status;
    END IF;

    RETURN QUERY
    SELECT
        l.id,
        l.webhook_id,
        w.webhook_name,
        l.event_type,
        l.payload,
        l.response_status,
        l.response_body,
        l.attempt_number,
        l.status,
        l.delivered_at,
        l.created_at
    FROM admin.webhook_delivery_log l
    JOIN admin.webhooks w ON w.id = l.webhook_id
    WHERE (p_webhook_id IS NULL OR l.webhook_id = p_webhook_id)
      AND (p_status IS NULL OR l.status = p_status)
      AND (p_event_type IS NULL OR l.event_type = p_event_type)
    ORDER BY l.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('security.integrations.view', 'View Integrations', 'security', 'View API keys, webhooks, and delivery logs'),
    ('security.integrations.edit', 'Edit Integrations', 'security', 'Create, update, revoke API keys and manage webhooks')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('security.integrations.view', 'security.integrations.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'security.integrations.view'),
    ('system_admin', 'security.integrations.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.create_api_key(TEXT, TEXT[], TEXT, INTEGER, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.revoke_api_key(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_api_key(UUID, TEXT, TEXT[], TEXT, INTEGER, TIMESTAMPTZ, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_webhook(TEXT, TEXT, TEXT[], TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_webhook(UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_webhook(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_webhook(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.test_webhook_delivery(UUID, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_webhook_delivery_logs(UUID, TEXT, TEXT, INTEGER, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v23: API keys, webhooks, and delivery log applied.';
END $$;
