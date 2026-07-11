-- ============================================================================
-- v91: Email centre seed data + nav
-- Plan: projectplans/v13.0_email_centre_plan.md (Phase 4)
-- Run: pnpm run admin:seed-email-data
-- Prerequisites: v88, v89, v90
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Expand template categories
-- ---------------------------------------------------------------------------
ALTER TABLE admin.email_templates
    DROP CONSTRAINT IF EXISTS email_templates_category_check;

ALTER TABLE admin.email_templates
    ADD CONSTRAINT email_templates_category_check
    CHECK (category IN ('auth', 'billing', 'support', 'system', 'affiliate', 'testers', 'marketing'));

-- Update create/update RPC category validation
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = admin, public
AS $$
DECLARE v_admin_user_id UUID; v_id UUID; v_new admin.email_templates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'content.email.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.email.edit required';
    END IF;
    IF COALESCE(p_category, '') NOT IN ('auth', 'billing', 'support', 'system', 'affiliate', 'testers', 'marketing') THEN
        RAISE EXCEPTION 'Invalid category: %', p_category;
    END IF;
    INSERT INTO admin.email_templates (
        template_key, template_name, subject, body_html, body_text, category,
        target_system, variables, is_active, version, created_by, updated_by
    ) VALUES (
        lower(trim(p_template_key)), trim(p_template_name), trim(p_subject), trim(p_body_html),
        NULLIF(trim(COALESCE(p_body_text, '')), ''), p_category,
        COALESCE(p_target_system, 'all'), COALESCE(p_variables, '[]'::JSONB),
        COALESCE(p_is_active, TRUE), 1, v_admin_user_id, v_admin_user_id
    ) RETURNING id INTO v_id;
    SELECT * INTO v_new FROM admin.email_templates WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin_user_id, 'email_template.create', 'email_template', v_id,
        jsonb_build_object('template_key', v_new.template_key), NULL, to_jsonb(v_new));
    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- New templates
-- ---------------------------------------------------------------------------
INSERT INTO admin.email_templates (template_key, template_name, subject, body_html, category, target_system, is_active)
VALUES
    ('tester_approved', 'System Tester: Application Approved', 'Welcome to the {{platform_name}} System Tester Program!',
     '<p>Hi {{first_name}},</p><p>Your application to the System Tester Program has been approved. You now have full professional-tier access for {{moratorium_months}} months at no cost.</p><p>Please log in to get started: {{login_url}}</p>',
     'testers', 'all', TRUE),
    ('tester_rejected', 'System Tester: Application Not Approved', 'Your System Tester Application Update',
     '<p>Hi {{first_name}},</p><p>Thank you for applying to the System Tester Program. Unfortunately we are unable to accept your application at this time.</p><p>Reason: {{rejection_reason}}</p>',
     'testers', 'all', TRUE),
    ('moratorium_expiry_90d', 'System Tester: Access Expiring in 90 Days', 'Your tester access expires in 90 days',
     '<p>Hi {{first_name}},</p><p>Your System Tester access will expire on {{expiry_date}} (90 days from today). After that date, a subscription will be required to continue using {{platform_name}}.</p>',
     'testers', 'all', TRUE),
    ('moratorium_expiry_30d', 'System Tester: Access Expiring in 30 Days', 'Your tester access expires in 30 days',
     '<p>Hi {{first_name}},</p><p>Your System Tester access will expire on {{expiry_date}}. Now is a great time to choose a subscription plan.</p><p>View plans: {{plans_url}}</p>',
     'testers', 'all', TRUE),
    ('moratorium_expiry_7d', 'System Tester: Access Expiring in 7 Days', 'Urgent: Your tester access expires in 7 days',
     '<p>Hi {{first_name}},</p><p>Your System Tester access expires on {{expiry_date}}. Subscribe now to avoid losing access.</p><p>Choose a plan: {{plans_url}}</p>',
     'testers', 'all', TRUE),
    ('affiliate_welcome', 'Affiliate Program: Welcome', 'Welcome to the {{platform_name}} Affiliate Program!',
     '<p>Hi {{first_name}},</p><p>You are now a registered affiliate. Your referral code is: <strong>{{referral_code}}</strong></p><p>Track your commissions in your affiliate dashboard: {{affiliate_dashboard_url}}</p>',
     'affiliate', 'all', TRUE),
    ('affiliate_commission_payout', 'Affiliate Commission Payout Processed', 'Your commission of {{currency}}{{amount}} has been processed',
     '<p>Hi {{first_name}},</p><p>A commission payout of {{currency}}{{amount}} for the period {{period}} has been processed to your account.</p><p>Transaction reference: {{transaction_ref}}</p>',
     'affiliate', 'all', TRUE),
    ('subscription_cancelled', 'Subscription Cancelled', 'Your {{platform_name}} subscription has been cancelled',
     '<p>Hi {{first_name}},</p><p>Your {{plan_name}} subscription has been cancelled effective {{cancel_date}}. You will retain access until {{access_until}}.</p><p>If this was a mistake, please contact support: {{support_url}}</p>',
     'billing', 'all', TRUE),
    ('subscription_expiry_warning_30d', 'Subscription Expiring in 30 Days', 'Your subscription expires on {{expiry_date}}',
     '<p>Hi {{first_name}},</p><p>Your {{plan_name}} subscription expires on {{expiry_date}}. Renew now to avoid service interruption.</p><p>Renew: {{renewal_url}}</p>',
     'billing', 'all', TRUE),
    ('subscription_expiry_warning_7d', 'Subscription Expiring in 7 Days', 'Urgent: Your subscription expires in 7 days',
     '<p>Hi {{first_name}},</p><p>Your {{plan_name}} subscription expires on {{expiry_date}}. Renew immediately to avoid service interruption.</p><p>Renew now: {{renewal_url}}</p>',
     'billing', 'all', TRUE),
    ('refund_approved', 'Refund Approved', 'Your refund of {{currency}}{{amount}} has been approved',
     '<p>Hi {{first_name}},</p><p>Your refund request for {{currency}}{{amount}} has been approved. Funds will be returned to your original payment method within 5-10 business days.</p><p>Reference: {{refund_id}}</p>',
     'billing', 'all', TRUE),
    ('refund_rejected', 'Refund Request Not Approved', 'Update on your refund request',
     '<p>Hi {{first_name}},</p><p>We have reviewed your refund request for {{currency}}{{amount}}. Unfortunately we are unable to process this refund.</p><p>Reason: {{rejection_reason}}</p><p>For assistance, contact support: {{support_url}}</p>',
     'billing', 'all', TRUE),
    ('platform_announcement', 'Platform Announcement', '{{announcement_subject}}',
     '<p>Hi {{first_name}},</p><p>{{announcement_body}}</p><p>The {{platform_name}} Team</p>',
     'marketing', 'all', TRUE)
ON CONFLICT (template_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Event trigger defaults
-- ---------------------------------------------------------------------------
INSERT INTO admin.email_event_triggers (event_type, template_key, is_active, delay_hours, description)
VALUES
    ('tester_approved', 'tester_approved', TRUE, 0, 'Sent when admin approves a tester application'),
    ('tester_rejected', 'tester_rejected', TRUE, 0, 'Sent when admin rejects a tester application'),
    ('moratorium_expiry_90d', 'moratorium_expiry_90d', TRUE, 0, 'Scheduled: 90 days before tester access expires'),
    ('moratorium_expiry_30d', 'moratorium_expiry_30d', TRUE, 0, 'Scheduled: 30 days before tester access expires'),
    ('moratorium_expiry_7d', 'moratorium_expiry_7d', TRUE, 0, 'Scheduled: 7 days before tester access expires'),
    ('affiliate_welcome', 'affiliate_welcome', TRUE, 0, 'Sent when an affiliate application is approved'),
    ('affiliate_commission_paid', 'affiliate_commission_payout', TRUE, 0, 'Sent when admin processes an affiliate commission payout'),
    ('refund_approved', 'refund_approved', TRUE, 0, 'Sent when admin approves a refund'),
    ('refund_rejected', 'refund_rejected', TRUE, 0, 'Sent when admin rejects a refund'),
    ('subscription_cancelled', 'subscription_cancelled', TRUE, 0, 'Sent when admin cancels a subscription'),
    ('subscription_expiry_30d', 'subscription_expiry_warning_30d', TRUE, 0, 'Scheduled: 30 days before subscription expires'),
    ('subscription_expiry_7d', 'subscription_expiry_warning_7d', TRUE, 0, 'Scheduled: 7 days before subscription expires')
ON CONFLICT (event_type) DO UPDATE SET
    template_key = EXCLUDED.template_key,
    description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------
INSERT INTO admin.system_settings (setting_key, setting_value, setting_type, category, description, is_sensitive)
VALUES
    ('email.daily_send_limit', '1000', 'integer', 'email', 'Maximum emails admin app can send per day', FALSE),
    ('email.monthly_send_limit', '10000', 'integer', 'email', 'Maximum emails admin app can send per month', FALSE),
    ('email.campaign_batch_size', '50', 'integer', 'email', 'Recipients per batch when dispatching campaigns', FALSE)
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Navigation
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b7585001-0001-5001-8091-000000000001'::uuid,
        'email-centre',
        NULL,
        'section',
        'Email Centre',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
        8,
        TRUE,
        NULL
    ),
    (
        'b7585001-0001-5001-8091-000000000002'::uuid,
        'email-centre:dashboard',
        'email-centre',
        'item',
        'Dashboard',
        '/email-centre/dashboard',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
        9,
        TRUE,
        NULL
    ),
    (
        'b7585001-0001-5001-8091-000000000003'::uuid,
        'email-centre:compose',
        'email-centre',
        'item',
        'Compose Email',
        '/email-centre/compose',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        10,
        TRUE,
        NULL
    ),
    (
        'b7585001-0001-5001-8091-000000000004'::uuid,
        'email-centre:campaigns',
        'email-centre',
        'item',
        'Campaigns',
        '/email-centre/campaigns',
        ARRAY['/email-centre/campaign-editor']::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        11,
        TRUE,
        NULL
    ),
    (
        'b7585001-0001-5001-8091-000000000005'::uuid,
        'email-centre:triggers',
        'email-centre',
        'item',
        'Event Triggers',
        '/email-centre/event-triggers',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        12,
        TRUE,
        NULL
    ),
    (
        'b7585001-0001-5001-8091-000000000006'::uuid,
        'email-centre:send-log',
        'email-centre',
        'item',
        'Send Log',
        '/email-centre/send-log',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
        13,
        TRUE,
        NULL
    ),
    (
        'b7585001-0002-5001-8091-000000000001'::uuid,
        'system:email-provider',
        'system-security:system',
        'item',
        'Email Provider',
        '/system/email-provider',
        ARRAY[]::text[],
        ARRAY['super_admin']::text[],
        35,
        TRUE,
        NULL
    )
ON CONFLICT (node_key) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

DO $$ BEGIN RAISE NOTICE 'v91: Email centre seed data applied.'; END $$;
