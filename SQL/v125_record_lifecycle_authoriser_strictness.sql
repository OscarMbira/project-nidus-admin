-- ============================================================================
-- v125: Tighten validate permission to assigned authorisers
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md §1
-- Prerequisites: v124_record_lifecycle_defer_apply_functions.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.transition_record_status(
    p_table_name TEXT,
    p_record_id UUID,
    p_operation TEXT,
    p_admin_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_table_qualified TEXT := admin.resolve_lifecycle_table(p_table_name);
    v_table_name TEXT := split_part(v_table_qualified, '.', 2);
    v_operation TEXT := lower(trim(COALESCE(p_operation, '')));
    v_old_row JSONB;
    v_new_row JSONB;
    v_from_status TEXT;
    v_to_status TEXT;
    v_root_record_id UUID;
    v_version INTEGER;
    v_action TEXT;
    v_log_id UUID;
    v_prev_live_price NUMERIC;
    v_new_price NUMERIC;
    v_target_system TEXT;
    v_currency TEXT;
    v_plan_type TEXT;
    v_billing_cycle TEXT;
    v_change_reason TEXT;
    v_pending admin.record_pending_changes%ROWTYPE;
    v_is_assigned_authoriser BOOLEAN;
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
            RAISE EXCEPTION 'Permission denied: active admin user required';
        END IF;
    ELSIF NOT (
        admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure')
    ) THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.authorise or lifecycle.configure required';
    END IF;

    IF v_operation NOT IN ('validate', 'delete', 'reject', 'archive', 'restore') THEN
        RAISE EXCEPTION 'Unsupported lifecycle operation: %', p_operation;
    END IF;

    IF v_operation = 'validate'
       AND v_admin_user_id IS NOT NULL
       AND NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure') THEN
        SELECT EXISTS (
            SELECT 1
            FROM admin.record_authorisers ra
            WHERE ra.table_name = v_table_name
              AND ra.authoriser_admin_user_id = v_admin_user_id
              AND ra.is_active = TRUE
        )
        INTO v_is_assigned_authoriser;

        IF NOT v_is_assigned_authoriser THEN
            RAISE EXCEPTION 'Permission denied: assigned authoriser or lifecycle.configure required to validate';
        END IF;
    END IF;

    EXECUTE format(
        'SELECT to_jsonb(t) FROM %s t WHERE t.id = $1 FOR UPDATE',
        v_table_qualified
    )
    INTO v_old_row
    USING p_record_id;

    IF v_old_row IS NULL THEN
        RAISE EXCEPTION 'Record not found in %: %', v_table_name, p_record_id;
    END IF;

    v_from_status := COALESCE(v_old_row->>'record_status', 'live');
    v_root_record_id := COALESCE((v_old_row->>'root_record_id')::uuid, p_record_id);
    v_version := COALESCE((v_old_row->>'record_version')::INTEGER, 1);

    IF v_operation = 'validate' THEN
        IF v_from_status NOT IN ('unauthorised', 'history') THEN
            RAISE EXCEPTION 'Cannot validate record from status %', v_from_status;
        END IF;
        v_to_status := 'live';
    ELSIF v_operation = 'reject' THEN
        IF v_from_status <> 'unauthorised' THEN
            RAISE EXCEPTION 'Cannot reject record from status %', v_from_status;
        END IF;
        SELECT *
        INTO v_pending
        FROM admin.record_pending_changes pc
        WHERE pc.table_name = v_table_name
          AND pc.record_id = p_record_id
        FOR UPDATE;

        v_to_status := COALESCE(v_pending.previous_status, 'live');

        IF FOUND THEN
            DELETE FROM admin.record_pending_changes WHERE id = v_pending.id;
        END IF;
    ELSIF v_operation = 'delete' THEN
        IF v_from_status NOT IN ('unauthorised', 'live') THEN
            RAISE EXCEPTION 'Cannot delete record from status %', v_from_status;
        END IF;
        v_to_status := 'history';
    ELSIF v_operation = 'archive' THEN
        IF v_from_status <> 'history' THEN
            RAISE EXCEPTION 'Cannot archive record from status %', v_from_status;
        END IF;
        v_to_status := 'archived';
    ELSE
        IF v_from_status NOT IN ('history', 'archived') THEN
            RAISE EXCEPTION 'Cannot restore record from status %', v_from_status;
        END IF;
        v_to_status := 'live';
    END IF;

    IF v_operation = 'validate' THEN
        v_pending := admin.merge_record_pending_changes(v_table_name, p_record_id);

        IF v_table_name = 'payment_gateways'
           AND v_pending.id IS NOT NULL
           AND COALESCE((v_pending.proposed_changes->>'is_default')::boolean, false) THEN
            UPDATE admin.payment_gateways
            SET is_default = FALSE,
                updated_at = NOW()
            WHERE is_default = TRUE
              AND id <> p_record_id;
        END IF;
    END IF;

    EXECUTE format(
        'UPDATE %s
         SET record_status = $1,
             authorised_by = CASE WHEN $2 IN (''validate'', ''restore'') THEN $3 ELSE authorised_by END,
             authorised_at = CASE WHEN $2 IN (''validate'', ''restore'') THEN NOW() ELSE authorised_at END,
             archived_by = CASE WHEN $2 = ''archive'' THEN $3 ELSE archived_by END,
             archived_at = CASE WHEN $2 = ''archive'' THEN NOW() ELSE archived_at END,
             updated_at = NOW()
         WHERE id = $4',
        v_table_qualified
    )
    USING v_to_status, v_operation, v_admin_user_id, p_record_id;

    EXECUTE format(
        'SELECT to_jsonb(t) FROM %s t WHERE t.id = $1',
        v_table_qualified
    )
    INTO v_new_row
    USING p_record_id;

    v_log_id := admin.lifecycle_log_transition(
        v_table_name,
        p_record_id,
        v_root_record_id,
        v_from_status,
        v_to_status,
        v_operation,
        v_admin_user_id,
        p_notes,
        v_old_row,
        v_version
    );

    IF v_table_name = 'subscription_plans' AND v_operation = 'validate' THEN
        v_new_price := NULLIF(v_new_row->>'price', '')::NUMERIC;
        v_plan_type := v_new_row->>'plan_type';
        v_billing_cycle := v_new_row->>'billing_cycle';
        v_target_system := COALESCE(v_new_row->>'catalog_scope', 'platform');
        v_currency := COALESCE(v_new_row->>'currency', 'USD');
        v_change_reason := COALESCE(NULLIF(trim(p_notes), ''), 'Validated via record lifecycle');

        EXECUTE format(
            'SELECT NULLIF(t.price::text, '''')::numeric
             FROM %s t
             WHERE t.root_record_id = $1
               AND t.id <> $2
               AND t.record_status = ''live''
             ORDER BY t.updated_at DESC
             LIMIT 1',
            v_table_qualified
        )
        INTO v_prev_live_price
        USING v_root_record_id, p_record_id;

        IF v_prev_live_price IS DISTINCT FROM v_new_price THEN
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
                p_record_id,
                v_target_system,
                v_plan_type,
                v_billing_cycle,
                COALESCE(v_prev_live_price, v_new_price),
                v_new_price,
                v_currency,
                NOW(),
                v_admin_user_id,
                v_change_reason,
                admin.count_active_subscribers_for_plan(v_plan_type, v_billing_cycle, v_target_system),
                jsonb_build_object('price', COALESCE(v_prev_live_price, v_new_price)),
                jsonb_build_object('price', v_new_price)
            );
        END IF;
    END IF;

    v_action := format('%s.lifecycle.%s', v_table_name, v_operation);
    PERFORM admin.log_admin_action(
        v_admin_user_id,
        v_action,
        v_table_name,
        p_record_id,
        jsonb_build_object(
            'operation', v_operation,
            'from_status', v_from_status,
            'to_status', v_to_status,
            'root_record_id', v_root_record_id
        ),
        v_old_row,
        v_new_row
    );

    RETURN jsonb_build_object(
        'ok', TRUE,
        'table_name', v_table_name,
        'record_id', p_record_id,
        'root_record_id', v_root_record_id,
        'operation', v_operation,
        'from_status', v_from_status,
        'to_status', v_to_status,
        'log_id', v_log_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.transition_record_status(TEXT, UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
