-- ============================================================================
-- v122: Navigation Management nav entry + documentation guide seed
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51_admin_navigation.sql, v121_nav_node_management.sql
-- Plan: projectplans/v16.0_sidebar_navigation_management_plan.md
-- ============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES (
    'b8120001-0001-4001-8122-000000000001'::uuid,
    'admin-mgmt:access-control:admin-mgmt:navigation-management',
    'admin-mgmt:access-control',
    'item',
    'Navigation Management',
    '/admin-mgmt/navigation-management',
    ARRAY[]::text[],
    ARRAY['super_admin']::text[],
    162,
    TRUE,
    NULL
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

UPDATE admin.nav_nodes
SET sort_order = 163,
    updated_at = NOW()
WHERE node_key = 'admin-mgmt:access-control:admin-mgmt:active-sessions';

INSERT INTO admin.documentation_guides (
    id, guide_id, title, file_name, category, module, description, target_roles, sort_order
)
VALUES (
    'b8120001-0001-4001-8122-000000000002'::uuid,
    'navigation-management-guide',
    'Sidebar Navigation Management',
    'Navigation_Management_Guide.md',
    'Reference',
    'admin-mgmt',
    'Rename sidebar labels and manage per-role visibility without SQL migrations',
    ARRAY['super_admin']::text[],
    3
)
ON CONFLICT (guide_id) DO UPDATE SET
    title = EXCLUDED.title,
    file_name = EXCLUDED.file_name,
    module = EXCLUDED.module,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    target_roles = EXCLUDED.target_roles,
    sort_order = EXCLUDED.sort_order;
