-- =============================================================================
-- v168: Global Template Library — top-level sidebar section
-- Plan: projectplans/v167_global_template_library_industry_bulk_populate_plan.md (Part B)
-- Moves content-localization:content:global-template-library under new section
-- Nav tree requires section → group → item (see packages/shared/src/navServices.js)
-- Roles / route unchanged. Mirror: packages/shared/src/defaultAdminNav.js
-- Prerequisites: v163 (item exists)
-- =============================================================================

-- Section: Global Templates (sort_order 100 — immediately before Content & Localization 101)
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
    'a1680000-1111-4000-8000-000000000001'::uuid,
    'global-templates',
    NULL,
    'section',
    'Global Templates',
    NULL,
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    100,
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

-- Group under section (required by buildAdminNavTree)
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
    'a1680000-1111-4000-8000-000000000002'::uuid,
    'global-templates:library',
    'global-templates',
    'group',
    'Library',
    NULL,
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    10,
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

-- Re-parent existing GTL item (keep node_key + path; fix sort_order)
UPDATE admin.nav_nodes
SET
    parent_key = 'global-templates:library',
    sort_order = 10,
    label = 'Global Template Library',
    path = '/content/global-template-library',
    active_paths = ARRAY[
        '/content/global-template-library',
        '/content/global-template-form',
        '/content/global-template-detail'
    ]::text[],
    roles = ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    is_active = TRUE,
    updated_at = NOW()
WHERE node_key = 'content-localization:content:global-template-library';

-- Safety: insert if v163 never ran
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
    'f4a8c2d1-6b3e-4f91-9c2a-1d7e5b908160'::uuid,
    'content-localization:content:global-template-library',
    'global-templates:library',
    'item',
    'Global Template Library',
    '/content/global-template-library',
    ARRAY[
        '/content/global-template-library',
        '/content/global-template-form',
        '/content/global-template-detail'
    ]::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    10,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    sort_order = EXCLUDED.sort_order,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v168_global_template_library_nav_reorg.sql applied';
END $$;
