-- =============================================================================
-- v209: Industry Reference Data — sidebar navigation (v918 Phase 8)
-- Parent: system-security (sibling group of "ID Generation", matching that precedent)
-- =============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES
(
    'a1b2c3d4-1111-4a1a-9c2a-1d7e5b900001'::uuid,
    'system-security:industries',
    'system-security',
    'group',
    'Industries',
    NULL,
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    140,
    TRUE,
    NULL
),
(
    'a1b2c3d4-1111-4a1a-9c2a-1d7e5b900002'::uuid,
    'system-security:industries:system:industry-categories',
    'system-security:industries',
    'item',
    'Industry Categories',
    '/system/industry-categories',
    ARRAY['/system/industry-category-form']::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    141,
    TRUE,
    NULL
),
(
    'a1b2c3d4-1111-4a1a-9c2a-1d7e5b900003'::uuid,
    'system-security:industries:system:industry-segments',
    'system-security:industries',
    'item',
    'Industry Segments',
    '/system/industry-segments',
    ARRAY['/system/industry-segment-form']::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    142,
    TRUE,
    NULL
),
(
    'a1b2c3d4-1111-4a1a-9c2a-1d7e5b900004'::uuid,
    'system-security:industries:system:industry-packs',
    'system-security:industries',
    'item',
    'Industry Packs',
    '/system/industry-packs',
    ARRAY['/system/industry-pack-form']::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    143,
    TRUE,
    NULL
),
(
    'a1b2c3d4-1111-4a1a-9c2a-1d7e5b900005'::uuid,
    'system-security:industries:system:professional-roles',
    'system-security:industries',
    'item',
    'Professional Roles',
    '/system/professional-roles',
    ARRAY['/system/professional-role-form']::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    144,
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

DO $$
BEGIN
    RAISE NOTICE 'v209_industry_reference_admin_nav.sql applied';
END $$;
