-- ============================================================================
-- v106: Subscription history nav subsections (companion to regenerated v52)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51_admin_navigation.sql
-- Replaces flat "Subscriptions" group with four subsections (main + history).
-- Migrates existing rows by path/id to avoid nav_nodes_pkey clashes.
-- ============================================================================

-- Subsection groups
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b1060001-0001-4001-8106-000000000001'::uuid,
        'subscription-billing:paying-subscriptions',
        'subscription-billing',
        'group',
        'Paying Subscriptions',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        6,
        TRUE,
        NULL
    ),
    (
        'b1060001-0001-4001-8106-000000000002'::uuid,
        'subscription-billing:user-pricing-preview',
        'subscription-billing',
        'group',
        'User Pricing Preview',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        8,
        TRUE,
        NULL
    ),
    (
        'b1060001-0001-4001-8106-000000000003'::uuid,
        'subscription-billing:subscriptions-catalog',
        'subscription-billing',
        'group',
        'Subscriptions Catalog',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        10,
        TRUE,
        NULL
    ),
    (
        'b1060001-0001-4001-8106-000000000004'::uuid,
        'subscription-billing:revenue',
        'subscription-billing',
        'group',
        'Revenue',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin']::text[],
        12,
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

-- Migrate existing main items in place (preserves fixed plan-catalog id)
UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:paying-subscriptions:subscriptions:subscription-list',
    parent_key = 'subscription-billing:paying-subscriptions',
    label = 'Subscription List',
    active_paths = ARRAY['/subscriptions/subscription-detail', '/subscriptions/subscription-form']::text[],
    roles = ARRAY['super_admin', 'system_admin']::text[],
    sort_order = 7,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/subscription-list';

UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:user-pricing-preview:subscriptions:subscription-preview',
    parent_key = 'subscription-billing:user-pricing-preview',
    label = 'Preview',
    active_paths = ARRAY[]::text[],
    roles = ARRAY['super_admin', 'system_admin']::text[],
    sort_order = 9,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/subscription-preview';

UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:subscriptions-catalog:subscriptions:plan-catalog',
    parent_key = 'subscription-billing:subscriptions-catalog',
    label = 'Plan Catalog',
    active_paths = ARRAY['/subscriptions/plan-catalog-form']::text[],
    roles = ARRAY['super_admin', 'system_admin']::text[],
    sort_order = 11,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/plan-catalog'
   OR id = 'b7593002-0001-4002-8093-000000000001'::uuid
   OR node_key = 'subscription-billing:subscriptions:subscriptions:plan-catalog';

UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:revenue:subscriptions:revenue-dashboard',
    parent_key = 'subscription-billing:revenue',
    label = 'Dashboard',
    active_paths = ARRAY[]::text[],
    roles = ARRAY['super_admin']::text[],
    sort_order = 13,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/revenue-dashboard';

-- Migrate existing history items in place (if a prior v106 run created them under the flat group)
UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:paying-subscriptions:subscriptions:subscription-change-history',
    parent_key = 'subscription-billing:paying-subscriptions',
    label = 'Change History',
    active_paths = ARRAY[]::text[],
    roles = ARRAY['super_admin', 'system_admin']::text[],
    sort_order = 8,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/subscription-change-history';

UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:user-pricing-preview:subscriptions:pricing-preview-history',
    parent_key = 'subscription-billing:user-pricing-preview',
    label = 'Change History',
    active_paths = ARRAY[]::text[],
    roles = ARRAY['super_admin', 'system_admin']::text[],
    sort_order = 10,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/pricing-preview-history';

UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:subscriptions-catalog:subscriptions:plan-catalog-history',
    parent_key = 'subscription-billing:subscriptions-catalog',
    label = 'Change History',
    active_paths = ARRAY[]::text[],
    roles = ARRAY['super_admin', 'system_admin']::text[],
    sort_order = 12,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/plan-catalog-history';

UPDATE admin.nav_nodes SET
    node_key = 'subscription-billing:revenue:subscriptions:revenue-history',
    parent_key = 'subscription-billing:revenue',
    label = 'Change History',
    active_paths = ARRAY[]::text[],
    roles = ARRAY['super_admin']::text[],
    sort_order = 14,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/revenue-history';

-- Insert history items only when missing (no explicit id — avoids PK clashes)
INSERT INTO admin.nav_nodes (
    node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
SELECT v.node_key, v.parent_key, v.node_type, v.label, v.path,
       v.active_paths, v.roles, v.sort_order, v.is_active, v.badge
FROM (VALUES
    (
        'subscription-billing:paying-subscriptions:subscriptions:subscription-change-history',
        'subscription-billing:paying-subscriptions',
        'item',
        'Change History',
        '/subscriptions/subscription-change-history',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        8,
        TRUE,
        NULL::text
    ),
    (
        'subscription-billing:user-pricing-preview:subscriptions:pricing-preview-history',
        'subscription-billing:user-pricing-preview',
        'item',
        'Change History',
        '/subscriptions/pricing-preview-history',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        10,
        TRUE,
        NULL::text
    ),
    (
        'subscription-billing:subscriptions-catalog:subscriptions:plan-catalog-history',
        'subscription-billing:subscriptions-catalog',
        'item',
        'Change History',
        '/subscriptions/plan-catalog-history',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        12,
        TRUE,
        NULL::text
    ),
    (
        'subscription-billing:revenue:subscriptions:revenue-history',
        'subscription-billing:revenue',
        'item',
        'Change History',
        '/subscriptions/revenue-history',
        ARRAY[]::text[],
        ARRAY['super_admin']::text[],
        14,
        TRUE,
        NULL::text
    )
) AS v(node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
WHERE NOT EXISTS (
    SELECT 1 FROM admin.nav_nodes n WHERE n.path = v.path
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

-- Retire the former flat "Subscriptions" group and any leftover legacy keys
UPDATE admin.nav_nodes SET is_active = FALSE, updated_at = NOW()
WHERE node_key = 'subscription-billing:subscriptions'
   OR (
        node_key LIKE 'subscription-billing:subscriptions:subscriptions:%'
        AND is_active = TRUE
   );
