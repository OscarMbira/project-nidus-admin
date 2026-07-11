-- ============================================================================
-- v99: Auto-archive lifecycle history (optional pg_cron scheduling)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v98_record_lifecycle_subscription_plan_gate.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.auto_archive_expired_history(p_table_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID := admin.current_admin_user_id();
    v_is_service_role BOOLEAN := current_setting('request.jwt.claim.role', true) = 'service_role';
    v_targets RECORD;
    v_row RECORD;
    v_total_archived INTEGER := 0;
    v_table_filter TEXT := NULLIF(lower(trim(COALESCE(p_table_name, ''))), '');
    v_resolved_filter_table TEXT := NULL;
    v_reason TEXT;
BEGIN
    IF v_admin_user_id IS NULL THEN
        IF NOT v_is_service_role THEN
            RAISE EXCEPTION 'Permission denied: lifecycle.configure required';
        END IF;
    ELSIF NOT admin.check_admin_permission(v_admin_user_id, 'lifecycle.configure') THEN
        RAISE EXCEPTION 'Permission denied: lifecycle.configure required';
    END IF;

    IF v_table_filter IS NOT NULL THEN
        v_resolved_filter_table := split_part(admin.resolve_lifecycle_table(v_table_filter), '.', 2);
    END IF;

    FOR v_targets IN
        SELECT
            admin.resolve_lifecycle_table(c.table_name) AS table_qualified,
            c.table_name,
            COALESCE(
                ac.history_retention_days,
                c.history_retention_days,
                90
            ) AS retention_days
        FROM admin.record_lifecycle_config c
        LEFT JOIN admin.record_archive_config ac
            ON ac.table_name = c.table_name
           AND ac.is_active = TRUE
        WHERE c.is_active = TRUE
          AND c.auto_archive_enabled = TRUE
          AND (v_resolved_filter_table IS NULL OR c.table_name = v_resolved_filter_table)
    LOOP
        FOR v_row IN EXECUTE format(
            'SELECT t.id,
                    t.root_record_id,
                    t.record_version,
                    to_jsonb(t) AS snapshot_data
             FROM %s t
             WHERE t.record_status = ''history''
               AND t.updated_at < (NOW() - ($1::TEXT || '' days'')::INTERVAL)',
            v_targets.table_qualified
        )
        USING v_targets.retention_days
        LOOP
            EXECUTE format(
                'UPDATE %s
                 SET record_status = ''archived'',
                     archived_at = NOW(),
                     archived_by = COALESCE(archived_by, $1),
                     updated_at = NOW()
                 WHERE id = $2',
                v_targets.table_qualified
            )
            USING v_admin_user_id, v_row.id;

            v_reason := format(
                'Auto-archived after %s day history retention',
                v_targets.retention_days
            );

            PERFORM admin.lifecycle_log_transition(
                v_targets.table_name,
                v_row.id,
                COALESCE(v_row.root_record_id, v_row.id),
                'history',
                'archived',
                'archive',
                v_admin_user_id,
                v_reason,
                v_row.snapshot_data,
                COALESCE(v_row.record_version, 1)
            );

            v_total_archived := v_total_archived + 1;
        END LOOP;
    END LOOP;

    IF v_admin_user_id IS NOT NULL THEN
        PERFORM admin.log_admin_action(
            v_admin_user_id,
            'record_lifecycle.auto_archive',
            'record_lifecycle',
            NULL,
            jsonb_build_object(
                'table_filter', v_table_filter,
                'archived_count', v_total_archived
            ),
            NULL,
            NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'archived_count', v_total_archived,
        'table_filter', v_table_filter
    );
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule(jobid)
            FROM cron.job
            WHERE jobname = 'admin_record_lifecycle_auto_archive_daily';
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        PERFORM cron.schedule(
            'admin_record_lifecycle_auto_archive_daily',
            '10 3 * * *',
            'SELECT admin.auto_archive_expired_history(NULL);'
        );
    END IF;
END $$;

GRANT EXECUTE ON FUNCTION admin.auto_archive_expired_history(TEXT) TO authenticated, service_role;
