-- ============================================================================
-- v17: Admin error reporting enrichment
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v735_06 (platform), v06_error_functions (admin)
-- ============================================================================

-- Allow admin shell errors to be tagged distinctly from platform/simulator.
ALTER TABLE admin.system_error_log
    DROP CONSTRAINT IF EXISTS system_error_log_system_check;

ALTER TABLE admin.system_error_log
    ADD CONSTRAINT system_error_log_system_check
    CHECK (system IN ('platform', 'simulator', 'admin'));

-- ---------------------------------------------------------------------------
-- admin.build_auto_ticket_message — formatted diagnostics for support tickets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.build_auto_ticket_message(
    p_log admin.system_error_log,
    p_agg admin.error_aggregations
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
    v_lines := array_append(v_lines, '[Automated Error Report]');
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, format('Error Type: %s', p_log.error_type));
    v_lines := array_append(v_lines, format('Message: %s', COALESCE(p_log.error_message, '—')));
    v_lines := array_append(v_lines, format('Route: %s', COALESCE(p_log.page_route, '—')));
    v_lines := array_append(v_lines, format('Component: %s', COALESCE(p_log.component_name, '—')));
    v_lines := array_append(v_lines, format('System: %s', COALESCE(p_log.system, '—')));
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, 'Environment:');
    v_lines := array_append(v_lines, format('- Browser: %s', COALESCE(p_log.browser, '—')));
    v_lines := array_append(v_lines, format('- OS: %s', COALESCE(p_log.os, '—')));
    v_lines := array_append(v_lines, format('- Device: %s', COALESCE(p_log.device_type, '—')));
    v_lines := array_append(v_lines, format('- Session: %s', COALESCE(p_log.session_id, '—')));
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, 'User Context:');
    v_lines := array_append(v_lines, format('- User ID: %s', COALESCE(p_log.user_id::TEXT, '—')));
    v_lines := array_append(v_lines, format('- Email: %s', COALESCE(p_log.user_email, '—')));
    v_lines := array_append(v_lines, format('- Role: %s', COALESCE(p_log.user_role, '—')));
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, format('Error Hash: %s', COALESCE(p_log.error_hash, '—')));
    v_lines := array_append(v_lines, format('Aggregation ID: %s', COALESCE(p_agg.id::TEXT, '—')));
    v_lines := array_append(v_lines, format('Occurrences: %s | Affected Users: %s',
        COALESCE(p_agg.occurrence_count, 1),
        GREATEST(COALESCE(p_agg.affected_user_count, 0), 1)
    ));
    v_lines := array_append(v_lines, format('First Seen: %s', COALESCE(to_char(p_agg.first_seen_at, 'YYYY-MM-DD HH24:MI:SS TZ'), '—')));
    v_lines := array_append(v_lines, format('Last Seen: %s', COALESCE(to_char(p_agg.last_seen_at, 'YYYY-MM-DD HH24:MI:SS TZ'), '—')));
    v_lines := array_append(v_lines, '');
    v_lines := array_append(v_lines, 'Stack Trace:');
    v_lines := array_append(v_lines, COALESCE(p_log.stack_trace, 'No stack trace captured.'));
    IF p_log.user_description IS NOT NULL AND btrim(p_log.user_description) <> '' THEN
        v_lines := array_append(v_lines, '');
        v_lines := array_append(v_lines, 'Additional Context:');
        v_lines := array_append(v_lines, p_log.user_description);
    END IF;

    RETURN array_to_string(v_lines, E'\n');
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.process_error_event — add initial ticket message with diagnostics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.process_error_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_agg admin.error_aggregations%ROWTYPE;
    v_rule admin.error_alert_rules%ROWTYPE;
    v_ticket_id UUID;
    v_user_threshold INTEGER;
    v_count_threshold INTEGER;
    v_window_minutes INTEGER;
    v_window_start TIMESTAMPTZ;
    v_recent_users INTEGER;
    v_recent_occurrences INTEGER;
    v_should_ticket BOOLEAN := FALSE;
    v_priority TEXT := 'high';
    v_route_matches BOOLEAN;
BEGIN
    SELECT * INTO v_agg
    FROM admin.error_aggregations
    WHERE error_hash = NEW.error_hash
    FOR UPDATE;

    IF FOUND THEN
        UPDATE admin.error_aggregations
        SET occurrence_count = occurrence_count + 1,
            last_seen_at = NEW.created_at,
            affected_user_ids = CASE
                WHEN NEW.user_id IS NOT NULL AND NOT (NEW.user_id = ANY (affected_user_ids))
                    THEN array_append(affected_user_ids, NEW.user_id)
                ELSE affected_user_ids
            END,
            affected_user_count = CASE
                WHEN NEW.user_id IS NOT NULL AND NOT (NEW.user_id = ANY (affected_user_ids))
                    THEN affected_user_count + 1
                ELSE affected_user_count
            END,
            status = CASE
                WHEN status = 'resolved' THEN 'recurring'
                ELSE status
            END,
            severity = CASE
                WHEN NEW.error_type = 'rls_error' THEN 'critical'
                WHEN NEW.error_type IN ('api_error', 'render_error') THEN 'high'
                ELSE severity
            END,
            updated_at = NOW()
        WHERE id = v_agg.id
        RETURNING * INTO v_agg;
    ELSE
        INSERT INTO admin.error_aggregations (
            error_hash,
            error_type,
            error_message,
            page_route,
            component_name,
            system,
            first_seen_at,
            last_seen_at,
            occurrence_count,
            affected_user_count,
            affected_user_ids,
            severity
        )
        VALUES (
            NEW.error_hash,
            NEW.error_type,
            NEW.error_message,
            NEW.page_route,
            NEW.component_name,
            NEW.system,
            NEW.created_at,
            NEW.created_at,
            1,
            CASE WHEN NEW.user_id IS NOT NULL THEN 1 ELSE 0 END,
            CASE WHEN NEW.user_id IS NOT NULL THEN ARRAY[NEW.user_id] ELSE '{}' END,
            CASE
                WHEN NEW.error_type = 'rls_error' THEN 'critical'
                WHEN NEW.error_type = 'slow_load' THEN 'low'
                ELSE 'medium'
            END
        )
        RETURNING * INTO v_agg;
    END IF;

    v_user_threshold := COALESCE(admin.get_system_setting('errors.auto_ticket_user_threshold', '3')::INTEGER, 3);
    v_count_threshold := COALESCE(admin.get_system_setting('errors.auto_ticket_count_threshold', '10')::INTEGER, 10);
    v_window_minutes := COALESCE(admin.get_system_setting('errors.auto_ticket_window_minutes', '60')::INTEGER, 60);
    v_window_start := NEW.created_at - (v_window_minutes || ' minutes')::INTERVAL;

    SELECT COUNT(DISTINCT e.user_id)::INTEGER,
           COUNT(*)::INTEGER
    INTO v_recent_users, v_recent_occurrences
    FROM admin.system_error_log e
    WHERE e.error_hash = NEW.error_hash
      AND e.created_at >= v_window_start;

    IF NEW.error_type = 'rls_error' THEN
        v_should_ticket := TRUE;
        v_priority := 'critical';
    END IF;

    IF NEW.page_route ~* '(checkout|payment|subscription)' THEN
        v_should_ticket := TRUE;
        v_priority := 'critical';
    END IF;

    IF v_recent_users >= v_user_threshold OR v_recent_occurrences >= v_count_threshold THEN
        v_should_ticket := TRUE;
        v_priority := COALESCE(v_priority, 'high');
    END IF;

    IF v_agg.status = 'recurring' AND v_agg.auto_ticket_id IS NOT NULL THEN
        v_should_ticket := TRUE;
        v_priority := 'high';
    END IF;

    FOR v_rule IN
        SELECT *
        FROM admin.error_alert_rules
        WHERE is_active = TRUE
          AND (error_type IS NULL OR error_type = NEW.error_type)
          AND (system IS NULL OR system = NEW.system)
    LOOP
        IF v_rule.page_route_pattern IS NOT NULL THEN
            IF NEW.page_route IS NULL THEN
                CONTINUE;
            END IF;
            v_route_matches := NEW.page_route ~* '(checkout|payment|subscription)';
            IF v_rule.page_route_pattern ILIKE '%checkout%'
               OR v_rule.page_route_pattern ILIKE '%payment%'
               OR v_rule.page_route_pattern ILIKE '%subscription%'
            THEN
                IF NOT v_route_matches THEN
                    CONTINUE;
                END IF;
            END IF;
        END IF;

        IF v_recent_users >= v_rule.threshold_users
           OR v_recent_occurrences >= v_rule.threshold_occurrences
        THEN
            v_should_ticket := TRUE;
            v_priority := v_rule.auto_ticket_priority;
        END IF;
    END LOOP;

    IF v_should_ticket AND v_agg.auto_ticket_id IS NULL THEN
        INSERT INTO admin.support_tickets (
            user_id,
            subject,
            category,
            priority,
            status,
            is_auto_created,
            source_error_hash
        )
        VALUES (
            NEW.user_id,
            format('[Auto] %s on %s — %s users affected',
                NEW.error_type,
                COALESCE(NEW.page_route, 'unknown'),
                GREATEST(v_agg.affected_user_count, 1)
            ),
            'technical',
            v_priority,
            'open',
            TRUE,
            NEW.error_hash
        )
        RETURNING id INTO v_ticket_id;

        INSERT INTO admin.ticket_messages (
            ticket_id,
            sender_type,
            sender_user_id,
            message_body,
            is_internal
        )
        VALUES (
            v_ticket_id,
            'system',
            NEW.user_id,
            admin.build_auto_ticket_message(NEW, v_agg),
            TRUE
        );

        UPDATE admin.error_aggregations
        SET auto_ticket_id = v_ticket_id,
            updated_at = NOW()
        WHERE id = v_agg.id;
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION admin.build_auto_ticket_message IS
  'Builds a formatted troubleshooting message for auto-created support tickets from error log events.';

-- Backfill system diagnostic messages for auto tickets created before enrichment.
INSERT INTO admin.ticket_messages (
    ticket_id,
    sender_type,
    sender_user_id,
    message_body,
    is_internal
)
SELECT
    t.id,
    'system',
    latest_log.user_id,
    admin.build_auto_ticket_message(latest_log, agg),
    TRUE
FROM admin.support_tickets t
JOIN admin.error_aggregations agg
  ON agg.auto_ticket_id = t.id
JOIN LATERAL (
    SELECT e.*
    FROM admin.system_error_log e
    WHERE e.error_hash = t.source_error_hash
    ORDER BY e.created_at DESC
    LIMIT 1
) latest_log ON TRUE
WHERE t.is_auto_created = TRUE
  AND t.source_error_hash IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM admin.ticket_messages m
      WHERE m.ticket_id = t.id
        AND m.sender_type = 'system'
  );
