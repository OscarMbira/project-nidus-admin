-- =============================================================================
-- v186: Global Templates nav — level-first × methodology
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md
-- Mirror: packages/shared/src/defaultAdminNav.js
-- Prerequisites: v168 (section), v174c (forms/process groups — superseded leaves)
-- Nav tree shape: section → group → item (buildAdminNavTree)
-- =============================================================================

-- Deactivate legacy flat Forms / Process Docs / Default Content leaves (v174c era)
UPDATE admin.nav_nodes
SET is_active = FALSE, updated_at = NOW()
WHERE node_key IN (
  'global-templates:forms:initiating',
  'global-templates:forms:planning',
  'global-templates:forms:executing',
  'global-templates:forms:monitoring',
  'global-templates:forms:closing',
  'global-templates:forms:agile',
  'global-templates:process-docs:initiating',
  'global-templates:process-docs:planning',
  'global-templates:process-docs:executing',
  'global-templates:process-docs:monitoring',
  'global-templates:process-docs:closing'
)
OR node_key LIKE 'global-templates:default-content:%';

-- Keep legacy group shells inactive (replaced by methodology-labelled groups)
UPDATE admin.nav_nodes
SET is_active = FALSE, updated_at = NOW()
WHERE node_key IN (
  'global-templates:forms',
  'global-templates:process-docs',
  'global-templates:default-content'
);

-- ---------------------------------------------------------------------------
-- Portfolio / Programme / Project Templates (methodology leaves)
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1860000-0000-4000-8000-000000000010'::uuid, 'global-templates:portfolio', 'global-templates', 'group', 'Portfolio Templates', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000020'::uuid, 'global-templates:programme', 'global-templates', 'group', 'Programme Templates', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000030'::uuid, 'global-templates:project', 'global-templates', 'group', 'Project Templates', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
-- Portfolio
('a1860000-0000-4000-8000-000000000011'::uuid, 'global-templates:portfolio:pmbok', 'global-templates:portfolio', 'item', 'PMBOK',
 '/content/global-template-library?domain=portfolio_template&methodology=pmbok', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000012'::uuid, 'global-templates:portfolio:structured', 'global-templates:portfolio', 'item', 'Structured',
 '/content/global-template-library?domain=portfolio_template&methodology=structured', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000013'::uuid, 'global-templates:portfolio:agile', 'global-templates:portfolio', 'item', 'Agile',
 '/content/global-template-library?domain=portfolio_template&methodology=agile', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
-- Programme
('a1860000-0000-4000-8000-000000000021'::uuid, 'global-templates:programme:pmbok', 'global-templates:programme', 'item', 'PMBOK',
 '/content/global-template-library?domain=programme_template&methodology=pmbok', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000022'::uuid, 'global-templates:programme:structured', 'global-templates:programme', 'item', 'Structured',
 '/content/global-template-library?domain=programme_template&methodology=structured', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000023'::uuid, 'global-templates:programme:agile', 'global-templates:programme', 'item', 'Agile',
 '/content/global-template-library?domain=programme_template&methodology=agile', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
-- Project
('a1860000-0000-4000-8000-000000000031'::uuid, 'global-templates:project:pmbok', 'global-templates:project', 'item', 'PMBOK',
 '/content/global-template-library?domain=project_template&methodology=pmbok', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000032'::uuid, 'global-templates:project:structured', 'global-templates:project', 'item', 'Structured',
 '/content/global-template-library?domain=project_template&methodology=structured', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000033'::uuid, 'global-templates:project:agile', 'global-templates:project', 'item', 'Agile',
 '/content/global-template-library?domain=project_template&methodology=agile', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Forms · PMBOK / Structured / Agile
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1860000-0000-4000-8000-000000000040'::uuid, 'global-templates:forms-pmbok', 'global-templates', 'group', 'Forms · PMBOK', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1860000-0000-4000-8000-000000000050'::uuid, 'global-templates:forms-structured', 'global-templates', 'group', 'Forms · Structured', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 60, TRUE, NULL),
('a1860000-0000-4000-8000-000000000060'::uuid, 'global-templates:forms-agile', 'global-templates', 'group', 'Forms · Agile', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 70, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
-- Forms · PMBOK
('a1860000-0000-4000-8000-000000000041'::uuid, 'global-templates:forms-pmbok:initiating', 'global-templates:forms-pmbok', 'item', 'Initiating',
 '/content/global-template-library?domain=form_template&methodology=pmbok&category=Initiating', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000042'::uuid, 'global-templates:forms-pmbok:planning', 'global-templates:forms-pmbok', 'item', 'Planning',
 '/content/global-template-library?domain=form_template&methodology=pmbok&category=Planning', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000043'::uuid, 'global-templates:forms-pmbok:executing', 'global-templates:forms-pmbok', 'item', 'Executing',
 '/content/global-template-library?domain=form_template&methodology=pmbok&category=Executing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000044'::uuid, 'global-templates:forms-pmbok:monitoring', 'global-templates:forms-pmbok', 'item', 'Monitoring & Controlling',
 '/content/global-template-library?domain=form_template&methodology=pmbok&category=Monitoring+%26+Controlling', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-000000000045'::uuid, 'global-templates:forms-pmbok:closing', 'global-templates:forms-pmbok', 'item', 'Closing',
 '/content/global-template-library?domain=form_template&methodology=pmbok&category=Closing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
-- Forms · Structured
('a1860000-0000-4000-8000-000000000051'::uuid, 'global-templates:forms-structured:starting-up', 'global-templates:forms-structured', 'item', 'Starting Up',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Starting+Up', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000052'::uuid, 'global-templates:forms-structured:directing', 'global-templates:forms-structured', 'item', 'Directing',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Directing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000053'::uuid, 'global-templates:forms-structured:initiating', 'global-templates:forms-structured', 'item', 'Initiating',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Initiating', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000054'::uuid, 'global-templates:forms-structured:controlling', 'global-templates:forms-structured', 'item', 'Controlling a Stage',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Controlling+a+Stage', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-000000000055'::uuid, 'global-templates:forms-structured:product-delivery', 'global-templates:forms-structured', 'item', 'Managing Product Delivery',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Managing+Product+Delivery', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1860000-0000-4000-8000-000000000056'::uuid, 'global-templates:forms-structured:stage-boundary', 'global-templates:forms-structured', 'item', 'Managing a Stage Boundary',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Managing+a+Stage+Boundary', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 60, TRUE, NULL),
('a1860000-0000-4000-8000-000000000057'::uuid, 'global-templates:forms-structured:closing', 'global-templates:forms-structured', 'item', 'Closing',
 '/content/global-template-library?domain=form_template&methodology=structured&category=Closing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 70, TRUE, NULL),
-- Forms · Agile
('a1860000-0000-4000-8000-000000000061'::uuid, 'global-templates:forms-agile:backlog', 'global-templates:forms-agile', 'item', 'Backlog',
 '/content/global-template-library?domain=form_template&methodology=agile&category=Backlog', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000062'::uuid, 'global-templates:forms-agile:sprint-planning', 'global-templates:forms-agile', 'item', 'Sprint Planning',
 '/content/global-template-library?domain=form_template&methodology=agile&category=Sprint+Planning', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000063'::uuid, 'global-templates:forms-agile:sprint-execution', 'global-templates:forms-agile', 'item', 'Sprint Execution',
 '/content/global-template-library?domain=form_template&methodology=agile&category=Sprint+Execution', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000064'::uuid, 'global-templates:forms-agile:review-retro', 'global-templates:forms-agile', 'item', 'Review & Retrospective',
 '/content/global-template-library?domain=form_template&methodology=agile&category=Review+%26+Retrospective', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-000000000065'::uuid, 'global-templates:forms-agile:release', 'global-templates:forms-agile', 'item', 'Release',
 '/content/global-template-library?domain=form_template&methodology=agile&category=Release', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Default Content · PMBOK / Structured / Agile
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1860000-0000-4000-8000-000000000070'::uuid, 'global-templates:default-pmbok', 'global-templates', 'group', 'Default Content · PMBOK', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 80, TRUE, NULL),
('a1860000-0000-4000-8000-000000000080'::uuid, 'global-templates:default-structured', 'global-templates', 'group', 'Default Content · Structured', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 90, TRUE, NULL),
('a1860000-0000-4000-8000-000000000090'::uuid, 'global-templates:default-agile', 'global-templates', 'group', 'Default Content · Agile', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 100, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1860000-0000-4000-8000-000000000071'::uuid, 'global-templates:default-pmbok:initiating', 'global-templates:default-pmbok', 'item', 'Initiating',
 '/content/default-content-library?methodology=pmbok&category=Initiating', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000072'::uuid, 'global-templates:default-pmbok:planning', 'global-templates:default-pmbok', 'item', 'Planning',
 '/content/default-content-library?methodology=pmbok&category=Planning', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000073'::uuid, 'global-templates:default-pmbok:executing', 'global-templates:default-pmbok', 'item', 'Executing',
 '/content/default-content-library?methodology=pmbok&category=Executing', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000074'::uuid, 'global-templates:default-pmbok:monitoring', 'global-templates:default-pmbok', 'item', 'Monitoring & Controlling',
 '/content/default-content-library?methodology=pmbok&category=Monitoring+%26+Controlling', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-000000000075'::uuid, 'global-templates:default-pmbok:closing', 'global-templates:default-pmbok', 'item', 'Closing',
 '/content/default-content-library?methodology=pmbok&category=Closing', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1860000-0000-4000-8000-000000000076'::uuid, 'global-templates:default-pmbok:all', 'global-templates:default-pmbok', 'item', 'All coverage',
 '/content/default-content-library?methodology=pmbok', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 60, TRUE, NULL),
('a1860000-0000-4000-8000-000000000081'::uuid, 'global-templates:default-structured:starting-up', 'global-templates:default-structured', 'item', 'Starting Up',
 '/content/default-content-library?methodology=structured&category=Starting+Up', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000082'::uuid, 'global-templates:default-structured:directing', 'global-templates:default-structured', 'item', 'Directing',
 '/content/default-content-library?methodology=structured&category=Directing', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000083'::uuid, 'global-templates:default-structured:initiating', 'global-templates:default-structured', 'item', 'Initiating',
 '/content/default-content-library?methodology=structured&category=Initiating', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000084'::uuid, 'global-templates:default-structured:controlling', 'global-templates:default-structured', 'item', 'Controlling a Stage',
 '/content/default-content-library?methodology=structured&category=Controlling+a+Stage', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-000000000085'::uuid, 'global-templates:default-structured:product-delivery', 'global-templates:default-structured', 'item', 'Managing Product Delivery',
 '/content/default-content-library?methodology=structured&category=Managing+Product+Delivery', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1860000-0000-4000-8000-000000000086'::uuid, 'global-templates:default-structured:stage-boundary', 'global-templates:default-structured', 'item', 'Managing a Stage Boundary',
 '/content/default-content-library?methodology=structured&category=Managing+a+Stage+Boundary', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 60, TRUE, NULL),
('a1860000-0000-4000-8000-000000000087'::uuid, 'global-templates:default-structured:closing', 'global-templates:default-structured', 'item', 'Closing',
 '/content/default-content-library?methodology=structured&category=Closing', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 70, TRUE, NULL),
('a1860000-0000-4000-8000-000000000091'::uuid, 'global-templates:default-agile:backlog', 'global-templates:default-agile', 'item', 'Backlog',
 '/content/default-content-library?methodology=agile&category=Backlog', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-000000000092'::uuid, 'global-templates:default-agile:sprint-planning', 'global-templates:default-agile', 'item', 'Sprint Planning',
 '/content/default-content-library?methodology=agile&category=Sprint+Planning', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-000000000093'::uuid, 'global-templates:default-agile:sprint-execution', 'global-templates:default-agile', 'item', 'Sprint Execution',
 '/content/default-content-library?methodology=agile&category=Sprint+Execution', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-000000000094'::uuid, 'global-templates:default-agile:review-retro', 'global-templates:default-agile', 'item', 'Review & Retrospective',
 '/content/default-content-library?methodology=agile&category=Review+%26+Retrospective', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-000000000095'::uuid, 'global-templates:default-agile:release', 'global-templates:default-agile', 'item', 'Release',
 '/content/default-content-library?methodology=agile&category=Release', ARRAY['/content/default-content-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Process Docs · PMBOK / Structured / Agile
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1860000-0000-4000-8000-0000000000a0'::uuid, 'global-templates:process-pmbok', 'global-templates', 'group', 'Process Docs · PMBOK', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 110, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b0'::uuid, 'global-templates:process-structured', 'global-templates', 'group', 'Process Docs · Structured', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 120, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000c0'::uuid, 'global-templates:process-agile', 'global-templates', 'group', 'Process Docs · Agile', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 130, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1860000-0000-4000-8000-0000000000a1'::uuid, 'global-templates:process-pmbok:initiating', 'global-templates:process-pmbok', 'item', 'Initiating',
 '/content/global-template-library?domain=process_template&methodology=pmbok&category=Initiating', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000a2'::uuid, 'global-templates:process-pmbok:planning', 'global-templates:process-pmbok', 'item', 'Planning',
 '/content/global-template-library?domain=process_template&methodology=pmbok&category=Planning', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000a3'::uuid, 'global-templates:process-pmbok:executing', 'global-templates:process-pmbok', 'item', 'Executing',
 '/content/global-template-library?domain=process_template&methodology=pmbok&category=Executing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000a4'::uuid, 'global-templates:process-pmbok:monitoring', 'global-templates:process-pmbok', 'item', 'Monitoring & Controlling',
 '/content/global-template-library?domain=process_template&methodology=pmbok&category=Monitoring+%26+Controlling', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000a5'::uuid, 'global-templates:process-pmbok:closing', 'global-templates:process-pmbok', 'item', 'Closing',
 '/content/global-template-library?domain=process_template&methodology=pmbok&category=Closing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b1'::uuid, 'global-templates:process-structured:starting-up', 'global-templates:process-structured', 'item', 'Starting Up',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Starting+Up', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b2'::uuid, 'global-templates:process-structured:directing', 'global-templates:process-structured', 'item', 'Directing',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Directing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b3'::uuid, 'global-templates:process-structured:initiating', 'global-templates:process-structured', 'item', 'Initiating',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Initiating', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b4'::uuid, 'global-templates:process-structured:controlling', 'global-templates:process-structured', 'item', 'Controlling a Stage',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Controlling+a+Stage', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b5'::uuid, 'global-templates:process-structured:product-delivery', 'global-templates:process-structured', 'item', 'Managing Product Delivery',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Managing+Product+Delivery', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b6'::uuid, 'global-templates:process-structured:stage-boundary', 'global-templates:process-structured', 'item', 'Managing a Stage Boundary',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Managing+a+Stage+Boundary', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 60, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000b7'::uuid, 'global-templates:process-structured:closing', 'global-templates:process-structured', 'item', 'Closing',
 '/content/global-template-library?domain=process_template&methodology=structured&category=Closing', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 70, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000c1'::uuid, 'global-templates:process-agile:backlog', 'global-templates:process-agile', 'item', 'Backlog',
 '/content/global-template-library?domain=process_template&methodology=agile&category=Backlog', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 10, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000c2'::uuid, 'global-templates:process-agile:sprint-planning', 'global-templates:process-agile', 'item', 'Sprint Planning',
 '/content/global-template-library?domain=process_template&methodology=agile&category=Sprint+Planning', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000c3'::uuid, 'global-templates:process-agile:sprint-execution', 'global-templates:process-agile', 'item', 'Sprint Execution',
 '/content/global-template-library?domain=process_template&methodology=agile&category=Sprint+Execution', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 30, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000c4'::uuid, 'global-templates:process-agile:review-retro', 'global-templates:process-agile', 'item', 'Review & Retrospective',
 '/content/global-template-library?domain=process_template&methodology=agile&category=Review+%26+Retrospective', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 40, TRUE, NULL),
('a1860000-0000-4000-8000-0000000000c5'::uuid, 'global-templates:process-agile:release', 'global-templates:process-agile', 'item', 'Release',
 '/content/global-template-library?domain=process_template&methodology=agile&category=Release', ARRAY['/content/global-template-library']::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, label = EXCLUDED.label, path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths, sort_order = EXCLUDED.sort_order,
    is_active = TRUE, updated_at = NOW();

-- Ensure Library group stays first
UPDATE admin.nav_nodes
SET sort_order = 10, is_active = TRUE, updated_at = NOW()
WHERE node_key = 'global-templates:library';

DO $$
BEGIN
  RAISE NOTICE 'v186_global_templates_nav_level_first.sql applied';
END $$;
