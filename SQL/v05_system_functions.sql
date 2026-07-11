-- ============================================================================
-- v736_05: Admin System — system settings, feature flags, maintenance functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01, v735_02, v735_04
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.update_system_setting
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_system_setting(
    p_key TEXT,
    p_value TEXT,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.system_settings%ROWTYPE;
    v_new admin.system_settings%ROWTYPE;
BEGIN
    IF trim(COALESCE(p_key, '')) = '' THEN
        RAISE EXCEPTION 'setting key is required';
    END IF;

    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.settings.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.settings.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.system_settings
    WHERE setting_key = p_key;

    IF FOUND THEN
        UPDATE admin.system_settings
        SET setting_value = COALESCE(p_value, ''),
            updated_by = p_admin_user_id,
            updated_at = NOW()
        WHERE setting_key = p_key
        RETURNING * INTO v_new;
    ELSE
        INSERT INTO admin.system_settings (
            setting_key,
            setting_value,
            setting_type,
            category,
            description,
            updated_by
        )
        VALUES (
            p_key,
            COALESCE(p_value, ''),
            'text',
            split_part(p_key, '.', 1),
            'Auto-created by admin.update_system_setting',
            p_admin_user_id
        )
        RETURNING * INTO v_new;
    END IF;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'system.settings.update',
        'system_setting',
        v_new.id,
        jsonb_build_object('setting_key', p_key),
        CASE WHEN v_prev.id IS NULL THEN NULL ELSE to_jsonb(v_prev) END,
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_feature_flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_feature_flag(
    p_key TEXT,
    p_name TEXT,
    p_description TEXT,
    p_applies_to TEXT,
    p_admin_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_id UUID;
    v_new admin.feature_flags%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.feature_flags.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.feature_flags.edit required';
    END IF;

    IF trim(COALESCE(p_key, '')) = '' OR trim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'flag key and name are required';
    END IF;

    IF p_applies_to NOT IN ('platform', 'simulator', 'both', 'admin') THEN
        RAISE EXCEPTION 'Invalid applies_to value: %', p_applies_to;
    END IF;

    INSERT INTO admin.feature_flags (
        flag_key,
        flag_name,
        description,
        applies_to,
        is_enabled,
        updated_by,
        updated_at
    )
    VALUES (
        p_key,
        p_name,
        p_description,
        p_applies_to,
        FALSE,
        p_admin_user_id,
        NOW()
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.feature_flags WHERE id = v_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'feature_flag.create',
        'feature_flag',
        v_id,
        NULL,
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.toggle_feature_flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.toggle_feature_flag(
    p_flag_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.feature_flags%ROWTYPE;
    v_new admin.feature_flags%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.feature_flags.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.feature_flags.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.feature_flags
    WHERE id = p_flag_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Feature flag not found: %', p_flag_id;
    END IF;

    UPDATE admin.feature_flags
    SET is_enabled = NOT is_enabled,
        updated_by = p_admin_user_id,
        updated_at = NOW()
    WHERE id = p_flag_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'feature_flag.toggle',
        'feature_flag',
        p_flag_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_feature_flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_feature_flag(
    p_flag_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.feature_flags%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.feature_flags.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.feature_flags.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.feature_flags
    WHERE id = p_flag_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Feature flag not found: %', p_flag_id;
    END IF;

    DELETE FROM admin.feature_flags
    WHERE id = p_flag_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'feature_flag.delete',
        'feature_flag',
        p_flag_id,
        NULL,
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_maintenance_window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_maintenance_window(
    p_target TEXT,
    p_message TEXT,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ,
    p_admin_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_id UUID;
    v_new admin.maintenance_windows%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.maintenance.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.maintenance.edit required';
    END IF;

    IF p_target NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid maintenance target: %', p_target;
    END IF;

    IF trim(COALESCE(p_message, '')) = '' THEN
        RAISE EXCEPTION 'Maintenance message is required';
    END IF;

    IF p_start IS NULL THEN
        RAISE EXCEPTION 'scheduled_start is required';
    END IF;

    IF p_end IS NOT NULL AND p_end <= p_start THEN
        RAISE EXCEPTION 'scheduled_end must be greater than scheduled_start';
    END IF;

    INSERT INTO admin.maintenance_windows (
        target_system,
        status,
        message,
        scheduled_start,
        scheduled_end,
        created_by
    )
    VALUES (
        p_target,
        'scheduled',
        p_message,
        p_start,
        p_end,
        p_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.maintenance_windows WHERE id = v_id;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'maintenance_window.create',
        'maintenance_window',
        v_id,
        NULL,
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.activate_maintenance_window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.activate_maintenance_window(
    p_window_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.maintenance_windows%ROWTYPE;
    v_new admin.maintenance_windows%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.maintenance.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.maintenance.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.maintenance_windows
    WHERE id = p_window_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance window not found: %', p_window_id;
    END IF;

    IF v_prev.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot activate maintenance window in status %', v_prev.status;
    END IF;

    UPDATE admin.maintenance_windows
    SET status = 'active',
        actual_start = COALESCE(actual_start, NOW())
    WHERE id = p_window_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'maintenance_window.activate',
        'maintenance_window',
        p_window_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.complete_maintenance_window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.complete_maintenance_window(
    p_window_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.maintenance_windows%ROWTYPE;
    v_new admin.maintenance_windows%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.maintenance.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.maintenance.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.maintenance_windows
    WHERE id = p_window_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance window not found: %', p_window_id;
    END IF;

    UPDATE admin.maintenance_windows
    SET status = 'completed',
        actual_start = COALESCE(actual_start, NOW()),
        actual_end = NOW()
    WHERE id = p_window_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'maintenance_window.complete',
        'maintenance_window',
        p_window_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.cancel_maintenance_window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.cancel_maintenance_window(
    p_window_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_prev admin.maintenance_windows%ROWTYPE;
    v_new admin.maintenance_windows%ROWTYPE;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.maintenance.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.maintenance.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.maintenance_windows
    WHERE id = p_window_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance window not found: %', p_window_id;
    END IF;

    IF v_prev.status = 'completed' THEN
        RAISE EXCEPTION 'Cannot cancel a completed maintenance window';
    END IF;

    UPDATE admin.maintenance_windows
    SET status = 'cancelled',
        actual_end = COALESCE(actual_end, NOW())
    WHERE id = p_window_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'maintenance_window.cancel',
        'maintenance_window',
        p_window_id,
        NULL,
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.toggle_maintenance_mode
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.toggle_maintenance_mode(
    p_target_system TEXT,
    p_enabled BOOLEAN,
    p_message TEXT,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_platform_prev TEXT;
    v_platform_new TEXT;
    v_platform_msg_prev TEXT;
    v_platform_msg_new TEXT;
    v_sim_prev TEXT;
    v_sim_new TEXT;
    v_sim_msg_prev TEXT;
    v_sim_msg_new TEXT;
BEGIN
    IF NOT admin.check_admin_permission(p_admin_user_id, 'system.settings.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.settings.edit required';
    END IF;

    IF p_target_system NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid target system: %', p_target_system;
    END IF;

    IF p_target_system IN ('platform', 'both') THEN
        SELECT setting_value INTO v_platform_prev
        FROM admin.system_settings
        WHERE setting_key = 'platform_maintenance_enabled';

        INSERT INTO admin.system_settings (
            setting_key, setting_value, setting_type, category, description, updated_by
        )
        VALUES (
            'platform_maintenance_enabled',
            CASE WHEN p_enabled THEN 'true' ELSE 'false' END,
            'boolean',
            'maintenance',
            'Platform maintenance mode toggle',
            p_admin_user_id
        )
        ON CONFLICT (setting_key) DO UPDATE
        SET setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        SELECT setting_value INTO v_platform_new
        FROM admin.system_settings
        WHERE setting_key = 'platform_maintenance_enabled';

        SELECT setting_value INTO v_platform_msg_prev
        FROM admin.system_settings
        WHERE setting_key = 'platform_maintenance_message';

        INSERT INTO admin.system_settings (
            setting_key, setting_value, setting_type, category, description, updated_by
        )
        VALUES (
            'platform_maintenance_message',
            COALESCE(p_message, ''),
            'text',
            'maintenance',
            'Platform maintenance mode user-facing message',
            p_admin_user_id
        )
        ON CONFLICT (setting_key) DO UPDATE
        SET setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        SELECT setting_value INTO v_platform_msg_new
        FROM admin.system_settings
        WHERE setting_key = 'platform_maintenance_message';
    END IF;

    IF p_target_system IN ('simulator', 'both') THEN
        SELECT setting_value INTO v_sim_prev
        FROM admin.system_settings
        WHERE setting_key = 'simulator_maintenance_enabled';

        INSERT INTO admin.system_settings (
            setting_key, setting_value, setting_type, category, description, updated_by
        )
        VALUES (
            'simulator_maintenance_enabled',
            CASE WHEN p_enabled THEN 'true' ELSE 'false' END,
            'boolean',
            'maintenance',
            'Simulator maintenance mode toggle',
            p_admin_user_id
        )
        ON CONFLICT (setting_key) DO UPDATE
        SET setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        SELECT setting_value INTO v_sim_new
        FROM admin.system_settings
        WHERE setting_key = 'simulator_maintenance_enabled';

        SELECT setting_value INTO v_sim_msg_prev
        FROM admin.system_settings
        WHERE setting_key = 'simulator_maintenance_message';

        INSERT INTO admin.system_settings (
            setting_key, setting_value, setting_type, category, description, updated_by
        )
        VALUES (
            'simulator_maintenance_message',
            COALESCE(p_message, ''),
            'text',
            'maintenance',
            'Simulator maintenance mode user-facing message',
            p_admin_user_id
        )
        ON CONFLICT (setting_key) DO UPDATE
        SET setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();

        SELECT setting_value INTO v_sim_msg_new
        FROM admin.system_settings
        WHERE setting_key = 'simulator_maintenance_message';
    END IF;

    PERFORM admin.log_admin_action(
        p_admin_user_id,
        'maintenance_mode.toggle',
        'system_settings',
        NULL,
        jsonb_build_object('target_system', p_target_system),
        jsonb_build_object(
            'platform_maintenance_enabled', v_platform_prev,
            'platform_maintenance_message', v_platform_msg_prev,
            'simulator_maintenance_enabled', v_sim_prev,
            'simulator_maintenance_message', v_sim_msg_prev
        ),
        jsonb_build_object(
            'enabled', p_enabled,
            'message', p_message,
            'platform_maintenance_enabled', v_platform_new,
            'platform_maintenance_message', v_platform_msg_new,
            'simulator_maintenance_enabled', v_sim_new,
            'simulator_maintenance_message', v_sim_msg_new
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.update_system_setting(TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_feature_flag(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_feature_flag(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_feature_flag(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_maintenance_window(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.activate_maintenance_window(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.complete_maintenance_window(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cancel_maintenance_window(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.toggle_maintenance_mode(TEXT, BOOLEAN, TEXT, UUID) TO authenticated, service_role;
