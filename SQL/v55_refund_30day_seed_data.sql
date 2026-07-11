-- ============================================================================
-- v55: Refund 30-day CRUD seed data
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v25 (billing), v27 (optional base invoices), v54 (refund CRUD)
-- Plan: projectplans/v9.0_refund_30day_crud_plan.md
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- ============================================================================

DO $$
DECLARE
    v_super UUID;
    v_user_a UUID;
    v_user_c UUID;
    v_sub_a UUID := 'b7360001-0001-4000-8000-000000000001'::uuid;
    v_sub_c UUID := 'b7360001-0001-4000-8000-000000000003'::uuid;
    v_pay_a UUID := 'b7360101-0001-4000-8000-000000000002'::uuid;
    v_pay_c UUID := 'b7360101-0001-4000-8000-000000000004'::uuid;
    v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
BEGIN
    SELECT id INTO v_super
    FROM admin.admin_users
    WHERE role = 'super_admin' AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    SELECT user_id INTO v_user_a FROM public.platform_subscriptions WHERE id = v_sub_a;
    SELECT user_id INTO v_user_c FROM public.platform_subscriptions WHERE id = v_sub_c;

    IF v_user_a IS NULL THEN
        RAISE NOTICE 'v55: v14 subscription seed required — skipping refund CRUD seed.';
        RETURN;
    END IF;

    -- Refresh v27 demo invoice so it stays inside the 30-day refund window
    UPDATE admin.invoices
    SET paid_at = NOW() - INTERVAL '10 days',
        status = 'paid',
        updated_at = NOW()
    WHERE id = 'b7380027-0010-4000-8000-000000000001'::uuid;

    INSERT INTO admin.invoices (
        id, invoice_number, user_id, subscription_id, target_system, status,
        currency, subtotal, tax_amount, total, tax_rate_applied,
        issued_at, due_at, paid_at, payment_transaction_id, line_items, notes,
        created_by, updated_by, created_at
    )
    VALUES
        (
            'b7550001-0010-4001-8055-000000000001'::uuid,
            'INV-' || v_year::TEXT || '-01001',
            v_user_a,
            v_sub_a,
            'platform',
            'paid',
            'USD',
            29.00,
            0.00,
            29.00,
            NULL,
            NOW() - INTERVAL '7 days',
            NOW() - INTERVAL '5 days',
            NOW() - INTERVAL '5 days',
            v_pay_a,
            '[{"description": "Starter Monthly — recent payment", "quantity": 1, "unit_price": 29.00, "amount": 29.00}]'::jsonb,
            'Seed — eligible for refund (5 days since payment)',
            v_super,
            v_super,
            NOW() - INTERVAL '7 days'
        ),
        (
            'b7550001-0010-4001-8055-000000000002'::uuid,
            'INV-' || v_year::TEXT || '-01002',
            v_user_a,
            v_sub_a,
            'platform',
            'paid',
            'USD',
            49.00,
            0.00,
            49.00,
            NULL,
            NOW() - INTERVAL '14 days',
            NOW() - INTERVAL '12 days',
            NOW() - INTERVAL '12 days',
            v_pay_a,
            '[{"description": "Professional Monthly — mid-window", "quantity": 1, "unit_price": 49.00, "amount": 49.00}]'::jsonb,
            'Seed — eligible for refund (12 days since payment)',
            v_super,
            v_super,
            NOW() - INTERVAL '14 days'
        ),
        (
            'b7550001-0010-4001-8055-000000000003'::uuid,
            'INV-' || v_year::TEXT || '-01003',
            COALESCE(v_user_c, v_user_a),
            COALESCE(v_sub_c, v_sub_a),
            'platform',
            'paid',
            'USD',
            99.00,
            0.00,
            99.00,
            NULL,
            NOW() - INTERVAL '9 days',
            NOW() - INTERVAL '8 days',
            NOW() - INTERVAL '8 days',
            COALESCE(v_pay_c, v_pay_a),
            '[{"description": "Enterprise trial conversion", "quantity": 1, "unit_price": 99.00, "amount": 99.00}]'::jsonb,
            'Seed — rejected refund demo',
            v_super,
            v_super,
            NOW() - INTERVAL '9 days'
        ),
        (
            'b7550001-0010-4001-8055-000000000004'::uuid,
            'INV-' || v_year::TEXT || '-01004',
            v_user_a,
            v_sub_a,
            'platform',
            'paid',
            'USD',
            19.00,
            0.00,
            19.00,
            NULL,
            NOW() - INTERVAL '3 days',
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '2 days',
            v_pay_a,
            '[{"description": "Add-on module — recent", "quantity": 1, "unit_price": 19.00, "amount": 19.00}]'::jsonb,
            'Seed — cancelled refund demo',
            v_super,
            v_super,
            NOW() - INTERVAL '3 days'
        ),
        (
            'b7550001-0010-4001-8055-000000000005'::uuid,
            'INV-' || v_year::TEXT || '-01005',
            v_user_a,
            v_sub_a,
            'platform',
            'paid',
            'USD',
            49.00,
            0.00,
            49.00,
            NULL,
            NOW() - INTERVAL '40 days',
            NOW() - INTERVAL '38 days',
            NOW() - INTERVAL '35 days',
            v_pay_a,
            '[{"description": "Professional Monthly — expired refund window", "quantity": 1, "unit_price": 49.00, "amount": 49.00}]'::jsonb,
            'Seed — outside 30-day window (not shown in create dropdown)',
            v_super,
            v_super,
            NOW() - INTERVAL '40 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        status = EXCLUDED.status,
        subtotal = EXCLUDED.subtotal,
        tax_amount = EXCLUDED.tax_amount,
        total = EXCLUDED.total,
        issued_at = EXCLUDED.issued_at,
        due_at = EXCLUDED.due_at,
        paid_at = EXCLUDED.paid_at,
        payment_transaction_id = EXCLUDED.payment_transaction_id,
        line_items = EXCLUDED.line_items,
        notes = EXCLUDED.notes,
        updated_at = NOW();

    INSERT INTO admin.refunds (
        id,
        invoice_id,
        payment_transaction_id,
        amount,
        currency,
        reason,
        status,
        approved_by,
        processed_at,
        created_by,
        updated_by,
        created_at,
        updated_at
    )
    VALUES
        (
            'b7380027-0011-4000-8000-000000000001'::uuid,
            'b7380027-0010-4000-8000-000000000001'::uuid,
            v_pay_a,
            10.00,
            'USD',
            'Partial goodwill credit — processed refund demo',
            'processed',
            v_super,
            NOW() - INTERVAL '8 days',
            v_super,
            v_super,
            NOW() - INTERVAL '9 days',
            NOW() - INTERVAL '8 days'
        ),
        (
            'b7550001-0011-4001-8055-000000000001'::uuid,
            'b7550001-0010-4001-8055-000000000001'::uuid,
            v_pay_a,
            29.00,
            'USD',
            'Customer requested cancellation within trial period',
            'pending',
            NULL,
            NULL,
            v_super,
            v_super,
            NOW() - INTERVAL '1 day',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7550001-0011-4001-8055-000000000002'::uuid,
            'b7550001-0010-4001-8055-000000000002'::uuid,
            v_pay_a,
            24.50,
            'USD',
            'Partial refund — billing error on last cycle',
            'approved',
            v_super,
            NULL,
            v_super,
            v_super,
            NOW() - INTERVAL '4 days',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7550001-0011-4001-8055-000000000003'::uuid,
            'b7550001-0010-4001-8055-000000000003'::uuid,
            COALESCE(v_pay_c, v_pay_a),
            99.00,
            'USD',
            'Full refund request — duplicate subscription charge',
            'rejected',
            v_super,
            NULL,
            v_super,
            v_super,
            NOW() - INTERVAL '6 days',
            NOW() - INTERVAL '5 days'
        ),
        (
            'b7550001-0011-4001-8055-000000000004'::uuid,
            'b7550001-0010-4001-8055-000000000004'::uuid,
            v_pay_a,
            19.00,
            'USD',
            'Add-on refund — customer changed mind before activation',
            'cancelled',
            NULL,
            NULL,
            v_super,
            v_super,
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '1 day'
        )
    ON CONFLICT (id) DO UPDATE SET
        invoice_id = EXCLUDED.invoice_id,
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        reason = EXCLUDED.reason,
        status = EXCLUDED.status,
        approved_by = EXCLUDED.approved_by,
        processed_at = EXCLUDED.processed_at,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO admin.invoice_number_counters (year, last_number)
    VALUES (v_year, 1005)
    ON CONFLICT (year) DO UPDATE
    SET last_number = GREATEST(admin.invoice_number_counters.last_number, EXCLUDED.last_number);

    RAISE NOTICE 'v55: Refund CRUD seed — 5 invoices, 5 refunds (all workflow statuses).';
END $$;
