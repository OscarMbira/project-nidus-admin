-- ============================================================================
-- v124: Record lifecycle defer-apply functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v123_record_pending_changes_infrastructure.sql
-- Plan: projectplans/v18.0_record_lifecycle_defer_apply_plan.md
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.merge_record_pending_changes(
    p_table_name TEXT,
    p_record_id UUID
)
RETURNS admin.record_pending_changes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_table_qualified TEXT := admin.resolve_lifecycle_table(p_table_name);
    v_table_name TEXT := split_part(v_table_qualified, '.', 2);
    v_pending admin.record_pending_changes%ROWTYPE;
    v_cols_csv TEXT;
BEGIN
    SELECT *
    INTO v_pending
    FROM admin.record_pending_changes pc
    WHERE pc.table_name = v_table_name
      AND pc.record_id = p_record_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_pending.proposed_changes IS NULL
       OR v_pending.proposed_changes = '{}'::jsonb
       OR jsonb_typeof(v_pending.proposed_changes) <> 'object' THEN
        DELETE FROM admin.record_pending_changes WHERE id = v_pending.id;
        RETURN v_pending;
    END IF;

    SELECT string_agg(quote_ident(key), ', ' ORDER BY key)
    INTO v_cols_csv
    FROM jsonb_object_keys(v_pending.proposed_changes) AS key;

    IF v_cols_csv IS NOT NULL AND v_cols_csv <> '' THEN
        EXECUTE format(
            'UPDATE %s AS t
             SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%s, $1))
             WHERE t.id = $2',
            v_table_qualified,
            v_cols_csv,
            v_cols_csv,
            v_table_qualified
        )
        USING v_pending.proposed_changes, p_record_id;
    END IF;

    DELETE FROM admin.record_pending_changes WHERE id = v_pending.id;

    RETURN v_pending;
END;
$$;

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

CREATE OR REPLACE FUNCTION admin.submit_for_authorisation(
    p_table_name TEXT,
    p_record_id UUID,
    p_root_record_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_proposed_changes JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_table_qualified TEXT := admin.resolve_lifecycle_table(p_table_name);
    v_table_name TEXT := split_part(v_table_qualified, '.', 2);
    v_root_record_id UUID := COALESCE(p_root_record_id, p_record_id);
    v_batch_id UUID := gen_random_uuid();
    v_config JSONB;
    v_approval_enabled BOOLEAN;
    v_authoriser_count INTEGER;
    v_level_mode TEXT;
    v_first_level INTEGER;
    v_current_status TEXT;
    v_has_proposed_changes BOOLEAN;
BEGIN
    IF v_admin_user_id IS NULL
       AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    EXECUTE format(
        'SELECT record_status FROM %s WHERE id = $1',
        v_table_qualified
    )
    INTO v_current_status
    USING p_record_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Record not found in %: %', v_table_name, p_record_id;
    END IF;

    v_has_proposed_changes := (
        p_proposed_changes IS NOT NULL
        AND jsonb_typeof(p_proposed_changes) = 'object'
        AND p_proposed_changes <> '{}'::jsonb
    );

    IF v_has_proposed_changes THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn',
            decided_at = COALESCE(decided_at, NOW()),
            decision_notes = COALESCE(
                decision_notes,
                'Withdrawn after superseding submission'
            )
        WHERE table_name = v_table_name
          AND record_id = p_record_id
          AND status IN ('waiting', 'pending');

        INSERT INTO admin.record_pending_changes (
            table_name,
            record_id,
            root_record_id,
            submission_batch_id,
            previous_status,
            proposed_changes,
            submitted_by,
            submitted_at
        )
        VALUES (
            v_table_name,
            p_record_id,
            v_root_record_id,
            v_batch_id,
            v_current_status,
            p_proposed_changes,
            v_admin_user_id,
            NOW()
        )
        ON CONFLICT (table_name, record_id) DO UPDATE SET
            root_record_id = EXCLUDED.root_record_id,
            submission_batch_id = EXCLUDED.submission_batch_id,
            previous_status = EXCLUDED.previous_status,
            proposed_changes = EXCLUDED.proposed_changes,
            submitted_by = EXCLUDED.submitted_by,
            submitted_at = NOW();
    END IF;

    v_config := admin.get_lifecycle_config(v_table_name, v_admin_user_id);
    v_approval_enabled := COALESCE((v_config->>'approval_enabled')::BOOLEAN, FALSE);
    v_level_mode := COALESCE(v_config->>'level_approval_mode', 'any');

    SELECT COUNT(*)::INTEGER
    INTO v_authoriser_count
    FROM admin.record_authorisers ra
    WHERE ra.table_name = v_table_name
      AND ra.is_active = TRUE;

    IF NOT v_approval_enabled OR v_authoriser_count = 0 THEN
        PERFORM admin.transition_record_status(
            v_table_name,
            p_record_id,
            'validate',
            v_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Auto-validated (no active authorisers)')
        );
        RETURN v_batch_id;
    END IF;

    EXECUTE format(
        'UPDATE %s
         SET record_status = ''unauthorised'',
             authorised_by = NULL,
             authorised_at = NULL,
             updated_at = NOW()
         WHERE id = $1',
        v_table_qualified
    )
    USING p_record_id;

    PERFORM admin.lifecycle_log_transition(
        v_table_name,
        p_record_id,
        v_root_record_id,
        v_current_status,
        'unauthorised',
        'submit',
        v_admin_user_id,
        p_notes,
        NULL,
        NULL
    );

    SELECT MIN(ra.approval_level)
    INTO v_first_level
    FROM admin.record_authorisers ra
    WHERE ra.table_name = v_table_name
      AND ra.is_active = TRUE;

    INSERT INTO admin.record_authorisation_requests (
        table_name,
        root_record_id,
        record_id,
        submission_batch_id,
        submitted_by,
        authoriser_id,
        approval_level,
        role_label,
        status,
        submission_notes,
        submitted_at,
        activated_at
    )
    SELECT
        v_table_name,
        v_root_record_id,
        p_record_id,
        v_batch_id,
        v_admin_user_id,
        ra.authoriser_admin_user_id,
        ra.approval_level,
        ra.role_label,
        CASE WHEN ra.approval_level = v_first_level THEN 'pending' ELSE 'waiting' END,
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        NOW(),
        CASE WHEN ra.approval_level = v_first_level THEN NOW() ELSE NULL END
    FROM admin.record_authorisers ra
    WHERE ra.table_name = v_table_name
      AND ra.is_active = TRUE;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        format('%s.lifecycle.submit', v_table_name),
        v_table_name,
        p_record_id,
        jsonb_build_object(
            'submission_batch_id', v_batch_id,
            'authoriser_count', v_authoriser_count,
            'level_approval_mode', v_level_mode,
            'proposed_changes', COALESCE(p_proposed_changes, '{}'::jsonb)
        ),
        NULL,
        NULL
    );

    RETURN v_batch_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.process_authoriser_decision(
    p_request_id UUID,
    p_decision TEXT,
    p_notes TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_decision TEXT := lower(trim(COALESCE(p_decision, '')));
    v_request admin.record_authorisation_requests%ROWTYPE;
    v_table_name TEXT;
    v_level_mode TEXT := 'any';
    v_batch_pending INTEGER;
    v_same_level_pending INTEGER;
    v_next_level INTEGER;
    v_result JSONB;
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.authorise required';
    END IF;

    IF v_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected';
    END IF;

    SELECT *
    INTO v_request
    FROM admin.record_authorisation_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Authorisation request not found: %', p_request_id;
    END IF;

    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'Authorisation request is not pending (current: %)', v_request.status;
    END IF;

    IF v_request.authoriser_id <> v_admin_user_id THEN
        RAISE EXCEPTION 'Only assigned authoriser can decide this request';
    END IF;

    v_table_name := v_request.table_name;
    v_level_mode := COALESCE((
        SELECT c.level_approval_mode
        FROM admin.record_lifecycle_config c
        WHERE c.table_name = v_table_name
          AND c.is_active = TRUE
        LIMIT 1
    ), 'any');

    UPDATE admin.record_authorisation_requests
    SET status = v_decision,
        decision_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
        decided_at = NOW()
    WHERE id = v_request.id;

    IF v_decision = 'rejected' THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn',
            decided_at = NOW(),
            decision_notes = COALESCE(
                decision_notes,
                'Withdrawn after rejection'
            )
        WHERE submission_batch_id = v_request.submission_batch_id
          AND id <> v_request.id
          AND status IN ('waiting', 'pending');

        v_result := admin.transition_record_status(
            v_table_name,
            v_request.record_id,
            'reject',
            v_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Rejected by authoriser')
        );

        RETURN jsonb_build_object(
            'ok', TRUE,
            'request_id', p_request_id,
            'decision', v_decision,
            'submission_batch_id', v_request.submission_batch_id,
            'transition', v_result
        );
    END IF;

    IF v_level_mode = 'any' THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'withdrawn',
            decided_at = NOW(),
            decision_notes = COALESCE(decision_notes, 'Superseded by same-level approval')
        WHERE submission_batch_id = v_request.submission_batch_id
          AND approval_level = v_request.approval_level
          AND id <> v_request.id
          AND status = 'pending';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_same_level_pending
    FROM admin.record_authorisation_requests ar
    WHERE ar.submission_batch_id = v_request.submission_batch_id
      AND ar.approval_level = v_request.approval_level
      AND ar.status = 'pending';

    IF v_level_mode = 'all' AND v_same_level_pending > 0 THEN
        RETURN jsonb_build_object(
            'ok', TRUE,
            'request_id', p_request_id,
            'decision', v_decision,
            'submission_batch_id', v_request.submission_batch_id,
            'waiting_for_same_level', v_same_level_pending
        );
    END IF;

    SELECT MIN(ar.approval_level)
    INTO v_next_level
    FROM admin.record_authorisation_requests ar
    WHERE ar.submission_batch_id = v_request.submission_batch_id
      AND ar.status = 'waiting';

    IF v_next_level IS NOT NULL THEN
        UPDATE admin.record_authorisation_requests
        SET status = 'pending',
            activated_at = COALESCE(activated_at, NOW())
        WHERE submission_batch_id = v_request.submission_batch_id
          AND approval_level = v_next_level
          AND status = 'waiting';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_batch_pending
    FROM admin.record_authorisation_requests ar
    WHERE ar.submission_batch_id = v_request.submission_batch_id
      AND ar.status IN ('waiting', 'pending');

    IF v_batch_pending = 0 THEN
        v_result := admin.transition_record_status(
            v_table_name,
            v_request.record_id,
            'validate',
            v_admin_user_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Approved by authoriser')
        );
    ELSE
        v_result := jsonb_build_object('ok', TRUE, 'message', 'Awaiting further approvals');
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'request_id', p_request_id,
        'decision', v_decision,
        'submission_batch_id', v_request.submission_batch_id,
        'pending_remaining', v_batch_pending,
        'transition', v_result
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_pending_changes(
    p_table_name TEXT,
    p_record_id UUID,
    p_admin_user_id UUID DEFAULT NULL
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
    v_pending admin.record_pending_changes%ROWTYPE;
    v_row JSONB;
    v_current_values JSONB := '{}'::jsonb;
    v_key TEXT;
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
            RAISE EXCEPTION 'Permission denied: active admin user required';
        END IF;
    ELSIF NOT (
        admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.view_all')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise')
    ) THEN
        RAISE EXCEPTION 'Permission denied: lifecycle permission required';
    END IF;

    SELECT *
    INTO v_pending
    FROM admin.record_pending_changes pc
    WHERE pc.table_name = v_table_name
      AND pc.record_id = p_record_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    EXECUTE format(
        'SELECT to_jsonb(t) FROM %s t WHERE t.id = $1',
        v_table_qualified
    )
    INTO v_row
    USING p_record_id;

    IF v_row IS NOT NULL AND jsonb_typeof(v_pending.proposed_changes) = 'object' THEN
        FOR v_key IN SELECT jsonb_object_keys(v_pending.proposed_changes)
        LOOP
            v_current_values := v_current_values || jsonb_build_object(v_key, v_row->v_key);
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'previous_status', v_pending.previous_status,
        'proposed_changes', v_pending.proposed_changes,
        'current_values', v_current_values,
        'submitted_by', v_pending.submitted_by,
        'submitted_at', v_pending.submitted_at,
        'submission_batch_id', v_pending.submission_batch_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin.merge_record_pending_changes(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.submit_for_authorisation(TEXT, UUID, UUID, UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.process_authoriser_decision(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.transition_record_status(TEXT, UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_pending_changes(TEXT, UUID, UUID) TO authenticated, service_role;
