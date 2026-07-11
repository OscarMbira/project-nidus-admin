-- ============================================================================
-- v82: System Tester program infrastructure
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v11.0_system_tester_program_plan.md (Phase 1)
-- Prerequisites: v735 admin schema, platform_subscriptions, sim.simulator_subscriptions
-- Run: pnpm run admin:migrate-system-testers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._tester_setting_int(p_key TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT NULLIF(trim(setting_value), '')::INTEGER
    FROM admin.system_settings
    WHERE setting_key = p_key
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION admin._tester_professional_features(p_target_system TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_features JSONB;
    v_scope TEXT;
BEGIN
    v_scope := CASE
        WHEN p_target_system = 'simulator' THEN 'simulator'
        ELSE 'platform'
    END;

    SELECT COALESCE(sp.features, '[]'::jsonb)
    INTO v_features
    FROM public.subscription_plans sp
    WHERE sp.plan_type = 'professional'
      AND sp.catalog_scope = v_scope
      AND sp.is_active = TRUE
    ORDER BY sp.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_features IS NULL OR jsonb_typeof(v_features) <> 'array' OR jsonb_array_length(v_features) = 0 THEN
        SELECT COALESCE(jsonb_agg(sfc.feature_label ORDER BY sfc.sort_order), '[]'::jsonb)
        INTO v_features
        FROM admin.subscription_feature_catalog sfc
        WHERE sfc.is_active = TRUE
          AND (sfc.target_system = v_scope OR sfc.target_system = 'both');
    END IF;

    RETURN COALESCE(v_features, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION admin._drop_check_constraint_by_def(
    p_table regclass,
    p_fragment TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = p_table
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%' || p_fragment || '%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', p_table, r.conname);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Subscription columns + plan_type / billing_cycle updates
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_subscriptions
    ADD COLUMN IF NOT EXISTS is_tester BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE sim.simulator_subscriptions
    ADD COLUMN IF NOT EXISTS is_tester BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.platform_subscriptions.is_tester IS
    'TRUE when subscription was provisioned via the System Tester program';
COMMENT ON COLUMN sim.simulator_subscriptions.is_tester IS
    'TRUE when subscription was provisioned via the System Tester program';

SELECT admin._drop_check_constraint_by_def('public.platform_subscriptions'::regclass, 'plan_type');
ALTER TABLE public.platform_subscriptions
    ADD CONSTRAINT platform_subscriptions_plan_type_check
    CHECK (plan_type IN (
        'free', 'starter', 'professional', 'enterprise',
        'lifetime_starter', 'lifetime_professional', 'lifetime_enterprise', 'lifetime',
        'tester'
    ));

SELECT admin._drop_check_constraint_by_def('public.platform_subscriptions'::regclass, 'billing_cycle');
ALTER TABLE public.platform_subscriptions
    ADD CONSTRAINT platform_subscriptions_billing_cycle_check
    CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly', 'lifetime', 'custom', 'tester'));

SELECT admin._drop_check_constraint_by_def('sim.simulator_subscriptions'::regclass, 'plan_type');
ALTER TABLE sim.simulator_subscriptions
    ADD CONSTRAINT simulator_subscriptions_plan_type_check
    CHECK (plan_type IN (
        'free', 'basic', 'professional', 'enterprise',
        'lifetime_basic', 'lifetime_professional', 'lifetime_ultimate', 'lifetime',
        'tester'
    ));

SELECT admin._drop_check_constraint_by_def('sim.simulator_subscriptions'::regclass, 'billing_cycle');
ALTER TABLE sim.simulator_subscriptions
    ADD CONSTRAINT simulator_subscriptions_billing_cycle_check
    CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly', 'lifetime', 'tester'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tester_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_name TEXT NOT NULL,
    applicant_email TEXT NOT NULL,
    target_systems TEXT[] NOT NULL,
    motivation TEXT,
    experience TEXT,
    how_heard TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES admin.admin_users(id),
    reviewed_at TIMESTAMPTZ,
    user_id UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tester_applications_email_active
    ON public.tester_applications (lower(trim(applicant_email)))
    WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS idx_tester_applications_status
    ON public.tester_applications (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.system_testers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    application_id UUID REFERENCES public.tester_applications(id),
    target_systems TEXT[] NOT NULL,
    moratorium_months INTEGER NOT NULL,
    moratorium_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    moratorium_end TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'converted', 'revoked')),
    granted_by UUID REFERENCES admin.admin_users(id),
    grant_note TEXT,
    is_tester_data_flagged BOOLEAN NOT NULL DEFAULT TRUE,
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_testers_user_active
    ON public.system_testers (user_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_system_testers_status_end
    ON public.system_testers (status, moratorium_end);

CREATE TABLE IF NOT EXISTS public.tester_project_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tester_id UUID NOT NULL REFERENCES public.system_testers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id),
    account_id UUID REFERENCES public.accounts(id),
    project_id UUID REFERENCES public.projects(id),
    org_role TEXT NOT NULL,
    project_role TEXT,
    assigned_by UUID REFERENCES admin.admin_users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tester_project_assignments_tester
    ON public.tester_project_assignments (tester_id, is_active);

CREATE TABLE IF NOT EXISTS public.tester_org_sandboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id),
    sandbox_name TEXT,
    target_system TEXT NOT NULL DEFAULT 'platform'
        CHECK (target_system IN ('platform', 'simulator', 'both')),
    max_members INTEGER NOT NULL DEFAULT 50,
    moratorium_months INTEGER NOT NULL,
    moratorium_end TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES admin.admin_users(id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tester_org_sandboxes_account
    ON public.tester_org_sandboxes (account_id, status);

CREATE TABLE IF NOT EXISTS public.tester_expiry_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tester_id UUID NOT NULL REFERENCES public.system_testers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id),
    notification_type TEXT NOT NULL
        CHECK (notification_type IN ('90d', '30d', '7d', '0d')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tester_id, notification_type)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tester_applications_updated_at ON public.tester_applications;
CREATE TRIGGER trg_tester_applications_updated_at
    BEFORE UPDATE ON public.tester_applications
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_system_testers_updated_at ON public.system_testers;
CREATE TRIGGER trg_system_testers_updated_at
    BEFORE UPDATE ON public.system_testers
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_tester_org_sandboxes_updated_at ON public.tester_org_sandboxes;
CREATE TRIGGER trg_tester_org_sandboxes_updated_at
    BEFORE UPDATE ON public.tester_org_sandboxes
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tester_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tester_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tester_org_sandboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tester_expiry_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tester_applications_insert ON public.tester_applications;
CREATE POLICY tester_applications_insert ON public.tester_applications
    FOR INSERT TO authenticated, anon
    WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS tester_applications_admin_select ON public.tester_applications;
CREATE POLICY tester_applications_admin_select ON public.tester_applications
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS system_testers_admin_select ON public.system_testers;
CREATE POLICY system_testers_admin_select ON public.system_testers
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS tester_project_assignments_admin_select ON public.tester_project_assignments;
CREATE POLICY tester_project_assignments_admin_select ON public.tester_project_assignments
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS tester_org_sandboxes_admin_select ON public.tester_org_sandboxes;
CREATE POLICY tester_org_sandboxes_admin_select ON public.tester_org_sandboxes
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS tester_expiry_notification_log_admin_select ON public.tester_expiry_notification_log;
CREATE POLICY tester_expiry_notification_log_admin_select ON public.tester_expiry_notification_log
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON public.tester_applications TO authenticated;
GRANT SELECT ON public.system_testers TO authenticated;
GRANT SELECT ON public.tester_project_assignments TO authenticated;
GRANT SELECT ON public.tester_org_sandboxes TO authenticated;
GRANT SELECT ON public.tester_expiry_notification_log TO authenticated;
GRANT INSERT ON public.tester_applications TO authenticated, anon;
GRANT ALL ON public.tester_applications TO service_role;
GRANT ALL ON public.system_testers TO service_role;
GRANT ALL ON public.tester_project_assignments TO service_role;
GRANT ALL ON public.tester_org_sandboxes TO service_role;
GRANT ALL ON public.tester_expiry_notification_log TO service_role;

-- ---------------------------------------------------------------------------
-- admin.get_tester_capacity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_tester_capacity()
RETURNS TABLE (active_count BIGINT, max_testers INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.is_active_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.system_testers st WHERE st.status = 'active')::BIGINT,
        COALESCE(admin._tester_setting_int('testers.max_active_testers'), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION admin.get_tester_capacity() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- admin.grant_tester_access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.grant_tester_access(
    p_user_id UUID,
    p_systems TEXT[],
    p_moratorium_months INTEGER DEFAULT NULL,
    p_grant_note TEXT DEFAULT NULL,
    p_application_id UUID DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_months INTEGER;
    v_max INTEGER;
    v_active_count BIGINT;
    v_tester_id UUID;
    v_moratorium_end TIMESTAMPTZ;
    v_system TEXT;
    v_features JSONB;
    v_existing UUID;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.grant') THEN
        RAISE EXCEPTION 'Permission denied: testers.grant required';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;
    IF p_systems IS NULL OR array_length(p_systems, 1) IS NULL THEN
        RAISE EXCEPTION 'At least one target system is required';
    END IF;

    v_months := COALESCE(p_moratorium_months, admin._tester_setting_int('testers.default_moratorium_months'));
    IF v_months IS NULL OR v_months < 1 THEN
        RAISE EXCEPTION 'testers.default_moratorium_months system setting is missing or invalid';
    END IF;

    v_max := COALESCE(admin._tester_setting_int('testers.max_active_testers'), 100);
    SELECT COUNT(*) INTO v_active_count
    FROM public.system_testers st
    WHERE st.status = 'active';

    IF EXISTS (
        SELECT 1 FROM public.system_testers st
        WHERE st.user_id = p_user_id AND st.status = 'active'
    ) THEN
        SELECT st.id INTO v_tester_id
        FROM public.system_testers st
        WHERE st.user_id = p_user_id AND st.status = 'active'
        LIMIT 1;
    ELSE
        IF v_active_count >= v_max THEN
            RAISE EXCEPTION
                'Tester limit reached (% active / % max). Revoke inactive testers or increase testers.max_active_testers in System Settings.',
                v_active_count, v_max;
        END IF;

        v_moratorium_end := NOW() + (v_months || ' months')::INTERVAL;

        INSERT INTO public.system_testers (
            user_id, application_id, target_systems, moratorium_months,
            moratorium_start, moratorium_end, status, granted_by, grant_note
        )
        VALUES (
            p_user_id,
            p_application_id,
            p_systems,
            v_months,
            NOW(),
            v_moratorium_end,
            'active',
            v_admin_user_id,
            NULLIF(trim(COALESCE(p_grant_note, '')), '')
        )
        RETURNING id INTO v_tester_id;
    END IF;

    SELECT st.moratorium_end INTO v_moratorium_end
    FROM public.system_testers st
    WHERE st.id = v_tester_id;

    FOREACH v_system IN ARRAY p_systems LOOP
        IF v_system NOT IN ('platform', 'simulator') THEN
            RAISE EXCEPTION 'Invalid system: %', v_system;
        END IF;

        v_features := admin._tester_professional_features(v_system);

        IF v_system = 'platform' THEN
            SELECT ps.id INTO v_existing
            FROM public.platform_subscriptions ps
            WHERE ps.user_id = p_user_id
              AND ps.is_tester = TRUE
              AND ps.status IN ('active', 'trialing')
            ORDER BY ps.created_at DESC
            LIMIT 1;

            IF v_existing IS NOT NULL THEN
                UPDATE public.platform_subscriptions
                SET expires_at = v_moratorium_end,
                    plan_type = 'tester',
                    billing_cycle = 'tester',
                    amount_paid = 0,
                    updated_at = NOW()
                WHERE id = v_existing;
            ELSE
                INSERT INTO public.platform_subscriptions (
                    user_id, plan_type, status, billing_cycle, amount_paid, currency,
                    started_at, expires_at, is_lifetime, is_trial, is_tester,
                    custom_features, updated_at
                )
                VALUES (
                    p_user_id, 'tester', 'active', 'tester', 0, 'USD',
                    NOW(), v_moratorium_end, FALSE, FALSE, TRUE,
                    jsonb_build_object('features', v_features), NOW()
                );
            END IF;
        ELSE
            SELECT ss.id INTO v_existing
            FROM sim.simulator_subscriptions ss
            WHERE ss.user_id = p_user_id
              AND ss.is_tester = TRUE
              AND ss.status IN ('active', 'trialing')
            ORDER BY ss.created_at DESC
            LIMIT 1;

            IF v_existing IS NOT NULL THEN
                UPDATE sim.simulator_subscriptions
                SET expires_at = v_moratorium_end,
                    plan_type = 'tester',
                    billing_cycle = 'tester',
                    amount_paid = 0,
                    updated_at = NOW()
                WHERE id = v_existing;
            ELSE
                INSERT INTO sim.simulator_subscriptions (
                    user_id, plan_type, status, billing_cycle, amount_paid, currency,
                    started_at, expires_at, is_lifetime, is_tester, features, updated_at
                )
                VALUES (
                    p_user_id, 'tester', 'active', 'tester', 0, 'USD',
                    NOW(), v_moratorium_end, FALSE, TRUE, v_features, NOW()
                );
            END IF;
        END IF;
    END LOOP;

    UPDATE public.system_testers
    SET target_systems = (
        SELECT ARRAY(
            SELECT DISTINCT unnest(system_testers.target_systems || p_systems)
        )
    ),
    updated_at = NOW()
    WHERE id = v_tester_id;

    SELECT to_jsonb(st.*) INTO v_new
    FROM public.system_testers st
    WHERE st.id = v_tester_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.grant',
        'system_tester',
        v_tester_id,
        jsonb_build_object('user_id', p_user_id, 'systems', p_systems, 'note', p_grant_note),
        NULL,
        v_new
    );

    RETURN v_tester_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.approve_tester_application
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.approve_tester_application(
    p_application_id UUID,
    p_moratorium_months INTEGER DEFAULT NULL,
    p_grant_note TEXT DEFAULT NULL,
    p_systems TEXT[] DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_app public.tester_applications%ROWTYPE;
    v_systems TEXT[];
    v_tester_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.applications') THEN
        RAISE EXCEPTION 'Permission denied: testers.applications required';
    END IF;

    SELECT * INTO v_app FROM public.tester_applications WHERE id = p_application_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Application not found: %', p_application_id; END IF;
    IF v_app.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending applications can be approved (current: %)', v_app.status;
    END IF;

    v_systems := COALESCE(p_systems, v_app.target_systems);

    UPDATE public.tester_applications
    SET status = 'approved',
        reviewed_by = v_admin_user_id,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_application_id;

    IF v_app.user_id IS NOT NULL THEN
        v_tester_id := admin.grant_tester_access(
            v_app.user_id, v_systems, p_moratorium_months, p_grant_note, p_application_id, v_admin_user_id
        );
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.application.approve',
        'tester_application',
        p_application_id,
        jsonb_build_object('systems', v_systems, 'tester_id', v_tester_id),
        to_jsonb(v_app),
        (SELECT to_jsonb(ta.*) FROM public.tester_applications ta WHERE ta.id = p_application_id)
    );

    RETURN COALESCE(v_tester_id, p_application_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reject_tester_application
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reject_tester_application(
    p_application_id UUID,
    p_rejection_reason TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev public.tester_applications%ROWTYPE;
    v_new public.tester_applications%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.applications') THEN
        RAISE EXCEPTION 'Permission denied: testers.applications required';
    END IF;

    SELECT * INTO v_prev FROM public.tester_applications WHERE id = p_application_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Application not found: %', p_application_id; END IF;
    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending applications can be rejected (current: %)', v_prev.status;
    END IF;

    UPDATE public.tester_applications
    SET status = 'rejected',
        rejection_reason = NULLIF(trim(COALESCE(p_rejection_reason, '')), ''),
        reviewed_by = v_admin_user_id,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_application_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.application.reject',
        'tester_application',
        p_application_id,
        jsonb_build_object('reason', p_rejection_reason),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.revoke_tester_access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.revoke_tester_access(
    p_tester_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev public.system_testers%ROWTYPE;
    v_new public.system_testers%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.revoke') THEN
        RAISE EXCEPTION 'Permission denied: testers.revoke required';
    END IF;

    SELECT * INTO v_prev FROM public.system_testers WHERE id = p_tester_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tester not found: %', p_tester_id; END IF;

    UPDATE public.system_testers
    SET status = 'revoked', updated_at = NOW()
    WHERE id = p_tester_id
    RETURNING * INTO v_new;

    UPDATE public.platform_subscriptions
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE user_id = v_prev.user_id AND is_tester = TRUE AND status IN ('active', 'trialing');

    UPDATE sim.simulator_subscriptions
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE user_id = v_prev.user_id AND is_tester = TRUE AND status IN ('active', 'trialing');

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.revoke',
        'system_tester',
        p_tester_id,
        jsonb_build_object('reason', p_reason),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.extend_tester_moratorium
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.extend_tester_moratorium(
    p_tester_id UUID,
    p_additional_months INTEGER,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev public.system_testers%ROWTYPE;
    v_new public.system_testers%ROWTYPE;
    v_new_end TIMESTAMPTZ;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.manage') THEN
        RAISE EXCEPTION 'Permission denied: testers.manage required';
    END IF;
    IF COALESCE(p_additional_months, 0) < 1 THEN
        RAISE EXCEPTION 'additional_months must be at least 1';
    END IF;

    SELECT * INTO v_prev FROM public.system_testers WHERE id = p_tester_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tester not found: %', p_tester_id; END IF;

    v_new_end := v_prev.moratorium_end + (p_additional_months || ' months')::INTERVAL;

    UPDATE public.system_testers
    SET moratorium_end = v_new_end,
        moratorium_months = moratorium_months + p_additional_months,
        status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
        updated_at = NOW()
    WHERE id = p_tester_id
    RETURNING * INTO v_new;

    UPDATE public.platform_subscriptions
    SET expires_at = v_new_end, status = 'active', updated_at = NOW()
    WHERE user_id = v_prev.user_id AND is_tester = TRUE;

    UPDATE sim.simulator_subscriptions
    SET expires_at = v_new_end, status = 'active', updated_at = NOW()
    WHERE user_id = v_prev.user_id AND is_tester = TRUE;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.extend',
        'system_tester',
        p_tester_id,
        jsonb_build_object('additional_months', p_additional_months),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.mark_tester_converted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.mark_tester_converted(
    p_tester_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev public.system_testers%ROWTYPE;
    v_new public.system_testers%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.manage') THEN
        RAISE EXCEPTION 'Permission denied: testers.manage required';
    END IF;

    SELECT * INTO v_prev FROM public.system_testers WHERE id = p_tester_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tester not found: %', p_tester_id; END IF;

    UPDATE public.system_testers
    SET status = 'converted', converted_at = NOW(), updated_at = NOW()
    WHERE id = p_tester_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.converted',
        'system_tester',
        p_tester_id,
        '{}'::jsonb,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.assign_tester_to_project
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.assign_tester_to_project(
    p_tester_id UUID,
    p_account_id UUID,
    p_project_id UUID,
    p_org_role TEXT,
    p_project_role TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_tester public.system_testers%ROWTYPE;
    v_id UUID;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.assign') THEN
        RAISE EXCEPTION 'Permission denied: testers.assign required';
    END IF;

    SELECT * INTO v_tester FROM public.system_testers WHERE id = p_tester_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tester not found: %', p_tester_id; END IF;

    INSERT INTO public.tester_project_assignments (
        tester_id, user_id, account_id, project_id, org_role, project_role,
        assigned_by, notes
    )
    VALUES (
        p_tester_id, v_tester.user_id, p_account_id, p_project_id,
        p_org_role, p_project_role, v_admin_user_id, NULLIF(trim(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_id;

    SELECT to_jsonb(tpa.*) INTO v_new
    FROM public.tester_project_assignments tpa
    WHERE tpa.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.assign',
        'tester_assignment',
        v_id,
        jsonb_build_object('tester_id', p_tester_id, 'account_id', p_account_id, 'project_id', p_project_id),
        NULL,
        v_new
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.revoke_tester_assignment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.revoke_tester_assignment(
    p_assignment_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev public.tester_project_assignments%ROWTYPE;
    v_new public.tester_project_assignments%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.assign') THEN
        RAISE EXCEPTION 'Permission denied: testers.assign required';
    END IF;

    SELECT * INTO v_prev FROM public.tester_project_assignments WHERE id = p_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found: %', p_assignment_id; END IF;

    UPDATE public.tester_project_assignments
    SET is_active = FALSE, revoked_at = NOW()
    WHERE id = p_assignment_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.assignment.revoke',
        'tester_assignment',
        p_assignment_id,
        jsonb_build_object('reason', p_reason),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_tester_sandbox
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_tester_sandbox(
    p_account_id UUID,
    p_sandbox_name TEXT,
    p_moratorium_months INTEGER DEFAULT NULL,
    p_target_system TEXT DEFAULT 'platform',
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_months INTEGER;
    v_id UUID;
    v_new JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.sandbox') THEN
        RAISE EXCEPTION 'Permission denied: testers.sandbox required';
    END IF;

    v_months := COALESCE(p_moratorium_months, admin._tester_setting_int('testers.default_moratorium_months'));
    IF v_months IS NULL OR v_months < 1 THEN
        RAISE EXCEPTION 'testers.default_moratorium_months system setting is missing or invalid';
    END IF;

    INSERT INTO public.tester_org_sandboxes (
        account_id, sandbox_name, target_system, moratorium_months, moratorium_end,
        created_by, notes
    )
    VALUES (
        p_account_id,
        NULLIF(trim(COALESCE(p_sandbox_name, '')), ''),
        COALESCE(p_target_system, 'platform'),
        v_months,
        NOW() + (v_months || ' months')::INTERVAL,
        v_admin_user_id,
        NULLIF(trim(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_id;

    SELECT to_jsonb(tos.*) INTO v_new FROM public.tester_org_sandboxes tos WHERE tos.id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.sandbox.create',
        'tester_sandbox',
        v_id,
        jsonb_build_object('account_id', p_account_id),
        NULL,
        v_new
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.provision_sandbox_members
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.provision_sandbox_members(
    p_sandbox_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_admin_user_id UUID;
    v_sandbox public.tester_org_sandboxes%ROWTYPE;
    v_max INTEGER;
    v_active_count BIGINT;
    v_remaining INTEGER;
    v_member RECORD;
    v_unprovisioned INTEGER := 0;
    v_provisioned INTEGER := 0;
    v_systems TEXT[];
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'testers.sandbox') THEN
        RAISE EXCEPTION 'Permission denied: testers.sandbox required';
    END IF;

    SELECT * INTO v_sandbox FROM public.tester_org_sandboxes WHERE id = p_sandbox_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox not found: %', p_sandbox_id; END IF;
    IF v_sandbox.status <> 'active' THEN
        RAISE EXCEPTION 'Sandbox is not active: %', v_sandbox.status;
    END IF;

    v_max := COALESCE(admin._tester_setting_int('testers.max_active_testers'), 100);
    SELECT COUNT(*) INTO v_active_count FROM public.system_testers WHERE status = 'active';
    v_remaining := GREATEST(v_max - v_active_count::INTEGER, 0);

    v_systems := CASE v_sandbox.target_system
        WHEN 'both' THEN ARRAY['platform', 'simulator']
        WHEN 'simulator' THEN ARRAY['simulator']
        ELSE ARRAY['platform']
    END;

    FOR v_member IN
        SELECT DISTINCT m.id AS user_id
        FROM admin.get_account_members(v_sandbox.account_id, v_admin_user_id) m
        WHERE NOT EXISTS (
            SELECT 1 FROM public.system_testers st
            WHERE st.user_id = m.id AND st.status = 'active'
        )
    LOOP
        v_unprovisioned := v_unprovisioned + 1;
    END LOOP;

    IF v_unprovisioned > 0 AND v_remaining = 0 THEN
        RAISE EXCEPTION '0 of % members can be provisioned — tester limit would be exceeded (max: %)',
            v_unprovisioned, v_max;
    END IF;

    IF v_unprovisioned > v_remaining THEN
        RAISE EXCEPTION '% of % members can be provisioned — tester limit would be exceeded (max: %, remaining: %)',
            v_remaining, v_unprovisioned, v_max, v_remaining;
    END IF;

    FOR v_member IN
        SELECT DISTINCT m.id AS user_id
        FROM admin.get_account_members(v_sandbox.account_id, v_admin_user_id) m
        WHERE NOT EXISTS (
            SELECT 1 FROM public.system_testers st
            WHERE st.user_id = m.id AND st.status = 'active'
        )
    LOOP
        PERFORM admin.grant_tester_access(
            v_member.user_id,
            v_systems,
            v_sandbox.moratorium_months,
            'Sandbox provision: ' || COALESCE(v_sandbox.sandbox_name, v_sandbox.id::TEXT),
            NULL,
            v_admin_user_id
        );
        v_provisioned := v_provisioned + 1;
    END LOOP;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tester.sandbox.provision',
        'tester_sandbox',
        p_sandbox_id,
        jsonb_build_object('provisioned', v_provisioned),
        NULL,
        jsonb_build_object('provisioned', v_provisioned)
    );

    RETURN v_provisioned;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.process_tester_expiry_notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.process_tester_expiry_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_tester RECORD;
    v_type TEXT;
    v_days INTEGER;
    v_count INTEGER := 0;
    v_template_key TEXT;
BEGIN
    FOR v_tester IN
        SELECT st.*, u.email, u.full_name
        FROM public.system_testers st
        INNER JOIN public.users u ON u.id = st.user_id
        WHERE st.status = 'active'
    LOOP
        v_days := GREATEST(0, EXTRACT(DAY FROM (v_tester.moratorium_end - NOW()))::INTEGER);

        v_type := CASE
            WHEN v_tester.moratorium_end::DATE = CURRENT_DATE THEN '0d'
            WHEN v_days <= 7 THEN '7d'
            WHEN v_days <= 30 THEN '30d'
            WHEN v_days <= 90 THEN '90d'
            ELSE NULL
        END;

        IF v_type IS NULL THEN
            CONTINUE;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.tester_expiry_notification_log l
            WHERE l.tester_id = v_tester.id AND l.notification_type = v_type
        ) THEN
            CONTINUE;
        END IF;

        v_template_key := 'tester_moratorium_expiry_' || v_type;

        INSERT INTO public.tester_expiry_notification_log (tester_id, user_id, notification_type)
        VALUES (v_tester.id, v_tester.user_id, v_type);

        PERFORM admin.log_admin_action(
            NULL,
            'tester.expiry.notification',
            'system_tester',
            v_tester.id,
            jsonb_build_object(
                'notification_type', v_type,
                'template_key', v_template_key,
                'email', v_tester.email,
                'moratorium_end', v_tester.moratorium_end
            ),
            NULL,
            NULL
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Sandbox auto-provision on org invitation accept
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sandbox_tester_auto_provision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_sandbox public.tester_org_sandboxes%ROWTYPE;
    v_user_id UUID;
    v_systems TEXT[];
BEGIN
    IF NEW.invitation_status IS DISTINCT FROM 'accepted' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.invitation_status = 'accepted' THEN
        RETURN NEW;
    END IF;

    v_user_id := COALESCE(NEW.accepted_by_user_id, NEW.invited_user_id);
    IF v_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_sandbox
    FROM public.tester_org_sandboxes tos
    WHERE tos.account_id = NEW.organisation_id
      AND tos.status = 'active'
    ORDER BY tos.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.system_testers st
        WHERE st.user_id = v_user_id AND st.status = 'active'
    ) THEN
        RETURN NEW;
    END IF;

    v_systems := CASE v_sandbox.target_system
        WHEN 'both' THEN ARRAY['platform', 'simulator']
        WHEN 'simulator' THEN ARRAY['simulator']
        ELSE ARRAY['platform']
    END;

    PERFORM admin.grant_tester_access(
        v_user_id,
        v_systems,
        v_sandbox.moratorium_months,
        'Auto-provisioned via sandbox org join',
        NULL,
        NULL
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'sandbox auto-provision failed for user %: %', v_user_id, SQLERRM;
        RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sandbox_tester_auto_provision ON public.organisation_invitations;
CREATE TRIGGER trg_sandbox_tester_auto_provision
    AFTER INSERT OR UPDATE OF invitation_status ON public.organisation_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_sandbox_tester_auto_provision();

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('testers.view', 'View System Testers', 'testers', 'View tester program records and dashboards'),
    ('testers.grant', 'Grant Tester Access', 'testers', 'Grant direct tester access to users'),
    ('testers.revoke', 'Revoke Tester Access', 'testers', 'Revoke active tester access'),
    ('testers.manage', 'Manage Tester Moratorium', 'testers', 'Extend moratorium and mark conversions'),
    ('testers.assign', 'Assign Tester to Project', 'testers', 'Assign testers to orgs and projects'),
    ('testers.sandbox', 'Manage Sandbox Orgs', 'testers', 'Create sandboxes and bulk-provision members'),
    ('testers.applications', 'Review Tester Applications', 'testers', 'Approve or reject tester applications')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key FROM admin.admin_permissions
WHERE permission_key LIKE 'testers.%'
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'system_admin', permission_key FROM admin.admin_permissions
WHERE permission_key LIKE 'testers.%'
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RPC grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.grant_tester_access(UUID, TEXT[], INTEGER, TEXT, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.approve_tester_application(UUID, INTEGER, TEXT, TEXT[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reject_tester_application(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.revoke_tester_access(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.extend_tester_moratorium(UUID, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.mark_tester_converted(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.assign_tester_to_project(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.revoke_tester_assignment(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_tester_sandbox(UUID, TEXT, INTEGER, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.provision_sandbox_members(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.process_tester_expiry_notifications() TO authenticated, service_role;
