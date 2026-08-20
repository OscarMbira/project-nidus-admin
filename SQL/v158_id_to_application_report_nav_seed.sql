-- ============================================================================
-- v158: ID to Application Report — sidebar navigation
-- Adds report page under SYSTEM & SECURITY > ID GENERATION
-- ============================================================================

INSERT INTO admin.nav_nodes (
    id,
    node_key,
    parent_key,
    node_type,
    label,
    path,
    active_paths,
    roles,
    sort_order,
    is_active,
    badge
)
VALUES (
    'f4a8c2d1-6b3e-4f91-9c2a-1d7e5b908643'::uuid,
    'system-security:id-generation:system:id-to-application-report',
    'system-security:id-generation',
    'item',
    'ID to Application Report',
    '/system/id-to-application-report',
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    131,
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
