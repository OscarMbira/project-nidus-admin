-- ============================================================================
-- v34: Content section seed data (Documentation CMS, Help, PWA, Role Menu)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735 admin schema, platform v58 (help), v100 (documentation_guides)
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin permission helpers for content console reads
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.can_view_content_docs()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(admin.current_admin_user_id(), 'content.docs.view');
$$;

CREATE OR REPLACE FUNCTION admin.can_view_content_help()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(admin.current_admin_user_id(), 'content.help.view');
$$;

CREATE OR REPLACE FUNCTION admin.can_view_content_pwa()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(admin.current_admin_user_id(), 'content.pwa.view');
$$;

CREATE OR REPLACE FUNCTION admin.can_view_content_menus()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT admin.current_admin_user_id() IS NOT NULL
       AND admin.check_admin_permission(admin.current_admin_user_id(), 'content.menus.view');
$$;

GRANT EXECUTE ON FUNCTION admin.can_view_content_docs() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.can_view_content_help() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.can_view_content_pwa() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.can_view_content_menus() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin.pwa_settings — PWA manifest configuration per target system
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.pwa_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_system TEXT NOT NULL CHECK (target_system IN ('platform', 'simulator')),
    app_name TEXT NOT NULL,
    app_short_name VARCHAR(12) NOT NULL,
    theme_color VARCHAR(7) NOT NULL DEFAULT '#1e293b',
    background_color VARCHAR(7) NOT NULL DEFAULT '#0f172a',
    display_mode TEXT NOT NULL DEFAULT 'standalone'
        CHECK (display_mode IN ('standalone', 'fullscreen', 'minimal-ui', 'browser')),
    install_prompt_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    offline_cache_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (target_system)
);

COMMENT ON TABLE admin.pwa_settings IS
    'Progressive Web App manifest settings for Platform and Simulator';

ALTER TABLE admin.pwa_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pwa_settings_select ON admin.pwa_settings;
CREATE POLICY pwa_settings_select ON admin.pwa_settings
    FOR SELECT TO authenticated
    USING (admin.can_view_content_pwa());

GRANT SELECT ON admin.pwa_settings TO authenticated;
GRANT ALL ON admin.pwa_settings TO service_role;

-- ---------------------------------------------------------------------------
-- RLS — admin console read access to platform content tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS documentation_guides_admin_console_select ON public.documentation_guides;
CREATE POLICY documentation_guides_admin_console_select
    ON public.documentation_guides
    FOR SELECT TO authenticated
    USING (admin.can_view_content_docs());

DROP POLICY IF EXISTS help_articles_admin_console_select ON public.help_articles;
CREATE POLICY help_articles_admin_console_select
    ON public.help_articles
    FOR SELECT TO authenticated
    USING (admin.can_view_content_help() AND COALESCE(is_deleted, FALSE) = FALSE);

DROP POLICY IF EXISTS help_categories_admin_console_select ON public.help_categories;
CREATE POLICY help_categories_admin_console_select
    ON public.help_categories
    FOR SELECT TO authenticated
    USING (admin.can_view_content_help() AND COALESCE(is_deleted, FALSE) = FALSE);

DROP POLICY IF EXISTS guided_tours_admin_console_select ON public.guided_tours;
CREATE POLICY guided_tours_admin_console_select
    ON public.guided_tours
    FOR SELECT TO authenticated
    USING (admin.can_view_content_help() AND COALESCE(is_deleted, FALSE) = FALSE);

DROP POLICY IF EXISTS menu_items_admin_console_select ON public.menu_items;
CREATE POLICY menu_items_admin_console_select
    ON public.menu_items
    FOR SELECT TO authenticated
    USING (admin.can_view_content_menus() AND COALESCE(is_deleted, FALSE) = FALSE);

DROP POLICY IF EXISTS role_menu_items_admin_console_select ON public.role_menu_items;
CREATE POLICY role_menu_items_admin_console_select
    ON public.role_menu_items
    FOR SELECT TO authenticated
    USING (admin.can_view_content_menus() AND COALESCE(is_deleted, FALSE) = FALSE);

DROP POLICY IF EXISTS roles_admin_console_select ON public.roles;
CREATE POLICY roles_admin_console_select
    ON public.roles
    FOR SELECT TO authenticated
    USING (admin.can_view_content_menus());

GRANT SELECT ON public.documentation_guides TO authenticated;
GRANT SELECT ON public.help_articles TO authenticated;
GRANT SELECT ON public.help_categories TO authenticated;
GRANT SELECT ON public.guided_tours TO authenticated;
GRANT SELECT ON public.menu_items TO authenticated;
GRANT SELECT ON public.role_menu_items TO authenticated;
GRANT SELECT ON public.roles TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: PWA settings (Platform + Simulator)
-- ---------------------------------------------------------------------------
INSERT INTO admin.pwa_settings (
    id, target_system, app_name, app_short_name, theme_color, background_color,
    display_mode, install_prompt_enabled, offline_cache_enabled
) VALUES
    (
        'c3400001-0001-4001-8001-000000000001'::uuid,
        'platform',
        'Project Nidus',
        'Nidus',
        '#1e293b',
        '#0f172a',
        'standalone',
        TRUE,
        TRUE
    ),
    (
        'c3400001-0001-4001-8001-000000000002'::uuid,
        'simulator',
        'Nidus Simulator',
        'SimNidus',
        '#312e81',
        '#0f172a',
        'standalone',
        TRUE,
        TRUE
    )
ON CONFLICT (target_system) DO UPDATE SET
    app_name = EXCLUDED.app_name,
    app_short_name = EXCLUDED.app_short_name,
    theme_color = EXCLUDED.theme_color,
    background_color = EXCLUDED.background_color,
    display_mode = EXCLUDED.display_mode,
    install_prompt_enabled = EXCLUDED.install_prompt_enabled,
    offline_cache_enabled = EXCLUDED.offline_cache_enabled,
    is_active = TRUE,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Seed: Help articles (categories from v58)
-- ---------------------------------------------------------------------------
INSERT INTO public.help_articles (
    id, title, content, excerpt, slug, category_id, tags, role, methodology,
    featured, is_published, is_active, sort_order
)
SELECT
    seed.id,
    seed.title,
    seed.content,
    seed.excerpt,
    seed.slug,
    hc.id,
    seed.tags,
    seed.role,
    seed.methodology,
    seed.featured,
    seed.is_published,
    TRUE,
    seed.sort_order
FROM (
    VALUES
        (
            'c3400002-0002-4002-8002-000000000001'::uuid,
            'Welcome to Project Nidus',
            'Project Nidus helps teams plan, deliver, and govern projects using Structured PM, Scrum, or Kanban. Start by creating a project, inviting your team, and choosing a methodology that fits your delivery style.',
            'Quick orientation for new Platform users.',
            'welcome-to-project-nidus',
            'getting-started',
            ARRAY['onboarding', 'basics']::text[],
            'all',
            'all',
            TRUE,
            TRUE,
            10
        ),
        (
            'c3400002-0002-4002-8002-000000000002'::uuid,
            'Creating your first project',
            'Navigate to Projects and click **New Project**. Enter a name, select a methodology, and assign a project manager. You can add work packages, tasks, and team members once the project shell is created.',
            'Step-by-step guide to creating a project.',
            'creating-your-first-project',
            'projects',
            ARRAY['projects', 'setup']::text[],
            'project_manager',
            'all',
            TRUE,
            TRUE,
            20
        ),
        (
            'c3400002-0002-4002-8002-000000000003'::uuid,
            'Managing tasks on the Kanban board',
            'Open Planning Hub → Kanban to view columns by status. Drag cards to update progress, assign owners, and set due dates. WIP limits can be configured per column in project settings.',
            'How to use the Kanban board effectively.',
            'managing-tasks-kanban-board',
            'tasks',
            ARRAY['kanban', 'tasks']::text[],
            'team_member',
            'kanban',
            FALSE,
            TRUE,
            30
        ),
        (
            'c3400002-0002-4002-8002-000000000004'::uuid,
            'Running Structured PM stage reviews',
            'Structured PM projects progress through stages with gate reviews. Use Stage Gates to submit evidence, capture decisions, and advance to the next management stage when approvers sign off.',
            'Stage gate workflow for Structured PM teams.',
            'structured-pm-stage-reviews',
            'methodologies',
            ARRAY['structured-pm', 'stage-gates']::text[],
            'project_manager',
            'structured_pm',
            FALSE,
            TRUE,
            40
        ),
        (
            'c3400002-0002-4002-8002-000000000005'::uuid,
            'Exporting reports to PDF',
            'Reports can be exported from the Reports module. Choose a template, set the date range, and click Export. PDF exports include your organisation branding when configured in Admin settings.',
            'Export dashboards and reports as PDF.',
            'exporting-reports-to-pdf',
            'reporting',
            ARRAY['reports', 'export']::text[],
            'all',
            'all',
            FALSE,
            TRUE,
            50
        ),
        (
            'c3400002-0002-4002-8002-000000000006'::uuid,
            'Connecting webhooks',
            'Webhooks notify external systems when events occur in Nidus. Generate an API key with webhook permissions, register your endpoint URL, and subscribe to event types from the Integrations area.',
            'Set up outbound webhooks for integrations.',
            'connecting-webhooks',
            'integrations',
            ARRAY['webhooks', 'api']::text[],
            'admin',
            'all',
            FALSE,
            TRUE,
            60
        ),
        (
            'c3400002-0002-4002-8002-000000000007'::uuid,
            'Troubleshooting login issues',
            'If you cannot sign in, verify your email address, reset your password, and ensure your organisation account is active. Contact your administrator if SSO is enabled and your IdP group membership changed.',
            'Common login problems and fixes.',
            'troubleshooting-login-issues',
            'troubleshooting',
            ARRAY['login', 'support']::text[],
            'all',
            'all',
            FALSE,
            TRUE,
            70
        )
) AS seed(id, title, content, excerpt, slug, category_slug, tags, role, methodology, featured, is_published, sort_order)
INNER JOIN public.help_categories hc
    ON hc.slug = seed.category_slug
   AND COALESCE(hc.is_deleted, FALSE) = FALSE
ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    excerpt = EXCLUDED.excerpt,
    category_id = EXCLUDED.category_id,
    tags = EXCLUDED.tags,
    role = EXCLUDED.role,
    methodology = EXCLUDED.methodology,
    featured = EXCLUDED.featured,
    is_published = EXCLUDED.is_published,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    is_deleted = FALSE,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Seed: Guided tours
-- ---------------------------------------------------------------------------
INSERT INTO public.guided_tours (
    id, tour_name, tour_key, description, steps, target_role, target_page, trigger_type, is_active
) VALUES
    (
        'c3400003-0003-4003-8003-000000000001'::uuid,
        'Platform dashboard tour',
        'platform_dashboard_intro',
        'Introduces the main dashboard widgets and navigation.',
        '[
            {"selector": "[data-tour=dashboard-kpis]", "title": "Key metrics", "content": "Track active projects, overdue tasks, and team workload at a glance.", "position": "bottom"},
            {"selector": "[data-tour=sidebar-nav]", "title": "Navigation", "content": "Use the sidebar to jump between modules. Your visible menus depend on your role.", "position": "right"},
            {"selector": "[data-tour=quick-actions]", "title": "Quick actions", "content": "Create tasks, log issues, or open recent projects from here.", "position": "left"}
        ]'::jsonb,
        'all',
        '/platform/dashboard',
        'on_first_visit',
        TRUE
    ),
    (
        'c3400003-0003-4003-8003-000000000002'::uuid,
        'Planning Hub — Gantt overview',
        'planning_hub_gantt',
        'Walkthrough of the Gantt chart toolbar and timeline controls.',
        '[
            {"selector": "[data-tour=gantt-toolbar]", "title": "Toolbar", "content": "Zoom, filter, and export the timeline from the toolbar.", "position": "bottom"},
            {"selector": "[data-tour=gantt-timeline]", "title": "Timeline", "content": "Drag bars to reschedule work. Dependencies show linked tasks.", "position": "top"}
        ]'::jsonb,
        'project_manager',
        '/platform/planning-hub/gantt',
        'manual',
        TRUE
    ),
    (
        'c3400003-0003-4003-8003-000000000003'::uuid,
        'Simulator scenario picker',
        'simulator_scenario_picker',
        'Helps learners choose and launch their first training scenario.',
        '[
            {"selector": "[data-tour=scenario-filters]", "title": "Filters", "content": "Filter scenarios by difficulty, competency, or learning path.", "position": "bottom"},
            {"selector": "[data-tour=scenario-launch]", "title": "Launch", "content": "Click Launch to start the scenario. Your progress is saved automatically.", "position": "left"}
        ]'::jsonb,
        'simulator_user',
        '/simulator/scenarios',
        'automatic',
        TRUE
    )
ON CONFLICT (tour_key) DO UPDATE SET
    tour_name = EXCLUDED.tour_name,
    description = EXCLUDED.description,
    steps = EXCLUDED.steps,
    target_role = EXCLUDED.target_role,
    target_page = EXCLUDED.target_page,
    trigger_type = EXCLUDED.trigger_type,
    is_active = EXCLUDED.is_active,
    is_deleted = FALSE,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Seed: Extra documentation guides (admin module)
-- ---------------------------------------------------------------------------
INSERT INTO public.documentation_guides (guide_id, title, file_name, category, module, system, sort_order)
VALUES
    (
        'admin-console-overview',
        'Admin Console Overview',
        'Admin_Console_Overview.md',
        'Administration',
        'admin-module',
        'platform',
        10
    ),
    (
        'content-management-guide',
        'Content Management Guide',
        'Content_Management_Guide.md',
        'Administration',
        'admin-module',
        'platform',
        20
    ),
    (
        'simulator-admin-guide',
        'Simulator Admin Guide',
        'Simulator_Admin_Guide.md',
        'Administration',
        'sim-admin-module',
        'simulator',
        10
    )
ON CONFLICT (guide_id, system) DO UPDATE SET
    title = EXCLUDED.title,
    file_name = EXCLUDED.file_name,
    category = EXCLUDED.category,
    module = EXCLUDED.module,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Seed: Demo menu + role assignments (only when no active menus exist)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_menu_count INTEGER;
    v_dash_id UUID := 'c3400004-0004-4004-8004-000000000001'::uuid;
    v_proj_id UUID := 'c3400004-0004-4004-8004-000000000002'::uuid;
    v_plan_id UUID := 'c3400004-0004-4004-8004-000000000003'::uuid;
    v_pm_role UUID;
    v_tm_role UUID;
BEGIN
    SELECT COUNT(*) INTO v_menu_count
    FROM public.menu_items
    WHERE COALESCE(is_deleted, FALSE) = FALSE;

    IF v_menu_count > 0 THEN
        RAISE NOTICE 'v34: menu_items already populated (% rows) — skipping demo menu seed.', v_menu_count;
        RETURN;
    END IF;

    SELECT id INTO v_pm_role FROM public.roles WHERE role_name = 'project_manager' LIMIT 1;
    SELECT id INTO v_tm_role FROM public.roles WHERE role_name = 'team_member' LIMIT 1;

    INSERT INTO public.menu_items (
        id, menu_code, menu_label, menu_description, menu_level, sort_order,
        route_path, menu_icon, is_visible, is_active
    ) VALUES
        (v_dash_id, 'demo_dashboard', 'Dashboard', 'Demo dashboard entry', 1, 1, '/platform/dashboard', 'layout-dashboard', TRUE, TRUE),
        (v_proj_id, 'demo_projects', 'Projects', 'Demo projects list', 1, 2, '/platform/projects', 'folder', TRUE, TRUE),
        (v_plan_id, 'demo_planning', 'Planning Hub', 'Demo planning hub', 1, 3, '/platform/planning-hub', 'calendar', TRUE, TRUE)
    ON CONFLICT (menu_code) DO UPDATE SET
        menu_label = EXCLUDED.menu_label,
        is_deleted = FALSE,
        is_active = TRUE,
        updated_at = NOW();

    IF v_pm_role IS NOT NULL THEN
        INSERT INTO public.role_menu_items (id, role_id, menu_item_id, can_view, can_use, is_active)
        VALUES
            ('c3400005-0005-4005-8005-000000000001'::uuid, v_pm_role, v_dash_id, TRUE, TRUE, TRUE),
            ('c3400005-0005-4005-8005-000000000002'::uuid, v_pm_role, v_proj_id, TRUE, TRUE, TRUE),
            ('c3400005-0005-4005-8005-000000000003'::uuid, v_pm_role, v_plan_id, TRUE, TRUE, TRUE)
        ON CONFLICT (role_id, menu_item_id) DO UPDATE SET
            can_view = TRUE,
            can_use = TRUE,
            is_active = TRUE,
            is_deleted = FALSE,
            updated_at = NOW();
    END IF;

    IF v_tm_role IS NOT NULL THEN
        INSERT INTO public.role_menu_items (id, role_id, menu_item_id, can_view, can_use, is_active)
        VALUES
            ('c3400005-0005-4005-8005-000000000011'::uuid, v_tm_role, v_dash_id, TRUE, TRUE, TRUE),
            ('c3400005-0005-4005-8005-000000000012'::uuid, v_tm_role, v_proj_id, TRUE, FALSE, TRUE)
        ON CONFLICT (role_id, menu_item_id) DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_use = EXCLUDED.can_use,
            is_active = TRUE,
            is_deleted = FALSE,
            updated_at = NOW();
    END IF;

    RAISE NOTICE 'v34: Demo menu items and role assignments seeded.';
END $$;
