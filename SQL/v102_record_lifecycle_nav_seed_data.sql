-- ============================================================================
-- v102: Record Governance nav seed data (standalone companion to v52)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51_admin_navigation.sql
-- Note: v52 (regenerated from defaultAdminNav.js) includes these nodes; this file
--       remains for incremental apply without re-seeding the full nav tree.
-- ============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b8020001-0001-4001-8102-000000000001'::uuid,
        'admin-mgmt:record-governance',
        'admin-mgmt',
        'group',
        'Record Governance',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        156,
        TRUE,
        NULL
    ),
    (
        'b8020001-0001-4001-8102-000000000002'::uuid,
        'admin-mgmt:record-governance:admin-mgmt:record-governance:lifecycle-configuration',
        'admin-mgmt:record-governance',
        'item',
        'Lifecycle Configuration',
        '/admin-mgmt/record-governance/lifecycle-configuration',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        157,
        TRUE,
        NULL
    ),
    (
        'b8020001-0001-4001-8102-000000000003'::uuid,
        'admin-mgmt:record-governance:admin-mgmt:record-governance:authorisers',
        'admin-mgmt:record-governance',
        'item',
        'Authorisers',
        '/admin-mgmt/record-governance/authorisers',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        158,
        TRUE,
        NULL
    ),
    (
        'b8020001-0001-4001-8102-000000000004'::uuid,
        'admin-mgmt:record-governance:admin-mgmt:record-governance:archive-retention-rules',
        'admin-mgmt:record-governance',
        'item',
        'Archive Retention Rules',
        '/admin-mgmt/record-governance/archive-retention-rules',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        159,
        TRUE,
        NULL
    ),
    (
        'b8020001-0001-4001-8102-000000000005'::uuid,
        'admin-mgmt:record-governance:admin-mgmt:record-governance:my-approvals',
        'admin-mgmt:record-governance',
        'item',
        'My Approvals',
        '/admin-mgmt/record-governance/my-approvals',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        160,
        TRUE,
        'pending'
    )
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    node_type = EXCLUDED.node_type,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    badge = EXCLUDED.badge,
    updated_at = NOW();
