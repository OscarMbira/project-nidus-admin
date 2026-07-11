-- ============================================================================
-- v140: Proactive ID generation capacity alerts
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v20.0_id_generation_duplication_safeguards_plan.md (follow-up)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.check_id_generation_capacity_alerts
--
-- Scans admin.v_id_generation_rule_usage for active rules at >= 70% keyspace
-- usage and broadcasts an in-app notification for each one not already
-- alerted at its current severity tier. Designed to be called by pg_cron
-- (no admin session) or manually by an admin holding
-- system.notifications.edit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.check_id_generation_capacity_alerts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
    v_is_service_role BOOLEAN := current_setting('request.jwt.claim.role', true) = 'service_role';
    v_system_admin_id UUID;
    v_row RECORD;
    v_severity TEXT;
    v_title TEXT;
    v_message TEXT;
    v_already_alerted BOOLEAN;
    v_checked_count INTEGER := 0;
    v_notified_count INTEGER := 0;
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF NOT v_is_service_role THEN
            RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
        END IF;
    ELSIF NOT admin.check_admin_permission(v_admin_user_id, 'system.notifications.edit') THEN
        RAISE EXCEPTION 'Permission denied: system.notifications.edit required';
    END IF;

    -- create_notification always requires a resolvable, permitted admin_user_id
    -- (no service-role bypass), so attribute cron-generated alerts to the
    -- longest-active super_admin.
    SELECT id INTO v_system_admin_id
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_system_admin_id IS NULL THEN
        RETURN jsonb_build_object(
            'checked', 0,
            'notified', 0,
            'skipped_reason', 'no active super_admin available for notification attribution'
        );
    END IF;

    FOR v_row IN
        SELECT rule_id, target_table, table_abbreviation, keyspace_size, generated_count, usage_pct
        FROM admin.v_id_generation_rule_usage
        WHERE usage_pct >= 70
        ORDER BY usage_pct DESC
    LOOP
        v_checked_count := v_checked_count + 1;
        v_severity := CASE WHEN v_row.usage_pct >= 100 THEN 'critical' ELSE 'warning' END;

        SELECT EXISTS (
            SELECT 1
            FROM admin.notifications
            WHERE recipient_admin_id IS NULL
              AND metadata->>'alert_type' = 'id_generation_capacity'
              AND metadata->>'rule_id' = v_row.rule_id::TEXT
              AND metadata->>'severity_tier' = v_severity
              AND (expires_at IS NULL OR expires_at > NOW())
        ) INTO v_already_alerted;

        IF v_already_alerted THEN
            CONTINUE;
        END IF;

        v_title := CASE
            WHEN v_severity = 'critical'
                THEN format('ID format saturated: %s', v_row.target_table)
            ELSE format('ID format nearing capacity: %s', v_row.target_table)
        END;

        v_message := format(
            'Rule %s (%s) is at %s%% of its keyspace (%s of %s codes used). Widen the format — more letters/digits, fewer excluded characters, or mixed case — before it starts failing new ID generation.',
            v_row.table_abbreviation,
            v_row.target_table,
            v_row.usage_pct,
            v_row.generated_count,
            v_row.keyspace_size
        );

        PERFORM admin.create_notification(
            NULL,
            v_title,
            v_message,
            'system',
            v_severity,
            '/system/id-generation-rules',
            NULL,
            jsonb_build_object(
                'alert_type', 'id_generation_capacity',
                'rule_id', v_row.rule_id,
                'target_table', v_row.target_table,
                'usage_pct', v_row.usage_pct,
                'severity_tier', v_severity
            ),
            NOW() + INTERVAL '7 days',
            v_system_admin_id
        );

        v_notified_count := v_notified_count + 1;
    END LOOP;

    RETURN jsonb_build_object('checked', v_checked_count, 'notified', v_notified_count);
END;
$$;

COMMENT ON FUNCTION admin.check_id_generation_capacity_alerts() IS
    'Broadcasts in-app notifications for ID generation rules at >= 70% keyspace usage; intended for periodic pg_cron invocation';

GRANT EXECUTE ON FUNCTION admin.check_id_generation_capacity_alerts() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- pg_cron schedule — every 6 hours, matches v99's guarded idempotent pattern
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'admin_id_generation_capacity_check';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        PERFORM cron.schedule(
            'admin_id_generation_capacity_check',
            '0 */6 * * *',
            'SELECT admin.check_id_generation_capacity_alerts();'
        );
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v140: ID generation capacity alerts applied.';
END $$;
