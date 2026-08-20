-- =============================================================================
-- v187: Global Templates — cluster groups under collapsible subsections
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md (addendum)
-- Mirror: packages/shared/src/defaultAdminNav.js (subsections field)
-- Adds a generic 'subsection' node_type (section -> subsection -> group -> item),
-- reusable by any future section, not just Global Templates.
-- Prerequisites: v186 (flat methodology groups)
-- =============================================================================

-- Widen node_type CHECK to add 'subsection' (find the auto-named constraint dynamically)
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'admin'
    AND rel.relname = 'nav_nodes'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%node_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin.nav_nodes DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE admin.nav_nodes
    ADD CONSTRAINT nav_nodes_node_type_check
    CHECK (node_type IN ('standalone', 'section', 'subsection', 'group', 'item'));
END $$;

-- ---------------------------------------------------------------------------
-- New subsection nodes under the Global Templates section
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
) VALUES
('a1870000-0000-4000-8000-000000000001'::uuid, 'global-templates:templates-section', 'global-templates', 'subsection', 'Templates', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 20, TRUE, NULL),
('a1870000-0000-4000-8000-000000000002'::uuid, 'global-templates:forms-section', 'global-templates', 'subsection', 'Forms', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 50, TRUE, NULL),
('a1870000-0000-4000-8000-000000000003'::uuid, 'global-templates:default-content-section', 'global-templates', 'subsection', 'Default Content', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 80, TRUE, NULL),
('a1870000-0000-4000-8000-000000000004'::uuid, 'global-templates:process-docs-section', 'global-templates', 'subsection', 'Process Docs', NULL, ARRAY[]::text[], ARRAY['super_admin','system_admin','content_admin']::text[], 110, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key, node_type = EXCLUDED.node_type, label = EXCLUDED.label,
    sort_order = EXCLUDED.sort_order, is_active = TRUE, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Reparent existing groups under their new subsection + relabel (drop the
-- now-redundant "Forms · " / "Templates" prefixes since the subsection header
-- already supplies that context)
-- ---------------------------------------------------------------------------
UPDATE admin.nav_nodes SET parent_key = 'global-templates:templates-section', label = 'Portfolio', updated_at = NOW() WHERE node_key = 'global-templates:portfolio';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:templates-section', label = 'Programme', updated_at = NOW() WHERE node_key = 'global-templates:programme';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:templates-section', label = 'Project', updated_at = NOW() WHERE node_key = 'global-templates:project';

UPDATE admin.nav_nodes SET parent_key = 'global-templates:forms-section', label = 'PMBOK', updated_at = NOW() WHERE node_key = 'global-templates:forms-pmbok';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:forms-section', label = 'Structured', updated_at = NOW() WHERE node_key = 'global-templates:forms-structured';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:forms-section', label = 'Agile', updated_at = NOW() WHERE node_key = 'global-templates:forms-agile';

UPDATE admin.nav_nodes SET parent_key = 'global-templates:default-content-section', label = 'PMBOK', updated_at = NOW() WHERE node_key = 'global-templates:default-pmbok';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:default-content-section', label = 'Structured', updated_at = NOW() WHERE node_key = 'global-templates:default-structured';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:default-content-section', label = 'Agile', updated_at = NOW() WHERE node_key = 'global-templates:default-agile';

UPDATE admin.nav_nodes SET parent_key = 'global-templates:process-docs-section', label = 'PMBOK', updated_at = NOW() WHERE node_key = 'global-templates:process-pmbok';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:process-docs-section', label = 'Structured', updated_at = NOW() WHERE node_key = 'global-templates:process-structured';
UPDATE admin.nav_nodes SET parent_key = 'global-templates:process-docs-section', label = 'Agile', updated_at = NOW() WHERE node_key = 'global-templates:process-agile';

DO $$
BEGIN
  RAISE NOTICE 'v187_global_templates_subsections_nav.sql applied';
END $$;
