-- =============================================================================
-- v163: Global Template Library — sidebar navigation
-- Plan: projectplans/v159_global_template_library_plan.md
-- Parent: content-localization:content (Content group)
-- =============================================================================

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
    'content-localization:content',
    'item',
    'Global Template Library',
    '/content/global-template-library',
    ARRAY[
        '/content/global-template-library',
        '/content/global-template-form',
        '/content/global-template-detail'
    ]::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    40,
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
    RAISE NOTICE 'v163_global_template_library_nav_seed.sql applied';
END $$;
