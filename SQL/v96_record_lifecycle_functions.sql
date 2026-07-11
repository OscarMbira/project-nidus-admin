-- ============================================================================
-- v96: Record lifecycle functions (admin schema)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v95_record_lifecycle_infrastructure.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.resolve_lifecycle_table(p_table_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_table_name TEXT := lower(trim(COALESCE(p_table_name, '')));
BEGIN
    IF v_table_name IN ('public.subscription_plans', 'subscription_plans') THEN
        RETURN 'public.subscription_plans';
    ELSIF v_table_name IN ('admin.affiliates', 'affiliates') THEN
        RETURN 'admin.affiliates';
    ELSIF v_table_name IN ('admin.payment_gateways', 'payment_gateways') THEN
        RETURN 'admin.payment_gateways';
    ELSIF v_table_name IN ('admin.cancellation_reason_categories', 'cancellation_reason_categories') THEN
        RETURN 'admin.cancellation_reason_categories';
    END IF;

    RAISE EXCEPTION 'Unsupported lifecycle table: %', p_table_name;
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_lifecycle_config(
    p_table_name TEXT,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_table_name TEXT := lower(trim(COALESCE(p_table_name, '')));
    v_config JSONB;
BEGIN
    v_table_name := admin.resolve_lifecycle_table(v_table_name);

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

    SELECT to_jsonb(c)
    INTO v_config
    FROM admin.record_lifecycle_config c
    WHERE c.table_name = split_part(v_table_name, '.', 2)
      AND c.is_active = TRUE;

    RETURN COALESCE(
        v_config,
        jsonb_build_object(
            'table_name', split_part(v_table_name, '.', 2),
            'approval_enabled', FALSE,
            'level_approval_mode', 'any',
            'history_retention_days', NULL,
            'auto_archive_enabled', FALSE,
            'archive_retention_years', NULL,
            'is_active', FALSE
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_authoriser_count(p_table_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
    v_table_name TEXT := split_part(admin.resolve_lifecycle_table(p_table_name), '.', 2);
    v_count INTEGER;
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

    SELECT COUNT(*)::INTEGER
    INTO v_count
    FROM admin.record_authorisers ra
    WHERE ra.table_name = v_table_name
      AND ra.is_active = TRUE;

    RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_approval_chain(p_table_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
    v_table_name TEXT := split_part(admin.resolve_lifecycle_table(p_table_name), '.', 2);
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

    RETURN COALESCE((
        SELECT jsonb_agg(
            jsonb_build_object(
                'authoriser_id', ra.authoriser_admin_user_id,
                'approval_level', ra.approval_level,
                'role_label', ra.role_label,
                'is_active', ra.is_active
            )
            ORDER BY ra.approval_level, ra.created_at
        )
        FROM admin.record_authorisers ra
        WHERE ra.table_name = v_table_name
          AND ra.is_active = TRUE
    ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION admin.lifecycle_log_transition(
    p_table_name TEXT,
    p_record_id UUID,
    p_root_record_id UUID,
    p_from_status TEXT,
    p_to_status TEXT,
    p_operation TEXT,
    p_admin_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_snapshot_data JSONB DEFAULT NULL,
    p_version_number INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_log_id UUID;
BEGIN
    IF v_admin_user_id IS NULL
       AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    INSERT INTO admin.record_lifecycle_logs (
        table_name,
        root_record_id,
        record_id,
        from_status,
        to_status,
        operation,
        performed_by,
        reason,
        version_number,
        snapshot_data
    )
    VALUES (
        split_part(admin.resolve_lifecycle_table(p_table_name), '.', 2),
        p_root_record_id,
        p_record_id,
        p_from_status,
        p_to_status,
        lower(trim(p_operation)),
        v_admin_user_id,
        NULLIF(trim(COALESCE(p_reason, '')), ''),
        p_version_number,
        p_snapshot_data
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
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

    IF v_operation NOT IN ('validate', 'delete', 'archive', 'restore') THEN
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
    p_notes TEXT DEFAULT NULL
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
            'level_approval_mode', v_level_mode
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
            'delete',
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

CREATE OR REPLACE FUNCTION admin.get_approval_progress(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
            RAISE EXCEPTION 'Permission denied: active admin user required';
        END IF;
    ELSIF NOT (
        admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.view_all')
    ) THEN
        RAISE EXCEPTION 'Permission denied: lifecycle permission required';
    END IF;

    RETURN (
        SELECT jsonb_build_object(
            'submission_batch_id', p_batch_id,
            'table_name', MIN(ar.table_name),
            'record_id', MIN(ar.record_id),
            'root_record_id', MIN(ar.root_record_id),
            'submitted_by', MIN(ar.submitted_by),
            'submitted_at', MIN(ar.submitted_at),
            'counts', jsonb_build_object(
                'waiting', COUNT(*) FILTER (WHERE ar.status = 'waiting'),
                'pending', COUNT(*) FILTER (WHERE ar.status = 'pending'),
                'approved', COUNT(*) FILTER (WHERE ar.status = 'approved'),
                'rejected', COUNT(*) FILTER (WHERE ar.status = 'rejected'),
                'withdrawn', COUNT(*) FILTER (WHERE ar.status = 'withdrawn')
            ),
            'requests', jsonb_agg(
                jsonb_build_object(
                    'request_id', ar.id,
                    'authoriser_id', ar.authoriser_id,
                    'approval_level', ar.approval_level,
                    'role_label', ar.role_label,
                    'status', ar.status,
                    'submission_notes', ar.submission_notes,
                    'decision_notes', ar.decision_notes,
                    'submitted_at', ar.submitted_at,
                    'activated_at', ar.activated_at,
                    'decided_at', ar.decided_at
                )
                ORDER BY ar.approval_level, ar.submitted_at, ar.id
            )
        )
        FROM admin.record_authorisation_requests ar
        WHERE ar.submission_batch_id = p_batch_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_record_lifecycle_chain(
    p_table_name TEXT,
    p_root_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
    v_table_qualified TEXT := admin.resolve_lifecycle_table(p_table_name);
    v_chain JSONB;
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
            RAISE EXCEPTION 'Permission denied: active admin user required';
        END IF;
    ELSIF NOT (
        admin.check_admin_permission(v_admin_user_id, 'lifecycle.view_all')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise')
    ) THEN
        RAISE EXCEPTION 'Permission denied: lifecycle permission required';
    END IF;

    EXECUTE format(
        'SELECT jsonb_agg(to_jsonb(t) ORDER BY t.record_version DESC, t.updated_at DESC)
         FROM %s t
         WHERE t.root_record_id = $1',
        v_table_qualified
    )
    INTO v_chain
    USING p_root_record_id;

    RETURN COALESCE(v_chain, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION admin.get_current_version(
    p_table_name TEXT,
    p_root_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
    v_table_qualified TEXT := admin.resolve_lifecycle_table(p_table_name);
    v_row JSONB;
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
            RAISE EXCEPTION 'Permission denied: active admin user required';
        END IF;
    ELSIF NOT (
        admin.check_admin_permission(v_admin_user_id, 'lifecycle.view_all')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure')
        OR admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise')
    ) THEN
        RAISE EXCEPTION 'Permission denied: lifecycle permission required';
    END IF;

    EXECUTE format(
        'SELECT to_jsonb(t)
         FROM %s t
         WHERE t.root_record_id = $1
         ORDER BY
             CASE WHEN t.record_status = ''live'' THEN 0 ELSE 1 END,
             t.record_version DESC,
             t.updated_at DESC
         LIMIT 1',
        v_table_qualified
    )
    INTO v_row
    USING p_root_record_id;

    RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_lifecycle_config(
    p_table_name TEXT,
    p_approval_enabled BOOLEAN DEFAULT TRUE,
    p_level_approval_mode TEXT DEFAULT 'any',
    p_history_retention_days INTEGER DEFAULT NULL,
    p_auto_archive_enabled BOOLEAN DEFAULT FALSE,
    p_archive_retention_years INTEGER DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_table_name TEXT := split_part(admin.resolve_lifecycle_table(p_table_name), '.', 2);
    v_id UUID;
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.configure required';
    END IF;

    IF lower(trim(COALESCE(p_level_approval_mode, 'any'))) NOT IN ('any', 'all') THEN
        RAISE EXCEPTION 'level_approval_mode must be any or all';
    END IF;

    INSERT INTO admin.record_lifecycle_config (
        table_name,
        approval_enabled,
        level_approval_mode,
        history_retention_days,
        auto_archive_enabled,
        archive_retention_years,
        is_active,
        configured_by
    )
    VALUES (
        v_table_name,
        COALESCE(p_approval_enabled, TRUE),
        lower(trim(COALESCE(p_level_approval_mode, 'any'))),
        p_history_retention_days,
        COALESCE(p_auto_archive_enabled, FALSE),
        p_archive_retention_years,
        COALESCE(p_is_active, TRUE),
        v_admin_user_id
    )
    ON CONFLICT (table_name) DO UPDATE SET
        approval_enabled = EXCLUDED.approval_enabled,
        level_approval_mode = EXCLUDED.level_approval_mode,
        history_retention_days = EXCLUDED.history_retention_days,
        auto_archive_enabled = EXCLUDED.auto_archive_enabled,
        archive_retention_years = EXCLUDED.archive_retention_years,
        is_active = EXCLUDED.is_active,
        configured_by = EXCLUDED.configured_by,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_record_authoriser(
    p_table_name TEXT,
    p_authoriser_admin_user_id UUID,
    p_approval_level INTEGER DEFAULT 1,
    p_role_label TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_table_name TEXT := split_part(admin.resolve_lifecycle_table(p_table_name), '.', 2);
    v_id UUID;
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.configure required';
    END IF;

    IF p_authoriser_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'authoriser_admin_user_id is required';
    END IF;

    INSERT INTO admin.record_authorisers (
        table_name,
        authoriser_admin_user_id,
        approval_level,
        role_label,
        is_active,
        created_by
    )
    VALUES (
        v_table_name,
        p_authoriser_admin_user_id,
        GREATEST(COALESCE(p_approval_level, 1), 1),
        NULLIF(trim(COALESCE(p_role_label, '')), ''),
        COALESCE(p_is_active, TRUE),
        v_admin_user_id
    )
    ON CONFLICT (table_name, authoriser_admin_user_id) DO UPDATE SET
        approval_level = EXCLUDED.approval_level,
        role_label = EXCLUDED.role_label,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.upsert_archive_config(
    p_table_name TEXT,
    p_history_retention_days INTEGER DEFAULT NULL,
    p_auto_archive_enabled BOOLEAN DEFAULT NULL,
    p_archive_retention_years INTEGER DEFAULT NULL,
    p_override_reason TEXT DEFAULT NULL,
    p_regulatory_reference TEXT DEFAULT NULL,
    p_effective_from DATE DEFAULT CURRENT_DATE,
    p_effective_until DATE DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    v_table_name TEXT := split_part(admin.resolve_lifecycle_table(p_table_name), '.', 2);
    v_id UUID;
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.configure required';
    END IF;

    INSERT INTO admin.record_archive_config (
        table_name,
        history_retention_days,
        auto_archive_enabled,
        archive_retention_years,
        override_reason,
        regulatory_reference,
        effective_from,
        effective_until,
        is_active,
        configured_by
    )
    VALUES (
        v_table_name,
        p_history_retention_days,
        p_auto_archive_enabled,
        p_archive_retention_years,
        COALESCE(NULLIF(trim(COALESCE(p_override_reason, '')), ''), 'Lifecycle override'),
        NULLIF(trim(COALESCE(p_regulatory_reference, '')), ''),
        COALESCE(p_effective_from, CURRENT_DATE),
        p_effective_until,
        COALESCE(p_is_active, TRUE),
        v_admin_user_id
    )
    ON CONFLICT (table_name) DO UPDATE SET
        history_retention_days = EXCLUDED.history_retention_days,
        auto_archive_enabled = EXCLUDED.auto_archive_enabled,
        archive_retention_years = EXCLUDED.archive_retention_years,
        override_reason = EXCLUDED.override_reason,
        regulatory_reference = EXCLUDED.regulatory_reference,
        effective_from = EXCLUDED.effective_from,
        effective_until = EXCLUDED.effective_until,
        is_active = EXCLUDED.is_active,
        configured_by = EXCLUDED.configured_by,
        updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin.list_pending_authorisation_requests(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    request_id UUID,
    submission_batch_id UUID,
    table_name TEXT,
    root_record_id UUID,
    record_id UUID,
    approval_level INTEGER,
    role_label TEXT,
    submitted_by UUID,
    authoriser_id UUID,
    status TEXT,
    submission_notes TEXT,
    submitted_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := COALESCE(p_admin_user_id, admin.current_admin_user_id());
BEGIN
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Permission denied: active admin user required';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.authorise') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.authorise required';
    END IF;

    RETURN QUERY
    SELECT
        ar.id AS request_id,
        ar.submission_batch_id,
        ar.table_name,
        ar.root_record_id,
        ar.record_id,
        ar.approval_level,
        ar.role_label,
        ar.submitted_by,
        ar.authoriser_id,
        ar.status,
        ar.submission_notes,
        ar.submitted_at,
        ar.activated_at
    FROM admin.record_authorisation_requests ar
    WHERE ar.authoriser_id = v_admin_user_id
      AND ar.status = 'pending'
    ORDER BY ar.activated_at NULLS LAST, ar.submitted_at;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.resolve_lifecycle_table(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_lifecycle_config(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_authoriser_count(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_approval_chain(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.lifecycle_log_transition(TEXT, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, JSONB, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.submit_for_authorisation(TEXT, UUID, UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.process_authoriser_decision(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_approval_progress(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.transition_record_status(TEXT, UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_record_lifecycle_chain(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_current_version(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_lifecycle_config(TEXT, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_record_authoriser(TEXT, UUID, INTEGER, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_archive_config(TEXT, INTEGER, BOOLEAN, INTEGER, TEXT, TEXT, DATE, DATE, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.list_pending_authorisation_requests(UUID) TO authenticated, service_role;
