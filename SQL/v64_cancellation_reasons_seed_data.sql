-- ============================================================================
-- v64: Cancellation reasons seed data
-- Prerequisites: v63_cancellation_reasons.sql
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Run: pnpm run admin:seed-cancellation-reasons
-- ============================================================================

INSERT INTO admin.cancellation_reason_categories (
    id, code, label, description, sort_order, is_active
)
VALUES
    (
        'c7630001-0001-4001-8063-000000000001'::uuid,
        'too_expensive',
        'Too expensive',
        'Price sensitivity or budget constraints',
        1, TRUE
    ),
    (
        'c7630001-0001-4001-8063-000000000002'::uuid,
        'missing_features',
        'Missing features I need',
        'Product gap vs customer requirements',
        2, TRUE
    ),
    (
        'c7630001-0001-4001-8063-000000000003'::uuid,
        'switching_competitor',
        'Switching to a competitor',
        'Chose an alternative product',
        3, TRUE
    ),
    (
        'c7630001-0001-4001-8063-000000000004'::uuid,
        'no_longer_needed',
        'No longer needed',
        'Project ended or role changed',
        4, TRUE
    ),
    (
        'c7630001-0001-4001-8063-000000000005'::uuid,
        'technical_issues',
        'Too many technical issues',
        'Reliability or bug frustration',
        5, TRUE
    ),
    (
        'c7630001-0001-4001-8063-000000000006'::uuid,
        'poor_support',
        'Support was not helpful',
        'Support experience dissatisfaction',
        6, TRUE
    ),
    (
        'c7630001-0001-4001-8063-000000000007'::uuid,
        'other',
        'Other reason',
        'Catch-all with optional free text',
        7, TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

DO $$
DECLARE
    v_auth_user_id UUID;
    v_sub_platform UUID;
    v_sub_simulator UUID;
BEGIN
    SELECT au.id INTO v_auth_user_id
    FROM auth.users au
    INNER JOIN public.users u ON u.auth_user_id = au.id AND COALESCE(u.is_deleted, false) = false
    ORDER BY u.created_at
    LIMIT 1;

    IF v_auth_user_id IS NULL THEN
        SELECT id INTO v_auth_user_id FROM auth.users ORDER BY created_at LIMIT 1;
    END IF;

    IF v_auth_user_id IS NULL THEN
        RAISE NOTICE 'v64: No auth.users row — skipping demo cancellation requests.';
        RETURN;
    END IF;

    SELECT id INTO v_sub_platform
    FROM public.platform_subscriptions
    WHERE user_id = v_auth_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT id INTO v_sub_simulator
    FROM sim.simulator_subscriptions
    WHERE user_id = v_auth_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO public.cancellation_requests (
        id, user_id, subscription_id, reason_category_id, notes, target_system, created_at
    )
    VALUES
        (
            'c7640001-0001-4001-8064-000000000001'::uuid,
            v_auth_user_id, v_sub_platform,
            'c7630001-0001-4001-8063-000000000001'::uuid,
            'Annual budget review — pausing tools for Q3.',
            'platform', NOW() - INTERVAL '28 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000002'::uuid,
            v_auth_user_id, v_sub_platform,
            'c7630001-0001-4001-8063-000000000002'::uuid,
            'Need portfolio-level reporting not available yet.',
            'platform', NOW() - INTERVAL '25 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000003'::uuid,
            v_auth_user_id, NULL,
            'c7630001-0001-4001-8063-000000000003'::uuid,
            'Moving team to Monday.com.',
            'platform', NOW() - INTERVAL '22 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000004'::uuid,
            v_auth_user_id, v_sub_platform,
            'c7630001-0001-4001-8063-000000000004'::uuid,
            NULL,
            'platform', NOW() - INTERVAL '18 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000005'::uuid,
            v_auth_user_id, v_sub_simulator,
            'c7630001-0001-4001-8063-000000000005'::uuid,
            'Simulator runs timing out on large scenarios.',
            'simulator', NOW() - INTERVAL '15 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000006'::uuid,
            v_auth_user_id, v_sub_simulator,
            'c7630001-0001-4001-8063-000000000006'::uuid,
            'Ticket took 5 days for a billing question.',
            'simulator', NOW() - INTERVAL '12 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000007'::uuid,
            v_auth_user_id, NULL,
            'c7630001-0001-4001-8063-000000000001'::uuid,
            'Consolidating subscriptions under enterprise account.',
            'simulator', NOW() - INTERVAL '10 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000008'::uuid,
            v_auth_user_id, v_sub_platform,
            'c7630001-0001-4001-8063-000000000007'::uuid,
            'Temporary pause — may return next year.',
            'platform', NOW() - INTERVAL '8 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000009'::uuid,
            v_auth_user_id, v_sub_simulator,
            'c7630001-0001-4001-8063-000000000002'::uuid,
            'Wanted programme-manager scenarios only.',
            'simulator', NOW() - INTERVAL '5 days'
        ),
        (
            'c7640001-0001-4001-8064-000000000010'::uuid,
            v_auth_user_id, v_sub_platform,
            'c7630001-0001-4001-8063-000000000003'::uuid,
            'Evaluating Smartsheet for PMO team.',
            'platform', NOW() - INTERVAL '2 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        notes = EXCLUDED.notes,
        target_system = EXCLUDED.target_system,
        reason_category_id = EXCLUDED.reason_category_id;

    RAISE NOTICE 'v64: Seeded 7 categories and up to 10 demo cancellation requests.';
END $$;
