-- ============================================================================
-- v49: Payment events seed data
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v46, v47, v48, v14 subscription seed
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING
-- Plan: projectplans/v8.0_payment_flow_visibility_plan.md (Phases 2 & 8)
-- ============================================================================

DO $$
DECLARE
    v_paynow UUID;
    v_flutterwave UUID;
    v_paddle UUID;
    v_ecocash UUID;
    v_onemoney UUID;
    v_zimswitch UUID;
    v_mpesa UUID;
    v_mtn UUID;
    v_airtel UUID;
    v_card_fw UUID;
    v_card_pd UUID;
    v_paypal UUID;
    v_apple_pay UUID;
    v_retry_paynow UUID;
    v_settle_paynow UUID;
    v_settle_fw UUID;
    v_settle_paddle UUID;
    v_sub_a UUID := 'b7360001-0001-4000-8000-000000000001'::uuid;
    v_sub_b UUID := 'b7360001-0001-4000-8000-000000000003'::uuid;
    v_sub_c UUID := 'b7360001-0001-4000-8000-000000000004'::uuid;
    v_user_a UUID;
    v_user_b UUID;
    v_user_c UUID;
    v_day INTEGER;
    v_ts TIMESTAMPTZ;
    v_event_id UUID;
    v_sub_id UUID;
    v_i INTEGER;
BEGIN
    SELECT id INTO v_paynow FROM admin.payment_gateways WHERE provider_key = 'paynow' LIMIT 1;
    SELECT id INTO v_flutterwave FROM admin.payment_gateways WHERE provider_key = 'flutterwave' LIMIT 1;
    SELECT id INTO v_paddle FROM admin.payment_gateways WHERE provider_key = 'paddle' LIMIT 1;

    SELECT id INTO v_ecocash FROM admin.payment_methods WHERE method_type = 'ecocash' AND gateway_id = v_paynow LIMIT 1;
    SELECT id INTO v_onemoney FROM admin.payment_methods WHERE method_type = 'onemoney' AND gateway_id = v_paynow LIMIT 1;
    SELECT id INTO v_zimswitch FROM admin.payment_methods WHERE method_type = 'zimswitch' AND gateway_id = v_paynow LIMIT 1;
    SELECT id INTO v_mpesa FROM admin.payment_methods WHERE method_type = 'mpesa' AND gateway_id = v_flutterwave LIMIT 1;
    SELECT id INTO v_mtn FROM admin.payment_methods WHERE method_type = 'mtn_momo' AND gateway_id = v_flutterwave LIMIT 1;
    SELECT id INTO v_airtel FROM admin.payment_methods WHERE method_type = 'airtel_money' AND gateway_id = v_flutterwave LIMIT 1;
    SELECT id INTO v_card_fw FROM admin.payment_methods WHERE method_type = 'credit_card' AND gateway_id = v_flutterwave LIMIT 1;
    SELECT id INTO v_card_pd FROM admin.payment_methods WHERE method_type = 'credit_card' AND gateway_id = v_paddle LIMIT 1;
    SELECT id INTO v_paypal FROM admin.payment_methods WHERE method_type = 'paypal' AND gateway_id = v_paddle LIMIT 1;
    SELECT id INTO v_apple_pay FROM admin.payment_methods WHERE method_type = 'apple_pay' AND gateway_id = v_paddle LIMIT 1;

    SELECT id INTO v_retry_paynow FROM admin.payment_retry_rules WHERE failure_code = 'insufficient_funds' LIMIT 1;
    SELECT id INTO v_settle_paynow FROM admin.settlement_accounts WHERE account_name ILIKE 'PayNow%' LIMIT 1;
    SELECT id INTO v_settle_fw FROM admin.settlement_accounts WHERE account_name ILIKE 'Flutterwave%' LIMIT 1;
    SELECT id INTO v_settle_paddle FROM admin.settlement_accounts WHERE account_name ILIKE 'Paddle%' LIMIT 1;

    SELECT user_id INTO v_user_a FROM public.platform_subscriptions WHERE id = v_sub_a;
    SELECT user_id INTO v_user_b FROM public.platform_subscriptions WHERE id = v_sub_b;
    SELECT user_id INTO v_user_c FROM public.platform_subscriptions WHERE id = v_sub_c;

    IF v_paynow IS NULL OR v_ecocash IS NULL THEN
        RAISE NOTICE 'v49: v47 payment config seed required — skipped.';
        RETURN;
    END IF;

    -- -----------------------------------------------------------------------
    -- Tier 1 — Journey A (ZW EcoCash success)
    -- -----------------------------------------------------------------------
    INSERT INTO admin.payment_events (
        id, subscription_id, user_id, gateway_id, payment_method_id, event_type,
        target_system, amount, currency, country_code, attempt_number,
        transaction_id, duration_ms, created_at
    ) VALUES
        ('b7480001-0001-4001-8001-000000000001'::uuid, v_sub_a, v_user_a, v_paynow, v_ecocash, 'initiated', 'platform', 29.00, 'USD', 'ZW', 1, NULL, NULL, '2026-06-25 08:00:00+00'),
        ('b7480001-0001-4001-8001-000000000002'::uuid, v_sub_a, v_user_a, v_paynow, v_ecocash, 'success', 'platform', 29.00, 'USD', 'ZW', 1, 'PAY-ZW-2026-00891', 3102, '2026-06-25 08:00:03+00'),
        ('b7480001-0001-4001-8001-000000000003'::uuid, v_sub_a, v_user_a, v_paynow, v_ecocash, 'invoice_issued', 'platform', 29.00, 'USD', 'ZW', 1, 'PAY-ZW-2026-00891', NULL, '2026-06-25 08:00:04+00')
    ON CONFLICT (id) DO NOTHING;

    -- Journey B — KE M-Pesa retry success
    INSERT INTO admin.payment_events (
        id, subscription_id, user_id, gateway_id, payment_method_id, event_type,
        target_system, amount, currency, country_code, attempt_number,
        transaction_id, failure_code, failure_message, duration_ms, retry_rule_id, next_retry_at, created_at
    ) VALUES
        ('b7480001-0001-4001-8001-000000000004'::uuid, v_sub_b, v_user_b, v_flutterwave, v_mpesa, 'initiated', 'platform', 29.00, 'USD', 'KE', 1, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-24 14:00:00+00'),
        ('b7480001-0001-4001-8001-000000000005'::uuid, v_sub_b, v_user_b, v_flutterwave, v_mpesa, 'failed', 'platform', 29.00, 'USD', 'KE', 1, NULL, 'insufficient_funds', 'Insufficient funds', 2341, NULL, NULL, '2026-06-24 14:00:05+00'),
        ('b7480001-0001-4001-8001-000000000006'::uuid, v_sub_b, v_user_b, v_flutterwave, v_mpesa, 'retry_scheduled', 'platform', 29.00, 'USD', 'KE', 1, NULL, NULL, NULL, NULL, v_retry_paynow, '2026-06-24 15:00:00+00', '2026-06-24 14:00:05+00'),
        ('b7480001-0001-4001-8001-000000000007'::uuid, v_sub_b, v_user_b, v_flutterwave, v_mpesa, 'retry_attempt', 'platform', 29.00, 'USD', 'KE', 2, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-24 15:00:00+00'),
        ('b7480001-0001-4001-8001-000000000008'::uuid, v_sub_b, v_user_b, v_flutterwave, v_mpesa, 'success', 'platform', 29.00, 'USD', 'KE', 2, 'FLW-KE-2026-00442', NULL, NULL, 2800, NULL, NULL, '2026-06-24 15:00:04+00'),
        ('b7480001-0001-4001-8001-000000000009'::uuid, v_sub_b, v_user_b, v_flutterwave, v_mpesa, 'invoice_issued', 'platform', 29.00, 'USD', 'KE', 2, 'FLW-KE-2026-00442', NULL, NULL, NULL, NULL, NULL, '2026-06-24 15:00:05+00')
    ON CONFLICT (id) DO NOTHING;

    -- Correct Journey B rows if a prior run inserted transaction_id into failure_code
    UPDATE admin.payment_events
    SET transaction_id = 'FLW-KE-2026-00442', failure_code = NULL, failure_message = NULL, duration_ms = 2800
    WHERE id = 'b7480001-0001-4001-8001-000000000008'::uuid
      AND failure_code = 'FLW-KE-2026-00442';

    UPDATE admin.payment_events
    SET transaction_id = 'FLW-KE-2026-00442', failure_code = NULL, failure_message = NULL
    WHERE id = 'b7480001-0001-4001-8001-000000000009'::uuid
      AND failure_code = 'FLW-KE-2026-00442';

    -- Journey C — US card cancelled
    INSERT INTO admin.payment_events (
        id, subscription_id, user_id, gateway_id, payment_method_id, event_type,
        target_system, amount, currency, country_code, attempt_number,
        transaction_id, failure_code, failure_message, duration_ms, retry_rule_id, next_retry_at, created_at
    ) VALUES
        ('b7480001-0001-4001-8001-000000000010'::uuid, v_sub_c, v_user_c, v_paddle, v_card_pd, 'initiated', 'platform', 99.00, 'USD', 'US', 1, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-23 10:00:00+00'),
        ('b7480001-0001-4001-8001-000000000011'::uuid, v_sub_c, v_user_c, v_paddle, v_card_pd, 'failed', 'platform', 99.00, 'USD', 'US', 1, NULL, 'card_declined', 'Card declined', 8000, NULL, NULL, '2026-06-23 10:00:08+00'),
        ('b7480001-0001-4001-8001-000000000012'::uuid, v_sub_c, v_user_c, v_paddle, v_card_pd, 'retry_scheduled', 'platform', 99.00, 'USD', 'US', 1, NULL, NULL, NULL, NULL, v_retry_paynow, '2026-06-23 11:00:00+00', '2026-06-23 10:00:08+00'),
        ('b7480001-0001-4001-8001-000000000013'::uuid, v_sub_c, v_user_c, v_paddle, v_card_pd, 'retry_attempt', 'platform', 99.00, 'USD', 'US', 2, NULL, 'card_declined', 'Card declined', 7500, NULL, NULL, '2026-06-23 11:00:00+00'),
        ('b7480001-0001-4001-8001-000000000014'::uuid, v_sub_c, v_user_c, v_paddle, v_card_pd, 'cancelled', 'platform', 99.00, 'USD', 'US', 2, NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-23 11:00:10+00')
    ON CONFLICT (id) DO NOTHING;

    -- -----------------------------------------------------------------------
    -- Tier 2 — Historical spread (2026-05-27 .. 2026-06-26)
    -- -----------------------------------------------------------------------
    v_i := 0;

    -- A1: 14 EcoCash first-attempt successes
    FOR v_day IN 1..14 LOOP
        v_i := v_i + 1;
        v_ts := ('2026-05-27'::date + (v_day || ' days')::interval)::timestamptz + interval '9 hours';
        v_sub_id := gen_random_uuid();
        v_event_id := ('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid;

        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, attempt_number, created_at)
        VALUES (v_event_id, v_sub_id, v_paynow, v_ecocash, 'initiated', 'platform', 29.00, 'ZW', 1, v_ts)
        ON CONFLICT (id) DO NOTHING;

        v_i := v_i + 1;
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, attempt_number, transaction_id, duration_ms, created_at)
        VALUES (
            ('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid,
            v_sub_id, v_paynow, v_ecocash, 'success', 'platform', 29.00, 'ZW', 1,
            'PAY-ZW-HIST-' || v_day, 2500 + v_day * 10, v_ts + interval '3 seconds'
        )
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- A4: 4 OneMoney successes
    FOR v_day IN SELECT unnest(ARRAY[3, 9, 17, 25]::integer[]) LOOP
        v_i := v_i + 1;
        v_ts := ('2026-05-27'::date + (v_day || ' days')::interval)::timestamptz + interval '11 hours';
        v_sub_id := gen_random_uuid();
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_paynow, v_onemoney, 'initiated', 'platform', 29.00, 'ZW', v_ts)
        ON CONFLICT (id) DO NOTHING;
        v_i := v_i + 1;
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, transaction_id, duration_ms, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_paynow, v_onemoney, 'success', 'platform', 29.00, 'ZW', 'PAY-OM-' || v_day, 2200, v_ts + interval '4 seconds')
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- A5: 2 ZimSwitch at $49
    FOR v_day IN SELECT unnest(ARRAY[7, 22]::integer[]) LOOP
        v_i := v_i + 1;
        v_ts := ('2026-05-27'::date + (v_day || ' days')::interval)::timestamptz + interval '14 hours';
        v_sub_id := gen_random_uuid();
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_paynow, v_zimswitch, 'initiated', 'platform', 49.00, 'ZW', v_ts)
        ON CONFLICT (id) DO NOTHING;
        v_i := v_i + 1;
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, transaction_id, duration_ms, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_paynow, v_zimswitch, 'success', 'platform', 49.00, 'ZW', 'PAY-ZS-' || v_day, 3100, v_ts + interval '5 seconds')
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- B1: 5 KE M-Pesa successes
    FOR v_day IN 2..10 BY 2 LOOP
        v_i := v_i + 1;
        v_ts := ('2026-05-27'::date + (v_day || ' days')::interval)::timestamptz + interval '10 hours';
        v_sub_id := gen_random_uuid();
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_flutterwave, v_mpesa, 'initiated', 'platform', 29.00, 'KE', v_ts)
        ON CONFLICT (id) DO NOTHING;
        v_i := v_i + 1;
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, transaction_id, duration_ms, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_flutterwave, v_mpesa, 'success', 'platform', 29.00, 'KE', 'FLW-KE-' || v_day, 2900, v_ts + interval '4 seconds')
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- B2: 4 GH MTN
    FOR v_day IN SELECT unnest(ARRAY[4, 11, 18, 26]::integer[]) LOOP
        v_i := v_i + 1;
        v_ts := ('2026-05-27'::date + (v_day || ' days')::interval)::timestamptz + interval '12 hours';
        v_sub_id := gen_random_uuid();
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_flutterwave, v_mtn, 'initiated', 'platform', 29.00, 'GH', v_ts)
        ON CONFLICT (id) DO NOTHING;
        v_i := v_i + 1;
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, transaction_id, duration_ms, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_flutterwave, v_mtn, 'success', 'platform', 29.00, 'GH', 'FLW-GH-' || v_day, 2600, v_ts + interval '3 seconds')
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- C1: 5 US card Paddle successes
    FOR v_day IN 1..15 BY 3 LOOP
        v_i := v_i + 1;
        v_ts := ('2026-05-27'::date + (v_day || ' days')::interval)::timestamptz + interval '16 hours';
        v_sub_id := gen_random_uuid();
        INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, created_at)
        VALUES (('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid, v_sub_id, v_paddle, v_card_pd, 'initiated', 'platform', 99.00, 'US', v_ts)
        ON CONFLICT (id) DO NOTHING;
        v_i := v_i + 1;
        INSERT INTO admin.payment_events (
            id, subscription_id, gateway_id, payment_method_id, event_type, target_system,
            amount, country_code, transaction_id, duration_ms, gateway_response, created_at
        ) VALUES (
            ('b7480002-0002-4002-8002-' || lpad(v_i::text, 12, '0'))::uuid,
            v_sub_id, v_paddle, v_card_pd, 'success', 'platform', 99.00, 'US',
            'PDL-US-' || v_day, 4200,
            CASE WHEN v_day = 1 THEN jsonb_build_object(
                'settlement_account', 'Paddle USD Settlement (****0003)',
                'settlement_account_id', v_settle_paddle::text,
                'fee_amount', 4.95
            ) ELSE '{}'::jsonb END,
            v_ts + interval '6 seconds'
        )
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    -- Block E — WELCOME20 promo (override first US success if exists)
    UPDATE admin.payment_events
    SET amount = 79.20,
        gateway_response = jsonb_build_object(
            'promo_code', 'WELCOME20',
            'original_amount', 99.00,
            'discount_amount', 19.80,
            'settlement_account', 'Paddle USD Settlement (****0003)',
            'settlement_account_id', v_settle_paddle::text,
            'fee_amount', 3.96
        )
    WHERE transaction_id = 'PDL-US-1';

    -- Block F — settlement refs for PayNow + Flutterwave
    UPDATE admin.payment_events
    SET gateway_response = jsonb_build_object(
        'settlement_account', 'PayNow USD Merchant (****0001)',
        'settlement_account_id', v_settle_paynow::text,
        'fee_amount', 0.58
    )
    WHERE transaction_id = 'PAY-ZW-HIST-1';

    UPDATE admin.payment_events
    SET gateway_response = jsonb_build_object(
        'settlement_account', 'Flutterwave USD Settlement (****0002)',
        'settlement_account_id', v_settle_fw::text,
        'fee_amount', 0.41
    )
    WHERE transaction_id = 'FLW-KE-2';

    -- Block D — refunds
    INSERT INTO admin.payment_events (
        id, subscription_id, gateway_id, payment_method_id, event_type,
        target_system, amount, country_code, created_at
    ) VALUES
        ('b7480003-0003-4003-8003-000000000001'::uuid, NULL, v_paynow, v_ecocash, 'refunded', 'platform', 29.00, 'ZW', '2026-06-06 10:00:00+00'),
        ('b7480003-0003-4003-8003-000000000002'::uuid, NULL, v_paddle, v_card_pd, 'refunded', 'platform', 99.00, 'US', '2026-06-10 10:00:00+00')
    ON CONFLICT (id) DO NOTHING;

    -- A3: retry then cancelled (day 8)
    v_sub_id := 'b7480004-0004-4004-8004-000000000001'::uuid;
    v_ts := '2026-06-04 09:00:00+00';
    INSERT INTO admin.payment_events (id, subscription_id, gateway_id, payment_method_id, event_type, target_system, amount, country_code, attempt_number, created_at) VALUES
        ('b7480004-0004-4004-8004-000000000002'::uuid, v_sub_id, v_paynow, v_ecocash, 'initiated', 'platform', 29.00, 'ZW', 1, v_ts),
        ('b7480004-0004-4004-8004-000000000003'::uuid, v_sub_id, v_paynow, v_ecocash, 'failed', 'platform', 29.00, 'ZW', 1, v_ts + interval '5 seconds'),
        ('b7480004-0004-4004-8004-000000000004'::uuid, v_sub_id, v_paynow, v_ecocash, 'retry_scheduled', 'platform', 29.00, 'ZW', 1, v_ts + interval '5 seconds'),
        ('b7480004-0004-4004-8004-000000000005'::uuid, v_sub_id, v_paynow, v_ecocash, 'retry_attempt', 'platform', 29.00, 'ZW', 2, v_ts + interval '1 hour'),
        ('b7480004-0004-4004-8004-000000000006'::uuid, v_sub_id, v_paynow, v_ecocash, 'cancelled', 'platform', 29.00, 'ZW', 2, v_ts + interval '1 hour 10 seconds')
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'v49: Payment events seed data applied.';
END $$;
