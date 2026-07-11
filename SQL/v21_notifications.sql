-- ============================================================================
-- v21: Admin notifications, templates, and alert rules
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v5.0_sidebar_completeness_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.notification_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT NOT NULL UNIQUE,
    template_name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'in_app'
        CHECK (channel IN ('in_app', 'email', 'both')),
    subject_template TEXT,
    body_template TEXT NOT NULL,
    category TEXT NOT NULL
        CHECK (category IN ('billing', 'security', 'system', 'support')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_category
    ON admin.notification_templates (category);

CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active
    ON admin.notification_templates (is_active);

COMMENT ON TABLE admin.notification_templates IS
    'Reusable notification templates for in-app and email channels';

-- ---------------------------------------------------------------------------
-- admin.notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES admin.notification_templates(id) ON DELETE SET NULL,
    recipient_admin_id UUID REFERENCES admin.admin_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL
        CHECK (category IN ('billing', 'security', 'system', 'support')),
    severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'critical')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    dismissed_at TIMESTAMPTZ,
    action_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON admin.notifications (recipient_admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread_direct
    ON admin.notifications (recipient_admin_id, is_read)
    WHERE recipient_admin_id IS NOT NULL AND is_dismissed = FALSE;

CREATE INDEX IF NOT EXISTS idx_notifications_broadcast
    ON admin.notifications (created_at DESC)
    WHERE recipient_admin_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_category
    ON admin.notifications (category);

COMMENT ON TABLE admin.notifications IS
    'Admin-facing notifications; NULL recipient broadcasts to all active admins';

-- ---------------------------------------------------------------------------
-- admin.alert_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name TEXT NOT NULL,
    rule_key TEXT NOT NULL UNIQUE,
    description TEXT,
    condition_type TEXT NOT NULL
        CHECK (condition_type IN (
            'subscription_expiry',
            'failed_payment',
            'usage_threshold',
            'system_health',
            'custom'
        )),
    condition_params JSONB NOT NULL DEFAULT '{}'::JSONB,
    notification_template_id UUID REFERENCES admin.notification_templates(id) ON DELETE SET NULL,
    target_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'admin', 'all')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    check_interval_minutes INTEGER NOT NULL DEFAULT 60
        CHECK (check_interval_minutes >= 1),
    last_checked_at TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_is_active
    ON admin.alert_rules (is_active);

CREATE INDEX IF NOT EXISTS idx_alert_rules_condition_type
    ON admin.alert_rules (condition_type);

COMMENT ON TABLE admin.alert_rules IS
    'Automated alert evaluation rules mapped to notification templates';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON admin.notification_templates;
CREATE TRIGGER trg_notification_templates_updated_at
    BEFORE UPDATE ON admin.notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed notification templates
-- ---------------------------------------------------------------------------
INSERT INTO admin.notification_templates (
    id, template_key, template_name, channel, subject_template, body_template, category, is_active
)
VALUES
    (
        'b7380021-0001-4000-8000-000000000001',
        'subscription_expiry_warning',
        'Subscription Expiry Warning',
        'both',
        'Subscription expiring in {{days_before}} days',
        'Subscription {{subscription_id}} for {{user_email}} expires on {{expiry_date}}.',
        'billing',
        TRUE
    ),
    (
        'b7380021-0001-4000-8000-000000000002',
        'failed_payment',
        'Failed Payment Alert',
        'both',
        'Payment failed for {{user_email}}',
        'A payment of {{amount}} {{currency}} failed for subscription {{subscription_id}}. Reason: {{failure_reason}}.',
        'billing',
        TRUE
    ),
    (
        'b7380021-0001-4000-8000-000000000003',
        'security_incident',
        'Security Incident',
        'in_app',
        NULL,
        'Security event detected: {{incident_type}} — {{summary}}',
        'security',
        TRUE
    ),
    (
        'b7380021-0001-4000-8000-000000000004',
        'system_health_warning',
        'System Health Warning',
        'in_app',
        NULL,
        'System health check reported {{metric_name}} at {{metric_value}} (threshold: {{threshold}}).',
        'system',
        TRUE
    )
ON CONFLICT (template_key) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    channel = EXCLUDED.channel,
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    category = EXCLUDED.category,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_templates_select ON admin.notification_templates;
CREATE POLICY notification_templates_select ON admin.notification_templates
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS notifications_select ON admin.notifications;
CREATE POLICY notifications_select ON admin.notifications
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS alert_rules_select ON admin.alert_rules;
CREATE POLICY alert_rules_select ON admin.alert_rules
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.notification_templates TO authenticated;
GRANT SELECT ON admin.notifications TO authenticated;
GRANT SELECT ON admin.alert_rules TO authenticated;
GRANT ALL ON admin.notification_templates TO service_role;
GRANT ALL ON admin.notifications TO service_role;
GRANT ALL ON admin.alert_rules TO service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._notification_broadcast_read(p_metadata JSONB, p_admin_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(p_metadata->'read_by', '[]'::JSONB) @> jsonb_build_array(p_admin_id::TEXT);
$$;

CREATE OR REPLACE FUNCTION admin._notification_broadcast_dismissed(p_metadata JSONB, p_admin_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(p_metadata->'dismissed_by', '[]'::JSONB) @> jsonb_build_array(p_admin_id::TEXT);
$$;

-- ---------------------------------------------------------------------------
-- admin.create_notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_notification(
    p_recipient_admin_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_category TEXT,
    p_severity TEXT DEFAULT 'info',
    p_action_url TEXT DEFAULT NULL,
    p_template_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
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
    v_new admin.notifications%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    IF trim(COALESCE(p_title, '')) = '' OR trim(COALESCE(p_message, '')) = '' THEN
        RAISE EXCEPTION 'title and message are required';
    END IF;

    IF COALESCE(p_category, '') NOT IN ('billing', 'security', 'system', 'support') THEN
        RAISE EXCEPTION 'Invalid category: %', p_category;
    END IF;

    IF COALESCE(p_severity, 'info') NOT IN ('info', 'warning', 'critical') THEN
        RAISE EXCEPTION 'Invalid severity: %', p_severity;
    END IF;

    IF p_template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin.notification_templates WHERE id = p_template_id
    ) THEN
        RAISE EXCEPTION 'Notification template not found: %', p_template_id;
    END IF;

    INSERT INTO admin.notifications (
        template_id,
        recipient_admin_id,
        title,
        message,
        category,
        severity,
        action_url,
        metadata,
        expires_at
    )
    VALUES (
        p_template_id,
        p_recipient_admin_id,
        trim(p_title),
        trim(p_message),
        p_category,
        COALESCE(p_severity, 'info'),
        NULLIF(trim(COALESCE(p_action_url, '')), ''),
        COALESCE(p_metadata, '{}'::JSONB),
        p_expires_at
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.notifications WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification.create',
        'notification',
        v_id,
        jsonb_build_object('recipient_admin_id', p_recipient_admin_id, 'category', p_category),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.mark_notification_read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.mark_notification_read(
    p_notification_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_row admin.notifications%ROWTYPE;
    v_prev JSONB;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.view') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.view required';
    END IF;

    SELECT * INTO v_row
    FROM admin.notifications
    WHERE id = p_notification_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification not found: %', p_notification_id;
    END IF;

    IF v_row.recipient_admin_id IS NOT NULL AND v_row.recipient_admin_id <> v_admin_user_id THEN
        RAISE EXCEPTION 'Notification does not belong to this admin user';
    END IF;

    v_prev := to_jsonb(v_row);

    IF v_row.recipient_admin_id IS NOT NULL THEN
        UPDATE admin.notifications
        SET is_read = TRUE,
            read_at = NOW()
        WHERE id = p_notification_id
        RETURNING * INTO v_row;
    ELSE
        IF admin._notification_broadcast_read(v_row.metadata, v_admin_user_id) THEN
            RETURN TRUE;
        END IF;

        UPDATE admin.notifications
        SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::JSONB),
            '{read_by}',
            COALESCE(metadata->'read_by', '[]'::JSONB) || to_jsonb(v_admin_user_id::TEXT),
            TRUE
        )
        WHERE id = p_notification_id
        RETURNING * INTO v_row;
    END IF;

    v_new := to_jsonb(v_row);

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification.mark_read',
        'notification',
        p_notification_id,
        NULL,
        v_prev,
        v_new
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.mark_all_read
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.mark_all_read(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_count INTEGER := 0;
    v_row admin.notifications%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.view') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.view required';
    END IF;

    UPDATE admin.notifications
    SET is_read = TRUE,
        read_at = NOW()
    WHERE recipient_admin_id = v_admin_user_id
      AND is_read = FALSE
      AND is_dismissed = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    FOR v_row IN
        SELECT *
        FROM admin.notifications
        WHERE recipient_admin_id IS NULL
          AND is_dismissed = FALSE
          AND NOT admin._notification_broadcast_read(metadata, v_admin_user_id)
          AND NOT admin._notification_broadcast_dismissed(metadata, v_admin_user_id)
          AND (expires_at IS NULL OR expires_at > NOW())
    LOOP
        PERFORM admin.mark_notification_read(v_row.id, v_admin_user_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_unread_notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_unread_notifications(
    p_admin_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
    id UUID,
    template_id UUID,
    recipient_admin_id UUID,
    title TEXT,
    message TEXT,
    category TEXT,
    severity TEXT,
    action_url TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.view') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.view required';
    END IF;

    RETURN QUERY
    SELECT
        n.id,
        n.template_id,
        n.recipient_admin_id,
        n.title,
        n.message,
        n.category,
        n.severity,
        n.action_url,
        n.metadata,
        n.created_at,
        n.expires_at
    FROM admin.notifications n
    WHERE (n.expires_at IS NULL OR n.expires_at > NOW())
      AND (
          (n.recipient_admin_id = v_admin_user_id
           AND n.is_read = FALSE
           AND n.is_dismissed = FALSE)
          OR
          (n.recipient_admin_id IS NULL
           AND NOT admin._notification_broadcast_read(n.metadata, v_admin_user_id)
           AND NOT admin._notification_broadcast_dismissed(n.metadata, v_admin_user_id))
      )
    ORDER BY n.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_notification_count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_notification_count(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_count INTEGER;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.view') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.view required';
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_count
    FROM admin.notifications n
    WHERE (n.expires_at IS NULL OR n.expires_at > NOW())
      AND (
          (n.recipient_admin_id = v_admin_user_id
           AND n.is_read = FALSE
           AND n.is_dismissed = FALSE)
          OR
          (n.recipient_admin_id IS NULL
           AND NOT admin._notification_broadcast_read(n.metadata, v_admin_user_id)
           AND NOT admin._notification_broadcast_dismissed(n.metadata, v_admin_user_id))
      );

    RETURN COALESCE(v_count, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.dismiss_notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.dismiss_notification(
    p_notification_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_row admin.notifications%ROWTYPE;
    v_prev JSONB;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.view') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.view required';
    END IF;

    SELECT * INTO v_row
    FROM admin.notifications
    WHERE id = p_notification_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification not found: %', p_notification_id;
    END IF;

    IF v_row.recipient_admin_id IS NOT NULL AND v_row.recipient_admin_id <> v_admin_user_id THEN
        RAISE EXCEPTION 'Notification does not belong to this admin user';
    END IF;

    v_prev := to_jsonb(v_row);

    IF v_row.recipient_admin_id IS NOT NULL THEN
        UPDATE admin.notifications
        SET is_dismissed = TRUE,
            dismissed_at = NOW()
        WHERE id = p_notification_id
        RETURNING * INTO v_row;
    ELSE
        IF admin._notification_broadcast_dismissed(v_row.metadata, v_admin_user_id) THEN
            RETURN TRUE;
        END IF;

        UPDATE admin.notifications
        SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::JSONB),
            '{dismissed_by}',
            COALESCE(metadata->'dismissed_by', '[]'::JSONB) || to_jsonb(v_admin_user_id::TEXT),
            TRUE
        )
        WHERE id = p_notification_id
        RETURNING * INTO v_row;
    END IF;

    v_new := to_jsonb(v_row);

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification.dismiss',
        'notification',
        p_notification_id,
        NULL,
        v_prev,
        v_new
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Notification template CRUD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_notification_template(
    p_template_key TEXT,
    p_template_name TEXT,
    p_body_template TEXT,
    p_category TEXT,
    p_channel TEXT DEFAULT 'in_app',
    p_subject_template TEXT DEFAULT NULL,
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
    v_new admin.notification_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    IF trim(COALESCE(p_template_key, '')) = ''
       OR trim(COALESCE(p_template_name, '')) = ''
       OR trim(COALESCE(p_body_template, '')) = '' THEN
        RAISE EXCEPTION 'template_key, template_name, and body_template are required';
    END IF;

    IF COALESCE(p_category, '') NOT IN ('billing', 'security', 'system', 'support') THEN
        RAISE EXCEPTION 'Invalid category: %', p_category;
    END IF;

    IF COALESCE(p_channel, 'in_app') NOT IN ('in_app', 'email', 'both') THEN
        RAISE EXCEPTION 'Invalid channel: %', p_channel;
    END IF;

    INSERT INTO admin.notification_templates (
        template_key,
        template_name,
        channel,
        subject_template,
        body_template,
        category,
        is_active,
        created_by,
        updated_by
    )
    VALUES (
        lower(trim(p_template_key)),
        trim(p_template_name),
        COALESCE(p_channel, 'in_app'),
        NULLIF(trim(COALESCE(p_subject_template, '')), ''),
        trim(p_body_template),
        p_category,
        COALESCE(p_is_active, TRUE),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.notification_templates WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification_template.create',
        'notification_template',
        v_id,
        jsonb_build_object('template_key', v_new.template_key),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_notification_template(
    p_template_id UUID,
    p_template_name TEXT DEFAULT NULL,
    p_channel TEXT DEFAULT NULL,
    p_subject_template TEXT DEFAULT NULL,
    p_body_template TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
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
    v_prev admin.notification_templates%ROWTYPE;
    v_new admin.notification_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.notification_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification template not found: %', p_template_id;
    END IF;

    IF p_category IS NOT NULL AND p_category NOT IN ('billing', 'security', 'system', 'support') THEN
        RAISE EXCEPTION 'Invalid category: %', p_category;
    END IF;

    IF p_channel IS NOT NULL AND p_channel NOT IN ('in_app', 'email', 'both') THEN
        RAISE EXCEPTION 'Invalid channel: %', p_channel;
    END IF;

    UPDATE admin.notification_templates
    SET template_name = COALESCE(NULLIF(trim(p_template_name), ''), template_name),
        channel = COALESCE(p_channel, channel),
        subject_template = CASE
            WHEN p_subject_template IS NULL THEN subject_template
            ELSE NULLIF(trim(p_subject_template), '')
        END,
        body_template = COALESCE(NULLIF(trim(p_body_template), ''), body_template),
        category = COALESCE(p_category, category),
        is_active = COALESCE(p_is_active, is_active),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_template_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification_template.update',
        'notification_template',
        p_template_id,
        jsonb_build_object('template_key', v_new.template_key),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_notification_template(
    p_template_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.notification_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.notification_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification template not found: %', p_template_id;
    END IF;

    DELETE FROM admin.notification_templates
    WHERE id = p_template_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification_template.delete',
        'notification_template',
        p_template_id,
        jsonb_build_object('template_key', v_prev.template_key),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_notification_template(
    p_template_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.notification_templates%ROWTYPE;
    v_new admin.notification_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.notification_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification template not found: %', p_template_id;
    END IF;

    UPDATE admin.notification_templates
    SET is_active = NOT is_active,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_template_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'notification_template.toggle',
        'notification_template',
        p_template_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Alert rule CRUD
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_alert_rule(
    p_rule_name TEXT,
    p_rule_key TEXT,
    p_condition_type TEXT,
    p_condition_params JSONB,
    p_notification_template_id UUID DEFAULT NULL,
    p_target_roles TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_target_system TEXT DEFAULT 'all',
    p_check_interval_minutes INTEGER DEFAULT 60,
    p_description TEXT DEFAULT NULL,
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
    v_new admin.alert_rules%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    IF trim(COALESCE(p_rule_name, '')) = '' OR trim(COALESCE(p_rule_key, '')) = '' THEN
        RAISE EXCEPTION 'rule_name and rule_key are required';
    END IF;

    IF COALESCE(p_condition_type, '') NOT IN (
        'subscription_expiry', 'failed_payment', 'usage_threshold', 'system_health', 'custom'
    ) THEN
        RAISE EXCEPTION 'Invalid condition_type: %', p_condition_type;
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'admin', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    IF p_notification_template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin.notification_templates WHERE id = p_notification_template_id
    ) THEN
        RAISE EXCEPTION 'Notification template not found: %', p_notification_template_id;
    END IF;

    INSERT INTO admin.alert_rules (
        rule_name,
        rule_key,
        description,
        condition_type,
        condition_params,
        notification_template_id,
        target_roles,
        target_system,
        check_interval_minutes,
        is_active,
        created_by
    )
    VALUES (
        trim(p_rule_name),
        lower(trim(p_rule_key)),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        p_condition_type,
        COALESCE(p_condition_params, '{}'::JSONB),
        p_notification_template_id,
        COALESCE(p_target_roles, ARRAY[]::TEXT[]),
        COALESCE(p_target_system, 'all'),
        COALESCE(p_check_interval_minutes, 60),
        COALESCE(p_is_active, TRUE),
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.alert_rules WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'alert_rule.create',
        'alert_rule',
        v_id,
        jsonb_build_object('rule_key', v_new.rule_key),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_alert_rule(
    p_rule_id UUID,
    p_rule_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_condition_type TEXT DEFAULT NULL,
    p_condition_params JSONB DEFAULT NULL,
    p_notification_template_id UUID DEFAULT NULL,
    p_target_roles TEXT[] DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_check_interval_minutes INTEGER DEFAULT NULL,
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
    v_prev admin.alert_rules%ROWTYPE;
    v_new admin.alert_rules%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.alert_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alert rule not found: %', p_rule_id;
    END IF;

    IF p_condition_type IS NOT NULL AND p_condition_type NOT IN (
        'subscription_expiry', 'failed_payment', 'usage_threshold', 'system_health', 'custom'
    ) THEN
        RAISE EXCEPTION 'Invalid condition_type: %', p_condition_type;
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'admin', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.alert_rules
    SET rule_name = COALESCE(NULLIF(trim(p_rule_name), ''), rule_name),
        description = CASE
            WHEN p_description IS NULL THEN description
            ELSE NULLIF(trim(p_description), '')
        END,
        condition_type = COALESCE(p_condition_type, condition_type),
        condition_params = COALESCE(p_condition_params, condition_params),
        notification_template_id = COALESCE(p_notification_template_id, notification_template_id),
        target_roles = COALESCE(p_target_roles, target_roles),
        target_system = COALESCE(p_target_system, target_system),
        check_interval_minutes = COALESCE(p_check_interval_minutes, check_interval_minutes),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'alert_rule.update',
        'alert_rule',
        p_rule_id,
        jsonb_build_object('rule_key', v_new.rule_key),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.delete_alert_rule(
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
    v_prev admin.alert_rules%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.alert_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alert rule not found: %', p_rule_id;
    END IF;

    DELETE FROM admin.alert_rules
    WHERE id = p_rule_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'alert_rule.delete',
        'alert_rule',
        p_rule_id,
        jsonb_build_object('rule_key', v_prev.rule_key),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION admin.toggle_alert_rule(
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
    v_prev admin.alert_rules%ROWTYPE;
    v_new admin.alert_rules%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.alert_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alert rule not found: %', p_rule_id;
    END IF;

    UPDATE admin.alert_rules
    SET is_active = NOT is_active
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'alert_rule.toggle',
        'alert_rule',
        p_rule_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('system.notifications.view', 'View Notifications', 'system', 'View notifications, templates, and alert rules'),
    ('system.notifications.edit', 'Edit Notifications', 'system', 'Create notifications and manage templates and alert rules')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('system.notifications.view', 'system.notifications.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'system.notifications.view'),
    ('system_admin', 'system.notifications.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._notification_broadcast_read(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._notification_broadcast_dismissed(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.mark_notification_read(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.mark_all_read(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_unread_notifications(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_notification_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.dismiss_notification(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_notification_template(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_notification_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_notification_template(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_notification_template(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_alert_rule(TEXT, TEXT, TEXT, JSONB, UUID, TEXT[], TEXT, INTEGER, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_alert_rule(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT[], TEXT, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_alert_rule(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_alert_rule(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v21: Admin notifications, templates, and alert rules applied.';
END $$;
