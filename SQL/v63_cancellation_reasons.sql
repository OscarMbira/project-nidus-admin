-- ============================================================================
-- v63: Customer cancellation reason capture — categories, requests, RPCs, nav
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v9.1_cancellation_reasons_plan.md (Phase 1)
-- Prerequisites: v735 admin schema, v51 nav_nodes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 — admin.cancellation_reason_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.cancellation_reason_categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          TEXT NOT NULL UNIQUE,
    label         TEXT NOT NULL,
    description   TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_reason_categories_active
    ON admin.cancellation_reason_categories (is_active, sort_order);

COMMENT ON TABLE admin.cancellation_reason_categories IS
    'Structured cancellation reason options shown to customers on cancel';

DROP TRIGGER IF EXISTS trg_cancellation_reason_categories_updated_at
    ON admin.cancellation_reason_categories;
CREATE TRIGGER trg_cancellation_reason_categories_updated_at
    BEFORE UPDATE ON admin.cancellation_reason_categories
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

ALTER TABLE admin.cancellation_reason_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cancellation_reason_categories_admin_select
    ON admin.cancellation_reason_categories;
CREATE POLICY cancellation_reason_categories_admin_select
    ON admin.cancellation_reason_categories
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.cancellation_reason_categories TO authenticated, service_role;
GRANT ALL ON admin.cancellation_reason_categories TO service_role;

-- ---------------------------------------------------------------------------
-- 1.2 — public.cancellation_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cancellation_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id    UUID,
    reason_category_id UUID NOT NULL REFERENCES admin.cancellation_reason_categories(id),
    notes              TEXT,
    target_system      TEXT NOT NULL CHECK (target_system IN ('platform', 'simulator')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cancellation_requests_notes_len CHECK (
        notes IS NULL OR char_length(notes) <= 1000
    )
);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_created_at
    ON public.cancellation_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_category
    ON public.cancellation_requests (reason_category_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_target_system
    ON public.cancellation_requests (target_system);

COMMENT ON TABLE public.cancellation_requests IS
    'Immutable customer cancellation reason submissions';

ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cancellation_requests_insert_own
    ON public.cancellation_requests;
CREATE POLICY cancellation_requests_insert_own
    ON public.cancellation_requests
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cancellation_requests_admin_select
    ON public.cancellation_requests;
CREATE POLICY cancellation_requests_admin_select
    ON public.cancellation_requests
    FOR SELECT TO authenticated
    USING (
        admin.is_active_admin()
        AND admin.check_admin_permission(
            admin.current_admin_user_id(),
            'cancellation:view'
        )
    );

GRANT SELECT, INSERT ON public.cancellation_requests TO authenticated, service_role;
GRANT ALL ON public.cancellation_requests TO service_role;

-- ---------------------------------------------------------------------------
-- 1.3 — Public RPCs (customer-facing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fetch_active_cancellation_categories()
RETURNS TABLE (
    id         UUID,
    code       TEXT,
    label      TEXT,
    sort_order INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
    SELECT c.id, c.code, c.label, c.sort_order
    FROM admin.cancellation_reason_categories c
    WHERE c.is_active = TRUE
    ORDER BY c.sort_order, c.label;
$$;

COMMENT ON FUNCTION public.fetch_active_cancellation_categories() IS
    'Active cancellation reason options for customer cancel modal';

CREATE OR REPLACE FUNCTION public.record_cancellation_request(
    p_reason_category_id UUID,
    p_notes              TEXT DEFAULT NULL,
    p_subscription_id    UUID DEFAULT NULL,
    p_target_system      TEXT DEFAULT 'platform'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
    v_user_id UUID;
    v_id      UUID;
    v_notes   TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_target_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM admin.cancellation_reason_categories
        WHERE id = p_reason_category_id AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Invalid or inactive cancellation reason category';
    END IF;

    v_notes := NULLIF(trim(COALESCE(p_notes, '')), '');
    IF v_notes IS NOT NULL AND char_length(v_notes) > 1000 THEN
        RAISE EXCEPTION 'Notes must be 1000 characters or fewer';
    END IF;

    INSERT INTO public.cancellation_requests (
        user_id, subscription_id, reason_category_id, notes, target_system
    )
    VALUES (
        v_user_id, p_subscription_id, p_reason_category_id, v_notes, p_target_system
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1.4 — Admin RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_fetch_cancellation_requests(
    p_limit              INT DEFAULT 50,
    p_offset             INT DEFAULT 0,
    p_reason_category_id UUID DEFAULT NULL,
    p_target_system      TEXT DEFAULT NULL,
    p_from_date          DATE DEFAULT NULL,
    p_to_date            DATE DEFAULT NULL
)
RETURNS TABLE (
    id              UUID,
    user_id         UUID,
    user_email      TEXT,
    subscription_id UUID,
    reason_code     TEXT,
    reason_label    TEXT,
    notes           TEXT,
    target_system   TEXT,
    created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
BEGIN
    v_admin := admin.current_admin_user_id();
    IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'cancellation:view') THEN
        RAISE EXCEPTION 'Permission denied: cancellation:view required';
    END IF;

    RETURN QUERY
    SELECT
        cr.id,
        cr.user_id,
        u.email::TEXT AS user_email,
        cr.subscription_id,
        c.code AS reason_code,
        c.label AS reason_label,
        cr.notes,
        cr.target_system,
        cr.created_at
    FROM public.cancellation_requests cr
    JOIN admin.cancellation_reason_categories c ON c.id = cr.reason_category_id
    LEFT JOIN public.users u ON u.auth_user_id = cr.user_id
    WHERE (p_reason_category_id IS NULL OR cr.reason_category_id = p_reason_category_id)
      AND (p_target_system IS NULL OR cr.target_system = p_target_system)
      AND (p_from_date IS NULL OR cr.created_at::DATE >= p_from_date)
      AND (p_to_date IS NULL OR cr.created_at::DATE <= p_to_date)
    ORDER BY cr.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION admin.admin_get_cancellation_trends(p_days INT DEFAULT 30)
RETURNS TABLE (
    reason_code  TEXT,
    reason_label TEXT,
    count        BIGINT,
    pct          NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_total BIGINT;
    v_days  INT;
BEGIN
    v_admin := admin.current_admin_user_id();
    IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'cancellation:view') THEN
        RAISE EXCEPTION 'Permission denied: cancellation:view required';
    END IF;

    v_days := GREATEST(COALESCE(p_days, 30), 1);

    SELECT COUNT(*) INTO v_total
    FROM public.cancellation_requests cr
    WHERE cr.created_at >= NOW() - (v_days || ' days')::INTERVAL;

    IF v_total = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        c.code,
        c.label,
        COUNT(cr.id)::BIGINT AS cnt,
        ROUND((COUNT(cr.id)::NUMERIC / v_total) * 100, 1) AS pct
    FROM public.cancellation_requests cr
    JOIN admin.cancellation_reason_categories c ON c.id = cr.reason_category_id
    WHERE cr.created_at >= NOW() - (v_days || ' days')::INTERVAL
    GROUP BY c.code, c.label, c.sort_order
    ORDER BY cnt DESC, c.sort_order;
END;
$$;

CREATE OR REPLACE FUNCTION admin.admin_fetch_cancellation_categories()
RETURNS TABLE (
    id               UUID,
    code             TEXT,
    label            TEXT,
    description      TEXT,
    sort_order       INTEGER,
    is_active        BOOLEAN,
    submission_count BIGINT,
    created_at       TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
BEGIN
    v_admin := admin.current_admin_user_id();
    IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'cancellation:manage_categories') THEN
        RAISE EXCEPTION 'Permission denied: cancellation:manage_categories required';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.code,
        c.label,
        c.description,
        c.sort_order,
        c.is_active,
        COUNT(cr.id)::BIGINT AS submission_count,
        c.created_at,
        c.updated_at
    FROM admin.cancellation_reason_categories c
    LEFT JOIN public.cancellation_requests cr ON cr.reason_category_id = c.id
    GROUP BY c.id
    ORDER BY c.sort_order, c.label;
END;
$$;

CREATE OR REPLACE FUNCTION admin.admin_upsert_cancellation_category(
    p_id          UUID DEFAULT NULL,
    p_code        TEXT DEFAULT NULL,
    p_label       TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_sort_order  INT DEFAULT 0,
    p_is_active   BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_id    UUID;
    v_prev  admin.cancellation_reason_categories%ROWTYPE;
    v_new   admin.cancellation_reason_categories%ROWTYPE;
    v_code  TEXT;
BEGIN
    v_admin := admin.current_admin_user_id();
    IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'cancellation:manage_categories') THEN
        RAISE EXCEPTION 'Permission denied: cancellation:manage_categories required';
    END IF;

    v_code := lower(trim(regexp_replace(COALESCE(p_code, ''), '[^a-z0-9_]+', '_', 'g'), '_'));
    IF v_code = '' OR trim(COALESCE(p_label, '')) = '' THEN
        RAISE EXCEPTION 'code and label are required';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO admin.cancellation_reason_categories (
            code, label, description, sort_order, is_active
        )
        VALUES (
            v_code, trim(p_label), NULLIF(trim(COALESCE(p_description, '')), ''),
            COALESCE(p_sort_order, 0), COALESCE(p_is_active, TRUE)
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT * INTO v_prev FROM admin.cancellation_reason_categories WHERE id = p_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Category not found: %', p_id;
        END IF;

        UPDATE admin.cancellation_reason_categories
        SET code = v_code,
            label = trim(p_label),
            description = NULLIF(trim(COALESCE(p_description, '')), ''),
            sort_order = COALESCE(p_sort_order, sort_order),
            is_active = COALESCE(p_is_active, is_active),
            updated_at = NOW()
        WHERE id = p_id
        RETURNING id INTO v_id;
    END IF;

    SELECT * INTO v_new FROM admin.cancellation_reason_categories WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin,
        CASE WHEN p_id IS NULL THEN 'cancellation_category.create' ELSE 'cancellation_category.update' END,
        'cancellation_reason_category',
        v_id,
        jsonb_build_object('code', v_new.code),
        CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(v_prev) END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.admin_delete_cancellation_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_prev  public.cancellation_requests%ROWTYPE;
BEGIN
    v_admin := admin.current_admin_user_id();
    IF v_admin IS NULL OR NOT admin.check_admin_permission(v_admin, 'cancellation:delete') THEN
        RAISE EXCEPTION 'Permission denied: cancellation:delete required';
    END IF;

    SELECT * INTO v_prev FROM public.cancellation_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cancellation request not found: %', p_request_id;
    END IF;

    DELETE FROM public.cancellation_requests WHERE id = p_request_id;

    PERFORM admin.log_admin_action(
        v_admin,
        'cancellation_request.delete',
        'cancellation_request',
        p_request_id,
        to_jsonb(v_prev),
        NULL,
        NULL
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1.5 — Permissions
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('cancellation:view', 'View Cancellation Reasons', 'subscriptions', 'View cancellation submissions and trend analytics'),
    ('cancellation:manage_categories', 'Manage Cancellation Categories', 'subscriptions', 'Create and edit cancellation reason categories'),
    ('cancellation:delete', 'Delete Cancellation Submissions', 'subscriptions', 'Remove individual cancellation reason submissions')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('super_admin', 'cancellation:view'),
    ('super_admin', 'cancellation:manage_categories'),
    ('super_admin', 'cancellation:delete'),
    ('system_admin', 'cancellation:view'),
    ('system_admin', 'cancellation:manage_categories'),
    ('support_admin', 'cancellation:view')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.6 — Navigation seed
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b7630001-0001-4001-8063-000000000001'::uuid,
        'subscription-billing:billing:subscriptions:cancellation-reasons',
        'subscription-billing:billing',
        'item',
        'Cancellation Reasons',
        '/subscriptions/cancellation-reasons',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        14,
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

-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fetch_active_cancellation_categories() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_cancellation_request(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_fetch_cancellation_requests(INT, INT, UUID, TEXT, DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_get_cancellation_trends(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_fetch_cancellation_categories() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_upsert_cancellation_category(UUID, TEXT, TEXT, TEXT, INT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_delete_cancellation_request(UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v63: cancellation reasons migration applied.';
END $$;
