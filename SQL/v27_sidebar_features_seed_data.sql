-- ============================================================================
-- v27: Sidebar features seed data (notifications, email, webhooks, reports,
--      billing, localization)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v21–v26 (v25 also requires v18; billing samples work best with v14)
--
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Skips billing rows when platform subscription seed users are absent.
-- Does NOT seed API keys (plain secrets must be created via the admin UI).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: active super_admin for created_by columns
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_super UUID;
BEGIN
    SELECT id INTO v_super
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_super IS NULL THEN
        RAISE NOTICE 'v27: No active super_admin — created_by columns will remain NULL where applicable.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Alert rules (linked to v21 notification templates)
-- ---------------------------------------------------------------------------
INSERT INTO admin.alert_rules (
    id,
    rule_name,
    rule_key,
    description,
    condition_type,
    condition_params,
    notification_template_id,
    target_roles,
    target_system,
    is_active,
    check_interval_minutes,
    last_checked_at,
    created_by
)
SELECT
    seed.id,
    seed.rule_name,
    seed.rule_key,
    seed.description,
    seed.condition_type,
    seed.condition_params,
    nt.id,
    seed.target_roles,
    seed.target_system,
    seed.is_active,
    seed.check_interval_minutes,
    seed.last_checked_at,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
FROM (
    VALUES
        (
            'b7380027-0001-4000-8000-000000000001'::uuid,
            'Subscription expiry (7 days)',
            'sub_expiry_7d',
            'Notify admins when a platform subscription expires within 7 days',
            'subscription_expiry',
            '{"days_before": 7}'::jsonb,
            'subscription_expiry_warning',
            ARRAY['super_admin', 'system_admin']::text[],
            'platform',
            TRUE,
            60,
            NOW() - INTERVAL '2 hours'
        ),
        (
            'b7380027-0001-4000-8000-000000000002'::uuid,
            'Failed payment threshold',
            'failed_payment_threshold',
            'Alert when failed payments exceed threshold in a rolling window',
            'failed_payment',
            '{"threshold": 5, "window_hours": 24}'::jsonb,
            'failed_payment',
            ARRAY['super_admin', 'system_admin']::text[],
            'all',
            TRUE,
            30,
            NOW() - INTERVAL '45 minutes'
        ),
        (
            'b7380027-0001-4000-8000-000000000003'::uuid,
            'System health — API latency',
            'system_health_api_latency',
            'Warn when average API latency exceeds configured threshold',
            'system_health',
            '{"metric_name": "api_latency_ms", "threshold": 500}'::jsonb,
            'system_health_warning',
            ARRAY['super_admin', 'system_admin']::text[],
            'all',
            TRUE,
            15,
            NOW() - INTERVAL '10 minutes'
        ),
        (
            'b7380027-0001-4000-8000-000000000004'::uuid,
            'Security incident — failed logins',
            'security_failed_login_burst',
            'Critical alert for burst of failed admin login attempts',
            'custom',
            '{"event": "failed_admin_login", "count_threshold": 10, "window_minutes": 5}'::jsonb,
            'security_incident',
            ARRAY['super_admin']::text[],
            'admin',
            TRUE,
            5,
            NOW() - INTERVAL '1 day'
        )
) AS seed(id, rule_name, rule_key, description, condition_type, condition_params, template_key, target_roles, target_system, is_active, check_interval_minutes, last_checked_at)
INNER JOIN admin.notification_templates nt ON nt.template_key = seed.template_key
ON CONFLICT (rule_key) DO UPDATE SET
    rule_name = EXCLUDED.rule_name,
    description = EXCLUDED.description,
    condition_type = EXCLUDED.condition_type,
    condition_params = EXCLUDED.condition_params,
    notification_template_id = EXCLUDED.notification_template_id,
    target_roles = EXCLUDED.target_roles,
    target_system = EXCLUDED.target_system,
    is_active = EXCLUDED.is_active,
    check_interval_minutes = EXCLUDED.check_interval_minutes,
    last_checked_at = EXCLUDED.last_checked_at;

-- ---------------------------------------------------------------------------
-- Sample notifications (notification bell demo)
-- ---------------------------------------------------------------------------
INSERT INTO admin.notifications (
    id,
    template_id,
    recipient_admin_id,
    title,
    message,
    category,
    severity,
    is_read,
    action_url,
    metadata,
    created_at,
    expires_at
)
SELECT
    seed.id,
    nt.id,
    seed.recipient_admin_id,
    seed.title,
    seed.message,
    seed.category,
    seed.severity,
    seed.is_read,
    seed.action_url,
    seed.metadata,
    seed.created_at,
    seed.expires_at
FROM (
    VALUES
        (
            'b7380027-0002-4000-8000-000000000001'::uuid,
            'subscription_expiry_warning',
            NULL::uuid,
            '3 subscriptions expiring this week',
            'Review upcoming renewals for Professional and Starter plans across Platform.',
            'billing',
            'warning',
            FALSE,
            '/subscriptions/subscription-list',
            '{"seed": "v27", "broadcast": true}'::jsonb,
            NOW() - INTERVAL '3 hours',
            NOW() + INTERVAL '30 days'
        ),
        (
            'b7380027-0002-4000-8000-000000000002'::uuid,
            'failed_payment',
            NULL::uuid,
            'Payment failure spike detected',
            '5 failed card payments in the last 24 hours. Most recent: SEED-PAY-202603-FAIL.',
            'billing',
            'critical',
            FALSE,
            '/subscriptions/payment-transactions',
            '{"seed": "v27", "broadcast": true}'::jsonb,
            NOW() - INTERVAL '1 hour',
            NOW() + INTERVAL '14 days'
        ),
        (
            'b7380027-0002-4000-8000-000000000003'::uuid,
            'system_health_warning',
            NULL::uuid,
            'Elevated API latency on Platform',
            'Average API latency reached 620ms (threshold: 500ms) over the last 15 minutes.',
            'system',
            'warning',
            FALSE,
            '/platform/platform-health',
            '{"seed": "v27", "broadcast": true}'::jsonb,
            NOW() - INTERVAL '20 minutes',
            NOW() + INTERVAL '7 days'
        ),
        (
            'b7380027-0002-4000-8000-000000000004'::uuid,
            'security_incident',
            (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
            'New admin session from unfamiliar IP',
            'A super_admin session started from 203.0.113.42 (seed demo). Verify this was you.',
            'security',
            'info',
            FALSE,
            '/admin-mgmt/active-sessions',
            '{"seed": "v27", "ip": "203.0.113.42"}'::jsonb,
            NOW() - INTERVAL '15 minutes',
            NULL::timestamptz
        ),
        (
            'b7380027-0002-4000-8000-000000000005'::uuid,
            NULL,
            (SELECT id FROM admin.admin_users WHERE role = 'system_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
            'Weekly admin digest ready',
            'Your scheduled User Growth report completed successfully. View results in Reports.',
            'system',
            'info',
            TRUE,
            '/audit/report-viewer?id=b7380027-0005-4000-8000-000000000001',
            '{"seed": "v27", "report_key": "user_growth"}'::jsonb,
            NOW() - INTERVAL '2 days',
            NOW() + INTERVAL '90 days'
        )
) AS seed(id, template_key, recipient_admin_id, title, message, category, severity, is_read, action_url, metadata, created_at, expires_at)
LEFT JOIN admin.notification_templates nt ON nt.template_key = seed.template_key
ON CONFLICT (id) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    recipient_admin_id = EXCLUDED.recipient_admin_id,
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    is_read = EXCLUDED.is_read,
    action_url = EXCLUDED.action_url,
    metadata = EXCLUDED.metadata,
    expires_at = EXCLUDED.expires_at;

-- ---------------------------------------------------------------------------
-- Additional email templates
-- ---------------------------------------------------------------------------
INSERT INTO admin.email_templates (
    id,
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
VALUES
    (
        'b7380027-0003-4000-8000-000000000001',
        'invoice_issued',
        'Invoice Issued',
        'Invoice {{invoice_number}} for {{amount}} {{currency}}',
        '<h1>Invoice {{invoice_number}}</h1><p>Hi {{first_name}},</p><p>Your invoice for {{amount}} {{currency}} is due on {{due_date}}.</p><p><a href="{{invoice_url}}">View invoice</a></p>',
        'Hi {{first_name}}, invoice {{invoice_number}} for {{amount}} {{currency}} is due on {{due_date}}. View: {{invoice_url}}',
        'billing',
        'platform',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"invoice_number","description":"Invoice number"},{"name":"amount","description":"Total amount"},{"name":"currency","description":"Currency code"},{"name":"due_date","description":"Due date"},{"name":"invoice_url","description":"Link to invoice"}]'::jsonb,
        TRUE,
        1,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'b7380027-0003-4000-8000-000000000002',
        'account_verification',
        'Account Verification',
        'Verify your {{product_name}} account',
        '<p>Hi {{first_name}},</p><p>Please verify your email by clicking: <a href="{{verify_url}}">Verify account</a></p>',
        'Hi {{first_name}}, verify your {{product_name}} account: {{verify_url}}',
        'auth',
        'all',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"product_name","description":"Product name"},{"name":"verify_url","description":"Verification URL"}]'::jsonb,
        TRUE,
        1,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'b7380027-0003-4000-8000-000000000003',
        'simulator_certificate_awarded',
        'Simulator Certificate Awarded',
        'Congratulations — you earned {{certificate_name}}',
        '<h1>Certificate awarded</h1><p>Hi {{first_name}},</p><p>You completed <strong>{{scenario_name}}</strong> and earned <strong>{{certificate_name}}</strong>.</p>',
        'Hi {{first_name}}, you earned {{certificate_name}} for completing {{scenario_name}}.',
        'system',
        'simulator',
        '[{"name":"first_name","description":"Recipient first name"},{"name":"certificate_name","description":"Certificate title"},{"name":"scenario_name","description":"Scenario completed"}]'::jsonb,
        TRUE,
        1,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
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
-- Email send log samples
-- ---------------------------------------------------------------------------
INSERT INTO admin.email_send_log (
    id,
    template_id,
    recipient_email,
    subject,
    status,
    error_message,
    metadata,
    sent_at
)
SELECT
    seed.id,
    et.id,
    seed.recipient_email,
    seed.subject,
    seed.status,
    seed.error_message,
    seed.metadata,
    seed.sent_at
FROM (
    VALUES
        (
            'b7380027-0004-4000-8000-000000000001'::uuid,
            'welcome_email',
            'demo.user@projectnidus.test',
            'Welcome to Project Nidus, Demo!',
            'sent',
            NULL::text,
            '{"seed": "v27", "variables": {"first_name": "Demo", "product_name": "Project Nidus"}}'::jsonb,
            NOW() - INTERVAL '5 days'
        ),
        (
            'b7380027-0004-4000-8000-000000000002'::uuid,
            'subscription_renewed',
            'billing@projectnidus.test',
            'Your Professional subscription has been renewed',
            'sent',
            NULL::text,
            '{"seed": "v27", "plan_name": "Professional", "amount": "49.00", "currency": "USD"}'::jsonb,
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7380027-0004-4000-8000-000000000003'::uuid,
            'ticket_update',
            'support@projectnidus.test',
            'Update on ticket #SPT-001: Login issue',
            'sent',
            NULL::text,
            '{"seed": "v27", "ticket_id": "SPT-001"}'::jsonb,
            NOW() - INTERVAL '6 hours'
        ),
        (
            'b7380027-0004-4000-8000-000000000004'::uuid,
            'password_reset',
            'bounce@invalid-domain.test',
            'Reset your Project Nidus password',
            'bounced',
            'Mailbox unavailable (550 5.1.1 User unknown)',
            '{"seed": "v27", "simulated_bounce": true}'::jsonb,
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7380027-0004-4000-8000-000000000005'::uuid,
            'invoice_issued',
            'accounts@projectnidus.test',
            'Invoice INV-2026-00001 for 55.35 USD',
            'sent',
            NULL::text,
            '{"seed": "v27", "invoice_number": "INV-2026-00001"}'::jsonb,
            NOW() - INTERVAL '12 hours'
        )
) AS seed(id, template_key, recipient_email, subject, status, error_message, metadata, sent_at)
INNER JOIN admin.email_templates et ON et.template_key = seed.template_key
ON CONFLICT (id) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    recipient_email = EXCLUDED.recipient_email,
    subject = EXCLUDED.subject,
    status = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    metadata = EXCLUDED.metadata,
    sent_at = EXCLUDED.sent_at;

-- ---------------------------------------------------------------------------
-- Demo webhooks (inactive — no outbound calls) + delivery log
-- ---------------------------------------------------------------------------
INSERT INTO admin.webhooks (
    id,
    webhook_name,
    endpoint_url,
    secret,
    events,
    target_system,
    is_active,
    retry_count,
    last_triggered_at,
    failure_count,
    created_by
)
VALUES
    (
        'b7380027-0006-4000-8000-000000000001',
        'Platform CRM Sync (demo)',
        'https://webhook.site/seed-platform-crm-demo',
        'whsec_seed_platform_crm_demo_only',
        ARRAY['user.created', 'subscription.created', 'subscription.cancelled']::text[],
        'platform',
        FALSE,
        3,
        NOW() - INTERVAL '3 days',
        2,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'b7380027-0006-4000-8000-000000000002',
        'Simulator Analytics (demo)',
        'https://webhook.site/seed-simulator-analytics-demo',
        'whsec_seed_simulator_analytics_demo',
        ARRAY['certificate.awarded', 'scenario.completed']::text[],
        'simulator',
        FALSE,
        5,
        NOW() - INTERVAL '1 day',
        0,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    )
ON CONFLICT (id) DO UPDATE SET
    webhook_name = EXCLUDED.webhook_name,
    endpoint_url = EXCLUDED.endpoint_url,
    events = EXCLUDED.events,
    target_system = EXCLUDED.target_system,
    is_active = EXCLUDED.is_active,
    retry_count = EXCLUDED.retry_count,
    last_triggered_at = EXCLUDED.last_triggered_at,
    failure_count = EXCLUDED.failure_count;

INSERT INTO admin.webhook_delivery_log (
    id,
    webhook_id,
    event_type,
    payload,
    response_status,
    response_body,
    attempt_number,
    status,
    delivered_at,
    created_at
)
VALUES
    (
        'b7380027-0007-4000-8000-000000000001',
        'b7380027-0006-4000-8000-000000000001',
        'user.created',
        '{"seed": "v27", "user_id": "demo-user", "email": "demo@projectnidus.test"}'::jsonb,
        200,
        '{"ok": true}',
        1,
        'delivered',
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '3 days'
    ),
    (
        'b7380027-0007-4000-8000-000000000002',
        'b7380027-0006-4000-8000-000000000001',
        'subscription.cancelled',
        '{"seed": "v27", "subscription_id": "b7360001-0001-4000-8000-000000000004"}'::jsonb,
        502,
        'Bad Gateway',
        3,
        'failed',
        NULL,
        NOW() - INTERVAL '2 days'
    ),
    (
        'b7380027-0007-4000-8000-000000000003',
        'b7380027-0006-4000-8000-000000000002',
        'certificate.awarded',
        '{"seed": "v27", "certificate": "Safety Fundamentals", "user_id": "demo-learner"}'::jsonb,
        200,
        '{"received": true}',
        1,
        'delivered',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT (id) DO UPDATE SET
    webhook_id = EXCLUDED.webhook_id,
    event_type = EXCLUDED.event_type,
    payload = EXCLUDED.payload,
    response_status = EXCLUDED.response_status,
    response_body = EXCLUDED.response_body,
    attempt_number = EXCLUDED.attempt_number,
    status = EXCLUDED.status,
    delivered_at = EXCLUDED.delivered_at,
    created_at = EXCLUDED.created_at;

-- ---------------------------------------------------------------------------
-- Scheduled reports + sample completed runs
-- ---------------------------------------------------------------------------
INSERT INTO admin.scheduled_reports (
    id,
    report_id,
    schedule_type,
    schedule_config,
    recipients,
    format,
    is_active,
    last_run_at,
    next_run_at,
    created_by
)
SELECT
    seed.id,
    rd.id,
    seed.schedule_type,
    seed.schedule_config,
    seed.recipients,
    seed.format,
    seed.is_active,
    seed.last_run_at,
    seed.next_run_at,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
FROM (
    VALUES
        (
            'b7380027-0008-4000-8000-000000000001'::uuid,
            'user_growth',
            'weekly',
            '{"day_of_week": "monday", "time": "08:00"}'::jsonb,
            ARRAY['admin@projectnidus.test']::text[],
            'csv',
            TRUE,
            NOW() - INTERVAL '2 days',
            date_trunc('week', NOW()) + INTERVAL '1 week' + INTERVAL '8 hours'
        ),
        (
            'b7380027-0008-4000-8000-000000000002'::uuid,
            'revenue',
            'monthly',
            '{"day_of_month": 1, "time": "06:00"}'::jsonb,
            ARRAY['finance@projectnidus.test', 'admin@projectnidus.test']::text[],
            'pdf',
            TRUE,
            NOW() - INTERVAL '28 days',
            date_trunc('month', NOW()) + INTERVAL '1 month' + INTERVAL '6 hours'
        ),
        (
            'b7380027-0008-4000-8000-000000000003'::uuid,
            'support_volume',
            'daily',
            '{"time": "07:30"}'::jsonb,
            ARRAY['support@projectnidus.test']::text[],
            'json',
            FALSE,
            NOW() - INTERVAL '14 days',
            NULL::timestamptz
        )
) AS seed(id, report_key, schedule_type, schedule_config, recipients, format, is_active, last_run_at, next_run_at)
INNER JOIN admin.report_definitions rd ON rd.report_key = seed.report_key
ON CONFLICT (id) DO UPDATE SET
    report_id = EXCLUDED.report_id,
    schedule_type = EXCLUDED.schedule_type,
    schedule_config = EXCLUDED.schedule_config,
    recipients = EXCLUDED.recipients,
    format = EXCLUDED.format,
    is_active = EXCLUDED.is_active,
    last_run_at = EXCLUDED.last_run_at,
    next_run_at = EXCLUDED.next_run_at;

INSERT INTO admin.report_runs (
    id,
    report_id,
    scheduled_report_id,
    status,
    result_data,
    row_count,
    file_url,
    run_by,
    started_at,
    completed_at
)
SELECT
    seed.id,
    rd.id,
    seed.scheduled_report_id,
    seed.status,
    seed.result_data,
    seed.row_count,
    seed.file_url,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    seed.started_at,
    seed.completed_at
FROM (
    VALUES
        (
            'b7380027-0005-4000-8000-000000000001'::uuid,
            'user_growth',
            'b7380027-0008-4000-8000-000000000001'::uuid,
            'completed',
            '{"stub": true, "report_key": "user_growth", "rows": [{"period": "2026-W24", "platform_new_users": 42, "simulator_new_users": 18}, {"period": "2026-W23", "platform_new_users": 38, "simulator_new_users": 15}]}'::jsonb,
            2,
            NULL::text,
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '2 days' + INTERVAL '3 seconds'
        ),
        (
            'b7380027-0005-4000-8000-000000000002'::uuid,
            'revenue',
            'b7380027-0008-4000-8000-000000000002'::uuid,
            'completed',
            '{"stub": true, "report_key": "revenue", "rows": [{"currency": "USD", "mrr": 12450.00, "target_system": "platform"}, {"currency": "ZAR", "mrr": 89000.00, "target_system": "simulator"}]}'::jsonb,
            2,
            NULL::text,
            NOW() - INTERVAL '28 days',
            NOW() - INTERVAL '28 days' + INTERVAL '5 seconds'
        ),
        (
            'b7380027-0005-4000-8000-000000000003'::uuid,
            'error_trends',
            NULL::uuid,
            'completed',
            '{"stub": true, "report_key": "error_trends", "rows": [{"date": "2026-06-18", "error_count": 12, "severity": "warning"}, {"date": "2026-06-19", "error_count": 7, "severity": "info"}]}'::jsonb,
            2,
            NULL::text,
            NOW() - INTERVAL '6 hours',
            NOW() - INTERVAL '6 hours' + INTERVAL '2 seconds'
        ),
        (
            'b7380027-0005-4000-8000-000000000004'::uuid,
            'churn',
            NULL::uuid,
            'failed',
            '{"stub": true, "report_key": "churn", "error": "Data source timeout"}'::jsonb,
            0,
            NULL::text,
            NOW() - INTERVAL '1 day',
            NOW() - INTERVAL '1 day' + INTERVAL '30 seconds'
        )
) AS seed(id, report_key, scheduled_report_id, status, result_data, row_count, file_url, started_at, completed_at)
INNER JOIN admin.report_definitions rd ON rd.report_key = seed.report_key
ON CONFLICT (id) DO UPDATE SET
    report_id = EXCLUDED.report_id,
    scheduled_report_id = EXCLUDED.scheduled_report_id,
    status = EXCLUDED.status,
    result_data = EXCLUDED.result_data,
    row_count = EXCLUDED.row_count,
    file_url = EXCLUDED.file_url,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at;

-- ---------------------------------------------------------------------------
-- Tax rates (requires v18 countries)
-- ---------------------------------------------------------------------------
INSERT INTO admin.tax_rates (
    id,
    country_code,
    tax_name,
    rate,
    is_inclusive,
    applies_to,
    is_active,
    effective_from,
    effective_to,
    created_by,
    updated_by
)
SELECT
    seed.id,
    seed.country_code,
    seed.tax_name,
    seed.rate,
    seed.is_inclusive,
    seed.applies_to,
    seed.is_active,
    seed.effective_from,
    seed.effective_to,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
FROM (
    VALUES
        ('b7380027-0009-4000-8000-000000000001'::uuid, 'ZA', 'VAT', 15.00, FALSE, 'all', TRUE, DATE '2024-04-01', NULL::date),
        ('b7380027-0009-4000-8000-000000000002'::uuid, 'US', 'Sales Tax (avg)', 7.25, FALSE, 'platform', TRUE, DATE '2025-01-01', NULL::date),
        ('b7380027-0009-4000-8000-000000000003'::uuid, 'GB', 'VAT', 20.00, FALSE, 'all', TRUE, DATE '2024-01-01', NULL::date),
        ('b7380027-0009-4000-8000-000000000004'::uuid, 'DE', 'VAT (USt)', 19.00, FALSE, 'all', TRUE, DATE '2024-01-01', NULL::date),
        ('b7380027-0009-4000-8000-000000000005'::uuid, 'FR', 'VAT (TVA)', 20.00, FALSE, 'simulator', TRUE, DATE '2024-01-01', NULL::date)
) AS seed(id, country_code, tax_name, rate, is_inclusive, applies_to, is_active, effective_from, effective_to)
WHERE EXISTS (SELECT 1 FROM admin.countries c WHERE c.country_code = seed.country_code)
ON CONFLICT (id) DO UPDATE SET
    tax_name = EXCLUDED.tax_name,
    rate = EXCLUDED.rate,
    is_inclusive = EXCLUDED.is_inclusive,
    applies_to = EXCLUDED.applies_to,
    is_active = EXCLUDED.is_active,
    effective_from = EXCLUDED.effective_from,
    effective_to = EXCLUDED.effective_to,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Sample invoices + refund (requires v14 subscription seed user)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_super UUID;
    v_user_id UUID;
    v_sub_id UUID := 'b7360001-0001-4000-8000-000000000001';
    v_pay_id UUID := 'b7360101-0001-4000-8000-000000000002';
    v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
BEGIN
    SELECT id INTO v_super
    FROM admin.admin_users
    WHERE role = 'super_admin' AND activation_status = 'active'
    ORDER BY created_at LIMIT 1;

    SELECT ps.user_id INTO v_user_id
    FROM public.platform_subscriptions ps
    WHERE ps.id = v_sub_id;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'v27: platform_subscriptions seed row % not found — skipping invoice/refund seed.', v_sub_id;
        RETURN;
    END IF;

    INSERT INTO admin.invoices (
        id, invoice_number, user_id, subscription_id, target_system, status,
        currency, subtotal, tax_amount, total, tax_rate_applied,
        issued_at, due_at, paid_at, payment_transaction_id, line_items, notes,
        created_by, updated_by
    )
    VALUES
        (
            'b7380027-0010-4000-8000-000000000001',
            'INV-' || v_year::TEXT || '-00001',
            v_user_id,
            v_sub_id,
            'platform',
            'paid',
            'USD',
            49.00,
            0.00,
            49.00,
            NULL,
            NOW() - INTERVAL '30 days',
            NOW() - INTERVAL '23 days',
            NOW() - INTERVAL '28 days',
            v_pay_id,
            '[{"description": "Professional Monthly — January", "quantity": 1, "unit_price": 49.00, "amount": 49.00}]'::jsonb,
            'Seed invoice — paid renewal',
            v_super,
            v_super
        ),
        (
            'b7380027-0010-4000-8000-000000000002',
            'INV-' || v_year::TEXT || '-00002',
            v_user_id,
            v_sub_id,
            'platform',
            'issued',
            'USD',
            49.00,
            6.35,
            55.35,
            7.25,
            NOW() - INTERVAL '2 days',
            NOW() + INTERVAL '14 days',
            NULL,
            NULL,
            '[{"description": "Professional Monthly — current period", "quantity": 1, "unit_price": 49.00, "amount": 49.00}]'::jsonb,
            'Seed invoice — issued, awaiting payment',
            v_super,
            v_super
        ),
        (
            'b7380027-0010-4000-8000-000000000003',
            'INV-' || v_year::TEXT || '-00003',
            v_user_id,
            NULL,
            'platform',
            'draft',
            'USD',
            99.00,
            0.00,
            99.00,
            NULL,
            NULL,
            NOW() + INTERVAL '30 days',
            NULL,
            NULL,
            '[{"description": "Onboarding services (draft)", "quantity": 1, "unit_price": 99.00, "amount": 99.00}]'::jsonb,
            'Seed invoice — draft',
            v_super,
            v_super
        )
    ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal,
        tax_amount = EXCLUDED.tax_amount,
        total = EXCLUDED.total,
        tax_rate_applied = EXCLUDED.tax_rate_applied,
        issued_at = EXCLUDED.issued_at,
        due_at = EXCLUDED.due_at,
        paid_at = EXCLUDED.paid_at,
        payment_transaction_id = EXCLUDED.payment_transaction_id,
        line_items = EXCLUDED.line_items,
        notes = EXCLUDED.notes,
        updated_at = NOW();

    INSERT INTO admin.refunds (
        id,
        invoice_id,
        payment_transaction_id,
        amount,
        currency,
        reason,
        status,
        approved_by,
        processed_at,
        created_by,
        updated_by
    )
    VALUES (
        'b7380027-0011-4000-8000-000000000001',
        'b7380027-0010-4000-8000-000000000001',
        v_pay_id,
        10.00,
        'USD',
        'Partial goodwill credit — seed demo',
        'processed',
        v_super,
        NOW() - INTERVAL '25 days',
        v_super,
        v_super
    )
    ON CONFLICT (id) DO UPDATE SET
        amount = EXCLUDED.amount,
        reason = EXCLUDED.reason,
        status = EXCLUDED.status,
        approved_by = EXCLUDED.approved_by,
        processed_at = EXCLUDED.processed_at,
        updated_at = NOW();

    INSERT INTO admin.invoice_number_counters (year, last_number)
    VALUES (v_year, 3)
    ON CONFLICT (year) DO UPDATE
    SET last_number = GREATEST(admin.invoice_number_counters.last_number, EXCLUDED.last_number);

    RAISE NOTICE 'v27: Seeded 3 invoices and 1 refund for user %.', v_user_id;
END $$;

-- ---------------------------------------------------------------------------
-- Additional languages + translation keys + translations
-- ---------------------------------------------------------------------------
INSERT INTO admin.supported_languages (
    id,
    language_code,
    language_name,
    native_name,
    is_default,
    is_active,
    completion_percentage,
    target_system,
    created_by,
    updated_by
)
VALUES
    (
        'b7380027-0012-4000-8000-000000000001',
        'af',
        'Afrikaans',
        'Afrikaans',
        FALSE,
        TRUE,
        0,
        'all',
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'b7380027-0012-4000-8000-000000000002',
        'zu',
        'Zulu',
        'isiZulu',
        FALSE,
        TRUE,
        0,
        'all',
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'b7380027-0012-4000-8000-000000000003',
        'fr',
        'French',
        'Français',
        FALSE,
        TRUE,
        0,
        'all',
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    )
ON CONFLICT (language_code) DO UPDATE SET
    language_name = EXCLUDED.language_name,
    native_name = EXCLUDED.native_name,
    is_active = EXCLUDED.is_active,
    target_system = EXCLUDED.target_system,
    updated_at = NOW();

INSERT INTO admin.translation_keys (
    id,
    translation_key,
    default_value,
    context,
    category,
    target_system,
    created_by,
    updated_by
)
VALUES
    ('b7380027-0013-4000-8000-000000000001', 'auth.login.title', 'Sign in', 'Login page heading', 'auth', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000002', 'auth.login.submit', 'Continue', 'Login form submit button', 'auth', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000003', 'auth.login.email_label', 'Email address', 'Login email field label', 'auth', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000004', 'dashboard.welcome', 'Welcome back, {{name}}', 'Dashboard greeting with name variable', 'dashboard', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000005', 'dashboard.quick_actions', 'Quick actions', 'Dashboard section title', 'dashboard', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000006', 'settings.profile.title', 'Profile settings', 'Settings page title', 'settings', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000007', 'settings.profile.save', 'Save changes', 'Profile save button', 'settings', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000008', 'sim.scenario.start', 'Start scenario', 'Simulator scenario CTA', 'simulator', 'simulator', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000009', 'sim.certificate.download', 'Download certificate', 'Certificate download button', 'simulator', 'simulator', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000010', 'support.ticket.create', 'Create ticket', 'Support new ticket action', 'support', 'platform', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000011', 'billing.invoice.view', 'View invoice', 'Billing invoice link label', 'billing', 'platform', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)),
    ('b7380027-0013-4000-8000-000000000012', 'common.cancel', 'Cancel', 'Generic cancel button', 'common', 'all', (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1), (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1))
ON CONFLICT (translation_key, target_system) DO UPDATE SET
    default_value = EXCLUDED.default_value,
    context = EXCLUDED.context,
    category = EXCLUDED.category,
    updated_at = NOW();

INSERT INTO admin.translations (
    id,
    translation_key_id,
    language_code,
    translated_value,
    is_reviewed,
    reviewed_by,
    created_by,
    updated_by
)
SELECT
    seed.id,
    tk.id,
    seed.language_code,
    seed.translated_value,
    seed.is_reviewed,
    CASE WHEN seed.is_reviewed THEN (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1) ELSE NULL END,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
FROM (
    VALUES
        ('b7380027-0014-4000-8000-000000000001'::uuid, 'auth.login.title', 'af', 'Teken in', TRUE),
        ('b7380027-0014-4000-8000-000000000002'::uuid, 'auth.login.submit', 'af', 'Gaan voort', TRUE),
        ('b7380027-0014-4000-8000-000000000003'::uuid, 'auth.login.email_label', 'af', 'E-posadres', TRUE),
        ('b7380027-0014-4000-8000-000000000004'::uuid, 'dashboard.welcome', 'af', 'Welkom terug, {{name}}', TRUE),
        ('b7380027-0014-4000-8000-000000000005'::uuid, 'common.cancel', 'af', 'Kanselleer', TRUE),
        ('b7380027-0014-4000-8000-000000000006'::uuid, 'auth.login.title', 'zu', 'Ngena ngemvume', TRUE),
        ('b7380027-0014-4000-8000-000000000007'::uuid, 'auth.login.submit', 'zu', 'Qhubeka', FALSE),
        ('b7380027-0014-4000-8000-000000000008'::uuid, 'dashboard.welcome', 'zu', 'Siyakwamukela futhi, {{name}}', FALSE),
        ('b7380027-0014-4000-8000-000000000009'::uuid, 'auth.login.title', 'fr', 'Se connecter', TRUE),
        ('b7380027-0014-4000-8000-000000000010'::uuid, 'auth.login.submit', 'fr', 'Continuer', TRUE),
        ('b7380027-0014-4000-8000-000000000011'::uuid, 'auth.login.email_label', 'fr', 'Adresse e-mail', TRUE),
        ('b7380027-0014-4000-8000-000000000012'::uuid, 'dashboard.welcome', 'fr', 'Bon retour, {{name}}', TRUE),
        ('b7380027-0014-4000-8000-000000000013'::uuid, 'dashboard.quick_actions', 'fr', 'Actions rapides', TRUE),
        ('b7380027-0014-4000-8000-000000000014'::uuid, 'common.cancel', 'fr', 'Annuler', TRUE)
) AS seed(id, translation_key, language_code, translated_value, is_reviewed)
INNER JOIN admin.translation_keys tk
    ON tk.translation_key = seed.translation_key
   AND tk.target_system = CASE
        WHEN seed.translation_key LIKE 'sim.%' THEN 'simulator'
        WHEN seed.translation_key LIKE 'support.%' OR seed.translation_key LIKE 'billing.%' THEN 'platform'
        ELSE 'all'
    END
ON CONFLICT (translation_key_id, language_code) DO UPDATE SET
    translated_value = EXCLUDED.translated_value,
    is_reviewed = EXCLUDED.is_reviewed,
    reviewed_by = EXCLUDED.reviewed_by,
    updated_at = NOW();

DO $$
BEGIN
    PERFORM admin._localization_recalc_completion('af');
    PERFORM admin._localization_recalc_completion('zu');
    PERFORM admin._localization_recalc_completion('fr');
END $$;

-- ---------------------------------------------------------------------------
-- Register admin tables in database_tables catalog
-- ---------------------------------------------------------------------------
INSERT INTO public.database_tables (table_name, table_description, schema_name, is_system_table, is_active, table_category)
VALUES
    ('notification_templates', 'Reusable in-app and email notification templates', 'admin', TRUE, TRUE, 'admin'),
    ('notifications', 'Admin-facing notifications and broadcast alerts', 'admin', FALSE, TRUE, 'admin'),
    ('alert_rules', 'Automated alert evaluation rules', 'admin', TRUE, TRUE, 'admin'),
    ('email_templates', 'Transactional email templates with variable placeholders', 'admin', TRUE, TRUE, 'admin'),
    ('email_send_log', 'Audit log of rendered transactional emails', 'admin', FALSE, TRUE, 'admin'),
    ('api_keys', 'Hashed API keys for external integrations', 'admin', TRUE, TRUE, 'admin'),
    ('webhooks', 'Outbound webhook endpoints for event notifications', 'admin', TRUE, TRUE, 'admin'),
    ('webhook_delivery_log', 'Webhook delivery attempts and outcomes', 'admin', FALSE, TRUE, 'admin'),
    ('report_definitions', 'Built-in and custom report definitions', 'admin', TRUE, TRUE, 'admin'),
    ('scheduled_reports', 'Scheduled report delivery configuration', 'admin', FALSE, TRUE, 'admin'),
    ('report_runs', 'Ad-hoc and scheduled report execution history', 'admin', FALSE, TRUE, 'admin'),
    ('invoices', 'Admin-managed billing invoices', 'admin', FALSE, TRUE, 'admin'),
    ('tax_rates', 'Country-specific tax rates with effective dating', 'admin', FALSE, TRUE, 'admin'),
    ('refunds', 'Invoice refund requests and workflow', 'admin', FALSE, TRUE, 'admin'),
    ('supported_languages', 'Platform and simulator supported languages', 'admin', FALSE, TRUE, 'admin'),
    ('translation_keys', 'Canonical translation keys with English defaults', 'admin', TRUE, TRUE, 'admin'),
    ('translations', 'Per-language translated values for keys', 'admin', FALSE, TRUE, 'admin')
ON CONFLICT (table_name) DO UPDATE SET
    table_description = EXCLUDED.table_description,
    schema_name = EXCLUDED.schema_name,
    is_system_table = EXCLUDED.is_system_table,
    is_active = EXCLUDED.is_active,
    table_category = EXCLUDED.table_category,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v27: Sidebar features seed data applied.';
END $$;
