-- =============================================================================
-- v174c: Global Templates — Forms + Process Docs sidebar groups
-- Plan: projectplans/v173_global_template_library_domain_coverage_plan.md Parts C/D
-- Mirror: packages/shared/src/defaultAdminNav.js
-- Prerequisites: v168 (global-templates section)
-- =============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES (
    'a1740000-1111-4000-8000-000000000001'::uuid,
    'global-templates:forms',
    'global-templates',
    'group',
    'Forms',
    NULL,
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    20,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
(
    'a1740000-1111-4000-8000-000000000011'::uuid,
    'global-templates:forms:initiating',
    'global-templates:forms',
    'item',
    'Initiating',
    '/content/global-template-library?domain=form_template&category=Initiating',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    10, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000012'::uuid,
    'global-templates:forms:planning',
    'global-templates:forms',
    'item',
    'Planning',
    '/content/global-template-library?domain=form_template&category=Planning',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    20, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000013'::uuid,
    'global-templates:forms:executing',
    'global-templates:forms',
    'item',
    'Executing',
    '/content/global-template-library?domain=form_template&category=Executing',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    30, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000014'::uuid,
    'global-templates:forms:monitoring',
    'global-templates:forms',
    'item',
    'Monitoring & Controlling',
    '/content/global-template-library?domain=form_template&category=Monitoring+%26+Controlling',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    40, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000015'::uuid,
    'global-templates:forms:closing',
    'global-templates:forms',
    'item',
    'Closing',
    '/content/global-template-library?domain=form_template&category=Closing',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    50, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000016'::uuid,
    'global-templates:forms:agile',
    'global-templates:forms',
    'item',
    'Agile',
    '/content/global-template-library?domain=form_template&category=Agile',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    60, TRUE, NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES (
    'a1740000-1111-4000-8000-000000000002'::uuid,
    'global-templates:process-docs',
    'global-templates',
    'group',
    'Process Docs',
    NULL,
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    30,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
(
    'a1740000-1111-4000-8000-000000000021'::uuid,
    'global-templates:process-docs:initiating',
    'global-templates:process-docs',
    'item',
    'Initiating',
    '/content/global-template-library?domain=process_template&category=Initiating',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    10, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000022'::uuid,
    'global-templates:process-docs:planning',
    'global-templates:process-docs',
    'item',
    'Planning',
    '/content/global-template-library?domain=process_template&category=Planning',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    20, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000023'::uuid,
    'global-templates:process-docs:executing',
    'global-templates:process-docs',
    'item',
    'Executing',
    '/content/global-template-library?domain=process_template&category=Executing',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    30, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000024'::uuid,
    'global-templates:process-docs:monitoring',
    'global-templates:process-docs',
    'item',
    'Monitoring & Controlling',
    '/content/global-template-library?domain=process_template&category=Monitoring+%26+Controlling',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    40, TRUE, NULL
),
(
    'a1740000-1111-4000-8000-000000000025'::uuid,
    'global-templates:process-docs:closing',
    'global-templates:process-docs',
    'item',
    'Closing',
    '/content/global-template-library?domain=process_template&category=Closing',
    ARRAY['/content/global-template-library']::text[],
    ARRAY['super_admin', 'system_admin', 'content_admin']::text[],
    50, TRUE, NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

DO $$
BEGIN
  RAISE NOTICE 'v174c_forms_process_docs_nav.sql applied';
END $$;
