-- ============================================================================
-- v85: Documentation guides seed + nav
-- Prerequisites: v84_documentation_infrastructure.sql
-- Run: pnpm run admin:seed-docs
-- ============================================================================

INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES
    ('b7584001-0001-4001-8085-000000000001'::uuid, 'getting-started', 'Getting Started', 'Getting_Started.md', 'Overview', 'general', 'Admin console orientation and first steps', NULL, 1),
    ('b7584001-0001-4001-8085-000000000002'::uuid, 'role-guides-overview', 'Role Guides Overview', 'Role_Guides_Overview.md', 'Overview', 'general', 'What each admin role can access', NULL, 2),
    ('b7584001-0002-4001-8085-000000000001'::uuid, 'user-management-guide', 'User Management', 'User_Management_Guide.md', 'Reference', 'users', 'Manage platform and simulator users', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0002-4001-8085-000000000002'::uuid, 'user-suspension-guide', 'User Suspension', 'User_Suspension_Guide.md', 'Reference', 'users', 'Suspend and investigate user accounts', ARRAY['super_admin','system_admin'], 2),
    ('b7584001-0003-4001-8085-000000000001'::uuid, 'subscription-management-guide', 'Subscription Management', 'Subscription_Management_Guide.md', 'Reference', 'subscriptions', 'Plans, billing, and catalog', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0004-4001-8085-000000000001'::uuid, 'affiliate-program-guide', 'Affiliate Program', 'Affiliate_Program_Guide.md', 'Reference', 'affiliates', 'Partner applications and commissions', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0005-4001-8085-000000000001'::uuid, 'support-tickets-guide', 'Support Tickets', 'Support_Tickets_Guide.md', 'Reference', 'support', 'Ticket workflow for support admins', ARRAY['super_admin','system_admin','support_admin'], 1),
    ('b7584001-0006-4001-8085-000000000001'::uuid, 'content-cms-guide', 'Content & CMS', 'Content_CMS_Guide.md', 'Reference', 'content', 'Documentation CMS and help articles', ARRAY['super_admin','content_admin'], 1),
    ('b7584001-0007-4001-8085-000000000001'::uuid, 'system-settings-guide', 'System Settings', 'System_Settings_Guide.md', 'Reference', 'system', 'Feature flags, COB, and global settings', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0008-4001-8085-000000000001'::uuid, 'batch-ops-guide', 'Batch Operations', 'Batch_Operations_Guide.md', 'Reference', 'batch-ops', 'Bulk jobs and batch processing', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0009-4001-8085-000000000001'::uuid, 'security-overview-guide', 'Security Overview', 'Security_Overview_Guide.md', 'Reference', 'security', 'API keys, SSO, and monitoring', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-000a-4001-8085-000000000001'::uuid, 'audit-log-guide', 'Audit Log', 'Audit_Log_Guide.md', 'Reference', 'audit', 'Filter, export, and investigate audit events', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-000b-4001-8085-000000000001'::uuid, 'error-investigation-guide', 'Error Investigation', 'Error_Investigation_Guide.md', 'Reference', 'errors', 'Error dashboard and investigation workflow', ARRAY['super_admin','support_admin'], 1),
    ('b7584001-000c-4001-8085-000000000001'::uuid, 'feedback-bugs-guide', 'Feedback & Bugs', 'Feedback_Bugs_Guide.md', 'Reference', 'feedback', 'Bug tracking and feature requests', ARRAY['super_admin','support_admin'], 1),
    ('b7584001-000d-4001-8085-000000000001'::uuid, 'platform-console-guide', 'Platform Console', 'Platform_Console_Guide.md', 'Reference', 'platform', 'Read-only platform project and user views', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-000e-4001-8085-000000000001'::uuid, 'simulator-console-guide', 'Simulator Console', 'Simulator_Console_Guide.md', 'Reference', 'simulator', 'Scenarios, certificates, and simulator admin', ARRAY['super_admin','content_admin'], 1),
    ('b7584001-000f-4001-8085-000000000001'::uuid, 'admin-mgmt-guide', 'Admin User Management', 'Admin_Management_Guide.md', 'Reference', 'admin-mgmt', 'Invite admins, roles, and activation', ARRAY['super_admin'], 1),
    ('b7584001-0010-4001-8085-000000000001'::uuid, 'mirrors-guide', 'Environment Mirrors', 'Mirrors_Guide.md', 'Reference', 'mirrors', 'Platform and simulator mirror consoles', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0011-4001-8085-000000000001'::uuid, 'system-testers-guide', 'System Tester Program', 'System_Tester_Program_Guide.md', 'Reference', 'testers', 'Moratorium, sandboxes, and tester access', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0012-4001-8085-000000000001'::uuid, 'testing-centre-guide', 'Testing Centre', 'Testing_Centre_Guide.md', 'Reference', 'testing-centre', 'E2E tests, evidence, and diagnostics', ARRAY['super_admin','system_admin'], 1),
    ('b7584001-0013-4001-8085-000000000001'::uuid, 'docs-centre-guide', 'Documentation Centre', 'Documentation_Centre_Guide.md', 'Reference', 'docs-centre', 'How admin documentation is authored and synced', NULL, 1)
ON CONFLICT (guide_id) DO UPDATE SET
    title = EXCLUDED.title,
    file_name = EXCLUDED.file_name,
    module = EXCLUDED.module,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

-- Navigation
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b7584002-0002-4002-8085-000000000001'::uuid,
        'docs-centre',
        NULL,
        'section',
        'Documentation',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin', 'content_admin']::text[],
        5,
        TRUE,
        NULL
    ),
    (
        'b7584002-0002-4002-8085-000000000002'::uuid,
        'docs-centre:browse',
        'docs-centre',
        'item',
        'Browse Docs',
        '/docs-centre',
        ARRAY['/docs-centre/search']::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin', 'content_admin']::text[],
        6,
        TRUE,
        NULL
    ),
    (
        'b7584002-0002-4002-8085-000000000003'::uuid,
        'docs-centre:editor',
        'docs-centre',
        'item',
        'Editor',
        '/docs-centre/editor',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
        7,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000001'::uuid,
        'testing-centre',
        NULL,
        'section',
        'Testing Centre',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        43,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000002'::uuid,
        'testing-centre:dashboard',
        'testing-centre',
        'item',
        'Dashboard',
        '/testing-centre',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        44,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000003'::uuid,
        'testing-centre:cases',
        'testing-centre',
        'item',
        'Case Library',
        '/testing-centre/cases',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        45,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000004'::uuid,
        'testing-centre:suites',
        'testing-centre',
        'item',
        'Test Suites',
        '/testing-centre/suites',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        46,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000005'::uuid,
        'testing-centre:runs',
        'testing-centre',
        'item',
        'Test Runs',
        '/testing-centre/runs',
        ARRAY['/testing-centre/runs/']::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        47,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000006'::uuid,
        'testing-centre:evidence',
        'testing-centre',
        'item',
        'Evidence',
        '/testing-centre/evidence',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        48,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000007'::uuid,
        'testing-centre:diagnostics',
        'testing-centre',
        'item',
        'Diagnostics',
        '/testing-centre/diagnostics',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        49,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000008'::uuid,
        'testing-centre:defects',
        'testing-centre',
        'item',
        'Defects',
        '/testing-centre/defects',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        50,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000009'::uuid,
        'testing-centre:reports',
        'testing-centre',
        'item',
        'Reports',
        '/testing-centre/reports',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        51,
        TRUE,
        NULL
    ),
    (
        'b7584003-0003-4003-8085-000000000010'::uuid,
        'testing-centre:settings',
        'testing-centre',
        'item',
        'Settings',
        '/testing-centre/settings',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        52,
        TRUE,
        NULL
    )
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;
