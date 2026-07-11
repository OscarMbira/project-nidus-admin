-- ============================================================================
-- v22: Email template management and send log
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v5.0_sidebar_completeness_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.email_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key TEXT NOT NULL UNIQUE,
    template_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    category TEXT NOT NULL
        CHECK (category IN ('auth', 'billing', 'support', 'system')),
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'all')),
    variables JSONB NOT NULL DEFAULT '[]'::JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_category
    ON admin.email_templates (category);

CREATE INDEX IF NOT EXISTS idx_email_templates_target_system
    ON admin.email_templates (target_system);

CREATE INDEX IF NOT EXISTS idx_email_templates_is_active
    ON admin.email_templates (is_active);

COMMENT ON TABLE admin.email_templates IS
    'Transactional email templates for Platform and Simulator with variable placeholders';

-- ---------------------------------------------------------------------------
-- admin.email_send_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.email_send_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES admin.email_templates(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'failed', 'bounced')),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_template
    ON admin.email_send_log (template_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient
    ON admin.email_send_log (recipient_email, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_status
    ON admin.email_send_log (status, sent_at DESC);

COMMENT ON TABLE admin.email_send_log IS
    'Audit log of rendered transactional emails sent through admin-managed templates';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON admin.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
    BEFORE UPDATE ON admin.email_templates
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed email templates
-- ---------------------------------------------------------------------------
INSERT INTO admin.email_templates (
    id, template_key, template_name, subject, body_html, body_text,
    category, target_system, variables, is_active, version
)
VALUES
    (
        'b7380022-0001-4000-8000-000000000001',
        'welcome_email',
        'Welcome Email',
        'Welcome to {{product_name}}, {{first_name}}!',
        '<h1>Welcome, {{first_name}}!</h1><p>Your account for {{product_name}} is ready.</p>',
        'Welcome, {{first_name}}! Your account for {{product_name}} is ready.',
        'auth',
        'all',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"product_name","description":"Product display name"}]'::JSONB,
        TRUE,
        1
    ),
    (
        'b7380022-0001-4000-8000-000000000002',
        'password_reset',
        'Password Reset',
        'Reset your {{product_name}} password',
        '<p>Hi {{first_name}},</p><p>Reset your password using this link: {{reset_url}}</p>',
        'Hi {{first_name}}, reset your password using this link: {{reset_url}}',
        'auth',
        'all',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"product_name","description":"Product display name"},{"name":"reset_url","description":"Password reset URL"}]'::JSONB,
        TRUE,
        1
    ),
    (
        'b7380022-0001-4000-8000-000000000003',
        'subscription_renewed',
        'Subscription Renewed',
        'Your {{plan_name}} subscription has been renewed',
        '<p>Hi {{first_name}},</p><p>Your {{plan_name}} subscription renewed on {{renewal_date}} for {{amount}} {{currency}}.</p>',
        'Hi {{first_name}}, your {{plan_name}} subscription renewed on {{renewal_date}} for {{amount}} {{currency}}.',
        'billing',
        'platform',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"plan_name","description":"Subscription plan name"},{"name":"renewal_date","description":"Renewal date"},{"name":"amount","description":"Charge amount"},{"name":"currency","description":"Currency code"}]'::JSONB,
        TRUE,
        1
    ),
    (
        'b7380022-0001-4000-8000-000000000004',
        'ticket_update',
        'Support Ticket Update',
        'Update on ticket #{{ticket_id}}: {{ticket_subject}}',
        '<p>Hi {{first_name}},</p><p>Your support ticket #{{ticket_id}} was updated: {{update_summary}}</p>',
        'Hi {{first_name}}, your support ticket #{{ticket_id}} was updated: {{update_summary}}',
        'support',
        'all',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"ticket_id","description":"Support ticket ID"},{"name":"ticket_subject","description":"Ticket subject"},{"name":"update_summary","description":"Update summary"}]'::JSONB,
        TRUE,
        1
    )
ON CONFLICT (template_key) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text,
    category = EXCLUDED.category,
    target_system = EXCLUDED.target_system,
    variables = EXCLUDED.variables,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.email_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_select ON admin.email_templates;
CREATE POLICY email_templates_select ON admin.email_templates
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS email_send_log_select ON admin.email_send_log;
CREATE POLICY email_send_log_select ON admin.email_send_log
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.email_templates TO authenticated;
GRANT SELECT ON admin.email_send_log TO authenticated;
GRANT ALL ON admin.email_templates TO service_role;
GRANT ALL ON admin.email_send_log TO service_role;

-- ---------------------------------------------------------------------------
-- admin.create_email_template
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_email_template(
    p_template_key TEXT,
    p_template_name TEXT,
    p_subject TEXT,
    p_body_html TEXT,
    p_category TEXT,
    p_body_text TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT 'all',
    p_variables JSONB DEFAULT '[]'::JSONB,
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
    v_new admin.email_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;

    IF trim(COALESCE(p_template_key, '')) = ''
       OR trim(COALESCE(p_template_name, '')) = ''
       OR trim(COALESCE(p_subject, '')) = ''
       OR trim(COALESCE(p_body_html, '')) = '' THEN
        RAISE EXCEPTION 'template_key, template_name, subject, and body_html are required';
    END IF;

    IF COALESCE(p_category, '') NOT IN ('auth', 'billing', 'support', 'system') THEN
        RAISE EXCEPTION 'Invalid category: %', p_category;
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    INSERT INTO admin.email_templates (
        template_key,
        template_name,
        subject,
        body_html,
        body_text,
        category,
        target_system,
        variables,
        is_active,
        version,
        created_by,
        updated_by
    )
    VALUES (
        lower(trim(p_template_key)),
        trim(p_template_name),
        trim(p_subject),
        trim(p_body_html),
        NULLIF(trim(COALESCE(p_body_text, '')), ''),
        p_category,
        COALESCE(p_target_system, 'all'),
        COALESCE(p_variables, '[]'::JSONB),
        COALESCE(p_is_active, TRUE),
        1,
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.email_templates WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'email_template.create',
        'email_template',
        v_id,
        jsonb_build_object('template_key', v_new.template_key),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_email_template
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_email_template(
    p_template_id UUID,
    p_template_name TEXT DEFAULT NULL,
    p_subject TEXT DEFAULT NULL,
    p_body_html TEXT DEFAULT NULL,
    p_body_text TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_variables JSONB DEFAULT NULL,
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
    v_prev admin.email_templates%ROWTYPE;
    v_new admin.email_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.email_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Email template not found: %', p_template_id;
    END IF;

    IF p_category IS NOT NULL AND p_category NOT IN ('auth', 'billing', 'support', 'system') THEN
        RAISE EXCEPTION 'Invalid category: %', p_category;
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.email_templates
    SET template_name = COALESCE(NULLIF(trim(p_template_name), ''), template_name),
        subject = COALESCE(NULLIF(trim(p_subject), ''), subject),
        body_html = COALESCE(NULLIF(trim(p_body_html), ''), body_html),
        body_text = CASE
            WHEN p_body_text IS NULL THEN body_text
            ELSE NULLIF(trim(p_body_text), '')
        END,
        category = COALESCE(p_category, category),
        target_system = COALESCE(p_target_system, target_system),
        variables = COALESCE(p_variables, variables),
        is_active = COALESCE(p_is_active, is_active),
        version = version + 1,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_template_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'email_template.update',
        'email_template',
        p_template_id,
        jsonb_build_object('template_key', v_new.template_key, 'version', v_new.version),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_email_template
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_email_template(
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
    v_prev admin.email_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.email_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Email template not found: %', p_template_id;
    END IF;

    DELETE FROM admin.email_templates
    WHERE id = p_template_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'email_template.delete',
        'email_template',
        p_template_id,
        jsonb_build_object('template_key', v_prev.template_key),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.toggle_email_template
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.toggle_email_template(
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
    v_prev admin.email_templates%ROWTYPE;
    v_new admin.email_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.email_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Email template not found: %', p_template_id;
    END IF;

    UPDATE admin.email_templates
    SET is_active = NOT is_active,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_template_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'email_template.toggle',
        'email_template',
        p_template_id,
        jsonb_build_object('is_active', v_new.is_active),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.log_email_send
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.log_email_send(
    p_template_id UUID,
    p_recipient_email TEXT,
    p_subject TEXT,
    p_status TEXT DEFAULT 'sent',
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB,
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
    v_new admin.email_send_log%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;

    IF trim(COALESCE(p_recipient_email, '')) = '' OR trim(COALESCE(p_subject, '')) = '' THEN
        RAISE EXCEPTION 'recipient_email and subject are required';
    END IF;

    IF COALESCE(p_status, 'sent') NOT IN ('sent', 'failed', 'bounced') THEN
        RAISE EXCEPTION 'Invalid status: %', p_status;
    END IF;

    IF p_template_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin.email_templates WHERE id = p_template_id
    ) THEN
        RAISE EXCEPTION 'Email template not found: %', p_template_id;
    END IF;

    INSERT INTO admin.email_send_log (
        template_id,
        recipient_email,
        subject,
        status,
        error_message,
        metadata
    )
    VALUES (
        p_template_id,
        lower(trim(p_recipient_email)),
        trim(p_subject),
        COALESCE(p_status, 'sent'),
        NULLIF(trim(COALESCE(p_error_message, '')), ''),
        COALESCE(p_metadata, '{}'::JSONB)
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.email_send_log WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'email_send.log',
        'email_send_log',
        v_id,
        jsonb_build_object('recipient_email', v_new.recipient_email, 'status', v_new.status),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.send_test_email (log only — no SMTP)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.send_test_email(
    p_template_id UUID,
    p_recipient_email TEXT,
    p_variables JSONB DEFAULT '{}'::JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_template admin.email_templates%ROWTYPE;
    v_rendered_subject TEXT;
    v_log_id UUID;
    v_pair RECORD;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;

    SELECT * INTO v_template
    FROM admin.email_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Email template not found: %', p_template_id;
    END IF;

    IF NOT v_template.is_active THEN
        RAISE EXCEPTION 'Email template is inactive: %', v_template.template_key;
    END IF;

    IF trim(COALESCE(p_recipient_email, '')) = '' THEN
        RAISE EXCEPTION 'recipient_email is required';
    END IF;

    v_rendered_subject := v_template.subject;
    FOR v_pair IN
        SELECT key, value
        FROM jsonb_each_text(COALESCE(p_variables, '{}'::JSONB))
    LOOP
        v_rendered_subject := replace(v_rendered_subject, '{{' || v_pair.key || '}}', v_pair.value);
    END LOOP;

    v_log_id := admin.log_email_send(
        p_template_id,
        p_recipient_email,
        v_rendered_subject,
        'sent',
        NULL,
        jsonb_build_object(
            'test_send', TRUE,
            'variables', COALESCE(p_variables, '{}'::JSONB),
            'template_key', v_template.template_key,
            'note', 'Test send logged only; no SMTP dispatch performed'
        ),
        v_admin_user_id
    );

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'email_template.test_send',
        'email_template',
        p_template_id,
        jsonb_build_object(
            'recipient_email', lower(trim(p_recipient_email)),
            'email_send_log_id', v_log_id
        ),
        NULL,
        NULL
    );

    RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.list_email_templates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_email_templates(
    p_category TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_active_only BOOLEAN DEFAULT FALSE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
    id UUID,
    template_key TEXT,
    template_name TEXT,
    subject TEXT,
    category TEXT,
    target_system TEXT,
    variables JSONB,
    is_active BOOLEAN,
    version INTEGER,
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.view') THEN
        RAISE EXCEPTION 'Permission denied: content.email.view required';
    END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.template_key,
        t.template_name,
        t.subject,
        t.category,
        t.target_system,
        t.variables,
        t.is_active,
        t.version,
        t.created_at,
        t.updated_at
    FROM admin.email_templates t
    WHERE (p_category IS NULL OR t.category = p_category)
      AND (p_target_system IS NULL OR t.target_system = p_target_system OR t.target_system = 'all')
      AND (NOT COALESCE(p_active_only, FALSE) OR t.is_active = TRUE)
    ORDER BY t.category, t.template_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('content.email.view', 'View Email Templates', 'content', 'View email templates and send log'),
    ('content.email.edit', 'Edit Email Templates', 'content', 'Create, update, delete email templates and log sends')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('content.email.view', 'content.email.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'content.email.view'),
    ('system_admin', 'content.email.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.create_email_template(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_email_template(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_email_template(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_email_template(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.log_email_send(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.send_test_email(UUID, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_email_templates(TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v22: Email template management and send log applied.';
END $$;
