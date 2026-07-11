-- ============================================================================
-- v62: Affiliate apply page preview — admin nav item
-- Prerequisites: v56_affiliate_program.sql (Affiliate Program nav group)
-- Run: pnpm run admin:migrate-affiliate-apply-preview-nav
-- ============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b7620001-0001-4001-8062-000000000001'::uuid,
        'subscription-billing:affiliate:affiliate-apply-preview',
        'subscription-billing:affiliate',
        'item',
        'Apply Page Preview',
        '/affiliates/apply-preview',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        31,
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
