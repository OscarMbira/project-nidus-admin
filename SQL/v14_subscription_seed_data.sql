-- ============================================================================
-- v14: Logical subscription seed data (Platform + Simulator + payments)
-- PostgreSQL 15+ / Supabase
-- Prerequisites:
--   - public.users linked to auth.users (by auth_user_id or matching email)
--   - v113 subscription_plans (catalog) or v38_subscription_plans_seed_data.sql
--   - v13 subscription CRUD (optional, for admin mutations)
--
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Skips gracefully when no eligible auth users exist.
-- ============================================================================

-- Optional columns used by admin UI payment queries (v117 metadata-only base schema)
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS subscription_id UUID;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription_id
    ON public.payment_transactions(subscription_id)
    WHERE subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Resolve auth.users.id (must exist — never use stale public.users.auth_user_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._subscription_seed_auth_user(p_email_pattern TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT COALESCE(
        (
            SELECT au.id
            FROM public.users u
            INNER JOIN auth.users au ON au.id = u.auth_user_id
            WHERE COALESCE(u.is_deleted, FALSE) = FALSE
              AND (
                u.email ILIKE p_email_pattern
                OR u.full_name ILIKE p_email_pattern
              )
            ORDER BY u.created_at
            LIMIT 1
        ),
        (
            SELECT au.id
            FROM public.users u
            INNER JOIN auth.users au ON lower(trim(au.email)) = lower(trim(u.email))
            WHERE COALESCE(u.is_deleted, FALSE) = FALSE
              AND u.email IS NOT NULL
              AND (
                u.email ILIKE p_email_pattern
                OR u.full_name ILIKE p_email_pattern
              )
            ORDER BY u.created_at
            LIMIT 1
        ),
        (
            SELECT au.id
            FROM public.users u
            INNER JOIN auth.users au ON au.id = u.auth_user_id
            WHERE COALESCE(u.is_deleted, FALSE) = FALSE
            ORDER BY u.created_at
            LIMIT 1
        ),
        (
            SELECT au.id
            FROM public.users u
            INNER JOIN auth.users au ON lower(trim(au.email)) = lower(trim(u.email))
            WHERE COALESCE(u.is_deleted, FALSE) = FALSE
              AND u.email IS NOT NULL
            ORDER BY u.created_at
            LIMIT 1
        )
    );
$$;

-- Map auth user → platform_subscriptions.user_id (FK may target auth.users or public.users)
CREATE OR REPLACE FUNCTION admin._subscription_seed_platform_user_id(p_auth_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
    v_fk_schema TEXT;
    v_fk_table TEXT;
BEGIN
    IF p_auth_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT fn.nspname, fc.relname
    INTO v_fk_schema, v_fk_table
    FROM pg_constraint c
    JOIN pg_class ft ON ft.oid = c.conrelid
    JOIN pg_namespace ftn ON ftn.oid = ft.relnamespace
    JOIN pg_class fc ON fc.oid = c.confrelid
    JOIN pg_namespace fn ON fn.oid = fc.relnamespace
    WHERE ftn.nspname = 'public'
      AND ft.relname = 'platform_subscriptions'
      AND c.contype = 'f'
      AND EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = ft.oid
            AND a.attnum = ANY (c.conkey)
            AND NOT a.attisdropped
            AND a.attname = 'user_id'
      )
    ORDER BY c.conname
    LIMIT 1;

    IF v_fk_schema = 'public' AND v_fk_table = 'users' THEN
        RETURN (
            SELECT u.id
            FROM public.users u
            WHERE COALESCE(u.is_deleted, FALSE) = FALSE
              AND (
                u.auth_user_id = p_auth_user_id
                OR lower(trim(u.email)) = (
                    SELECT lower(trim(au.email))
                    FROM auth.users au
                    WHERE au.id = p_auth_user_id
                )
              )
            ORDER BY u.created_at
            LIMIT 1
        );
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_auth_user_id) THEN
        RETURN p_auth_user_id;
    END IF;

    RETURN NULL;
END;
$$;

DO $$
DECLARE
    v_auth_support UUID;
    v_auth_admin UUID;
    v_auth_second UUID;
    v_auth_third UUID;
    v_plat_support UUID;
    v_plat_admin UUID;
    v_plat_second UUID;
    v_plat_third UUID;
    v_account_support UUID;
    v_account_admin UUID;
    v_count INTEGER := 0;
BEGIN
    v_auth_support := admin._subscription_seed_auth_user('%support%');
    v_auth_admin := admin._subscription_seed_auth_user('%admin%');
    v_auth_second := admin._subscription_seed_auth_user('%oscar%');
    v_auth_third := admin._subscription_seed_auth_user('%mbira%');

    IF v_auth_second IS NULL AND v_auth_admin IS NOT NULL AND v_auth_admin IS DISTINCT FROM v_auth_support THEN
        v_auth_second := v_auth_admin;
    END IF;
    IF v_auth_third IS NULL THEN
        SELECT au.id INTO v_auth_third
        FROM auth.users au
        WHERE au.id NOT IN (v_auth_support, COALESCE(v_auth_second, v_auth_support))
        ORDER BY au.created_at
        OFFSET 1 LIMIT 1;
    END IF;

    IF v_auth_support IS NULL THEN
        RAISE NOTICE 'v14: No auth.users linked to public.users — subscription seed skipped.';
        RETURN;
    END IF;

    v_plat_support := admin._subscription_seed_platform_user_id(v_auth_support);
    v_plat_admin := admin._subscription_seed_platform_user_id(COALESCE(v_auth_admin, v_auth_support));
    v_plat_second := admin._subscription_seed_platform_user_id(COALESCE(v_auth_second, v_auth_support));
    v_plat_third := admin._subscription_seed_platform_user_id(COALESCE(v_auth_third, v_auth_support));

    IF v_plat_support IS NULL THEN
        RAISE NOTICE 'v14: Could not resolve platform_subscriptions.user_id for seed user — skipped.';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'accounts'
    ) THEN
        SELECT a.id INTO v_account_support
        FROM public.accounts a
        INNER JOIN public.users u ON u.id = a.owner_user_id
        LEFT JOIN auth.users au ON au.id = v_auth_support
        WHERE COALESCE(a.is_deleted, FALSE) = FALSE
          AND (
            u.auth_user_id = v_auth_support
            OR (au.email IS NOT NULL AND lower(trim(u.email)) = lower(trim(au.email)))
          )
        ORDER BY a.created_at
        LIMIT 1;

        SELECT a.id INTO v_account_admin
        FROM public.accounts a
        INNER JOIN public.users u ON u.id = a.owner_user_id
        LEFT JOIN auth.users au ON au.id = COALESCE(v_auth_admin, v_auth_support)
        WHERE COALESCE(a.is_deleted, FALSE) = FALSE
          AND (
            u.auth_user_id = COALESCE(v_auth_admin, v_auth_support)
            OR (au.email IS NOT NULL AND lower(trim(u.email)) = lower(trim(au.email)))
          )
        ORDER BY a.created_at
        LIMIT 1;
    END IF;

    -- -----------------------------------------------------------------------
    -- Platform subscriptions (mirrors user billing dashboard scenarios)
    -- -----------------------------------------------------------------------
    INSERT INTO public.platform_subscriptions (
        id, user_id, account_id, plan_type, status, billing_cycle,
        amount_paid, currency, started_at, expires_at, trial_end, next_billing_date,
        is_lifetime, is_trial, is_in_grace_period, grace_period_end,
        cancel_at_period_end, cancellation_reason, cancelled_at,
        base_users_per_project, metadata, updated_at
    )
    VALUES
        (
            'b7360001-0001-4000-8000-000000000001',
            v_plat_support,
            v_account_support,
            'professional',
            'active',
            'monthly',
            49.00,
            'USD',
            NOW() - INTERVAL '4 months',
            NOW() + INTERVAL '26 days',
            NULL,
            NOW() + INTERVAL '26 days',
            FALSE,
            FALSE,
            FALSE,
            NULL,
            FALSE,
            NULL,
            NULL,
            30,
            '{"seed":"v14","label":"Active Professional — primary support account"}'::jsonb,
            NOW()
        ),
        (
            'b7360001-0001-4000-8000-000000000002',
            COALESCE(v_plat_admin, v_plat_support),
            v_account_admin,
            'starter',
            'trialing',
            'monthly',
            0.00,
            'USD',
            NOW() - INTERVAL '10 days',
            NOW() + INTERVAL '20 days',
            NOW() + INTERVAL '20 days',
            NULL,
            FALSE,
            TRUE,
            FALSE,
            NULL,
            FALSE,
            NULL,
            NULL,
            20,
            '{"seed":"v14","label":"Trialing Starter — evaluation period"}'::jsonb,
            NOW()
        ),
        (
            'b7360001-0001-4000-8000-000000000003',
            COALESCE(v_plat_second, v_plat_support),
            NULL,
            'professional',
            'past_due',
            'monthly',
            49.00,
            'USD',
            NOW() - INTERVAL '2 months',
            NOW() + INTERVAL '5 days',
            NULL,
            NOW() - INTERVAL '3 days',
            FALSE,
            FALSE,
            TRUE,
            NOW() + INTERVAL '4 days',
            FALSE,
            NULL,
            NULL,
            30,
            '{"seed":"v14","label":"Past due — grace period active"}'::jsonb,
            NOW()
        ),
        (
            'b7360001-0001-4000-8000-000000000004',
            COALESCE(v_plat_third, v_plat_support),
            NULL,
            'starter',
            'cancelled',
            'monthly',
            29.00,
            'USD',
            NOW() - INTERVAL '8 months',
            NOW() - INTERVAL '1 month',
            NULL,
            NULL,
            FALSE,
            FALSE,
            FALSE,
            NULL,
            TRUE,
            'Customer switched to annual billing elsewhere',
            NOW() - INTERVAL '1 month',
            20,
            '{"seed":"v14","label":"Cancelled — end of billing period"}'::jsonb,
            NOW()
        ),
        (
            'b7360001-0001-4000-8000-000000000005',
            v_plat_support,
            v_account_support,
            'free',
            'expired',
            'monthly',
            0.00,
            'USD',
            NOW() - INTERVAL '14 months',
            NOW() - INTERVAL '12 months',
            NOW() - INTERVAL '12 months',
            NULL,
            FALSE,
            FALSE,
            FALSE,
            NULL,
            FALSE,
            'Trial expired without conversion',
            NULL,
            5,
            '{"seed":"v14","label":"Expired trial — lapsed account"}'::jsonb,
            NOW()
        ),
        (
            'b7360001-0001-4000-8000-000000000006',
            COALESCE(v_plat_admin, v_plat_support),
            v_account_admin,
            'lifetime_enterprise',
            'active',
            'lifetime',
            999.00,
            'USD',
            NOW() - INTERVAL '1 year',
            NULL,
            NULL,
            NULL,
            TRUE,
            FALSE,
            FALSE,
            NULL,
            FALSE,
            NULL,
            NULL,
            100,
            '{"seed":"v14","label":"Lifetime Enterprise — one-time purchase"}'::jsonb,
            NOW()
        )
    ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        account_id = EXCLUDED.account_id,
        plan_type = EXCLUDED.plan_type,
        status = EXCLUDED.status,
        billing_cycle = EXCLUDED.billing_cycle,
        amount_paid = EXCLUDED.amount_paid,
        currency = EXCLUDED.currency,
        started_at = EXCLUDED.started_at,
        expires_at = EXCLUDED.expires_at,
        trial_end = EXCLUDED.trial_end,
        next_billing_date = EXCLUDED.next_billing_date,
        is_lifetime = EXCLUDED.is_lifetime,
        is_trial = EXCLUDED.is_trial,
        is_in_grace_period = EXCLUDED.is_in_grace_period,
        grace_period_end = EXCLUDED.grace_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        cancellation_reason = EXCLUDED.cancellation_reason,
        cancelled_at = EXCLUDED.cancelled_at,
        base_users_per_project = EXCLUDED.base_users_per_project,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'v14: Upserted % platform subscription(s).', v_count;

    -- -----------------------------------------------------------------------
    -- Simulator subscriptions (dual-subscription model)
    -- -----------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'sim' AND table_name = 'simulator_subscriptions'
    ) THEN
        INSERT INTO sim.simulator_subscriptions (
            id, user_id, plan_type, status, billing_cycle,
            amount_paid, currency, started_at, expires_at, next_billing_date,
            is_lifetime, cancelled_at, updated_at
        )
        VALUES
            (
                'b7360002-0001-4000-8000-000000000001',
                v_auth_support,
                'basic',
                'active',
                'monthly',
                19.00,
                'USD',
                NOW() - INTERVAL '3 months',
                NOW() + INTERVAL '18 days',
                NOW() + INTERVAL '18 days',
                FALSE,
                NULL,
                NOW()
            ),
            (
                'b7360002-0001-4000-8000-000000000002',
                COALESCE(v_auth_second, v_auth_support),
                'professional',
                'trialing',
                'monthly',
                0.00,
                'USD',
                NOW() - INTERVAL '5 days',
                NOW() + INTERVAL '25 days',
                NULL,
                FALSE,
                NULL,
                NOW()
            ),
            (
                'b7360002-0001-4000-8000-000000000003',
                COALESCE(v_auth_third, v_auth_support),
                'basic',
                'cancelled',
                'monthly',
                19.00,
                'USD',
                NOW() - INTERVAL '6 months',
                NOW() - INTERVAL '2 months',
                NULL,
                FALSE,
                NOW() - INTERVAL '2 months',
                NOW()
            ),
            (
                'b7360002-0001-4000-8000-000000000004',
                COALESCE(v_auth_admin, v_auth_support),
                'lifetime_professional',
                'active',
                'lifetime',
                299.00,
                'USD',
                NOW() - INTERVAL '8 months',
                NULL,
                NULL,
                TRUE,
                NULL,
                NOW()
            )
        ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            plan_type = EXCLUDED.plan_type,
            status = EXCLUDED.status,
            billing_cycle = EXCLUDED.billing_cycle,
            amount_paid = EXCLUDED.amount_paid,
            currency = EXCLUDED.currency,
            started_at = EXCLUDED.started_at,
            expires_at = EXCLUDED.expires_at,
            next_billing_date = EXCLUDED.next_billing_date,
            is_lifetime = EXCLUDED.is_lifetime,
            cancelled_at = EXCLUDED.cancelled_at,
            updated_at = NOW();

        RAISE NOTICE 'v14: Upserted simulator subscription seed rows.';
    ELSE
        RAISE NOTICE 'v14: sim.simulator_subscriptions not found — simulator seed skipped.';
    END IF;

    -- -----------------------------------------------------------------------
    -- Payment transactions (Platform billing history tab)
    -- -----------------------------------------------------------------------
    INSERT INTO public.payment_transactions (
        id, reference, paynow_reference, amount, currency, status,
        payment_provider, payment_method, subscription_id, user_id,
        metadata, created_at, updated_at
    )
    VALUES
        (
            'b7360101-0001-4000-8000-000000000001',
            'SEED-PAY-202601-001',
            'PN-SEED-001',
            49.00,
            'USD',
            'paid',
            'paynow',
            'card',
            'b7360001-0001-4000-8000-000000000001'::uuid,
            v_auth_support,
            jsonb_build_object(
                'seed', 'v14',
                'description', 'Professional Monthly — January renewal',
                'subscription_id', 'b7360001-0001-4000-8000-000000000001',
                'user_id', v_auth_support::text,
                'plan_type', 'professional',
                'billing_cycle', 'monthly'
            ),
            NOW() - INTERVAL '30 days',
            NOW() - INTERVAL '30 days'
        ),
        (
            'b7360101-0001-4000-8000-000000000002',
            'SEED-PAY-202602-001',
            'PN-SEED-002',
            49.00,
            'USD',
            'paid',
            'paynow',
            'card',
            'b7360001-0001-4000-8000-000000000001'::uuid,
            v_auth_support,
            jsonb_build_object(
                'seed', 'v14',
                'description', 'Professional Monthly — February renewal',
                'subscription_id', 'b7360001-0001-4000-8000-000000000001',
                'user_id', v_auth_support::text,
                'plan_type', 'professional',
                'billing_cycle', 'monthly'
            ),
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7360101-0001-4000-8000-000000000003',
            'SEED-PAY-202603-FAIL',
            'PN-SEED-003',
            49.00,
            'USD',
            'failed',
            'paynow',
            'card',
            'b7360001-0001-4000-8000-000000000003'::uuid,
            COALESCE(v_auth_second, v_auth_support),
            jsonb_build_object(
                'seed', 'v14',
                'description', 'Professional Monthly — payment failed',
                'subscription_id', 'b7360001-0001-4000-8000-000000000003',
                'user_id', COALESCE(v_auth_second, v_auth_support)::text,
                'plan_type', 'professional',
                'billing_cycle', 'monthly'
            ),
            NOW() - INTERVAL '5 days',
            NOW() - INTERVAL '5 days'
        ),
        (
            'b7360101-0001-4000-8000-000000000004',
            'SEED-PAY-LIFETIME-001',
            'PN-SEED-004',
            999.00,
            'USD',
            'paid',
            'stripe',
            'card',
            'b7360001-0001-4000-8000-000000000006'::uuid,
            COALESCE(v_auth_admin, v_auth_support),
            jsonb_build_object(
                'seed', 'v14',
                'description', 'Lifetime Enterprise — one-time purchase',
                'subscription_id', 'b7360001-0001-4000-8000-000000000006',
                'user_id', COALESCE(v_auth_admin, v_auth_support)::text,
                'plan_type', 'lifetime_enterprise',
                'billing_cycle', 'lifetime'
            ),
            NOW() - INTERVAL '1 year',
            NOW() - INTERVAL '1 year'
        )
    ON CONFLICT (reference) DO UPDATE SET
        amount = EXCLUDED.amount,
        currency = EXCLUDED.currency,
        status = EXCLUDED.status,
        payment_provider = EXCLUDED.payment_provider,
        payment_method = EXCLUDED.payment_method,
        subscription_id = EXCLUDED.subscription_id,
        user_id = EXCLUDED.user_id,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();

    RAISE NOTICE 'v14: Upserted payment transaction seed rows.';

    -- -----------------------------------------------------------------------
    -- Pricing change history (admin Pricing Plans audit trail)
    -- -----------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'pricing_change_history'
    ) THEN
        INSERT INTO admin.pricing_change_history (
            id,
            plan_id,
            target_system,
            plan_type,
            billing_cycle,
            previous_price,
            new_price,
            currency,
            effective_date,
            change_reason,
            affected_subscribers_count,
            previous_values,
            new_values,
            created_at
        )
        SELECT
            'b7360201-0001-4000-8000-000000000001'::uuid,
            sp.id,
            'platform',
            sp.plan_type,
            sp.billing_cycle,
            45.00,
            sp.price,
            sp.currency,
            NOW() - INTERVAL '90 days',
            'Seed: aligned Professional monthly price with market review',
            admin.count_active_subscribers_for_plan(sp.plan_type, sp.billing_cycle, 'platform'),
            jsonb_build_object('price', 45.00),
            jsonb_build_object('price', sp.price),
            NOW() - INTERVAL '90 days'
        FROM public.subscription_plans sp
        WHERE sp.plan_type = 'professional'
          AND sp.billing_cycle = 'monthly'
          AND sp.is_active = TRUE
        LIMIT 1
        ON CONFLICT (id) DO UPDATE SET
            change_reason = EXCLUDED.change_reason,
            affected_subscribers_count = EXCLUDED.affected_subscribers_count,
            new_values = EXCLUDED.new_values;
    END IF;

    RAISE NOTICE 'v14: Subscription seed complete.';
END $$;

DROP FUNCTION IF EXISTS admin._subscription_seed_auth_user(TEXT);
DROP FUNCTION IF EXISTS admin._subscription_seed_platform_user_id(UUID);
DROP FUNCTION IF EXISTS admin._subscription_seed_user(TEXT);

COMMENT ON TABLE public.platform_subscriptions IS
    'Platform user subscriptions. Dev seed rows use metadata.seed = v14 (see SQL/v14_subscription_seed_data.sql).';
