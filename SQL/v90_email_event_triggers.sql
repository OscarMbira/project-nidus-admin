-- ============================================================================
-- v90: Email event triggers
-- Plan: projectplans/v13.0_email_centre_plan.md (Phase 3)
-- Run: pnpm run admin:migrate-email-triggers
-- Prerequisites: v88_email_dispatch_infrastructure.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.email_event_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL UNIQUE
        CHECK (event_type IN (
            'subscription_cancelled', 'subscription_expiry_30d', 'subscription_expiry_7d',
            'refund_approved', 'refund_rejected',
            'affiliate_commission_paid', 'affiliate_welcome',
            'tester_approved', 'tester_rejected',
            'moratorium_expiry_90d', 'moratorium_expiry_30d', 'moratorium_expiry_7d'
        )),
    template_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    delay_hours INTEGER NOT NULL DEFAULT 0 CHECK (delay_hours >= 0),
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_email_event_triggers_updated_at ON admin.email_event_triggers;
CREATE TRIGGER trg_email_event_triggers_updated_at
    BEFORE UPDATE ON admin.email_event_triggers
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

ALTER TABLE admin.email_event_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_event_triggers_select ON admin.email_event_triggers;
CREATE POLICY email_event_triggers_select ON admin.email_event_triggers
    FOR SELECT TO authenticated USING (admin.is_active_admin());

GRANT SELECT ON admin.email_event_triggers TO authenticated;
GRANT ALL ON admin.email_event_triggers TO service_role;

-- ---------------------------------------------------------------------------
-- admin.trigger_email_event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.trigger_email_event(
    p_event_type TEXT,
    p_recipient_email TEXT,
    p_context_data JSONB DEFAULT '{}'::JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_trigger admin.email_event_triggers%ROWTYPE;
    v_template admin.email_templates%ROWTYPE;
    v_subject TEXT;
    v_body TEXT;
    v_pair RECORD;
    v_log_id UUID;
    v_admin_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());

    SELECT * INTO v_trigger FROM admin.email_event_triggers WHERE event_type = p_event_type;
    IF NOT FOUND OR NOT v_trigger.is_active THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_template
    FROM admin.email_templates
    WHERE template_key = v_trigger.template_key AND is_active = TRUE
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_subject := v_template.subject;
    v_body := v_template.body_html;
    FOR v_pair IN SELECT key, value FROM jsonb_each_text(COALESCE(p_context_data, '{}'::JSONB))
    LOOP
        v_subject := replace(v_subject, '{{' || v_pair.key || '}}', v_pair.value);
        v_body := replace(v_body, '{{' || v_pair.key || '}}', v_pair.value);
    END LOOP;

    IF v_trigger.delay_hours > 0 THEN
        INSERT INTO admin.email_queue (recipient_email, variables, status, scheduled_at)
        VALUES (
            lower(trim(p_recipient_email)),
            COALESCE(p_context_data, '{}'::JSONB) || jsonb_build_object(
                'event_type', p_event_type,
                'template_key', v_trigger.template_key,
                'subject', v_subject,
                'body_html', v_body
            ),
            'pending',
            NOW() + make_interval(hours => v_trigger.delay_hours)
        );
        RETURN NULL;
    END IF;

    v_log_id := admin.queue_email(
        p_recipient_email,
        v_trigger.template_key,
        v_subject,
        v_body,
        NULL,
        v_template.target_system,
        v_admin_id,
        jsonb_build_object('event_type', p_event_type, 'context', COALESCE(p_context_data, '{}'::JSONB))
    );

    RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.update_email_event_trigger(
    p_event_type TEXT,
    p_is_active BOOLEAN DEFAULT NULL,
    p_delay_hours INTEGER DEFAULT NULL,
    p_template_key TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_id UUID;
BEGIN
    v_admin_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF NOT admin.check_admin_permission(v_admin_id, 'system.email.send') THEN
        RAISE EXCEPTION 'Permission denied: system.email.send required';
    END IF;
    UPDATE admin.email_event_triggers
    SET is_active = COALESCE(p_is_active, is_active),
        delay_hours = COALESCE(p_delay_hours, delay_hours),
        template_key = COALESCE(p_template_key, template_key),
        updated_at = NOW()
    WHERE event_type = p_event_type;
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.trigger_email_event(TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_email_event_trigger(TEXT, BOOLEAN, INTEGER, TEXT, UUID) TO authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'v90: Email event triggers applied.'; END $$;
