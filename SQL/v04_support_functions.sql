-- ============================================================================
-- v736_04: Support & Announcement RPC Functions
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_01_admin_schema.sql, v735_02_admin_auth_functions.sql, v735_05_admin_support_tables.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.create_ticket_reply
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_ticket_reply(
    p_ticket_id UUID,
    p_admin_user_id UUID,
    p_message TEXT,
    p_is_internal BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_message_id UUID;
    v_ticket_prev JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'support.tickets.manage') THEN
        RAISE EXCEPTION 'Permission denied: support.tickets.manage required';
    END IF;

    IF p_message IS NULL OR trim(p_message) = '' THEN
        RAISE EXCEPTION 'Ticket reply message is required';
    END IF;

    SELECT to_jsonb(t.*)
    INTO v_ticket_prev
    FROM admin.support_tickets t
    WHERE t.id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support ticket not found: %', p_ticket_id;
    END IF;

    INSERT INTO admin.ticket_messages (
        ticket_id,
        sender_type,
        sender_admin_id,
        message_body,
        is_internal
    )
    VALUES (
        p_ticket_id,
        'admin',
        v_admin_user_id,
        trim(p_message),
        COALESCE(p_is_internal, FALSE)
    )
    RETURNING id INTO v_message_id;

    UPDATE admin.support_tickets
    SET status = CASE
            WHEN status IN ('open', 'waiting_user') THEN 'in_progress'
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'support.tickets.reply',
        'support_ticket',
        p_ticket_id,
        jsonb_build_object(
            'ticket_message_id', v_message_id,
            'is_internal', COALESCE(p_is_internal, FALSE)
        ),
        v_ticket_prev,
        jsonb_build_object('status', 'in_progress')
    );

    RETURN v_message_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_ticket_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_ticket_status(
    p_ticket_id UUID,
    p_admin_user_id UUID,
    p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'support.tickets.manage') THEN
        RAISE EXCEPTION 'Permission denied: support.tickets.manage required';
    END IF;

    IF p_new_status NOT IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed') THEN
        RAISE EXCEPTION 'Invalid ticket status: %', p_new_status;
    END IF;

    SELECT to_jsonb(t.*)
    INTO v_prev
    FROM admin.support_tickets t
    WHERE t.id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support ticket not found: %', p_ticket_id;
    END IF;

    UPDATE admin.support_tickets
    SET status = p_new_status,
        resolved_at = CASE WHEN p_new_status IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END,
        resolved_by = CASE WHEN p_new_status IN ('resolved', 'closed') THEN v_admin_user_id ELSE resolved_by END,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'support.tickets.status.update',
        'support_ticket',
        p_ticket_id,
        NULL,
        v_prev,
        jsonb_build_object('status', p_new_status)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.assign_ticket
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.assign_ticket(
    p_ticket_id UUID,
    p_admin_user_id UUID,
    p_assigned_to_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'support.tickets.assign') THEN
        RAISE EXCEPTION 'Permission denied: support.tickets.assign required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM admin.admin_users au
        WHERE au.id = p_assigned_to_id
          AND au.activation_status = 'active'
    ) THEN
        RAISE EXCEPTION 'Assigned admin user is not active or does not exist: %', p_assigned_to_id;
    END IF;

    SELECT to_jsonb(t.*)
    INTO v_prev
    FROM admin.support_tickets t
    WHERE t.id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support ticket not found: %', p_ticket_id;
    END IF;

    UPDATE admin.support_tickets
    SET assigned_to = p_assigned_to_id,
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'support.tickets.assign',
        'support_ticket',
        p_ticket_id,
        jsonb_build_object('assigned_to_id', p_assigned_to_id),
        v_prev,
        jsonb_build_object('assigned_to', p_assigned_to_id)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_announcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_announcement(
    p_title TEXT,
    p_body TEXT,
    p_type TEXT,
    p_audience TEXT,
    p_publish_at TIMESTAMPTZ DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_created_by UUID;
    v_announcement_id UUID;
    v_status TEXT;
BEGIN
    v_created_by := COALESCE(p_created_by, admin.current_admin_user_id());
    IF v_created_by IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve creating admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_created_by, 'support.announcements.create') THEN
        RAISE EXCEPTION 'Permission denied: support.announcements.create required';
    END IF;

    IF p_title IS NULL OR trim(p_title) = '' THEN
        RAISE EXCEPTION 'Announcement title is required';
    END IF;
    IF p_body IS NULL OR trim(p_body) = '' THEN
        RAISE EXCEPTION 'Announcement body is required';
    END IF;
    IF p_type NOT IN ('info', 'warning', 'maintenance', 'feature_update') THEN
        RAISE EXCEPTION 'Invalid announcement type: %', p_type;
    END IF;
    IF p_audience NOT IN ('all', 'platform', 'simulator', 'subscription_tier') THEN
        RAISE EXCEPTION 'Invalid announcement audience: %', p_audience;
    END IF;
    IF p_expires_at IS NOT NULL AND p_publish_at IS NOT NULL AND p_expires_at <= p_publish_at THEN
        RAISE EXCEPTION 'expires_at must be later than publish_at';
    END IF;

    v_status := CASE
        WHEN p_publish_at IS NULL THEN 'draft'
        WHEN p_publish_at > NOW() THEN 'scheduled'
        ELSE 'published'
    END;

    INSERT INTO admin.announcements (
        title,
        body,
        announcement_type,
        target_audience,
        status,
        publish_at,
        expires_at,
        created_by,
        updated_by
    )
    VALUES (
        trim(p_title),
        trim(p_body),
        p_type,
        p_audience,
        v_status,
        p_publish_at,
        p_expires_at,
        v_created_by,
        v_created_by
    )
    RETURNING id INTO v_announcement_id;

    PERFORM admin.log_admin_action(
        v_created_by,
        'support.announcements.create',
        'announcement',
        v_announcement_id,
        NULL,
        NULL,
        jsonb_build_object('status', v_status)
    );

    RETURN v_announcement_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_announcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_announcement(
    p_id UUID,
    p_updates JSONB,
    p_updated_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_updated_by UUID;
    v_prev JSONB;
    v_new_type TEXT;
    v_new_audience TEXT;
    v_new_status TEXT;
BEGIN
    v_updated_by := COALESCE(p_updated_by, admin.current_admin_user_id());
    IF v_updated_by IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve updating admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_updated_by, 'support.announcements.create') THEN
        RAISE EXCEPTION 'Permission denied: support.announcements.create required';
    END IF;

    IF p_updates IS NULL OR p_updates = '{}'::JSONB THEN
        RAISE EXCEPTION 'updates payload cannot be empty';
    END IF;

    SELECT to_jsonb(a.*)
    INTO v_prev
    FROM admin.announcements a
    WHERE a.id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Announcement not found: %', p_id;
    END IF;

    v_new_type := COALESCE(p_updates ->> 'announcement_type', p_updates ->> 'type');
    v_new_audience := COALESCE(p_updates ->> 'target_audience', p_updates ->> 'audience');
    v_new_status := p_updates ->> 'status';

    IF v_new_type IS NOT NULL AND v_new_type NOT IN ('info', 'warning', 'maintenance', 'feature_update') THEN
        RAISE EXCEPTION 'Invalid announcement type in updates: %', v_new_type;
    END IF;
    IF v_new_audience IS NOT NULL AND v_new_audience NOT IN ('all', 'platform', 'simulator', 'subscription_tier') THEN
        RAISE EXCEPTION 'Invalid target audience in updates: %', v_new_audience;
    END IF;
    IF v_new_status IS NOT NULL AND v_new_status NOT IN ('draft', 'scheduled', 'published', 'expired', 'archived') THEN
        RAISE EXCEPTION 'Invalid announcement status in updates: %', v_new_status;
    END IF;

    UPDATE admin.announcements
    SET title = COALESCE(NULLIF(trim(p_updates ->> 'title'), ''), title),
        body = COALESCE(NULLIF(trim(p_updates ->> 'body'), ''), body),
        announcement_type = COALESCE(v_new_type, announcement_type),
        target_audience = COALESCE(v_new_audience, target_audience),
        target_subscription_tier = COALESCE(p_updates ->> 'target_subscription_tier', target_subscription_tier),
        status = COALESCE(v_new_status, status),
        publish_at = COALESCE(
            CASE WHEN p_updates ? 'publish_at' THEN (p_updates ->> 'publish_at')::TIMESTAMPTZ ELSE NULL END,
            publish_at
        ),
        expires_at = COALESCE(
            CASE WHEN p_updates ? 'expires_at' THEN (p_updates ->> 'expires_at')::TIMESTAMPTZ ELSE NULL END,
            expires_at
        ),
        updated_by = v_updated_by,
        updated_at = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Failed to update announcement: %', p_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_updated_by,
        'support.announcements.update',
        'announcement',
        p_id,
        NULL,
        v_prev,
        p_updates
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.publish_announcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.publish_announcement(
    p_id UUID,
    p_published_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_published_by UUID;
    v_prev JSONB;
BEGIN
    v_published_by := COALESCE(p_published_by, admin.current_admin_user_id());
    IF v_published_by IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve publishing admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_published_by, 'support.announcements.create') THEN
        RAISE EXCEPTION 'Permission denied: support.announcements.create required';
    END IF;

    SELECT to_jsonb(a.*)
    INTO v_prev
    FROM admin.announcements a
    WHERE a.id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Announcement not found: %', p_id;
    END IF;

    UPDATE admin.announcements
    SET status = 'published',
        publish_at = COALESCE(publish_at, NOW()),
        updated_by = v_published_by,
        updated_at = NOW()
    WHERE id = p_id
      AND status IN ('draft', 'scheduled');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only draft or scheduled announcements can be published';
    END IF;

    PERFORM admin.log_admin_action(
        v_published_by,
        'support.announcements.publish',
        'announcement',
        p_id,
        NULL,
        v_prev,
        jsonb_build_object('status', 'published')
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.create_ticket_reply(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_ticket_status(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.assign_ticket(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_announcement(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_announcement(UUID, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.publish_announcement(UUID, UUID) TO authenticated, service_role;
