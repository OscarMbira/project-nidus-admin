-- ============================================================================
-- v40: Enterprise monthly subscription seed (companion to v38 catalog)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v14 subscription seed, v38 subscription_plans catalog
-- Idempotent: fixed UUID + ON CONFLICT (id). Safe to re-run.
--
-- v38 seeds the Enterprise plan in subscription_plans but not a subscription row.
-- This adds an active Enterprise subscription so the admin list shows it.
-- ============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_account_id UUID;
BEGIN
    SELECT ps.user_id, ps.account_id
    INTO v_user_id, v_account_id
    FROM public.platform_subscriptions ps
    WHERE ps.id = 'b7360001-0001-4000-8000-000000000006'::uuid
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SELECT ps.user_id, ps.account_id
        INTO v_user_id, v_account_id
        FROM public.platform_subscriptions ps
        ORDER BY ps.created_at NULLS LAST
        LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'v40: No platform subscription anchor user — Enterprise seed skipped.';
        RETURN;
    END IF;

    INSERT INTO public.platform_subscriptions (
        id, user_id, account_id, plan_type, status, billing_cycle,
        amount_paid, currency, started_at, expires_at, trial_end, next_billing_date,
        is_lifetime, is_trial, is_in_grace_period, grace_period_end,
        cancel_at_period_end, cancellation_reason, cancelled_at,
        base_users_per_project, custom_features, metadata, updated_at
    )
    SELECT
        'b7360001-0001-4000-8000-000000000007'::uuid,
        v_user_id,
        v_account_id,
        'enterprise',
        'active',
        'monthly',
        199.00,
        'USD',
        NOW() - INTERVAL '2 months',
        NOW() + INTERVAL '28 days',
        NULL,
        NOW() + INTERVAL '28 days',
        FALSE,
        FALSE,
        FALSE,
        NULL,
        FALSE,
        NULL,
        NULL,
        200,
        jsonb_build_object(
            'features',
            COALESCE(
                (
                    SELECT sp.features
                    FROM public.subscription_plans sp
                    WHERE sp.plan_type = 'enterprise'
                      AND sp.billing_cycle = 'monthly'
                      AND sp.is_active = TRUE
                    LIMIT 1
                ),
                '[]'::jsonb
            )
        ),
        '{"seed":"v40","label":"Active Enterprise — monthly from v38 catalog"}'::jsonb,
        NOW()
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
        next_billing_date = EXCLUDED.next_billing_date,
        base_users_per_project = EXCLUDED.base_users_per_project,
        custom_features = CASE
            WHEN platform_subscriptions.custom_features IS NULL
              OR jsonb_array_length(COALESCE(platform_subscriptions.custom_features -> 'features', '[]'::jsonb)) = 0
            THEN EXCLUDED.custom_features
            ELSE platform_subscriptions.custom_features
        END,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();

    RAISE NOTICE 'v40: Upserted Enterprise monthly platform subscription.';
END $$;

INSERT INTO admin.generated_ids (id, target_table, record_id, display_id, rule_id)
SELECT
    v.id,
    v.target_table,
    v.record_id,
    v.display_id,
    r.id
FROM (
    VALUES
        ('b2000002-0001-4001-8001-000000000005'::uuid, 'public.platform_subscriptions'::text, 'b7360001-0001-4000-8000-000000000007'::uuid, 'SUB-E7N9T42'::text)
) AS v(id, target_table, record_id, display_id)
INNER JOIN admin.id_generation_rules r
    ON r.target_table = v.target_table
   AND r.is_active = TRUE
WHERE EXISTS (
    SELECT 1
    FROM public.platform_subscriptions ps
    WHERE ps.id = v.record_id
)
ON CONFLICT (target_table, record_id) DO UPDATE SET
    display_id = EXCLUDED.display_id,
    rule_id = EXCLUDED.rule_id;
