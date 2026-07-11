-- ============================================================================
-- v81: Publish Simulator Professional to public pricing catalog
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v80
--
-- v80 hid simulator professional (is_active = false). Saving an active paid
-- subscription must re-publish the matching catalog row for public pricing.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'subscription_plans'
    ) THEN
        RAISE NOTICE 'v81: Skipping — public.subscription_plans does not exist.';
        RETURN;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION admin.publish_subscription_plan_catalog(
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_new_price DECIMAL(10, 2),
    p_catalog_scope TEXT,
    p_admin_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_plan public.subscription_plans%ROWTYPE;
    v_catalog_plan_type TEXT;
    v_catalog_billing_cycle TEXT;
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT (
        admin.check_admin_permission(p_admin_user_id, 'subscriptions.edit')
        OR admin.check_admin_permission(p_admin_user_id, 'pricing.edit')
    ) THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit or pricing.edit required';
    END IF;

    v_catalog_plan_type := public.normalize_subscription_catalog_plan_type(p_plan_type, p_catalog_scope);
    v_catalog_billing_cycle := CASE
        WHEN p_billing_cycle = 'lifetime'
             OR v_catalog_plan_type = 'lifetime'
             OR p_plan_type LIKE 'lifetime_%'
            THEN 'lifetime'
        ELSE p_billing_cycle
    END;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE plan_type = v_catalog_plan_type
      AND billing_cycle = v_catalog_billing_cycle
      AND catalog_scope = p_catalog_scope
    ORDER BY display_order
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan catalog row not found for % / % / %',
            v_catalog_plan_type, v_catalog_billing_cycle, p_catalog_scope;
    END IF;

    PERFORM admin.sync_subscription_plan_price(
        v_catalog_plan_type,
        v_catalog_billing_cycle,
        p_new_price,
        p_admin_user_id,
        COALESCE(p_reason, 'Published plan to public pricing catalog'),
        p_catalog_scope
    );

    UPDATE public.subscription_plans
    SET is_active = TRUE,
        updated_at = NOW()
    WHERE id = v_plan.id;

    IF v_catalog_plan_type = 'professional' AND p_catalog_scope = 'simulator' THEN
        UPDATE public.subscription_plans
        SET is_popular = TRUE,
            display_order = 3,
            updated_at = NOW()
        WHERE id = v_plan.id;

        UPDATE public.subscription_plans
        SET is_popular = FALSE,
            updated_at = NOW()
        WHERE catalog_scope = 'simulator'
          AND plan_type = 'basic'
          AND billing_cycle = 'monthly';

        UPDATE public.subscription_plans
        SET display_order = 4,
            features = '[
                "Everything in Professional",
                "All scenarios (forever)",
                "All future updates",
                "No recurring fees",
                "Priority support"
            ]'::jsonb,
            updated_at = NOW()
        WHERE catalog_scope = 'simulator'
          AND plan_type = 'lifetime'
          AND billing_cycle = 'lifetime';
    END IF;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'subscription_plan.catalog_publish',
        'subscription_plan',
        v_plan.id,
        jsonb_build_object(
            'plan_type', v_catalog_plan_type,
            'billing_cycle', v_catalog_billing_cycle,
            'catalog_scope', p_catalog_scope,
            'price', p_new_price,
            'reason', p_reason
        ),
        NULL,
        jsonb_build_object('is_active', TRUE, 'price', p_new_price)
    );

    RETURN v_plan.id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.publish_subscription_plan_catalog(
    TEXT, TEXT, DECIMAL, TEXT, UUID, TEXT
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION admin.set_subscription_plan_catalog_active(
    p_plan_id UUID,
    p_is_active BOOLEAN,
    p_admin_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_plan public.subscription_plans%ROWTYPE;
    v_prev JSONB;
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT admin.check_admin_permission(p_admin_user_id, 'pricing.edit') THEN
        RAISE EXCEPTION 'Permission denied: pricing.edit required';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan not found';
    END IF;

    IF v_plan.is_active IS NOT DISTINCT FROM p_is_active THEN
        RETURN v_plan.id;
    END IF;

    v_prev := jsonb_build_object('is_active', v_plan.is_active);

    UPDATE public.subscription_plans
    SET is_active = p_is_active,
        is_popular = CASE
            WHEN p_is_active AND v_plan.plan_type = 'professional' AND v_plan.catalog_scope = 'simulator' THEN TRUE
            WHEN NOT p_is_active AND v_plan.plan_type = 'professional' AND v_plan.catalog_scope = 'simulator' THEN FALSE
            ELSE is_popular
        END,
        updated_at = NOW()
    WHERE id = p_plan_id;

    IF p_is_active AND v_plan.plan_type = 'professional' AND v_plan.catalog_scope = 'simulator' THEN
        UPDATE public.subscription_plans
        SET is_popular = FALSE,
            updated_at = NOW()
        WHERE catalog_scope = 'simulator'
          AND plan_type = 'basic'
          AND billing_cycle = 'monthly';
    END IF;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'subscription_plan.catalog_visibility',
        'subscription_plan',
        v_plan.id,
        jsonb_build_object(
            'is_active', p_is_active,
            'catalog_scope', v_plan.catalog_scope,
            'reason', p_reason
        ),
        v_prev,
        jsonb_build_object('is_active', p_is_active)
    );

    RETURN v_plan.id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.set_subscription_plan_catalog_active(UUID, BOOLEAN, UUID, TEXT)
    TO authenticated, service_role;

-- Allow price sync on inactive catalog rows (required before publish)
CREATE OR REPLACE FUNCTION admin.sync_subscription_plan_price(
    p_plan_type TEXT,
    p_billing_cycle TEXT,
    p_new_price DECIMAL(10, 2),
    p_admin_user_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_catalog_scope TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_plan public.subscription_plans%ROWTYPE;
    v_history_id UUID;
    v_affected INTEGER;
    v_prev JSONB;
    v_catalog_plan_type TEXT;
    v_catalog_billing_cycle TEXT;
    v_target_system TEXT;
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;

    IF NOT (
        admin.check_admin_permission(p_admin_user_id, 'subscriptions.edit')
        OR admin.check_admin_permission(p_admin_user_id, 'pricing.edit')
    ) THEN
        RAISE EXCEPTION 'Permission denied: subscriptions.edit or pricing.edit required';
    END IF;

    v_target_system := COALESCE(p_catalog_scope, 'platform');
    v_catalog_plan_type := public.normalize_subscription_catalog_plan_type(p_plan_type, v_target_system);
    v_catalog_billing_cycle := CASE
        WHEN p_billing_cycle = 'lifetime'
             OR v_catalog_plan_type = 'lifetime'
             OR p_plan_type LIKE 'lifetime_%'
            THEN 'lifetime'
        ELSE p_billing_cycle
    END;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE plan_type = v_catalog_plan_type
      AND billing_cycle = v_catalog_billing_cycle
      AND (
          p_catalog_scope IS NULL
          OR catalog_scope = p_catalog_scope
      )
    ORDER BY
        CASE WHEN p_catalog_scope IS NOT NULL AND catalog_scope = p_catalog_scope THEN 0 ELSE 1 END,
        display_order
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan not found for % / %', v_catalog_plan_type, v_catalog_billing_cycle;
    END IF;

    IF v_plan.price = p_new_price THEN
        RETURN v_plan.id;
    END IF;

    v_affected := admin.count_active_subscribers_for_plan(
        v_plan.plan_type,
        v_plan.billing_cycle,
        COALESCE(p_catalog_scope, v_plan.catalog_scope, 'platform')
    );

    v_prev := jsonb_build_object(
        'price', v_plan.price,
        'original_price', v_plan.original_price,
        'is_active', v_plan.is_active
    );

    UPDATE public.subscription_plans
    SET price = p_new_price,
        updated_at = NOW()
    WHERE id = v_plan.id;

    INSERT INTO admin.pricing_change_history (
        plan_id,
        target_system,
        plan_type,
        billing_cycle,
        previous_price,
        new_price,
        currency,
        effective_date,
        changed_by,
        change_reason,
        affected_subscribers_count,
        previous_values,
        new_values
    )
    VALUES (
        v_plan.id,
        COALESCE(p_catalog_scope, v_plan.catalog_scope, 'platform'),
        v_plan.plan_type,
        v_plan.billing_cycle,
        v_plan.price,
        p_new_price,
        v_plan.currency,
        NOW(),
        p_admin_user_id,
        COALESCE(p_reason, 'Synced from subscription amount'),
        v_affected,
        v_prev,
        jsonb_build_object('price', p_new_price)
    )
    RETURNING id INTO v_history_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'subscription_plan.price_sync',
        'subscription_plan',
        v_plan.id,
        jsonb_build_object(
            'subscription_plan_type', p_plan_type,
            'catalog_plan_type', v_catalog_plan_type,
            'billing_cycle', v_catalog_billing_cycle,
            'catalog_scope', v_plan.catalog_scope,
            'previous_price', v_plan.price,
            'new_price', p_new_price,
            'reason', p_reason
        ),
        v_prev,
        jsonb_build_object('price', p_new_price)
    );

    RETURN v_history_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.sync_subscription_plan_price(
    TEXT, TEXT, DECIMAL, UUID, TEXT, TEXT
) TO authenticated, service_role;

-- Backfill: active paid simulator professional subscriptions → publish catalog row
DO $$
DECLARE
    v_price DECIMAL(10, 2);
    v_admin UUID;
BEGIN
    SELECT ss.amount_paid INTO v_price
    FROM sim.simulator_subscriptions ss
    WHERE ss.plan_type = 'professional'
      AND ss.billing_cycle = 'monthly'
      AND COALESCE(ss.status, '') = 'active'
      AND ss.amount_paid IS NOT NULL
      AND ss.amount_paid > 0
    ORDER BY COALESCE(ss.started_at, ss.created_at, ss.updated_at) DESC NULLS LAST
    LIMIT 1;

    IF v_price IS NULL THEN
        RAISE NOTICE 'v81: No active paid simulator professional subscription — skip publish backfill.';
        RETURN;
    END IF;

    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        UPDATE public.subscription_plans
        SET is_active = TRUE,
            is_popular = TRUE,
            price = v_price,
            display_order = 3,
            updated_at = NOW()
        WHERE catalog_scope = 'simulator'
          AND plan_type = 'professional'
          AND billing_cycle = 'monthly';

        UPDATE public.subscription_plans
        SET is_popular = FALSE,
            updated_at = NOW()
        WHERE catalog_scope = 'simulator'
          AND plan_type = 'basic'
          AND billing_cycle = 'monthly';

        UPDATE public.subscription_plans
        SET display_order = 4,
            features = '[
                "Everything in Professional",
                "All scenarios (forever)",
                "All future updates",
                "No recurring fees",
                "Priority support"
            ]'::jsonb,
            updated_at = NOW()
        WHERE catalog_scope = 'simulator'
          AND plan_type = 'lifetime'
          AND billing_cycle = 'lifetime';

        RAISE NOTICE 'v81: Published simulator professional catalog at % (no admin user for RPC).', v_price;
        RETURN;
    END IF;

    PERFORM admin.publish_subscription_plan_catalog(
        'professional',
        'monthly',
        v_price,
        'simulator',
        v_admin,
        'Backfill: active simulator professional subscription'
    );
END $$;
