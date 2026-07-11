-- ============================================================================
-- v121: Admin nav node management (rename, role visibility, active toggle)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51_admin_navigation.sql, admin.check_admin_permission
-- Plan: projectplans/v16.0_sidebar_navigation_management_plan.md
-- ============================================================================

INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('nav.configure', 'Configure Sidebar Navigation', 'navigation', 'Rename nav labels and manage role visibility for admin sidebar nodes')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES ('super_admin', 'nav.configure')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- admin.upsert_nav_node — permission-key gated (was hardcoded super_admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.upsert_nav_node(
    p_node_key TEXT,
    p_node_type TEXT,
    p_label TEXT,
    p_parent_key TEXT DEFAULT NULL,
    p_path TEXT DEFAULT NULL,
    p_active_paths TEXT[] DEFAULT '{}',
    p_roles TEXT[] DEFAULT '{}',
    p_sort_order INTEGER DEFAULT 0,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_badge TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'nav.configure') THEN
        RAISE EXCEPTION 'Permission denied: nav.configure required';
    END IF;

    INSERT INTO admin.nav_nodes (
        node_key, parent_key, node_type, label, path,
        active_paths, roles, sort_order, is_active, badge, updated_at
    ) VALUES (
        p_node_key, p_parent_key, p_node_type, p_label, p_path,
        COALESCE(p_active_paths, '{}'), COALESCE(p_roles, '{}'),
        COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE), p_badge, NOW()
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
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.list_all_nav_nodes_for_management
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_all_nav_nodes_for_management(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    node_key TEXT,
    parent_key TEXT,
    node_type TEXT,
    label TEXT,
    path TEXT,
    active_paths TEXT[],
    roles TEXT[],
    sort_order INTEGER,
    is_active BOOLEAN,
    badge TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'nav.configure') THEN
        RAISE EXCEPTION 'Permission denied: nav.configure required';
    END IF;

    RETURN QUERY
    SELECT
        n.id,
        n.node_key,
        n.parent_key,
        n.node_type,
        n.label,
        n.path,
        n.active_paths,
        n.roles,
        n.sort_order,
        n.is_active,
        n.badge
    FROM admin.nav_nodes n
    ORDER BY n.sort_order, n.label;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.rename_nav_node
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.rename_nav_node(
    p_node_key TEXT,
    p_label TEXT,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
    v_next JSONB;
    v_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'nav.configure') THEN
        RAISE EXCEPTION 'Permission denied: nav.configure required';
    END IF;

    IF p_label IS NULL OR trim(p_label) = '' THEN
        RAISE EXCEPTION 'Label is required';
    END IF;

    SELECT to_jsonb(n.*) INTO v_prev
    FROM admin.nav_nodes n
    WHERE n.node_key = p_node_key;

    IF v_prev IS NULL THEN
        RAISE EXCEPTION 'Nav node not found: %', p_node_key;
    END IF;

    UPDATE admin.nav_nodes
    SET label = trim(p_label),
        updated_at = NOW()
    WHERE node_key = p_node_key
    RETURNING id INTO v_id;

    SELECT to_jsonb(n.*) INTO v_next
    FROM admin.nav_nodes n
    WHERE n.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'nav_node.rename',
        'nav_node',
        v_id,
        jsonb_build_object('node_key', p_node_key, 'reason', p_reason),
        v_prev,
        v_next
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.set_nav_node_roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.set_nav_node_roles(
    p_node_key TEXT,
    p_roles TEXT[],
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
    v_next JSONB;
    v_id UUID;
    v_roles TEXT[];
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'nav.configure') THEN
        RAISE EXCEPTION 'Permission denied: nav.configure required';
    END IF;

    v_roles := COALESCE(p_roles, '{}');

    SELECT to_jsonb(n.*) INTO v_prev
    FROM admin.nav_nodes n
    WHERE n.node_key = p_node_key;

    IF v_prev IS NULL THEN
        RAISE EXCEPTION 'Nav node not found: %', p_node_key;
    END IF;

    UPDATE admin.nav_nodes
    SET roles = v_roles,
        updated_at = NOW()
    WHERE node_key = p_node_key
    RETURNING id INTO v_id;

    SELECT to_jsonb(n.*) INTO v_next
    FROM admin.nav_nodes n
    WHERE n.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'nav_node.set_roles',
        'nav_node',
        v_id,
        jsonb_build_object('node_key', p_node_key, 'reason', p_reason),
        v_prev,
        v_next
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.set_nav_node_active
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.set_nav_node_active(
    p_node_key TEXT,
    p_is_active BOOLEAN,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
    v_next JSONB;
    v_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'nav.configure') THEN
        RAISE EXCEPTION 'Permission denied: nav.configure required';
    END IF;

    SELECT to_jsonb(n.*) INTO v_prev
    FROM admin.nav_nodes n
    WHERE n.node_key = p_node_key;

    IF v_prev IS NULL THEN
        RAISE EXCEPTION 'Nav node not found: %', p_node_key;
    END IF;

    UPDATE admin.nav_nodes
    SET is_active = COALESCE(p_is_active, TRUE),
        updated_at = NOW()
    WHERE node_key = p_node_key
    RETURNING id INTO v_id;

    SELECT to_jsonb(n.*) INTO v_next
    FROM admin.nav_nodes n
    WHERE n.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'nav_node.set_active',
        'nav_node',
        v_id,
        jsonb_build_object('node_key', p_node_key, 'reason', p_reason),
        v_prev,
        v_next
    );

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.list_all_nav_nodes_for_management(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.rename_nav_node(TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_nav_node_roles(TEXT, TEXT[], UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.set_nav_node_active(TEXT, BOOLEAN, UUID, TEXT) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v121: Admin nav node management RPCs applied.';
END $$;
