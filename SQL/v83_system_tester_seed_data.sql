-- ============================================================================
-- v83: System Tester program seed data
-- Prerequisites: v82_system_tester_infrastructure.sql
-- Run: pnpm run admin:seed-testers
-- Idempotent: ON CONFLICT. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------
INSERT INTO admin.system_settings (
    setting_key, setting_value, setting_type, category, description, is_sensitive
)
VALUES
    (
        'testers.default_moratorium_months',
        '10',
        'integer',
        'testers',
        'Default moratorium period (months) granted to new system testers. Individual grants and sandboxes can override this value.',
        FALSE
    ),
    (
        'testers.max_active_testers',
        '100',
        'integer',
        'testers',
        'Maximum number of concurrently active system testers. Enforced at grant time.',
        FALSE
    )
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Email templates — moratorium expiry notices
-- (category 'testers' added to email_templates_category_check)
-- ---------------------------------------------------------------------------
ALTER TABLE admin.email_templates
    DROP CONSTRAINT IF EXISTS email_templates_category_check;

ALTER TABLE admin.email_templates
    ADD CONSTRAINT email_templates_category_check
    CHECK (category IN ('auth', 'billing', 'support', 'system', 'testers'));

INSERT INTO admin.email_templates (
    id, template_key, template_name, subject, body_html, body_text,
    category, target_system, variables, is_active, version
)
VALUES
    (
        'b7583001-0001-4001-8083-000000000001'::uuid,
        'tester_moratorium_expiry_90d',
        'Tester Moratorium — 90 Days Remaining',
        'Your Nidus tester access expires in 90 days',
        '<p>Hi {{first_name}},</p><p>Your system tester moratorium ends on <strong>{{moratorium_end}}</strong> (about 90 days from now).</p><p>When you are ready, upgrade to a paid plan to keep full access: <a href="{{upgrade_url}}">View plans</a></p>',
        'Hi {{first_name}}, your tester moratorium ends on {{moratorium_end}}. Upgrade: {{upgrade_url}}',
        'testers',
        'all',
        '[{"name":"first_name"},{"name":"moratorium_end"},{"name":"upgrade_url"}]'::jsonb,
        TRUE,
        1
    ),
    (
        'b7583001-0001-4001-8083-000000000002'::uuid,
        'tester_moratorium_expiry_30d',
        'Tester Moratorium — 30 Days Remaining',
        'Your Nidus tester access expires in 30 days',
        '<p>Hi {{first_name}},</p><p>Your tester moratorium ends on <strong>{{moratorium_end}}</strong>. Convert to a paid subscription to continue without interruption.</p><p><a href="{{upgrade_url}}">Choose a plan</a></p>',
        'Hi {{first_name}}, your tester access ends {{moratorium_end}}. Upgrade: {{upgrade_url}}',
        'testers',
        'all',
        '[{"name":"first_name"},{"name":"moratorium_end"},{"name":"upgrade_url"}]'::jsonb,
        TRUE,
        1
    ),
    (
        'b7583001-0001-4001-8083-000000000003'::uuid,
        'tester_moratorium_expiry_7d',
        'Tester Moratorium — 7 Days Remaining',
        'Final week of your Nidus tester access',
        '<p>Hi {{first_name}},</p><p>Your tester moratorium ends in about 7 days (<strong>{{moratorium_end}}</strong>).</p><p><a href="{{upgrade_url}}">Subscribe now</a> to keep your projects and team access.</p>',
        'Hi {{first_name}}, tester access ends {{moratorium_end}}. Subscribe: {{upgrade_url}}',
        'testers',
        'all',
        '[{"name":"first_name"},{"name":"moratorium_end"},{"name":"upgrade_url"}]'::jsonb,
        TRUE,
        1
    ),
    (
        'b7583001-0001-4001-8083-000000000004'::uuid,
        'tester_moratorium_expiry_0d',
        'Your Nidus tester moratorium has ended',
        'Your tester moratorium has ended — upgrade to continue',
        '<p>Hi {{first_name}},</p><p>Your system tester moratorium ended today. Paid features are now gated until you subscribe.</p><p><a href="{{upgrade_url}}">View subscription options</a></p>',
        'Hi {{first_name}}, your tester moratorium ended. Upgrade: {{upgrade_url}}',
        'testers',
        'all',
        '[{"name":"first_name"},{"name":"moratorium_end"},{"name":"upgrade_url"}]'::jsonb,
        TRUE,
        1
    ),
    (
        'b7583001-0001-4001-8083-000000000005'::uuid,
        'tester_application_approved',
        'Tester Application Approved',
        'Welcome to the Nidus System Tester program',
        '<p>Hi {{first_name}},</p><p>Your application to test {{systems}} has been approved. Your moratorium runs until <strong>{{moratorium_end}}</strong>.</p><p><a href="{{login_url}}">Sign in to get started</a></p>',
        'Hi {{first_name}}, your tester application was approved until {{moratorium_end}}. Sign in: {{login_url}}',
        'testers',
        'all',
        '[{"name":"first_name"},{"name":"systems"},{"name":"moratorium_end"},{"name":"login_url"}]'::jsonb,
        TRUE,
        1
    )
ON CONFLICT (template_key) DO UPDATE SET
    template_name = EXCLUDED.template_name,
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text,
    category = EXCLUDED.category,
    variables = EXCLUDED.variables,
    is_active = EXCLUDED.is_active;

-- ---------------------------------------------------------------------------
-- Example applications (dev)
-- ---------------------------------------------------------------------------
INSERT INTO public.tester_applications (
    id, applicant_name, applicant_email, target_systems, motivation, experience,
    how_heard, status, created_at, updated_at
)
VALUES
    (
        'b7583002-0002-4002-8083-000000000001'::uuid,
        'Alex Rivera',
        'alex.rivera@example.com',
        ARRAY['platform', 'simulator'],
        'I run a PMO consultancy and want to evaluate Nidus for client delivery.',
        '10+ years PMO lead, PRINCE2 & Agile',
        'LinkedIn',
        'pending',
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '3 days'
    ),
    (
        'b7583002-0002-4002-8083-000000000002'::uuid,
        'Sam Okonkwo',
        'sam.okonkwo@example.com',
        ARRAY['platform'],
        'Testing end-to-end project lifecycle with a volunteer team.',
        'Project manager, construction sector',
        'Referral',
        'pending',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day'
    ),
    (
        'b7583002-0002-4002-8083-000000000003'::uuid,
        'Jordan Lee',
        'jordan.lee@example.com',
        ARRAY['simulator'],
        'Interested in PMO simulation for university coursework.',
        'Graduate student',
        'Web search',
        'rejected',
        NOW() - INTERVAL '10 days',
        NOW() - INTERVAL '9 days'
    )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Navigation seed
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b7583003-0003-4003-8083-000000000001'::uuid,
        'system-testers',
        NULL,
        'section',
        'System Testers',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        35,
        TRUE,
        NULL
    ),
    (
        'b7583003-0003-4003-8083-000000000002'::uuid,
        'system-testers:applications',
        'system-testers',
        'item',
        'Applications',
        '/system-testers/applications',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        36,
        TRUE,
        'pending'
    ),
    (
        'b7583003-0003-4003-8083-000000000003'::uuid,
        'system-testers:active',
        'system-testers',
        'item',
        'Active Testers',
        '/system-testers/active',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        37,
        TRUE,
        NULL
    ),
    (
        'b7583003-0003-4003-8083-000000000004'::uuid,
        'system-testers:grant',
        'system-testers',
        'item',
        'Grant Access',
        '/system-testers/grant',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        38,
        TRUE,
        NULL
    ),
    (
        'b7583003-0003-4003-8083-000000000005'::uuid,
        'system-testers:assignments',
        'system-testers',
        'item',
        'Project Assignments',
        '/system-testers/assignments',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        39,
        TRUE,
        NULL
    ),
    (
        'b7583003-0003-4003-8083-000000000006'::uuid,
        'system-testers:sandboxes',
        'system-testers',
        'item',
        'Sandbox Orgs',
        '/system-testers/sandboxes',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        40,
        TRUE,
        NULL
    ),
    (
        'b7583003-0003-4003-8083-000000000007'::uuid,
        'system-testers:expiry',
        'system-testers',
        'item',
        'Expiry Dashboard',
        '/system-testers/expiry',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        41,
        TRUE,
        NULL
    ),
    (
        'b7583003-0003-4003-8083-000000000008'::uuid,
        'system-testers:activity',
        'system-testers',
        'item',
        'Tester Activity',
        '/system-testers/activity',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        42,
        TRUE,
        NULL
    )
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    badge = EXCLUDED.badge;
