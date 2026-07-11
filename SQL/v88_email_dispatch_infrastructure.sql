-- ============================================================================
-- v88: Email dispatch infrastructure
-- Plan: projectplans/v13.0_email_centre_plan.md (Phase 1)
-- Run: pnpm run admin:migrate-email-dispatch
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enhance admin.email_send_log
-- ---------------------------------------------------------------------------
ALTER TABLE admin.email_send_log
    DROP CONSTRAINT IF EXISTS email_send_log_status_check;

ALTER TABLE admin.email_send_log
    ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced'));

ALTER TABLE admin.email_send_log
    ADD COLUMN IF NOT EXISTS message_id TEXT,
    ADD COLUMN IF NOT EXISTS provider TEXT,
    ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES admin.admin_users(id),
    ADD COLUMN IF NOT EXISTS template_key TEXT,
    ADD COLUMN IF NOT EXISTS target_system TEXT;

ALTER TABLE admin.email_send_log
    DROP CONSTRAINT IF EXISTS email_send_log_target_system_check;

ALTER TABLE admin.email_send_log
    ADD CONSTRAINT email_send_log_target_system_check
    CHECK (target_system IS NULL OR target_system IN ('platform', 'simulator', 'all'));

CREATE INDEX IF NOT EXISTS idx_email_send_log_initiated_by
    ON admin.email_send_log (initiated_by, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_template_key
    ON admin.email_send_log (template_key, sent_at DESC);

-- ---------------------------------------------------------------------------
-- admin.queue_email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.queue_email(
    p_recipient_email TEXT,
    p_template_key TEXT,
    p_subject TEXT,
    p_body_html TEXT,
    p_provider TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_id UUID;
    v_log_id UUID;
    v_template_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_id IS NULL AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
       AND NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;

    IF trim(COALESCE(p_recipient_email, '')) = '' OR trim(COALESCE(p_subject, '')) = '' THEN
        RAISE EXCEPTION 'recipient_email and subject are required';
    END IF;

    SELECT id INTO v_template_id
    FROM admin.email_templates
    WHERE template_key = p_template_key
    LIMIT 1;

    INSERT INTO admin.email_send_log (
        template_id,
        recipient_email,
        subject,
        status,
        delivery_status,
        template_key,
        provider,
        target_system,
        initiated_by,
        metadata,
        sent_at
    )
    VALUES (
        v_template_id,
        lower(trim(p_recipient_email)),
        trim(p_subject),
        'pending',
        'pending',
        NULLIF(trim(p_template_key), ''),
        NULLIF(trim(p_provider), ''),
        NULLIF(trim(p_target_system), ''),
        v_admin_id,
        COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('body_html', COALESCE(p_body_html, '')),
        NOW()
    )
    RETURNING id INTO v_log_id;

    PERFORM admin.log_admin_action(
        v_admin_id,
        'system.email.send',
        'email_send_log',
        v_log_id,
        NULL,
        NULL,
        jsonb_build_object('recipient', lower(trim(p_recipient_email)), 'template_key', p_template_key)
    );

    RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_email_send_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_email_send_status(
    p_log_id UUID,
    p_status TEXT,
    p_message_id TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_provider TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF COALESCE(p_status, '') NOT IN ('pending', 'sent', 'delivered', 'failed', 'bounced') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;

    UPDATE admin.email_send_log
    SET status = p_status,
        delivery_status = p_status,
        message_id = COALESCE(p_message_id, message_id),
        provider = COALESCE(p_provider, provider),
        error_message = NULLIF(trim(COALESCE(p_error_message, '')), ''),
        sent_at = CASE WHEN p_status IN ('sent', 'delivered') THEN NOW() ELSE sent_at END
    WHERE id = p_log_id;

    RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_email_provider_config (redacted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_email_provider_config()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_id UUID;
    v_config JSONB;
BEGIN
    v_admin_id := admin.current_admin_user_id();
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.view') THEN
        RAISE EXCEPTION 'Permission denied: system.email.view required';
    END IF;

    SELECT jsonb_build_object(
        'id', ec.id,
        'config_name', ec.config_name,
        'service_provider', ec.service_provider,
        'from_email', ec.from_email,
        'from_name', ec.from_name,
        'reply_to_email', ec.reply_to_email,
        'daily_send_limit', ec.daily_send_limit,
        'monthly_send_limit', ec.monthly_send_limit,
        'is_default', ec.is_default,
        'is_active', ec.is_active,
        'updated_at', ec.updated_at
    ) INTO v_config
    FROM public.email_configurations ec
    WHERE COALESCE(ec.is_deleted, FALSE) = FALSE
      AND ec.is_active = TRUE
    ORDER BY ec.is_default DESC NULLS LAST, ec.updated_at DESC
    LIMIT 1;

    RETURN COALESCE(v_config, '{}'::JSONB);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_email_sender_profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_email_sender_profiles()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := admin.current_admin_user_id();
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.view') THEN
        RAISE EXCEPTION 'Permission denied: system.email.view required';
    END IF;

    RETURN COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', esp.id,
                'profile_name', esp.profile_name,
                'from_email', esp.from_email,
                'from_name', esp.from_name,
                'project_type_id', esp.project_type_id,
                'is_default', esp.is_default,
                'is_active', esp.is_active
            )
            ORDER BY esp.is_default DESC, esp.profile_name
        )
        FROM public.email_sender_profiles esp
        WHERE COALESCE(esp.is_deleted, FALSE) = FALSE
    ), '[]'::JSONB);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('system.email.view', 'View Email Configuration', 'system', 'View email provider configuration and send log'),
    ('system.email.send', 'Send Admin Emails', 'system', 'Compose and send individual and campaign emails'),
    ('system.email.configure', 'Configure Email', 'system', 'Edit email provider configuration and sender profiles')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('system.email.view', 'system.email.send', 'system.email.configure')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'system.email.view'),
    ('system_admin', 'system.email.send'),
    ('content_admin', 'system.email.view')
ON CONFLICT (role, permission_key) DO NOTHING;

GRANT EXECUTE ON FUNCTION admin.queue_email(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_email_send_status(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_email_provider_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_email_sender_profiles() TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'v88: Email dispatch infrastructure applied.'; END $$;
