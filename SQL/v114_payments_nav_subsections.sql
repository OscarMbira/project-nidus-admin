-- ============================================================================
-- v114: Split Payments nav into Configuration + Operations subsections
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51_admin_navigation.sql, v52_admin_navigation_seed_data.sql
-- ============================================================================

-- Retire the single long "Payments" group
UPDATE admin.nav_nodes SET
    is_active = FALSE,
    updated_at = NOW()
WHERE node_key = 'subscription-billing:payments';

-- New subsection groups
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b1140001-0001-4001-8114-000000000001'::uuid,
        'subscription-billing:payment-configuration',
        'subscription-billing',
        'group',
        'Payment Configuration',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        23,
        TRUE,
        NULL
    ),
    (
        'b1140001-0001-4001-8114-000000000002'::uuid,
        'subscription-billing:payment-operations',
        'subscription-billing',
        'group',
        'Payment Operations',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        24,
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

-- Payment Configuration items
UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 25,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-gateways';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 26,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-methods';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 27,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-method-routing';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 28,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-flow';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 29,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-retry-rules';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 30,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/settlement-accounts';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-configuration',
    sort_order = 31,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/promo-codes';

-- Payment Operations items
UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-operations',
    sort_order = 32,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-monitor';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-operations',
    sort_order = 33,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-dashboard';

UPDATE admin.nav_nodes SET
    parent_key = 'subscription-billing:payment-operations',
    sort_order = 34,
    is_active = TRUE,
    updated_at = NOW()
WHERE path = '/subscriptions/payment-reports';
