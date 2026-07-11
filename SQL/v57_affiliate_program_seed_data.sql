-- ============================================================================
-- v57: Affiliate program seed data (admin DB)
-- Prerequisites: v56_affiliate_program.sql
-- Plan: projectplans/v10.0_affiliate_program_plan.md (Phase 6)
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Run: pnpm run admin:seed-affiliates
-- ============================================================================

DO $$
DECLARE
    v_super UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'affiliates'
    ) THEN
        RAISE NOTICE 'v57: admin.affiliates not found — run v56 first.';
        RETURN;
    END IF;

    SELECT id INTO v_super
    FROM admin.admin_users
    WHERE role = 'super_admin' AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    INSERT INTO admin.affiliates (
        id, code, name, email, target_system, commission_rate_pct,
        status, approved_by, approved_at, created_by, updated_by, created_at, updated_at
    )
    VALUES
        (
            'b1000001-cafe-4001-8001-aff000000001'::uuid,
            'DEMOPLATFORM01',
            'Demo Platform Partner',
            'platform-partner@demo.nidus.com',
            'platform',
            10.00,
            'active',
            v_super,
            NOW() - INTERVAL '60 days',
            v_super,
            v_super,
            NOW() - INTERVAL '65 days',
            NOW() - INTERVAL '60 days'
        ),
        (
            'b1000001-cafe-4001-8001-aff000000002'::uuid,
            'DEMOSIMULATOR01',
            'Demo Simulator Partner',
            'sim-partner@demo.nidus.com',
            'simulator',
            12.00,
            'active',
            v_super,
            NOW() - INTERVAL '45 days',
            v_super,
            v_super,
            NOW() - INTERVAL '50 days',
            NOW() - INTERVAL '45 days'
        ),
        (
            'b1000001-cafe-4001-8001-aff000000003'::uuid,
            'DEMOBOTH01',
            'Demo Both Partner',
            'both-partner@demo.nidus.com',
            'both',
            8.00,
            'active',
            v_super,
            NOW() - INTERVAL '30 days',
            v_super,
            v_super,
            NOW() - INTERVAL '35 days',
            NOW() - INTERVAL '30 days'
        ),
        (
            'b1000001-cafe-4001-8001-aff000000004'::uuid,
            'DEMOPENDING01',
            'Demo Pending Applicant',
            'pending@demo.nidus.com',
            'platform',
            10.00,
            'pending',
            NULL,
            NULL,
            NULL,
            NULL,
            NOW() - INTERVAL '1 day',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b1000001-cafe-4001-8001-aff000000005'::uuid,
            'TESTAFFILIATE',
            'Test Affiliate (E2E)',
            'test.affiliate@projectnidus.test',
            'both',
            10.00,
            'active',
            v_super,
            NOW() - INTERVAL '14 days',
            v_super,
            v_super,
            NOW() - INTERVAL '14 days',
            NOW() - INTERVAL '14 days'
        )
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        target_system = EXCLUDED.target_system,
        commission_rate_pct = EXCLUDED.commission_rate_pct,
        status = EXCLUDED.status,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO admin.affiliate_payouts (
        id, affiliate_id, period_start, period_end,
        total_clicks, total_conversions, gross_revenue, commission_rate_applied,
        commission_amount, currency, status, approved_by, approved_at, paid_at, created_by
    )
    VALUES
        (
            'b1000002-cafe-4001-8001-b00100000001'::uuid,
            'b1000001-cafe-4001-8001-aff000000001'::uuid,
            DATE '2026-06-01',
            DATE '2026-06-30',
            120,
            8,
            799.00,
            10.00,
            79.90,
            'USD',
            'paid',
            v_super,
            NOW() - INTERVAL '5 days',
            NOW() - INTERVAL '3 days',
            v_super
        ),
        (
            'b1000002-cafe-4001-8001-b00100000002'::uuid,
            'b1000001-cafe-4001-8001-aff000000001'::uuid,
            DATE '2026-05-01',
            DATE '2026-05-31',
            95,
            5,
            499.50,
            10.00,
            49.95,
            'USD',
            'paid',
            v_super,
            NOW() - INTERVAL '35 days',
            NOW() - INTERVAL '33 days',
            v_super
        ),
        (
            'b1000002-cafe-4001-8001-b00100000003'::uuid,
            'b1000001-cafe-4001-8001-aff000000002'::uuid,
            DATE '2026-06-01',
            DATE '2026-06-30',
            60,
            4,
            320.00,
            12.00,
            38.40,
            'USD',
            'approved',
            v_super,
            NOW() - INTERVAL '2 days',
            NULL,
            v_super
        ),
        (
            'b1000002-cafe-4001-8001-b00100000004'::uuid,
            'b1000001-cafe-4001-8001-aff000000003'::uuid,
            DATE '2026-06-01',
            DATE '2026-06-30',
            200,
            12,
            960.00,
            8.00,
            76.80,
            'USD',
            'pending',
            NULL,
            NULL,
            NULL,
            v_super
        )
    ON CONFLICT (id) DO UPDATE SET
        total_clicks = EXCLUDED.total_clicks,
        total_conversions = EXCLUDED.total_conversions,
        gross_revenue = EXCLUDED.gross_revenue,
        commission_amount = EXCLUDED.commission_amount,
        status = EXCLUDED.status,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        paid_at = EXCLUDED.paid_at,
        updated_at = NOW();

    RAISE NOTICE 'v57: Affiliate seed data applied (5 affiliates, 4 payouts).';
END $$;
