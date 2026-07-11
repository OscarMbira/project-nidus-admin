-- ============================================================================
-- v25: Invoices, tax rates, and refunds
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v18 (admin.currencies, admin.countries)
-- Plan: projectplans/v5.0_sidebar_completeness_plan.md (B5)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.invoice_number_counters — INV-YYYY-NNNNN sequence per calendar year
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.invoice_number_counters (
    year INTEGER PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE admin.invoice_number_counters IS
    'Per-year counter for auto-generated invoice numbers (INV-YYYY-NNNNN)';

-- ---------------------------------------------------------------------------
-- admin.invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    subscription_id UUID,
    target_system TEXT NOT NULL
        CHECK (target_system IN ('platform', 'simulator')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'issued', 'paid', 'overdue', 'cancelled', 'refunded')),
    currency VARCHAR(3) NOT NULL REFERENCES admin.currencies(currency_code),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
    tax_rate_applied NUMERIC(5, 2),
    issued_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_transaction_id UUID,
    line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
    notes TEXT,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id
    ON admin.invoices (user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id
    ON admin.invoices (subscription_id)
    WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON admin.invoices (status);

CREATE INDEX IF NOT EXISTS idx_invoices_target_system
    ON admin.invoices (target_system);

CREATE INDEX IF NOT EXISTS idx_invoices_created_at
    ON admin.invoices (created_at DESC);

COMMENT ON TABLE admin.invoices IS
    'Admin-managed invoices for platform and simulator billing';

-- ---------------------------------------------------------------------------
-- admin.tax_rates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL REFERENCES admin.countries(country_code),
    tax_name TEXT NOT NULL,
    rate NUMERIC(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
    is_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
    applies_to TEXT NOT NULL DEFAULT 'all'
        CHECK (applies_to IN ('platform', 'simulator', 'all')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_country_code
    ON admin.tax_rates (country_code);

CREATE INDEX IF NOT EXISTS idx_tax_rates_is_active
    ON admin.tax_rates (is_active);

CREATE INDEX IF NOT EXISTS idx_tax_rates_effective
    ON admin.tax_rates (country_code, effective_from DESC);

COMMENT ON TABLE admin.tax_rates IS
    'Country-specific tax rates with effective dating';

-- ---------------------------------------------------------------------------
-- admin.refunds
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES admin.invoices(id) ON DELETE RESTRICT,
    payment_transaction_id UUID,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL REFERENCES admin.currencies(currency_code),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'processed', 'rejected')),
    approved_by UUID REFERENCES admin.admin_users(id),
    processed_at TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_invoice_id
    ON admin.refunds (invoice_id);

CREATE INDEX IF NOT EXISTS idx_refunds_status
    ON admin.refunds (status);

CREATE INDEX IF NOT EXISTS idx_refunds_created_at
    ON admin.refunds (created_at DESC);

COMMENT ON TABLE admin.refunds IS
    'Refund requests with approval workflow';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON admin.invoices;
CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON admin.invoices
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_tax_rates_updated_at ON admin.tax_rates;
CREATE TRIGGER trg_tax_rates_updated_at
    BEFORE UPDATE ON admin.tax_rates
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_refunds_updated_at ON admin.refunds;
CREATE TRIGGER trg_refunds_updated_at
    BEFORE UPDATE ON admin.refunds
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.invoice_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_number_counters_service ON admin.invoice_number_counters;
CREATE POLICY invoice_number_counters_service ON admin.invoice_number_counters
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS invoices_select ON admin.invoices;
CREATE POLICY invoices_select ON admin.invoices
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS tax_rates_select ON admin.tax_rates;
CREATE POLICY tax_rates_select ON admin.tax_rates
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS refunds_select ON admin.refunds;
CREATE POLICY refunds_select ON admin.refunds
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.invoices TO authenticated;
GRANT SELECT ON admin.tax_rates TO authenticated;
GRANT SELECT ON admin.refunds TO authenticated;
GRANT ALL ON admin.invoice_number_counters TO service_role;
GRANT ALL ON admin.invoices TO service_role;
GRANT ALL ON admin.tax_rates TO service_role;
GRANT ALL ON admin.refunds TO service_role;

-- ---------------------------------------------------------------------------
-- admin._next_invoice_number
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    v_seq INTEGER;
BEGIN
    INSERT INTO admin.invoice_number_counters (year, last_number)
    VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE
    SET last_number = admin.invoice_number_counters.last_number + 1
    RETURNING last_number INTO v_seq;

    RETURN 'INV-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 5, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_invoice(
    p_user_id UUID,
    p_target_system TEXT,
    p_currency VARCHAR(3),
    p_subtotal NUMERIC,
    p_tax_amount NUMERIC DEFAULT 0,
    p_total NUMERIC DEFAULT NULL,
    p_tax_rate_applied NUMERIC DEFAULT NULL,
    p_subscription_id UUID DEFAULT NULL,
    p_due_at TIMESTAMPTZ DEFAULT NULL,
    p_line_items JSONB DEFAULT '[]'::JSONB,
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
    v_id UUID;
    v_invoice_number TEXT;
    v_currency VARCHAR(3);
    v_subtotal NUMERIC(12, 2);
    v_tax_amount NUMERIC(12, 2);
    v_total NUMERIC(12, 2);
    v_new admin.invoices%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;

    IF COALESCE(p_target_system, '') NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    v_currency := upper(trim(COALESCE(p_currency, '')));
    IF length(v_currency) <> 3 THEN
        RAISE EXCEPTION 'currency must be a 3-character ISO 4217 code';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.currencies WHERE currency_code = v_currency) THEN
        RAISE EXCEPTION 'Currency not found: %', v_currency;
    END IF;

    v_subtotal := COALESCE(p_subtotal, 0);
    v_tax_amount := COALESCE(p_tax_amount, 0);
    v_total := COALESCE(p_total, v_subtotal + v_tax_amount);

    IF v_subtotal < 0 OR v_tax_amount < 0 OR v_total < 0 THEN
        RAISE EXCEPTION 'subtotal, tax_amount, and total must be non-negative';
    END IF;

    v_invoice_number := admin._next_invoice_number();

    INSERT INTO admin.invoices (
        invoice_number,
        user_id,
        subscription_id,
        target_system,
        status,
        currency,
        subtotal,
        tax_amount,
        total,
        tax_rate_applied,
        due_at,
        line_items,
        notes,
        created_by,
        updated_by
    )
    VALUES (
        v_invoice_number,
        p_user_id,
        p_subscription_id,
        p_target_system,
        'draft',
        v_currency,
        v_subtotal,
        v_tax_amount,
        v_total,
        p_tax_rate_applied,
        p_due_at,
        COALESCE(p_line_items, '[]'::JSONB),
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.invoices WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'invoice.create',
        'invoice',
        v_id,
        jsonb_build_object('invoice_number', v_invoice_number),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_invoice(
    p_invoice_id UUID,
    p_subtotal NUMERIC DEFAULT NULL,
    p_tax_amount NUMERIC DEFAULT NULL,
    p_total NUMERIC DEFAULT NULL,
    p_tax_rate_applied NUMERIC DEFAULT NULL,
    p_due_at TIMESTAMPTZ DEFAULT NULL,
    p_line_items JSONB DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.invoices%ROWTYPE;
    v_new admin.invoices%ROWTYPE;
    v_subtotal NUMERIC(12, 2);
    v_tax_amount NUMERIC(12, 2);
    v_total NUMERIC(12, 2);
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;

    IF v_prev.status NOT IN ('draft', 'issued') THEN
        RAISE EXCEPTION 'Only draft or issued invoices can be updated (current status: %)', v_prev.status;
    END IF;

    v_subtotal := COALESCE(p_subtotal, v_prev.subtotal);
    v_tax_amount := COALESCE(p_tax_amount, v_prev.tax_amount);
    v_total := COALESCE(p_total, v_subtotal + v_tax_amount);

    IF v_subtotal < 0 OR v_tax_amount < 0 OR v_total < 0 THEN
        RAISE EXCEPTION 'subtotal, tax_amount, and total must be non-negative';
    END IF;

    UPDATE admin.invoices
    SET subtotal = v_subtotal,
        tax_amount = v_tax_amount,
        total = v_total,
        tax_rate_applied = COALESCE(p_tax_rate_applied, tax_rate_applied),
        due_at = COALESCE(p_due_at, due_at),
        line_items = COALESCE(p_line_items, line_items),
        notes = CASE
            WHEN p_notes IS NULL THEN notes
            ELSE NULLIF(trim(p_notes), '')
        END,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_invoice_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'invoice.update',
        'invoice',
        p_invoice_id,
        jsonb_build_object('invoice_number', v_new.invoice_number),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.issue_invoice
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.issue_invoice(
    p_invoice_id UUID,
    p_due_at TIMESTAMPTZ DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.invoices%ROWTYPE;
    v_new admin.invoices%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;

    IF v_prev.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft invoices can be issued (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.invoices
    SET status = 'issued',
        issued_at = NOW(),
        due_at = COALESCE(p_due_at, due_at, NOW() + INTERVAL '30 days'),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_invoice_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'invoice.issue',
        'invoice',
        p_invoice_id,
        jsonb_build_object('invoice_number', v_new.invoice_number),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.mark_invoice_paid
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.mark_invoice_paid(
    p_invoice_id UUID,
    p_payment_transaction_id UUID DEFAULT NULL,
    p_paid_at TIMESTAMPTZ DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.invoices%ROWTYPE;
    v_new admin.invoices%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;

    IF v_prev.status NOT IN ('issued', 'overdue') THEN
        RAISE EXCEPTION 'Only issued or overdue invoices can be marked paid (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.invoices
    SET status = 'paid',
        paid_at = COALESCE(p_paid_at, NOW()),
        payment_transaction_id = COALESCE(p_payment_transaction_id, payment_transaction_id),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_invoice_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'invoice.mark_paid',
        'invoice',
        p_invoice_id,
        jsonb_build_object('invoice_number', v_new.invoice_number),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_tax_rate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_tax_rate(
    p_country_code VARCHAR(2),
    p_tax_name TEXT,
    p_rate NUMERIC,
    p_effective_from DATE,
    p_is_inclusive BOOLEAN DEFAULT FALSE,
    p_applies_to TEXT DEFAULT 'all',
    p_is_active BOOLEAN DEFAULT TRUE,
    p_effective_to DATE DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_country VARCHAR(2);
    v_id UUID;
    v_new admin.tax_rates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    v_country := upper(trim(COALESCE(p_country_code, '')));
    IF length(v_country) <> 2 THEN
        RAISE EXCEPTION 'country_code must be a 2-character ISO code';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.countries WHERE country_code = v_country) THEN
        RAISE EXCEPTION 'Country not found: %', v_country;
    END IF;

    IF trim(COALESCE(p_tax_name, '')) = '' THEN
        RAISE EXCEPTION 'tax_name is required';
    END IF;

    IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN
        RAISE EXCEPTION 'rate must be between 0 and 100';
    END IF;

    IF p_effective_from IS NULL THEN
        RAISE EXCEPTION 'effective_from is required';
    END IF;

    IF COALESCE(p_applies_to, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid applies_to: %', p_applies_to;
    END IF;

    IF p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN
        RAISE EXCEPTION 'effective_to must be on or after effective_from';
    END IF;

    INSERT INTO admin.tax_rates (
        country_code,
        tax_name,
        rate,
        is_inclusive,
        applies_to,
        is_active,
        effective_from,
        effective_to,
        created_by,
        updated_by
    )
    VALUES (
        v_country,
        trim(p_tax_name),
        p_rate,
        COALESCE(p_is_inclusive, FALSE),
        COALESCE(p_applies_to, 'all'),
        COALESCE(p_is_active, TRUE),
        p_effective_from,
        p_effective_to,
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.tax_rates WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tax_rate.create',
        'tax_rate',
        v_id,
        jsonb_build_object('country_code', v_country, 'tax_name', trim(p_tax_name)),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_tax_rate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_tax_rate(
    p_tax_rate_id UUID,
    p_tax_name TEXT DEFAULT NULL,
    p_rate NUMERIC DEFAULT NULL,
    p_is_inclusive BOOLEAN DEFAULT NULL,
    p_applies_to TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_effective_from DATE DEFAULT NULL,
    p_effective_to DATE DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.tax_rates%ROWTYPE;
    v_new admin.tax_rates%ROWTYPE;
    v_effective_from DATE;
    v_effective_to DATE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.tax_rates
    WHERE id = p_tax_rate_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tax rate not found: %', p_tax_rate_id;
    END IF;

    IF p_rate IS NOT NULL AND (p_rate < 0 OR p_rate > 100) THEN
        RAISE EXCEPTION 'rate must be between 0 and 100';
    END IF;

    IF p_applies_to IS NOT NULL AND p_applies_to NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid applies_to: %', p_applies_to;
    END IF;

    v_effective_from := COALESCE(p_effective_from, v_prev.effective_from);
    v_effective_to := CASE
        WHEN p_effective_to IS NULL AND p_effective_from IS NULL THEN v_prev.effective_to
        ELSE p_effective_to
    END;

    IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
        RAISE EXCEPTION 'effective_to must be on or after effective_from';
    END IF;

    UPDATE admin.tax_rates
    SET tax_name = COALESCE(NULLIF(trim(p_tax_name), ''), tax_name),
        rate = COALESCE(p_rate, rate),
        is_inclusive = COALESCE(p_is_inclusive, is_inclusive),
        applies_to = COALESCE(p_applies_to, applies_to),
        is_active = COALESCE(p_is_active, is_active),
        effective_from = v_effective_from,
        effective_to = v_effective_to,
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_tax_rate_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tax_rate.update',
        'tax_rate',
        p_tax_rate_id,
        jsonb_build_object('country_code', v_new.country_code),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_tax_rate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_tax_rate(
    p_tax_rate_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.tax_rates%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.tax_rates
    WHERE id = p_tax_rate_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tax rate not found: %', p_tax_rate_id;
    END IF;

    DELETE FROM admin.tax_rates
    WHERE id = p_tax_rate_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'tax_rate.delete',
        'tax_rate',
        p_tax_rate_id,
        jsonb_build_object('country_code', v_prev.country_code),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_refund(
    p_invoice_id UUID,
    p_amount NUMERIC,
    p_reason TEXT,
    p_currency VARCHAR(3) DEFAULT NULL,
    p_payment_transaction_id UUID DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_invoice admin.invoices%ROWTYPE;
    v_currency VARCHAR(3);
    v_id UUID;
    v_new admin.refunds%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_invoice
    FROM admin.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.status NOT IN ('paid', 'issued') THEN
        RAISE EXCEPTION 'Refunds require a paid or issued invoice (current status: %)', v_invoice.status;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be greater than zero';
    END IF;

    IF p_amount > v_invoice.total THEN
        RAISE EXCEPTION 'Refund amount exceeds invoice total';
    END IF;

    IF trim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'reason is required';
    END IF;

    v_currency := upper(trim(COALESCE(p_currency, v_invoice.currency)));
    IF NOT EXISTS (SELECT 1 FROM admin.currencies WHERE currency_code = v_currency) THEN
        RAISE EXCEPTION 'Currency not found: %', v_currency;
    END IF;

    INSERT INTO admin.refunds (
        invoice_id,
        payment_transaction_id,
        amount,
        currency,
        reason,
        status,
        created_by,
        updated_by
    )
    VALUES (
        p_invoice_id,
        COALESCE(p_payment_transaction_id, v_invoice.payment_transaction_id),
        p_amount,
        v_currency,
        trim(p_reason),
        'pending',
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.refunds WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'refund.create',
        'refund',
        v_id,
        jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.approve_refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.approve_refund(
    p_refund_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.refunds%ROWTYPE;
    v_new admin.refunds%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.refunds
    WHERE id = p_refund_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending refunds can be approved (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.refunds
    SET status = 'approved',
        approved_by = v_admin_user_id,
        processed_at = NOW(),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_refund_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'refund.approve',
        'refund',
        p_refund_id,
        jsonb_build_object('invoice_id', v_prev.invoice_id),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.reject_refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.reject_refund(
    p_refund_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.refunds%ROWTYPE;
    v_new admin.refunds%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'subscriptions.billing.edit') THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.billing.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.refunds
    WHERE id = p_refund_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending refunds can be rejected (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.refunds
    SET status = 'rejected',
        approved_by = v_admin_user_id,
        processed_at = NOW(),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_refund_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'refund.reject',
        'refund',
        p_refund_id,
        jsonb_build_object('invoice_id', v_prev.invoice_id),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('subscriptions.billing.view', 'View Billing', 'subscriptions', 'View invoices, tax rates, and refunds'),
    ('subscriptions.billing.edit', 'Edit Billing', 'subscriptions', 'Create and manage invoices, tax rates, and refunds')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('subscriptions.billing.view', 'subscriptions.billing.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'subscriptions.billing.view'),
    ('system_admin', 'subscriptions.billing.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._next_invoice_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_invoice(UUID, TEXT, VARCHAR, NUMERIC, NUMERIC, NUMERIC, NUMERIC, UUID, TIMESTAMPTZ, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_invoice(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.issue_invoice(UUID, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.mark_invoice_paid(UUID, UUID, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_tax_rate(VARCHAR, TEXT, NUMERIC, DATE, BOOLEAN, TEXT, BOOLEAN, DATE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_tax_rate(UUID, TEXT, NUMERIC, BOOLEAN, TEXT, BOOLEAN, DATE, DATE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_tax_rate(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_refund(UUID, NUMERIC, TEXT, VARCHAR, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.approve_refund(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.reject_refund(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v25: Invoices, tax rates, and refunds applied.';
END $$;
