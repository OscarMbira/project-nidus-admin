-- ============================================================================
-- v736_06: Admin System — error management functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01, v735_02, v735_06
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.update_error_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_error_status(
    p_error_agg_id UUID,
    p_new_status TEXT,
    p_admin_user_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.error_aggregations%ROWTYPE;
    v_new admin.error_aggregations%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.edit') THEN
        RAISE EXCEPTION 'Permission denied: errors.edit required';
    END IF;

    IF p_new_status NOT IN ('new', 'acknowledged', 'investigating', 'resolved', 'ignored', 'recurring') THEN
        RAISE EXCEPTION 'Invalid error status: %', p_new_status;
    END IF;

    SELECT * INTO v_prev
    FROM admin.error_aggregations
    WHERE id = p_error_agg_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Error aggregation not found: %', p_error_agg_id;
    END IF;

    UPDATE admin.error_aggregations
    SET status = p_new_status,
        resolved_by = CASE WHEN p_new_status = 'resolved' THEN p_admin_user_id ELSE NULL END,
        resolved_at = CASE WHEN p_new_status = 'resolved' THEN NOW() ELSE NULL END,
        resolution_notes = CASE
            WHEN p_new_status = 'resolved' THEN COALESCE(p_notes, resolution_notes)
            ELSE p_notes
        END,
        updated_at = NOW()
    WHERE id = p_error_agg_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.status.update',
        'error_aggregation',
        p_error_agg_id,
        jsonb_build_object('notes', p_notes),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_error_severity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_error_severity(
    p_error_agg_id UUID,
    p_new_severity TEXT,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.error_aggregations%ROWTYPE;
    v_new admin.error_aggregations%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.edit') THEN
        RAISE EXCEPTION 'Permission denied: errors.edit required';
    END IF;

    IF p_new_severity NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid error severity: %', p_new_severity;
    END IF;

    SELECT * INTO v_prev
    FROM admin.error_aggregations
    WHERE id = p_error_agg_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Error aggregation not found: %', p_error_agg_id;
    END IF;

    UPDATE admin.error_aggregations
    SET severity = p_new_severity,
        updated_at = NOW()
    WHERE id = p_error_agg_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.severity.update',
        'error_aggregation',
        p_error_agg_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_error_alert_rule
-- p_data shape:
-- {
--   "rule_name": "...",                   -- required
--   "error_type": "api_error",
--   "page_route_pattern": "checkout",
--   "system": "platform|simulator|null",
--   "threshold_users": 3,
--   "threshold_occurrences": 10,
--   "time_window_minutes": 60,
--   "auto_ticket_priority": "high",
--   "notify_role": "support_admin",
--   "is_active": true
-- }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_error_alert_rule(
    p_data JSONB,
    p_admin_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_id UUID;
    v_rule_name TEXT;
    v_error_type TEXT;
    v_page_route_pattern TEXT;
    v_system TEXT;
    v_threshold_users INTEGER;
    v_threshold_occurrences INTEGER;
    v_time_window_minutes INTEGER;
    v_auto_ticket_priority TEXT;
    v_notify_role TEXT;
    v_is_active BOOLEAN;
    v_new admin.error_alert_rules%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.alert_rules.edit') THEN
        RAISE EXCEPTION 'Permission denied: errors.alert_rules.edit required';
    END IF;

    IF p_data IS NULL THEN
        RAISE EXCEPTION 'p_data is required';
    END IF;

    v_rule_name := trim(COALESCE(p_data->>'rule_name', ''));
    IF v_rule_name = '' THEN
        RAISE EXCEPTION 'rule_name is required';
    END IF;

    v_error_type := NULLIF(trim(COALESCE(p_data->>'error_type', '')), '');
    IF v_error_type IS NOT NULL
       AND v_error_type NOT IN ('js_error', 'api_error', 'slow_load', 'rls_error', 'route_error', 'render_error')
    THEN
        RAISE EXCEPTION 'Invalid error_type: %', v_error_type;
    END IF;

    v_page_route_pattern := NULLIF(trim(COALESCE(p_data->>'page_route_pattern', '')), '');
    v_system := NULLIF(trim(COALESCE(p_data->>'system', '')), '');
    IF v_system IS NOT NULL AND v_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid system value: %', v_system;
    END IF;

    v_threshold_users := GREATEST(COALESCE((p_data->>'threshold_users')::INTEGER, 3), 1);
    v_threshold_occurrences := GREATEST(COALESCE((p_data->>'threshold_occurrences')::INTEGER, 10), 1);
    v_time_window_minutes := GREATEST(COALESCE((p_data->>'time_window_minutes')::INTEGER, 60), 1);
    v_auto_ticket_priority := COALESCE(NULLIF(trim(p_data->>'auto_ticket_priority'), ''), 'high');
    v_notify_role := COALESCE(NULLIF(trim(p_data->>'notify_role'), ''), 'support_admin');
    v_is_active := COALESCE((p_data->>'is_active')::BOOLEAN, TRUE);

    IF v_auto_ticket_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid auto_ticket_priority: %', v_auto_ticket_priority;
    END IF;

    INSERT INTO admin.error_alert_rules (
        rule_name,
        error_type,
        page_route_pattern,
        system,
        threshold_users,
        threshold_occurrences,
        time_window_minutes,
        auto_ticket_priority,
        notify_role,
        is_active,
        created_by
    )
    VALUES (
        v_rule_name,
        v_error_type,
        v_page_route_pattern,
        v_system,
        v_threshold_users,
        v_threshold_occurrences,
        v_time_window_minutes,
        v_auto_ticket_priority,
        v_notify_role,
        v_is_active,
        p_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.error_alert_rules WHERE id = v_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.alert_rule.create',
        'error_alert_rule',
        v_id,
        NULL,
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_error_alert_rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_error_alert_rule(
    p_rule_id UUID,
    p_data JSONB,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.error_alert_rules%ROWTYPE;
    v_new admin.error_alert_rules%ROWTYPE;
    v_rule_name TEXT;
    v_error_type TEXT;
    v_page_route_pattern TEXT;
    v_system TEXT;
    v_threshold_users INTEGER;
    v_threshold_occurrences INTEGER;
    v_time_window_minutes INTEGER;
    v_auto_ticket_priority TEXT;
    v_notify_role TEXT;
    v_is_active BOOLEAN;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.alert_rules.edit') THEN
        RAISE EXCEPTION 'Permission denied: errors.alert_rules.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.error_alert_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Error alert rule not found: %', p_rule_id;
    END IF;

    IF p_data IS NULL THEN
        RAISE EXCEPTION 'p_data is required';
    END IF;

    v_rule_name := COALESCE(NULLIF(trim(p_data->>'rule_name'), ''), v_prev.rule_name);
    v_error_type := COALESCE(NULLIF(trim(p_data->>'error_type'), ''), v_prev.error_type);
    v_page_route_pattern := COALESCE(NULLIF(trim(p_data->>'page_route_pattern'), ''), v_prev.page_route_pattern);
    v_system := COALESCE(NULLIF(trim(p_data->>'system'), ''), v_prev.system);

    IF v_error_type IS NOT NULL
       AND v_error_type NOT IN ('js_error', 'api_error', 'slow_load', 'rls_error', 'route_error', 'render_error')
    THEN
        RAISE EXCEPTION 'Invalid error_type: %', v_error_type;
    END IF;

    IF v_system IS NOT NULL AND v_system NOT IN ('platform', 'simulator') THEN
        RAISE EXCEPTION 'Invalid system value: %', v_system;
    END IF;

    v_threshold_users := COALESCE((p_data->>'threshold_users')::INTEGER, v_prev.threshold_users);
    v_threshold_occurrences := COALESCE((p_data->>'threshold_occurrences')::INTEGER, v_prev.threshold_occurrences);
    v_time_window_minutes := COALESCE((p_data->>'time_window_minutes')::INTEGER, v_prev.time_window_minutes);
    v_auto_ticket_priority := COALESCE(NULLIF(trim(p_data->>'auto_ticket_priority'), ''), v_prev.auto_ticket_priority);
    v_notify_role := COALESCE(NULLIF(trim(p_data->>'notify_role'), ''), v_prev.notify_role);
    v_is_active := COALESCE((p_data->>'is_active')::BOOLEAN, v_prev.is_active);

    IF v_threshold_users < 1 OR v_threshold_occurrences < 1 OR v_time_window_minutes < 1 THEN
        RAISE EXCEPTION 'Threshold and time window values must be >= 1';
    END IF;

    IF v_auto_ticket_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION 'Invalid auto_ticket_priority: %', v_auto_ticket_priority;
    END IF;

    UPDATE admin.error_alert_rules
    SET rule_name = v_rule_name,
        error_type = v_error_type,
        page_route_pattern = v_page_route_pattern,
        system = v_system,
        threshold_users = v_threshold_users,
        threshold_occurrences = v_threshold_occurrences,
        time_window_minutes = v_time_window_minutes,
        auto_ticket_priority = v_auto_ticket_priority,
        notify_role = v_notify_role,
        is_active = v_is_active
    WHERE id = p_rule_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.alert_rule.update',
        'error_alert_rule',
        p_rule_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_error_alert_rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_error_alert_rule(
    p_rule_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.error_alert_rules%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'errors.alert_rules.edit') THEN
        RAISE EXCEPTION 'Permission denied: errors.alert_rules.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.error_alert_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Error alert rule not found: %', p_rule_id;
    END IF;

    DELETE FROM admin.error_alert_rules
    WHERE id = p_rule_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'errors.alert_rule.delete',
        'error_alert_rule',
        p_rule_id,
        NULL,
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_error_status(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_error_severity(UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_error_alert_rule(JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_error_alert_rule(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_error_alert_rule(UUID, UUID) TO authenticated, service_role;
