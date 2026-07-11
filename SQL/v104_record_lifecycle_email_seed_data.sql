-- ============================================================================
-- v104: Record lifecycle email templates and event triggers
-- PostgreSQL 15+ / Supabase
-- Run: pnpm run admin:seed-record-lifecycle-email
-- Prerequisites: v90_email_event_triggers.sql, v88_email_dispatch_infrastructure.sql
-- ============================================================================

ALTER TABLE admin.email_event_triggers
    DROP CONSTRAINT IF EXISTS email_event_triggers_event_type_check;

ALTER TABLE admin.email_event_triggers
    ADD CONSTRAINT email_event_triggers_event_type_check
    CHECK (event_type IN (
        'subscription_cancelled', 'subscription_expiry_30d', 'subscription_expiry_7d',
        'refund_approved', 'refund_rejected',
        'affiliate_commission_paid', 'affiliate_welcome',
        'tester_approved', 'tester_rejected',
        'moratorium_expiry_90d', 'moratorium_expiry_30d', 'moratorium_expiry_7d',
        'lifecycle_submitted', 'lifecycle_approved', 'lifecycle_rejected'
    ));

INSERT INTO admin.email_templates (template_key, template_name, subject, body_html, category, target_system, is_active)
VALUES
    (
        'lifecycle_submitted',
        'Record Lifecycle: Submitted for Approval',
        'Record change pending approval — {{table_name}}',
        '<p>A change to <strong>{{table_name}}</strong> (record {{record_id}}) has been submitted for authorisation.</p><p>Notes: {{submission_notes}}</p><p>Review in Admin → Record Governance → My Approvals.</p>',
        'system',
        'all',
        TRUE
    ),
    (
        'lifecycle_approved',
        'Record Lifecycle: Change Approved',
        'Record change approved — {{table_name}}',
        '<p>A change to <strong>{{table_name}}</strong> (record {{record_id}}) has been approved and is now live.</p><p>Decision notes: {{decision_notes}}</p>',
        'system',
        'all',
        TRUE
    ),
    (
        'lifecycle_rejected',
        'Record Lifecycle: Change Rejected',
        'Record change rejected — {{table_name}}',
        '<p>A change to <strong>{{table_name}}</strong> (record {{record_id}}) was rejected.</p><p>Reason: {{decision_notes}}</p>',
        'system',
        'all',
        TRUE
    )
ON CONFLICT (template_key) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    category = EXCLUDED.category,
    is_active = EXCLUDED.is_active;

INSERT INTO admin.email_event_triggers (event_type, template_key, is_active, delay_hours, description)
VALUES
    ('lifecycle_submitted', 'lifecycle_submitted', TRUE, 0, 'Sent when a governed record is submitted for authorisation'),
    ('lifecycle_approved', 'lifecycle_approved', TRUE, 0, 'Sent when an authoriser approves a lifecycle submission'),
    ('lifecycle_rejected', 'lifecycle_rejected', TRUE, 0, 'Sent when an authoriser rejects a lifecycle submission')
ON CONFLICT (event_type) DO UPDATE SET
    template_key = EXCLUDED.template_key,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

DO $$ BEGIN RAISE NOTICE 'v104: Record lifecycle email seed applied.'; END $$;
