-- ============================================================================
-- v235: AI Centre — permissions and sidebar navigation (monorepo v1272, PRD D17)
-- Monorepo PRD: E:\project-nidus\projectprd\v1272_ai_agents_foundation_PRD.md
-- Admin module: modules/ai (port 5199).
--
--   Permissions
--     ai.view                  see AI Centre (usage, organisations, settings, catalogue — read only)
--     ai.settings.edit         kill switch, model routing and prices, retention defaults
--     ai.credits.edit          plan allowances, organisation overrides, top-ups, organisation enable/disable
--     ai.catalogue.edit        Ask Nidus data catalogue and AI languages
--     ai.embeddings.manage     meaning-search queue: retry and re-embed
--   Grants: super_admin all; system_admin all; support_admin ai.view.
--   Navigation: section "AI Centre" → group "AI" → Overview, Organisations, Plans & Credits,
--   Models & Routing, Data Catalogue, Meaning Search, Assessor Calibration, Settings.
-- Idempotent.
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
  ('ai.view',              'View AI Centre',             'ai', 'See AI usage, organisations, settings and the data catalogue'),
  ('ai.settings.edit',     'Edit AI Settings',           'ai', 'Kill switch, model routing and prices, retention defaults and limits'),
  ('ai.credits.edit',      'Manage AI Credits',          'ai', 'Plan allowances, organisation overrides, top-ups and organisation AI enable/disable'),
  ('ai.catalogue.edit',    'Edit Ask Nidus Catalogue',   'ai', 'Which registers and fields Ask Nidus may query, and the AI languages'),
  ('ai.embeddings.manage', 'Manage Meaning Search',      'ai', 'Retry failed embeddings and re-embed an organisation')
ON CONFLICT (permission_key) DO UPDATE SET
  permission_name = EXCLUDED.permission_name, category = EXCLUDED.category, description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT r, p FROM unnest(ARRAY['super_admin', 'system_admin']) r
CROSS JOIN unnest(ARRAY['ai.view', 'ai.settings.edit', 'ai.credits.edit', 'ai.catalogue.edit', 'ai.embeddings.manage']) p
UNION ALL SELECT 'support_admin', 'ai.view'
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.nav_nodes (id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge)
VALUES
  ('7a1c2e00-1272-4a10-9a00-000000000001'::uuid, 'ai-centre', NULL, 'section', 'AI Centre', NULL,
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin', 'support_admin']::text[], 69, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000002'::uuid, 'ai-centre:ai', 'ai-centre', 'group', 'AI', NULL,
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin', 'support_admin']::text[], 70, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000003'::uuid, 'ai-centre:ai:overview', 'ai-centre:ai', 'item', 'Overview', '/ai/overview',
   ARRAY['/ai/runs']::text[], ARRAY['super_admin', 'system_admin', 'support_admin']::text[], 71, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000004'::uuid, 'ai-centre:ai:organisations', 'ai-centre:ai', 'item', 'Organisations', '/ai/organisations',
   ARRAY['/ai/organisation']::text[], ARRAY['super_admin', 'system_admin', 'support_admin']::text[], 72, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000005'::uuid, 'ai-centre:ai:plans', 'ai-centre:ai', 'item', 'Plans & Credits', '/ai/plans',
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin']::text[], 73, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000006'::uuid, 'ai-centre:ai:models', 'ai-centre:ai', 'item', 'Models & Routing', '/ai/models',
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin']::text[], 74, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000007'::uuid, 'ai-centre:ai:catalogue', 'ai-centre:ai', 'item', 'Data Catalogue', '/ai/catalogue',
   ARRAY['/ai/catalogue-entity']::text[], ARRAY['super_admin', 'system_admin']::text[], 75, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000008'::uuid, 'ai-centre:ai:meaning-search', 'ai-centre:ai', 'item', 'Meaning Search', '/ai/meaning-search',
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin']::text[], 76, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000009'::uuid, 'ai-centre:ai:assessor', 'ai-centre:ai', 'item', 'Assessor Calibration', '/ai/assessor',
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin']::text[], 77, TRUE, NULL),
  ('7a1c2e00-1272-4a10-9a00-000000000010'::uuid, 'ai-centre:ai:settings', 'ai-centre:ai', 'item', 'Settings', '/ai/settings',
   ARRAY[]::text[], ARRAY['super_admin', 'system_admin']::text[], 78, TRUE, NULL)
ON CONFLICT (node_key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key, node_type = EXCLUDED.node_type, label = EXCLUDED.label, path = EXCLUDED.path,
  active_paths = EXCLUDED.active_paths, roles = EXCLUDED.roles, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';

SELECT 'v235 applied' AS status,
       (SELECT COUNT(*) FROM admin.admin_permissions WHERE category = 'ai') AS ai_permissions_of_5,
       (SELECT COUNT(*) FROM admin.nav_nodes WHERE node_key LIKE 'ai-centre%') AS nav_nodes_of_10;
