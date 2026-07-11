-- ============================================================================
-- v56: Affiliate program infrastructure (affiliates, payouts, RPCs, nav)
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v10.0_affiliate_program_plan.md (Phase 1)
-- Prerequisites: v735 admin schema, v51 nav_nodes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.affiliates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    website TEXT,
    target_system TEXT NOT NULL DEFAULT 'both'
        CHECK (target_system IN ('platform', 'simulator', 'both')),
    commission_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00
        CHECK (commission_rate_pct >= 0 AND commission_rate_pct <= 100),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
    application_notes TEXT,
    payout_method TEXT DEFAULT 'bank_transfer'
        CHECK (payout_method IN ('bank_transfer', 'paypal', 'other')),
    payout_details JSONB NOT NULL DEFAULT '{}'::JSONB,
    approved_by UUID REFERENCES admin.admin_users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_status ON admin.affiliates (status);
CREATE INDEX IF NOT EXISTS idx_affiliates_target_system ON admin.affiliates (target_system);
CREATE INDEX IF NOT EXISTS idx_affiliates_email ON admin.affiliates (lower(email));
CREATE INDEX IF NOT EXISTS idx_affiliates_created_at ON admin.affiliates (created_at DESC);

COMMENT ON TABLE admin.affiliates IS 'Affiliate partners and application records';

-- ---------------------------------------------------------------------------
-- admin.affiliate_payouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.affiliate_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES admin.affiliates(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    total_conversions INTEGER NOT NULL DEFAULT 0,
    gross_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    commission_rate_applied NUMERIC(5, 2) NOT NULL,
    commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    notes TEXT,
    approved_by UUID REFERENCES admin.admin_users(id),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON admin.affiliate_payouts (affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status ON admin.affiliate_payouts (status);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_period ON admin.affiliate_payouts (period_start DESC, period_end DESC);

COMMENT ON TABLE admin.affiliate_payouts IS 'Commission payout periods for affiliates';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_affiliates_updated_at ON admin.affiliates;
CREATE TRIGGER trg_affiliates_updated_at
    BEFORE UPDATE ON admin.affiliates
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_affiliate_payouts_updated_at ON admin.affiliate_payouts;
CREATE TRIGGER trg_affiliate_payouts_updated_at
    BEFORE UPDATE ON admin.affiliate_payouts
    FOR EACH ROW EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE admin.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.affiliate_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliates_select ON admin.affiliates;
CREATE POLICY affiliates_select ON admin.affiliates
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS affiliate_payouts_select ON admin.affiliate_payouts;
CREATE POLICY affiliate_payouts_select ON admin.affiliate_payouts
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.affiliates TO authenticated;
GRANT SELECT ON admin.affiliate_payouts TO authenticated;
GRANT ALL ON admin.affiliates TO service_role;
GRANT ALL ON admin.affiliate_payouts TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._normalize_affiliate_code(p_code TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT upper(regexp_replace(trim(COALESCE(p_code, '')), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION admin._generate_affiliate_code(p_base TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_base TEXT;
    v_candidate TEXT;
    v_suffix INTEGER := 0;
BEGIN
    v_base := left(admin._normalize_affiliate_code(p_base), 12);
    IF v_base = '' THEN
        v_base := 'AFFILIATE';
    END IF;
    v_candidate := v_base;
    WHILE EXISTS (SELECT 1 FROM admin.affiliates WHERE code = v_candidate) LOOP
        v_suffix := v_suffix + 1;
        v_candidate := v_base || v_suffix::TEXT;
    END LOOP;
    RETURN v_candidate;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_affiliate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_affiliate(
    p_name TEXT,
    p_email TEXT,
    p_code TEXT DEFAULT NULL,
    p_commission_rate_pct NUMERIC DEFAULT 10.00,
    p_target_system TEXT DEFAULT 'both',
    p_phone TEXT DEFAULT NULL,
    p_website TEXT DEFAULT NULL,
    p_application_notes TEXT DEFAULT NULL,
    p_payout_method TEXT DEFAULT 'bank_transfer',
    p_payout_details JSONB DEFAULT '{}'::JSONB,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_code TEXT;
    v_id UUID;
    v_new admin.affiliates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:create') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:create required';
    END IF;
    IF trim(COALESCE(p_name, '')) = '' OR trim(COALESCE(p_email, '')) = '' THEN
        RAISE EXCEPTION 'name and email are required';
    END IF;
    IF COALESCE(p_target_system, 'both') NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    v_code := COALESCE(NULLIF(admin._normalize_affiliate_code(p_code), ''), admin._generate_affiliate_code(p_name));
    IF length(v_code) < 4 OR length(v_code) > 20 THEN
        RAISE EXCEPTION 'Affiliate code must be 4-20 characters';
    END IF;

    INSERT INTO admin.affiliates (
        code, name, email, phone, website, target_system, commission_rate_pct,
        status, application_notes, payout_method, payout_details,
        approved_by, approved_at, created_by, updated_by
    )
    VALUES (
        v_code,
        trim(p_name),
        lower(trim(p_email)),
        NULLIF(trim(COALESCE(p_phone, '')), ''),
        NULLIF(trim(COALESCE(p_website, '')), ''),
        COALESCE(p_target_system, 'both'),
        COALESCE(p_commission_rate_pct, 10.00),
        'active',
        NULLIF(trim(COALESCE(p_application_notes, '')), ''),
        COALESCE(p_payout_method, 'bank_transfer'),
        COALESCE(p_payout_details, '{}'::JSONB),
        v_admin_user_id,
        NOW(),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.affiliates WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.create', 'affiliate', v_id,
        jsonb_build_object('code', v_code), NULL, to_jsonb(v_new));
    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.apply_as_affiliate (public / anon)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.apply_as_affiliate(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT DEFAULT NULL,
    p_website TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT 'platform',
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_code TEXT;
    v_id UUID;
BEGIN
    IF trim(COALESCE(p_name, '')) = '' OR trim(COALESCE(p_email, '')) = '' THEN
        RAISE EXCEPTION 'name and email are required';
    END IF;
    IF COALESCE(p_target_system, 'platform') NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;
    IF EXISTS (
        SELECT 1 FROM admin.affiliates
        WHERE lower(email) = lower(trim(p_email))
          AND status IN ('pending', 'active', 'suspended')
    ) THEN
        RAISE EXCEPTION 'An affiliate application already exists for this email';
    END IF;

    v_code := admin._generate_affiliate_code(p_name);

    INSERT INTO admin.affiliates (
        code, name, email, phone, website, target_system,
        commission_rate_pct, status, application_notes, payout_method
    )
    VALUES (
        v_code,
        trim(p_name),
        lower(trim(p_email)),
        NULLIF(trim(COALESCE(p_phone, '')), ''),
        NULLIF(trim(COALESCE(p_website, '')), ''),
        COALESCE(p_target_system, 'platform'),
        10.00,
        'pending',
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        'bank_transfer'
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_affiliate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_affiliate(
    p_affiliate_id UUID,
    p_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_website TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_commission_rate_pct NUMERIC DEFAULT NULL,
    p_application_notes TEXT DEFAULT NULL,
    p_payout_method TEXT DEFAULT NULL,
    p_payout_details JSONB DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliates%ROWTYPE;
    v_new admin.affiliates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:update') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:update required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;
    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.affiliates
    SET name = COALESCE(NULLIF(trim(p_name), ''), name),
        email = COALESCE(NULLIF(lower(trim(p_email)), ''), email),
        phone = CASE WHEN p_phone IS NULL THEN phone ELSE NULLIF(trim(p_phone), '') END,
        website = CASE WHEN p_website IS NULL THEN website ELSE NULLIF(trim(p_website), '') END,
        target_system = COALESCE(p_target_system, target_system),
        commission_rate_pct = COALESCE(p_commission_rate_pct, commission_rate_pct),
        application_notes = CASE WHEN p_application_notes IS NULL THEN application_notes ELSE NULLIF(trim(p_application_notes), '') END,
        payout_method = COALESCE(p_payout_method, payout_method),
        payout_details = COALESCE(p_payout_details, payout_details),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_affiliate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.update', 'affiliate', p_affiliate_id,
        jsonb_build_object('code', v_new.code), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.approve_affiliate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.approve_affiliate(
    p_affiliate_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliates%ROWTYPE;
    v_new admin.affiliates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:approve') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:approve required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;
    IF v_prev.status NOT IN ('pending', 'suspended') THEN
        RAISE EXCEPTION 'Affiliate cannot be approved from status: %', v_prev.status;
    END IF;

    UPDATE admin.affiliates
    SET status = 'active',
        approved_by = v_admin_user_id,
        approved_at = NOW(),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_affiliate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.approve', 'affiliate', p_affiliate_id,
        jsonb_build_object('code', v_new.code), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.suspend_affiliate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.suspend_affiliate(
    p_affiliate_id UUID,
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
    v_prev admin.affiliates%ROWTYPE;
    v_new admin.affiliates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:suspend') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:suspend required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;

    UPDATE admin.affiliates
    SET status = 'suspended',
        application_notes = CASE
            WHEN p_reason IS NOT NULL AND trim(p_reason) <> '' THEN
                trim(COALESCE(application_notes, '') || E'\n[Suspended] ' || trim(p_reason))
            ELSE application_notes
        END,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_affiliate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.suspend', 'affiliate', p_affiliate_id,
        jsonb_build_object('code', v_new.code), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.terminate_affiliate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.terminate_affiliate(
    p_affiliate_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliates%ROWTYPE;
    v_new admin.affiliates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:terminate') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:terminate required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;

    UPDATE admin.affiliates
    SET status = 'terminated',
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_affiliate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.terminate', 'affiliate', p_affiliate_id,
        jsonb_build_object('code', v_new.code), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.regenerate_affiliate_code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.regenerate_affiliate_code(
    p_affiliate_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliates%ROWTYPE;
    v_new admin.affiliates%ROWTYPE;
    v_code TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:code_regen') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:code_regen required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;

    v_code := admin._generate_affiliate_code(v_prev.name || to_char(NOW(), 'YYYY'));

    UPDATE admin.affiliates
    SET code = v_code,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_affiliate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate.code_regen', 'affiliate', p_affiliate_id,
        jsonb_build_object('old_code', v_prev.code, 'new_code', v_code), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_affiliate_payout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_affiliate_payout(
    p_affiliate_id UUID,
    p_period_start DATE,
    p_period_end DATE,
    p_commission_amount NUMERIC,
    p_gross_revenue NUMERIC DEFAULT 0,
    p_total_clicks INTEGER DEFAULT 0,
    p_total_conversions INTEGER DEFAULT 0,
    p_currency VARCHAR(3) DEFAULT 'USD',
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
    v_affiliate admin.affiliates%ROWTYPE;
    v_id UUID;
    v_new admin.affiliate_payouts%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:payout_create') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:payout_create required';
    END IF;

    SELECT * INTO v_affiliate FROM admin.affiliates WHERE id = p_affiliate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate not found: %', p_affiliate_id; END IF;

    INSERT INTO admin.affiliate_payouts (
        affiliate_id, period_start, period_end, total_clicks, total_conversions,
        gross_revenue, commission_rate_applied, commission_amount, currency,
        status, notes, created_by
    )
    VALUES (
        p_affiliate_id,
        p_period_start,
        p_period_end,
        COALESCE(p_total_clicks, 0),
        COALESCE(p_total_conversions, 0),
        COALESCE(p_gross_revenue, 0),
        v_affiliate.commission_rate_pct,
        COALESCE(p_commission_amount, 0),
        upper(COALESCE(p_currency, 'USD')),
        'pending',
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.affiliate_payouts WHERE id = v_id;
    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate_payout.create', 'affiliate_payout', v_id,
        jsonb_build_object('affiliate_id', p_affiliate_id), NULL, to_jsonb(v_new));
    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.approve_affiliate_payout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.approve_affiliate_payout(
    p_payout_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliate_payouts%ROWTYPE;
    v_new admin.affiliate_payouts%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:payout_approve') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:payout_approve required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliate_payouts WHERE id = p_payout_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found: %', p_payout_id; END IF;
    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending payouts can be approved (current: %)', v_prev.status;
    END IF;

    UPDATE admin.affiliate_payouts
    SET status = 'approved',
        approved_by = v_admin_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_payout_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate_payout.approve', 'affiliate_payout', p_payout_id,
        jsonb_build_object('affiliate_id', v_new.affiliate_id), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.mark_affiliate_payout_paid
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.mark_affiliate_payout_paid(
    p_payout_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.affiliate_payouts%ROWTYPE;
    v_new admin.affiliate_payouts%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN RAISE EXCEPTION 'Unable to resolve acting admin user'; END IF;
    IF NOT admin.check_admin_permission(v_admin_user_id, 'affiliate:payout_pay') THEN
        RAISE EXCEPTION 'Permission denied: affiliate:payout_pay required';
    END IF;

    SELECT * INTO v_prev FROM admin.affiliate_payouts WHERE id = p_payout_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found: %', p_payout_id; END IF;
    IF v_prev.status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Payout cannot be marked paid from status: %', v_prev.status;
    END IF;

    UPDATE admin.affiliate_payouts
    SET status = 'paid',
        paid_at = NOW(),
        approved_by = COALESCE(approved_by, v_admin_user_id),
        approved_at = COALESCE(approved_at, NOW()),
        updated_at = NOW()
    WHERE id = p_payout_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(v_admin_user_id, 'affiliate_payout.pay', 'affiliate_payout', p_payout_id,
        jsonb_build_object('affiliate_id', v_new.affiliate_id), to_jsonb(v_prev), to_jsonb(v_new));
    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('affiliate:view', 'View Affiliates', 'affiliate', 'View affiliate list, detail, and dashboard'),
    ('affiliate:create', 'Create Affiliates', 'affiliate', 'Create affiliate partners'),
    ('affiliate:update', 'Update Affiliates', 'affiliate', 'Edit affiliate details'),
    ('affiliate:approve', 'Approve Affiliates', 'affiliate', 'Approve pending affiliate applications'),
    ('affiliate:suspend', 'Suspend Affiliates', 'affiliate', 'Suspend active affiliates'),
    ('affiliate:terminate', 'Terminate Affiliates', 'affiliate', 'Terminate affiliate partnerships'),
    ('affiliate:code_regen', 'Regenerate Affiliate Code', 'affiliate', 'Generate a new affiliate referral code'),
    ('affiliate:payout_create', 'Create Affiliate Payouts', 'affiliate', 'Create commission payout records'),
    ('affiliate:payout_approve', 'Approve Affiliate Payouts', 'affiliate', 'Approve pending commission payouts'),
    ('affiliate:payout_pay', 'Mark Payout Paid', 'affiliate', 'Mark approved payouts as paid')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key FROM admin.admin_permissions
WHERE permission_key LIKE 'affiliate:%'
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'affiliate:view'),
    ('system_admin', 'affiliate:create'),
    ('system_admin', 'affiliate:update'),
    ('system_admin', 'affiliate:approve'),
    ('system_admin', 'affiliate:payout_create'),
    ('system_admin', 'affiliate:payout_pay'),
    ('support_admin', 'affiliate:view')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Navigation seed
-- ---------------------------------------------------------------------------
INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
)
VALUES
    (
        'b7560001-0003-4001-8056-000000000001'::uuid,
        'subscription-billing:affiliate',
        'subscription-billing',
        'group',
        'Affiliate Program',
        NULL,
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        26,
        TRUE,
        NULL
    ),
    (
        'b7560001-0003-4001-8056-000000000002'::uuid,
        'subscription-billing:affiliate:affiliate-dashboard',
        'subscription-billing:affiliate',
        'item',
        'Dashboard',
        '/affiliates/dashboard',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        27,
        TRUE,
        NULL
    ),
    (
        'b7560001-0003-4001-8056-000000000003'::uuid,
        'subscription-billing:affiliate:affiliate-list',
        'subscription-billing:affiliate',
        'item',
        'Affiliates',
        '/affiliates/affiliate-list',
        ARRAY['/affiliates/affiliate-detail', '/affiliates/affiliate-form']::text[],
        ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
        28,
        TRUE,
        NULL
    ),
    (
        'b7560001-0003-4001-8056-000000000004'::uuid,
        'subscription-billing:affiliate:affiliate-commissions',
        'subscription-billing:affiliate',
        'item',
        'Commissions',
        '/affiliates/commissions',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        29,
        TRUE,
        NULL
    ),
    (
        'b7560001-0003-4001-8056-000000000005'::uuid,
        'subscription-billing:affiliate:affiliate-applications',
        'subscription-billing:affiliate',
        'item',
        'Applications',
        '/affiliates/applications',
        ARRAY[]::text[],
        ARRAY['super_admin', 'system_admin']::text[],
        30,
        TRUE,
        'pending'
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
-- GRANT EXECUTE
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._normalize_affiliate_code(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._generate_affiliate_code(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_affiliate(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.apply_as_affiliate(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_affiliate(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.approve_affiliate(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.suspend_affiliate(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.terminate_affiliate(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.regenerate_affiliate_code(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_affiliate_payout(UUID, DATE, DATE, NUMERIC, NUMERIC, INTEGER, INTEGER, VARCHAR, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.approve_affiliate_payout(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.mark_affiliate_payout_paid(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v56: Affiliate program infrastructure applied.';
END $$;
