-- ============================================================================
-- v51: DB-driven admin sidebar navigation
-- PostgreSQL 15+ / Supabase
-- Plan: extensible nav — sections, groups, items stored in admin.nav_nodes
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.nav_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_key TEXT NOT NULL UNIQUE,
    parent_key TEXT,
    node_type TEXT NOT NULL CHECK (node_type IN ('standalone', 'section', 'group', 'item')),
    label TEXT NOT NULL,
    path TEXT,
    active_paths TEXT[] NOT NULL DEFAULT '{}',
    roles TEXT[] NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    badge TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT nav_nodes_path_required CHECK (
        node_type NOT IN ('standalone', 'item') OR path IS NOT NULL
    ),
    CONSTRAINT nav_nodes_parent_required CHECK (
        node_type = 'section' OR parent_key IS NOT NULL OR node_type = 'standalone'
    )
);

CREATE INDEX IF NOT EXISTS idx_nav_nodes_parent_key ON admin.nav_nodes (parent_key);
CREATE INDEX IF NOT EXISTS idx_nav_nodes_node_type ON admin.nav_nodes (node_type);
CREATE INDEX IF NOT EXISTS idx_nav_nodes_sort_order ON admin.nav_nodes (sort_order);
CREATE INDEX IF NOT EXISTS idx_nav_nodes_is_active ON admin.nav_nodes (is_active) WHERE is_active = TRUE;

COMMENT ON TABLE admin.nav_nodes IS
    'Hierarchical admin sidebar navigation (standalone → section → group → item)';

ALTER TABLE admin.nav_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nav_nodes_select ON admin.nav_nodes;
CREATE POLICY nav_nodes_select ON admin.nav_nodes
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.nav_nodes TO authenticated;
GRANT ALL ON admin.nav_nodes TO service_role;

-- ---------------------------------------------------------------------------
-- admin.list_admin_nav_nodes — flat rows for frontend tree builder
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.list_admin_nav_nodes(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    node_key TEXT,
    parent_key TEXT,
    node_type TEXT,
    label TEXT,
    path TEXT,
    active_paths TEXT[],
    roles TEXT[],
    sort_order INTEGER,
    badge TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_role TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.is_active_admin() THEN
        RAISE EXCEPTION 'Permission denied: active admin required';
    END IF;

    SELECT au.role INTO v_role
    FROM admin.admin_users au
    WHERE au.id = v_admin_user_id
      AND au.activation_status = 'active';

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Admin user not found or inactive';
    END IF;

    RETURN QUERY
    SELECT
        n.node_key,
        n.parent_key,
        n.node_type,
        n.label,
        n.path,
        n.active_paths,
        n.roles,
        n.sort_order,
        n.badge
    FROM admin.nav_nodes n
    WHERE n.is_active = TRUE
      AND (n.roles = '{}'::text[] OR v_role = ANY(n.roles))
    ORDER BY n.sort_order, n.label;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.upsert_nav_node — add/update menu entries (super_admin)
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
    v_role TEXT;
    v_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    SELECT au.role INTO v_role
    FROM admin.admin_users au
    WHERE au.id = v_admin_user_id
      AND au.activation_status = 'active';

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Admin user not found or inactive';
    END IF;

    IF v_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Permission denied: super_admin required';
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

GRANT EXECUTE ON FUNCTION admin.list_admin_nav_nodes(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_nav_node(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT[], INTEGER, BOOLEAN, TEXT, UUID)
    TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v51: Admin navigation infrastructure applied.';
END $$;
