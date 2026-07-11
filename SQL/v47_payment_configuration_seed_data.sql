-- ============================================================================
-- v47: Payment configuration seed data
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v46_payment_configuration.sql
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Plan: projectplans/v7.0_payment_configuration_plan.md (Phase 2)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Block 1 — Payment Gateways (3 rows)
-- ---------------------------------------------------------------------------
INSERT INTO admin.payment_gateways (
    id, name, provider_key, display_name, environment,
    api_key_masked, api_secret_hash, webhook_secret_hash,
    is_active, is_default, notes
) VALUES
    (
        'b7470001-0001-4001-8001-000000000001'::uuid,
        'PayNow Zimbabwe',
        'paynow',
        'PayNow',
        'sandbox',
        'int_****demo',
        encode(digest('seed-placeholder', 'sha256'), 'hex'),
        encode(digest('seed-placeholder', 'sha256'), 'hex'),
        TRUE,
        TRUE,
        'Default local gateway for Zimbabwe mobile money and bank rails'
    ),
    (
        'b7470001-0001-4001-8001-000000000002'::uuid,
        'Flutterwave Africa',
        'flutterwave',
        'Flutterwave',
        'sandbox',
        'FLW_****demo',
        encode(digest('seed-placeholder', 'sha256'), 'hex'),
        encode(digest('seed-placeholder', 'sha256'), 'hex'),
        TRUE,
        FALSE,
        'Regional gateway for Africa mobile money and cards'
    ),
    (
        'b7470001-0001-4001-8001-000000000003'::uuid,
        'Paddle Global',
        'paddle',
        'Paddle',
        'sandbox',
        'ven_****demo',
        encode(digest('seed-placeholder', 'sha256'), 'hex'),
        encode(digest('seed-placeholder', 'sha256'), 'hex'),
        TRUE,
        FALSE,
        'Global MoR gateway for cards and wallets'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    provider_key = EXCLUDED.provider_key,
    display_name = EXCLUDED.display_name,
    environment = EXCLUDED.environment,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- Ensure only PayNow is default
UPDATE admin.payment_gateways SET is_default = FALSE WHERE id <> 'b7470001-0001-4001-8001-000000000001'::uuid;
UPDATE admin.payment_gateways SET is_default = TRUE WHERE id = 'b7470001-0001-4001-8001-000000000001'::uuid;

-- ---------------------------------------------------------------------------
-- Block 2 — Payment Methods (15 rows)
-- ---------------------------------------------------------------------------
INSERT INTO admin.payment_methods (
    id, gateway_id, method_type, display_name, supported_currencies,
    min_amount, max_amount, fee_type, fee_value, display_order, is_enabled
) VALUES
    -- PayNow (5)
    ('b7470002-0002-4002-8002-000000000001'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, 'ecocash', 'EcoCash', '{USD}', 0.50, 5000, 'none', 0, 1, TRUE),
    ('b7470002-0002-4002-8002-000000000002'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, 'onemoney', 'OneMoney', '{USD}', 0.50, 2000, 'none', 0, 2, TRUE),
    ('b7470002-0002-4002-8002-000000000003'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, 'telecash', 'Telecash', '{USD}', 0.50, 1000, 'none', 0, 3, TRUE),
    ('b7470002-0002-4002-8002-000000000004'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, 'zimswitch', 'ZimSwitch', '{USD}', 1.00, 10000, 'none', 0, 4, TRUE),
    ('b7470002-0002-4002-8002-000000000005'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, 'zipit', 'ZIPIT Bank Transfer', '{USD}', 5.00, 50000, 'none', 0, 5, TRUE),
    -- Flutterwave (6)
    ('b7470002-0002-4002-8002-000000000006'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'credit_card', 'Credit / Debit Card', '{USD}', 1.00, 50000, 'percentage', 1.4, 1, TRUE),
    ('b7470002-0002-4002-8002-000000000007'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'mpesa', 'M-Pesa', '{USD}', 0.50, 3000, 'none', 0, 2, TRUE),
    ('b7470002-0002-4002-8002-000000000008'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'mtn_momo', 'MTN Mobile Money', '{USD}', 0.50, 3000, 'none', 0, 3, TRUE),
    ('b7470002-0002-4002-8002-000000000009'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'airtel_money', 'Airtel Money', '{USD}', 0.50, 2000, 'none', 0, 4, TRUE),
    ('b7470002-0002-4002-8002-000000000010'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'vodafone_cash', 'Vodafone Cash', '{USD}', 0.50, 1000, 'none', 0, 5, TRUE),
    ('b7470002-0002-4002-8002-000000000011'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'bank_transfer', 'Bank Transfer', '{USD}', 5.00, 100000, 'none', 0, 6, TRUE),
    -- Paddle (4)
    ('b7470002-0002-4002-8002-000000000012'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, 'credit_card', 'Credit / Debit Card', '{USD}', 1.00, 100000, 'percentage', 5, 1, TRUE),
    ('b7470002-0002-4002-8002-000000000013'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, 'paypal', 'PayPal', '{USD}', 1.00, 50000, 'percentage', 5, 2, TRUE),
    ('b7470002-0002-4002-8002-000000000014'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, 'apple_pay', 'Apple Pay', '{USD}', 1.00, 50000, 'percentage', 5, 3, TRUE),
    ('b7470002-0002-4002-8002-000000000015'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, 'google_pay', 'Google Pay', '{USD}', 1.00, 50000, 'percentage', 5, 4, TRUE)
ON CONFLICT (id) DO UPDATE SET
    gateway_id = EXCLUDED.gateway_id,
    method_type = EXCLUDED.method_type,
    display_name = EXCLUDED.display_name,
    supported_currencies = EXCLUDED.supported_currencies,
    min_amount = EXCLUDED.min_amount,
    max_amount = EXCLUDED.max_amount,
    fee_type = EXCLUDED.fee_type,
    fee_value = EXCLUDED.fee_value,
    display_order = EXCLUDED.display_order,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Block 3 — Method Routing (12 rows)
-- ---------------------------------------------------------------------------
INSERT INTO admin.payment_method_routing (
    id, display_label, payment_method_id, primary_gateway_id, fallback_gateway_id,
    region_scope, supported_countries, display_order, is_enabled
) VALUES
    ('b7470003-0003-4003-8003-000000000001'::uuid, 'EcoCash', 'b7470002-0002-4002-8002-000000000001'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'local', '{ZW}', 1, TRUE),
    ('b7470003-0003-4003-8003-000000000002'::uuid, 'OneMoney', 'b7470002-0002-4002-8002-000000000002'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, NULL, 'local', '{ZW}', 2, TRUE),
    ('b7470003-0003-4003-8003-000000000003'::uuid, 'Telecash', 'b7470002-0002-4002-8002-000000000003'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, NULL, 'local', '{ZW}', 3, TRUE),
    ('b7470003-0003-4003-8003-000000000004'::uuid, 'ZimSwitch', 'b7470002-0002-4002-8002-000000000004'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, NULL, 'local', '{ZW}', 4, TRUE),
    ('b7470003-0003-4003-8003-000000000005'::uuid, 'ZIPIT Bank Transfer', 'b7470002-0002-4002-8002-000000000005'::uuid, 'b7470001-0001-4001-8001-000000000001'::uuid, NULL, 'local', '{ZW}', 5, TRUE),
    ('b7470003-0003-4003-8003-000000000006'::uuid, 'M-Pesa', 'b7470002-0002-4002-8002-000000000007'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, NULL, 'africa', '{KE,TZ,MZ,CD}', 6, TRUE),
    ('b7470003-0003-4003-8003-000000000007'::uuid, 'MTN Mobile Money', 'b7470002-0002-4002-8002-000000000008'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, NULL, 'africa', '{GH,UG,RW,ZM,CM,BJ}', 7, TRUE),
    ('b7470003-0003-4003-8003-000000000008'::uuid, 'Airtel Money', 'b7470002-0002-4002-8002-000000000009'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, NULL, 'africa', '{UG,KE,TZ,ZM,RW,MW}', 8, TRUE),
    ('b7470003-0003-4003-8003-000000000009'::uuid, 'Vodafone Cash', 'b7470002-0002-4002-8002-000000000010'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, NULL, 'africa', '{GH}', 9, TRUE),
    ('b7470003-0003-4003-8003-000000000010'::uuid, 'Pay by Card', 'b7470002-0002-4002-8002-000000000006'::uuid, 'b7470001-0001-4001-8001-000000000002'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, 'global', NULL, 10, TRUE),
    ('b7470003-0003-4003-8003-000000000011'::uuid, 'PayPal', 'b7470002-0002-4002-8002-000000000013'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, NULL, 'global', NULL, 11, TRUE),
    ('b7470003-0003-4003-8003-000000000012'::uuid, 'Apple Pay / Google Pay', 'b7470002-0002-4002-8002-000000000014'::uuid, 'b7470001-0001-4001-8001-000000000003'::uuid, NULL, 'global', NULL, 12, TRUE)
ON CONFLICT (id) DO UPDATE SET
    display_label = EXCLUDED.display_label,
    payment_method_id = EXCLUDED.payment_method_id,
    primary_gateway_id = EXCLUDED.primary_gateway_id,
    fallback_gateway_id = EXCLUDED.fallback_gateway_id,
    region_scope = EXCLUDED.region_scope,
    supported_countries = EXCLUDED.supported_countries,
    display_order = EXCLUDED.display_order,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Block 4 — Promo Codes (2 rows)
-- ---------------------------------------------------------------------------
INSERT INTO admin.promo_codes (
    id, code, name, description, discount_type, discount_value, currency_code,
    max_uses, current_uses, applicable_plan_keys, valid_from, valid_until, is_active
) VALUES
    (
        'b7470004-0004-4004-8004-000000000001'::uuid,
        'WELCOME20',
        'Welcome 20% Off',
        'Standard welcome discount for new subscribers',
        'percentage',
        20,
        'USD',
        NULL,
        0,
        NULL,
        NOW() - INTERVAL '30 days',
        NULL,
        FALSE
    ),
    (
        'b7470004-0004-4004-8004-000000000002'::uuid,
        'LAUNCH50',
        'Launch 50% Off',
        'Limited launch promotion — max 100 redemptions',
        'percentage',
        50,
        'USD',
        100,
        0,
        NULL,
        NOW() - INTERVAL '7 days',
        '2026-12-31'::timestamptz,
        FALSE
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    discount_type = EXCLUDED.discount_type,
    discount_value = EXCLUDED.discount_value,
    max_uses = EXCLUDED.max_uses,
    valid_until = EXCLUDED.valid_until,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Block 5 — Payment Retry Rules (2 rows)
-- ---------------------------------------------------------------------------
INSERT INTO admin.payment_retry_rules (
    id, rule_name, gateway_id, failure_code, retry_schedule, max_attempts, is_active
) VALUES
    (
        'b7470005-0005-4005-8005-000000000001'::uuid,
        'Global Default Retry',
        NULL,
        NULL,
        '[
            {"attempt": 1, "delay_hours": 1, "notify_customer": true},
            {"attempt": 2, "delay_hours": 24, "notify_customer": true},
            {"attempt": 3, "delay_hours": 72, "notify_customer": true}
        ]'::jsonb,
        3,
        TRUE
    ),
    (
        'b7470005-0005-4005-8005-000000000002'::uuid,
        'PayNow Insufficient Funds',
        'b7470001-0001-4001-8001-000000000001'::uuid,
        'insufficient_funds',
        '[
            {"attempt": 1, "delay_hours": 2, "notify_customer": true},
            {"attempt": 2, "delay_hours": 48, "notify_customer": true}
        ]'::jsonb,
        2,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    rule_name = EXCLUDED.rule_name,
    gateway_id = EXCLUDED.gateway_id,
    failure_code = EXCLUDED.failure_code,
    retry_schedule = EXCLUDED.retry_schedule,
    max_attempts = EXCLUDED.max_attempts,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Block 6 — Settlement Accounts (3 rows)
-- ---------------------------------------------------------------------------
INSERT INTO admin.settlement_accounts (
    id, account_name, gateway_id, bank_name, account_number_masked, routing_code_masked,
    currency_code, account_type, is_default, is_active, notes
) VALUES
    (
        'b7470006-0006-4006-8006-000000000001'::uuid,
        'PayNow USD Merchant',
        'b7470001-0001-4001-8001-000000000001'::uuid,
        'Ecobank Zimbabwe',
        '****0001',
        '****0001',
        'USD',
        'merchant',
        TRUE,
        FALSE,
        'Update with real account details before activating'
    ),
    (
        'b7470006-0006-4006-8006-000000000002'::uuid,
        'Flutterwave USD Settlement',
        'b7470001-0001-4001-8001-000000000002'::uuid,
        'Flutterwave Reserve',
        '****0002',
        '****0002',
        'USD',
        'merchant',
        FALSE,
        FALSE,
        'Update with real account details before activating'
    ),
    (
        'b7470006-0006-4006-8006-000000000003'::uuid,
        'Paddle USD Settlement',
        'b7470001-0001-4001-8001-000000000003'::uuid,
        'Paddle Payments Ltd',
        '****0003',
        '****0003',
        'USD',
        'merchant',
        FALSE,
        FALSE,
        'Update with real account details before activating'
    )
ON CONFLICT (id) DO UPDATE SET
    account_name = EXCLUDED.account_name,
    gateway_id = EXCLUDED.gateway_id,
    bank_name = EXCLUDED.bank_name,
    account_number_masked = EXCLUDED.account_number_masked,
    routing_code_masked = EXCLUDED.routing_code_masked,
    currency_code = EXCLUDED.currency_code,
    account_type = EXCLUDED.account_type,
    is_default = EXCLUDED.is_default,
    is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v47: Payment configuration seed data applied.';
END $$;
