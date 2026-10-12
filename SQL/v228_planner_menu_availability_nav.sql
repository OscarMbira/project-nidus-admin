-- ============================================================================
-- v228: Admin sidebar — "Planner Menu Availability" (monorepo plan v1239 Slice 8.4)
-- Admin plan: projectplans/v211_planner_edition_admin_plan.md
-- Page: modules/system → /system/planner-menu (PlannerMenuAvailabilityPage).
-- Edition badge/filter and "Change edition" live on the existing Organisations list (no new node).
-- Planner plan prices are edited in the existing Plan Catalog (plan type "planner"). Idempotent.
-- ============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path, active_paths, roles, sort_order, is_active, badge
)
VALUES (
    'a1b2c3d4-2281-4a1a-9c2a-1d7e5b922801'::uuid,
    'system-security:system:system:planner-menu',
    'system-security:system',
    'item',
    'Planner Menu Availability',
    '/system/planner-menu',
    ARRAY[]::text[],
    ARRAY['super_admin', 'system_admin']::text[],
    190,
    TRUE,
    NULL
)
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload schema';
DO $$ BEGIN RAISE NOTICE 'v228: Planner Menu Availability nav node added'; END $$;
