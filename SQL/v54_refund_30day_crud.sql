-- ============================================================================
-- v54: 30-day refund CRUD — cancelled status, granular permissions, admin RPCs
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v9.0_refund_30day_crud_plan.md
-- Prerequisites: v25 (refunds), v51 (nav_nodes)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 — Add cancelled status
-- ---------------------------------------------------------------------------
ALTER TABLE admin.refunds
    DROP CONSTRAINT IF EXISTS refunds_status_check;

ALTER TABLE admin.refunds
    ADD CONSTRAINT refunds_status_check
    CHECK (status IN ('pending', 'approved', 'processed', 'rejected', 'cancelled'));

-- ---------------------------------------------------------------------------
-- 1.2 — admin_create_refund (30-day window, paid invoices only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_create_refund(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'refund:create') THEN
        RAISE EXCEPTION 'Permission denied: refund:create required';
    END IF;

    SELECT * INTO v_invoice FROM admin.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
    END IF;

    IF v_invoice.status <> 'paid' THEN
        RAISE EXCEPTION 'Only paid invoices are eligible for refunds (current status: %)', v_invoice.status;
    END IF;

    IF v_invoice.paid_at IS NULL OR v_invoice.paid_at < NOW() - INTERVAL '30 days' THEN
        RAISE EXCEPTION 'Refund window has expired (30-day limit from payment date)';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be greater than zero';
    END IF;

    IF p_amount > v_invoice.total THEN
        RAISE EXCEPTION 'Refund amount cannot exceed invoice total';
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
-- admin_update_refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_update_refund(
    p_refund_id UUID,
    p_amount NUMERIC DEFAULT NULL,
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
    v_prev admin.refunds%ROWTYPE;
    v_new admin.refunds%ROWTYPE;
    v_invoice admin.invoices%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'refund:update') THEN
        RAISE EXCEPTION 'Permission denied: refund:update required';
    END IF;

    SELECT * INTO v_prev FROM admin.refunds WHERE id = p_refund_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending refunds can be edited (current status: %)', v_prev.status;
    END IF;

    IF p_amount IS NOT NULL AND p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be greater than zero';
    END IF;

    IF p_amount IS NOT NULL THEN
        SELECT * INTO v_invoice FROM admin.invoices WHERE id = v_prev.invoice_id;
        IF p_amount > v_invoice.total THEN
            RAISE EXCEPTION 'Refund amount cannot exceed invoice total';
        END IF;
    END IF;

    IF p_reason IS NOT NULL AND trim(p_reason) = '' THEN
        RAISE EXCEPTION 'reason cannot be empty';
    END IF;

    UPDATE admin.refunds
    SET amount = COALESCE(p_amount, amount),
        reason = COALESCE(NULLIF(trim(p_reason), ''), reason),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_refund_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'refund.update',
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
-- admin_cancel_refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_cancel_refund(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'refund:cancel') THEN
        RAISE EXCEPTION 'Permission denied: refund:cancel required';
    END IF;

    SELECT * INTO v_prev FROM admin.refunds WHERE id = p_refund_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending refunds can be cancelled (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.refunds
    SET status = 'cancelled',
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_refund_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'refund.cancel',
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
-- admin_approve_refund (super_admin only — does NOT set processed_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_approve_refund(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'refund:approve') THEN
        RAISE EXCEPTION 'Permission denied: refund:approve required';
    END IF;

    SELECT * INTO v_prev FROM admin.refunds WHERE id = p_refund_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending refunds can be approved (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.refunds
    SET status = 'approved',
        approved_by = v_admin_user_id,
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
-- admin_reject_refund (super_admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_reject_refund(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'refund:approve') THEN
        RAISE EXCEPTION 'Permission denied: refund:approve required';
    END IF;

    SELECT * INTO v_prev FROM admin.refunds WHERE id = p_refund_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending refunds can be rejected (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.refunds
    SET status = 'rejected',
        approved_by = v_admin_user_id,
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
-- admin_process_refund (approved → processed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.admin_process_refund(
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'refund:process') THEN
        RAISE EXCEPTION 'Permission denied: refund:process required';
    END IF;

    SELECT * INTO v_prev FROM admin.refunds WHERE id = p_refund_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;

    IF v_prev.status <> 'approved' THEN
        RAISE EXCEPTION 'Only approved refunds can be processed (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.refunds
    SET status = 'processed',
        processed_at = NOW(),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_refund_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'refund.process',
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
-- 1.3 — Permission registration
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('refund:create', 'Create Refunds', 'subscriptions', 'Create refund requests for eligible paid invoices'),
    ('refund:update', 'Edit Refunds', 'subscriptions', 'Edit pending refund requests'),
    ('refund:cancel', 'Cancel Refunds', 'subscriptions', 'Cancel pending refund requests'),
    ('refund:approve', 'Approve/Reject Refunds', 'subscriptions', 'Approve or reject pending refund requests'),
    ('refund:process', 'Process Refunds', 'subscriptions', 'Mark approved refunds as processed (payment issued)')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('super_admin', 'refund:create'),
    ('super_admin', 'refund:update'),
    ('super_admin', 'refund:cancel'),
    ('super_admin', 'refund:approve'),
    ('super_admin', 'refund:process'),
    ('system_admin', 'refund:create'),
    ('system_admin', 'refund:update'),
    ('system_admin', 'refund:cancel'),
    ('system_admin', 'refund:process')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('refund:create', 'refund:update', 'refund:cancel', 'refund:approve', 'refund:process')
ON CONFLICT (role, permission_key) DO NOTHING;

-- support_admin: read-only billing access for list/detail views
INSERT INTO admin.role_permissions (role, permission_key)
VALUES ('support_admin', 'subscriptions.billing.view')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.4 — Navigation seed update
-- ---------------------------------------------------------------------------
UPDATE admin.nav_nodes
SET roles = ARRAY['super_admin', 'system_admin', 'support_admin']::text[],
    active_paths = ARRAY['/subscriptions/refund-detail']::text[],
    updated_at = NOW()
WHERE node_key = 'subscription-billing:billing:subscriptions:refunds';

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on new RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.admin_create_refund(UUID, NUMERIC, TEXT, VARCHAR, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_update_refund(UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_cancel_refund(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_approve_refund(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_reject_refund(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.admin_process_refund(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v54: 30-day refund CRUD migration applied.';
END $$;
