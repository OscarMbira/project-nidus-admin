-- ============================================================================
-- v135: Cancel invoice RPC
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v25 (billing)
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.cancel_invoice(
    p_invoice_id UUID,
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

    IF v_prev.status NOT IN ('draft', 'issued', 'overdue') THEN
        RAISE EXCEPTION 'Only draft, issued, or overdue invoices can be cancelled (current status: %)', v_prev.status;
    END IF;

    UPDATE admin.invoices
    SET status = 'cancelled',
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_invoice_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'invoice.cancel',
        'invoice',
        p_invoice_id,
        jsonb_build_object('invoice_number', v_new.invoice_number),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.cancel_invoice(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v135: cancel_invoice RPC applied.';
END $$;
