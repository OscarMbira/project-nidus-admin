-- ============================================================================
-- v29: Close of Business (COB) infrastructure
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v3.0_batch_processing_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.business_calendar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.business_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_date DATE NOT NULL UNIQUE,
    day_type TEXT NOT NULL DEFAULT 'working'
        CHECK (day_type IN ('working', 'weekend', 'holiday')),
    holiday_name TEXT,
    country_code TEXT NOT NULL DEFAULT 'ZA',
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_calendar_day_type
    ON admin.business_calendar (day_type);

COMMENT ON TABLE admin.business_calendar IS
    'Business calendar overrides for working days, weekends, and holidays';

-- ---------------------------------------------------------------------------
-- admin.cob_processes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.cob_processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_name TEXT NOT NULL,
    process_key TEXT NOT NULL UNIQUE,
    description TEXT,
    process_order INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'admin', 'all')),
    rpc_function_name TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cob_processes_order
    ON admin.cob_processes (process_order, is_active);

COMMENT ON TABLE admin.cob_processes IS
    'Configurable Close of Business pipeline process definitions';

-- ---------------------------------------------------------------------------
-- admin.cob_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.cob_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
    trigger_type TEXT NOT NULL DEFAULT 'manual'
        CHECK (trigger_type IN ('manual', 'scheduled')),
    triggered_by UUID REFERENCES admin.admin_users(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_business_date DATE,
    cob_report JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cob_runs_business_date
    ON admin.cob_runs (business_date DESC);

CREATE INDEX IF NOT EXISTS idx_cob_runs_status
    ON admin.cob_runs (status, created_at DESC);

COMMENT ON TABLE admin.cob_runs IS
    'Close of Business run history and aggregated reports';

-- ---------------------------------------------------------------------------
-- admin.cob_run_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.cob_run_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cob_run_id UUID NOT NULL REFERENCES admin.cob_runs(id) ON DELETE CASCADE,
    process_id UUID REFERENCES admin.cob_processes(id) ON DELETE SET NULL,
    process_name TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    records_processed INTEGER NOT NULL DEFAULT 0,
    result_summary JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cob_run_steps_run_order
    ON admin.cob_run_steps (cob_run_id, step_order);

COMMENT ON TABLE admin.cob_run_steps IS
    'Per-process execution steps within a COB run';

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.business_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.cob_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.cob_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.cob_run_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_calendar_select ON admin.business_calendar;
CREATE POLICY business_calendar_select ON admin.business_calendar
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS cob_processes_select ON admin.cob_processes;
CREATE POLICY cob_processes_select ON admin.cob_processes
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS cob_runs_select ON admin.cob_runs;
CREATE POLICY cob_runs_select ON admin.cob_runs
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS cob_run_steps_select ON admin.cob_run_steps;
CREATE POLICY cob_run_steps_select ON admin.cob_run_steps
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.business_calendar TO authenticated;
GRANT SELECT ON admin.cob_processes TO authenticated;
GRANT SELECT ON admin.cob_runs TO authenticated;
GRANT SELECT ON admin.cob_run_steps TO authenticated;
GRANT ALL ON admin.business_calendar TO service_role;
GRANT ALL ON admin.cob_processes TO service_role;
GRANT ALL ON admin.cob_runs TO service_role;
GRANT ALL ON admin.cob_run_steps TO service_role;

-- ---------------------------------------------------------------------------
-- Seed COB system settings
-- ---------------------------------------------------------------------------
INSERT INTO admin.system_settings (
    setting_key,
    setting_value,
    setting_type,
    category,
    description
)
VALUES
    (
        'cob.current_business_date',
        to_char(CURRENT_DATE, 'YYYY-MM-DD'),
        'text',
        'cob',
        'Current business date for Close of Business processing'
    ),
    (
        'cob.auto_run_time',
        '17:00',
        'text',
        'cob',
        'Scheduled auto-COB trigger time (HH:MM, 24-hour)'
    ),
    (
        'cob.auto_run_enabled',
        'false',
        'boolean',
        'cob',
        'Enable scheduled automatic Close of Business runs'
    ),
    (
        'cob.lock_active',
        'false',
        'boolean',
        'cob',
        'COB lock flag — prevents concurrent COB operations'
    )
ON CONFLICT (setting_key) DO UPDATE SET
    setting_type = EXCLUDED.setting_type,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Seed default COB processes
-- ---------------------------------------------------------------------------
INSERT INTO admin.cob_processes (
    id,
    process_name,
    process_key,
    description,
    process_order,
    is_active,
    target_system,
    rpc_function_name,
    parameters
)
VALUES
    (
        'b7380029-0001-4000-8000-000000000010',
        'Expire Overdue Subscriptions',
        'expire_subscriptions',
        'Mark active subscriptions past expiry date as expired',
        10,
        TRUE,
        'all',
        'cob_expire_subscriptions',
        '{}'::JSONB
    ),
    (
        'b7380029-0001-4000-8000-000000000020',
        'Close Resolved Tickets',
        'close_resolved_tickets',
        'Auto-close resolved support tickets older than threshold days',
        20,
        TRUE,
        'admin',
        'cob_close_resolved_tickets',
        jsonb_build_object('days_threshold', 7)
    ),
    (
        'b7380029-0001-4000-8000-000000000030',
        'Archive Old Errors',
        'archive_old_errors',
        'Mark old resolved error aggregations as ignored/archived',
        30,
        TRUE,
        'admin',
        'cob_archive_old_errors',
        jsonb_build_object('days_threshold', 30)
    ),
    (
        'b7380029-0001-4000-8000-000000000040',
        'Generate Daily Summary',
        'generate_daily_summary',
        'Aggregate daily operational counts for the business date',
        40,
        TRUE,
        'all',
        'cob_generate_daily_summary',
        '{}'::JSONB
    ),
    (
        'b7380029-0001-4000-8000-000000000050',
        'Reset Daily Counters',
        'reset_daily_counters',
        'Reset daily rate limits and counters (placeholder)',
        50,
        TRUE,
        'all',
        'cob_reset_daily_counters',
        '{}'::JSONB
    ),
    (
        'b7380029-0001-4000-8000-000000000060',
        'Lock Business Day',
        'lock_business_day',
        'Activate COB lock to prevent concurrent operations',
        60,
        TRUE,
        'all',
        'cob_lock_business_day',
        '{}'::JSONB
    ),
    (
        'b7380029-0001-4000-8000-000000000070',
        'Advance Business Date',
        'advance_business_date',
        'Move system business date to the next working day',
        70,
        TRUE,
        'all',
        'cob_advance_business_date',
        '{}'::JSONB
    ),
    (
        'b7380029-0001-4000-8000-000000000080',
        'Generate COB Report',
        'generate_cob_report',
        'Aggregate all step results into the final COB report',
        80,
        TRUE,
        'all',
        'cob_generate_report',
        '{}'::JSONB
    )
ON CONFLICT (process_key) DO UPDATE SET
    process_name = EXCLUDED.process_name,
    description = EXCLUDED.description,
    process_order = EXCLUDED.process_order,
    is_active = EXCLUDED.is_active,
    target_system = EXCLUDED.target_system,
    rpc_function_name = EXCLUDED.rpc_function_name,
    parameters = EXCLUDED.parameters;

-- ---------------------------------------------------------------------------
-- Internal COB helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._cob_get_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT setting_value
    FROM admin.system_settings
    WHERE setting_key = p_key;
$$;

CREATE OR REPLACE FUNCTION admin._cob_set_setting(
    p_key TEXT,
    p_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    INSERT INTO admin.system_settings (
        setting_key,
        setting_value,
        setting_type,
        category,
        description
    )
    VALUES (
        p_key,
        COALESCE(p_value, ''),
        CASE
            WHEN p_key IN ('cob.auto_run_enabled', 'cob.lock_active') THEN 'boolean'
            ELSE 'text'
        END,
        'cob',
        'Managed by COB infrastructure'
    )
    ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION admin._cob_day_type(p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_entry admin.business_calendar%ROWTYPE;
BEGIN
    SELECT * INTO v_entry
    FROM admin.business_calendar
    WHERE calendar_date = p_date;

    IF FOUND THEN
        RETURN v_entry.day_type;
    END IF;

    IF EXTRACT(DOW FROM p_date) IN (0, 6) THEN
        RETURN 'weekend';
    END IF;

    RETURN 'working';
END;
$$;

CREATE OR REPLACE FUNCTION admin._cob_next_working_date(p_from_date DATE)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_candidate DATE;
    v_attempts INTEGER := 0;
BEGIN
    v_candidate := p_from_date + 1;

    WHILE v_attempts < 366 LOOP
        IF admin._cob_day_type(v_candidate) = 'working' THEN
            RETURN v_candidate;
        END IF;
        v_candidate := v_candidate + 1;
        v_attempts := v_attempts + 1;
    END LOOP;

    RAISE EXCEPTION 'Unable to find next working date after %', p_from_date;
END;
$$;

CREATE OR REPLACE FUNCTION admin._cob_is_locked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
    SELECT COALESCE(admin._cob_get_setting('cob.lock_active'), 'false') = 'true';
$$;

-- ---------------------------------------------------------------------------
-- admin.get_current_business_date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_current_business_date()
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_value TEXT;
BEGIN
    v_value := admin._cob_get_setting('cob.current_business_date');
    IF v_value IS NULL OR trim(v_value) = '' THEN
        RETURN CURRENT_DATE;
    END IF;
    RETURN v_value::DATE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN CURRENT_DATE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.advance_business_date
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.advance_business_date(
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_current DATE;
    v_next DATE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.run.execute') THEN
        RAISE EXCEPTION 'Permission denied: cob.run.execute required';
    END IF;

    v_current := admin.get_current_business_date();
    v_next := admin._cob_next_working_date(v_current);

    PERFORM admin._cob_set_setting('cob.current_business_date', to_char(v_next, 'YYYY-MM-DD'));

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'cob.advance_business_date',
        'system_setting',
        NULL,
        jsonb_build_object(
            'previous_date', v_current,
            'next_date', v_next
        ),
        NULL,
        NULL
    );

    RETURN v_next;
END;
$$;

-- ---------------------------------------------------------------------------
-- Individual COB process functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.cob_expire_subscriptions(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_platform_count INTEGER := 0;
    v_simulator_count INTEGER := 0;
BEGIN
    UPDATE public.platform_subscriptions
    SET status = 'expired',
        updated_at = NOW()
    WHERE status IN ('active', 'trialing')
      AND COALESCE(is_lifetime, FALSE) = FALSE
      AND expires_at IS NOT NULL
      AND expires_at::DATE <= p_business_date;

    GET DIAGNOSTICS v_platform_count = ROW_COUNT;

    UPDATE sim.simulator_subscriptions
    SET status = 'expired',
        updated_at = NOW()
    WHERE status IN ('active', 'trialing')
      AND COALESCE(is_lifetime, FALSE) = FALSE
      AND expires_at IS NOT NULL
      AND expires_at::DATE <= p_business_date;

    GET DIAGNOSTICS v_simulator_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'process', 'expire_subscriptions',
        'business_date', p_business_date,
        'platform_expired', v_platform_count,
        'simulator_expired', v_simulator_count,
        'records_processed', v_platform_count + v_simulator_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_close_resolved_tickets(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_days INTEGER;
    v_count INTEGER := 0;
BEGIN
    v_days := GREATEST(COALESCE((p_params->>'days_threshold')::INTEGER, 7), 1);

    UPDATE admin.support_tickets
    SET status = 'closed',
        updated_at = NOW()
    WHERE status = 'resolved'
      AND resolved_at IS NOT NULL
      AND resolved_at < (p_business_date::TIMESTAMPTZ - make_interval(days => v_days));

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'process', 'close_resolved_tickets',
        'business_date', p_business_date,
        'days_threshold', v_days,
        'records_processed', v_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_archive_old_errors(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_days INTEGER;
    v_count INTEGER := 0;
    v_table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'admin'
          AND table_name = 'error_aggregations'
    ) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RETURN jsonb_build_object(
            'process', 'archive_old_errors',
            'business_date', p_business_date,
            'skipped', TRUE,
            'reason', 'admin.error_aggregations table not found',
            'records_processed', 0
        );
    END IF;

    v_days := GREATEST(COALESCE((p_params->>'days_threshold')::INTEGER, 30), 1);

    UPDATE admin.error_aggregations
    SET status = 'ignored',
        updated_at = NOW()
    WHERE status = 'resolved'
      AND resolved_at IS NOT NULL
      AND resolved_at < (p_business_date::TIMESTAMPTZ - make_interval(days => v_days));

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'process', 'archive_old_errors',
        'business_date', p_business_date,
        'days_threshold', v_days,
        'records_processed', v_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_generate_daily_summary(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_audit_count BIGINT := 0;
    v_ticket_open BIGINT := 0;
    v_ticket_created BIGINT := 0;
    v_platform_active BIGINT := 0;
    v_simulator_active BIGINT := 0;
BEGIN
    SELECT COUNT(*) INTO v_audit_count
    FROM admin.admin_audit_log
    WHERE created_at::DATE = p_business_date;

    SELECT COUNT(*) INTO v_ticket_open
    FROM admin.support_tickets
    WHERE status IN ('open', 'in_progress', 'waiting_user');

    SELECT COUNT(*) INTO v_ticket_created
    FROM admin.support_tickets
    WHERE created_at::DATE = p_business_date;

    SELECT COUNT(*) INTO v_platform_active
    FROM public.platform_subscriptions
    WHERE status IN ('active', 'trialing');

    SELECT COUNT(*) INTO v_simulator_active
    FROM sim.simulator_subscriptions
    WHERE status IN ('active', 'trialing');

    RETURN jsonb_build_object(
        'process', 'generate_daily_summary',
        'business_date', p_business_date,
        'audit_events', v_audit_count,
        'open_support_tickets', v_ticket_open,
        'support_tickets_created', v_ticket_created,
        'platform_active_subscriptions', v_platform_active,
        'simulator_active_subscriptions', v_simulator_active,
        'records_processed', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_reset_daily_counters(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    RETURN jsonb_build_object(
        'process', 'reset_daily_counters',
        'business_date', p_business_date,
        'status', 'placeholder',
        'message', 'Daily counter reset not yet implemented',
        'records_processed', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_lock_business_day(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    PERFORM admin._cob_set_setting('cob.lock_active', 'true');

    RETURN jsonb_build_object(
        'process', 'lock_business_day',
        'business_date', p_business_date,
        'lock_active', TRUE,
        'records_processed', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_advance_business_date(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_current DATE;
    v_next DATE;
BEGIN
    v_current := admin.get_current_business_date();

    IF v_current <> p_business_date THEN
        RAISE EXCEPTION 'Business date mismatch: expected %, current %', p_business_date, v_current;
    END IF;

    v_next := admin._cob_next_working_date(v_current);
    PERFORM admin._cob_set_setting('cob.current_business_date', to_char(v_next, 'YYYY-MM-DD'));

    RETURN jsonb_build_object(
        'process', 'advance_business_date',
        'business_date', p_business_date,
        'previous_date', v_current,
        'next_date', v_next,
        'records_processed', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION admin.cob_generate_report(
    p_business_date DATE,
    p_params JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_run_id UUID;
    v_steps JSONB;
    v_report JSONB;
    v_total_processed INTEGER := 0;
    v_failed_steps INTEGER := 0;
BEGIN
    v_run_id := NULLIF(p_params->>'cob_run_id', '')::UUID;

    IF v_run_id IS NULL THEN
        SELECT id INTO v_run_id
        FROM admin.cob_runs
        WHERE business_date = p_business_date
          AND status IN ('pending', 'running')
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_run_id IS NULL THEN
        RAISE EXCEPTION 'No active COB run found for business date %', p_business_date;
    END IF;

    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'step_id', s.id,
                    'process_name', s.process_name,
                    'step_order', s.step_order,
                    'status', s.status,
                    'records_processed', s.records_processed,
                    'result_summary', s.result_summary,
                    'error_message', s.error_message,
                    'started_at', s.started_at,
                    'completed_at', s.completed_at
                )
                ORDER BY s.step_order
            ),
            '[]'::JSONB
        ),
        COALESCE(SUM(s.records_processed), 0),
        COUNT(*) FILTER (WHERE s.status = 'failed')
    INTO v_steps, v_total_processed, v_failed_steps
    FROM admin.cob_run_steps s
    WHERE s.cob_run_id = v_run_id;

    v_report := jsonb_build_object(
        'business_date', p_business_date,
        'generated_at', NOW(),
        'total_records_processed', v_total_processed,
        'failed_steps', v_failed_steps,
        'steps', v_steps
    );

    UPDATE admin.cob_runs
    SET cob_report = v_report,
        status = CASE WHEN v_failed_steps > 0 THEN 'failed' ELSE 'completed' END,
        completed_at = NOW(),
        next_business_date = admin.get_current_business_date()
    WHERE id = v_run_id;

    PERFORM admin._cob_set_setting('cob.lock_active', 'false');

    RETURN jsonb_build_object(
        'process', 'generate_cob_report',
        'business_date', p_business_date,
        'cob_run_id', v_run_id,
        'report', v_report,
        'records_processed', v_total_processed
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.start_cob_run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.start_cob_run(
    p_business_date DATE,
    p_trigger_type TEXT DEFAULT 'manual',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_current DATE;
    v_run_id UUID;
    v_new admin.cob_runs%ROWTYPE;
    v_process RECORD;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.run.execute') THEN
        RAISE EXCEPTION 'Permission denied: cob.run.execute required';
    END IF;

    IF p_trigger_type NOT IN ('manual', 'scheduled') THEN
        RAISE EXCEPTION 'Invalid trigger_type: %', p_trigger_type;
    END IF;

    IF admin._cob_is_locked() THEN
        RAISE EXCEPTION 'COB lock is active — another COB operation may be in progress';
    END IF;

    IF EXISTS (
        SELECT 1 FROM admin.cob_runs
        WHERE status IN ('pending', 'running')
    ) THEN
        RAISE EXCEPTION 'A COB run is already in progress';
    END IF;

    v_current := admin.get_current_business_date();
    IF p_business_date IS NULL THEN
        p_business_date := v_current;
    END IF;

    IF p_business_date <> v_current THEN
        RAISE EXCEPTION 'Business date % does not match current business date %', p_business_date, v_current;
    END IF;

    IF EXISTS (
        SELECT 1 FROM admin.cob_runs
        WHERE business_date = p_business_date
          AND status = 'completed'
    ) THEN
        RAISE EXCEPTION 'Business date % has already been closed', p_business_date;
    END IF;

    INSERT INTO admin.cob_runs (
        business_date,
        status,
        trigger_type,
        triggered_by,
        started_at
    )
    VALUES (
        p_business_date,
        'running',
        p_trigger_type,
        v_admin_user_id,
        NOW()
    )
    RETURNING id INTO v_run_id;

    FOR v_process IN
        SELECT *
        FROM admin.cob_processes
        WHERE is_active = TRUE
        ORDER BY process_order, process_name
    LOOP
        INSERT INTO admin.cob_run_steps (
            cob_run_id,
            process_id,
            process_name,
            step_order,
            status
        )
        VALUES (
            v_run_id,
            v_process.id,
            v_process.process_name,
            v_process.process_order,
            'pending'
        );
    END LOOP;

    PERFORM admin._cob_set_setting('cob.lock_active', 'true');

    SELECT * INTO v_new FROM admin.cob_runs WHERE id = v_run_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'cob.run.start',
        'cob_run',
        v_run_id,
        jsonb_build_object(
            'business_date', p_business_date,
            'trigger_type', p_trigger_type
        ),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.execute_cob_step
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.execute_cob_step(
    p_run_id UUID,
    p_step_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_run admin.cob_runs%ROWTYPE;
    v_step admin.cob_run_steps%ROWTYPE;
    v_process admin.cob_processes%ROWTYPE;
    v_result JSONB;
    v_records INTEGER := 0;
    v_fn TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.run.execute') THEN
        RAISE EXCEPTION 'Permission denied: cob.run.execute required';
    END IF;

    SELECT * INTO v_run
    FROM admin.cob_runs
    WHERE id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COB run not found: %', p_run_id;
    END IF;

    IF v_run.status NOT IN ('pending', 'running') THEN
        RAISE EXCEPTION 'COB run is not active: %', v_run.status;
    END IF;

    SELECT * INTO v_step
    FROM admin.cob_run_steps
    WHERE id = p_step_id
      AND cob_run_id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COB run step not found: %', p_step_id;
    END IF;

    IF v_step.status NOT IN ('pending', 'failed') THEN
        RAISE EXCEPTION 'COB step is not executable: %', v_step.status;
    END IF;

    SELECT * INTO v_process
    FROM admin.cob_processes
    WHERE id = v_step.process_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COB process definition not found for step %', p_step_id;
    END IF;

    UPDATE admin.cob_run_steps
    SET status = 'running',
        started_at = COALESCE(started_at, NOW()),
        error_message = NULL
    WHERE id = p_step_id;

    IF v_run.status = 'pending' THEN
        UPDATE admin.cob_runs
        SET status = 'running',
            started_at = COALESCE(started_at, NOW())
        WHERE id = p_run_id;
    END IF;

    v_fn := v_process.rpc_function_name;
    IF v_fn LIKE 'admin.%' THEN
        v_fn := substr(v_fn, 7);
    END IF;

    BEGIN
        EXECUTE format(
            'SELECT admin.%I($1, $2)',
            v_fn
        )
        INTO v_result
        USING v_run.business_date,
              COALESCE(v_process.parameters, '{}'::JSONB)
              || CASE
                     WHEN v_fn = 'cob_generate_report' THEN jsonb_build_object('cob_run_id', p_run_id)
                     ELSE '{}'::JSONB
                 END;

        v_records := COALESCE((v_result->>'records_processed')::INTEGER, 0);

        UPDATE admin.cob_run_steps
        SET status = 'completed',
            records_processed = v_records,
            result_summary = v_result,
            completed_at = NOW()
        WHERE id = p_step_id;
    EXCEPTION
        WHEN OTHERS THEN
            UPDATE admin.cob_run_steps
            SET status = 'failed',
                error_message = SQLERRM,
                completed_at = NOW()
            WHERE id = p_step_id;

            RAISE;
    END;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'cob.step.execute',
        'cob_run_step',
        p_step_id,
        jsonb_build_object(
            'cob_run_id', p_run_id,
            'process_key', v_process.process_key,
            'records_processed', v_records
        ),
        NULL,
        v_result
    );

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.cancel_cob_run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.cancel_cob_run(
    p_run_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.cob_runs%ROWTYPE;
    v_new admin.cob_runs%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.run.cancel') THEN
        RAISE EXCEPTION 'Permission denied: cob.run.cancel required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.cob_runs
    WHERE id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COB run not found: %', p_run_id;
    END IF;

    IF v_prev.status IN ('completed', 'failed', 'rolled_back') THEN
        RETURN FALSE;
    END IF;

    UPDATE admin.cob_run_steps
    SET status = 'skipped',
        completed_at = COALESCE(completed_at, NOW())
    WHERE cob_run_id = p_run_id
      AND status IN ('pending', 'running');

    UPDATE admin.cob_runs
    SET status = 'rolled_back',
        completed_at = NOW()
    WHERE id = p_run_id
    RETURNING * INTO v_new;

    PERFORM admin._cob_set_setting('cob.lock_active', 'false');

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'cob.run.cancel',
        'cob_run',
        p_run_id,
        jsonb_build_object('status', 'rolled_back'),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_cob_runs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_cob_runs(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    business_date DATE,
    status TEXT,
    trigger_type TEXT,
    triggered_by UUID,
    triggered_by_email TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_business_date DATE,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.run.view') THEN
        RAISE EXCEPTION 'Permission denied: cob.run.view required';
    END IF;

    RETURN QUERY
    SELECT
        r.id,
        r.business_date,
        r.status,
        r.trigger_type,
        r.triggered_by,
        au.email AS triggered_by_email,
        r.started_at,
        r.completed_at,
        r.next_business_date,
        r.created_at
    FROM admin.cob_runs r
    LEFT JOIN admin.admin_users au ON au.id = r.triggered_by
    ORDER BY r.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_cob_run_detail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_cob_run_detail(
    p_run_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_run JSONB;
    v_steps JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.run.view') THEN
        RAISE EXCEPTION 'Permission denied: cob.run.view required';
    END IF;

    SELECT jsonb_build_object(
        'id', r.id,
        'business_date', r.business_date,
        'status', r.status,
        'trigger_type', r.trigger_type,
        'triggered_by', r.triggered_by,
        'triggered_by_email', au.email,
        'started_at', r.started_at,
        'completed_at', r.completed_at,
        'next_business_date', r.next_business_date,
        'cob_report', r.cob_report,
        'created_at', r.created_at
    )
    INTO v_run
    FROM admin.cob_runs r
    LEFT JOIN admin.admin_users au ON au.id = r.triggered_by
    WHERE r.id = p_run_id;

    IF v_run IS NULL THEN
        RAISE EXCEPTION 'COB run not found: %', p_run_id;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'process_id', s.process_id,
                'process_name', s.process_name,
                'step_order', s.step_order,
                'status', s.status,
                'records_processed', s.records_processed,
                'result_summary', s.result_summary,
                'error_message', s.error_message,
                'started_at', s.started_at,
                'completed_at', s.completed_at
            )
            ORDER BY s.step_order
        ),
        '[]'::JSONB
    )
    INTO v_steps
    FROM admin.cob_run_steps s
    WHERE s.cob_run_id = p_run_id;

    RETURN v_run || jsonb_build_object('steps', v_steps);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.upsert_calendar_entry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.upsert_calendar_entry(
    p_calendar_date DATE,
    p_day_type TEXT,
    p_holiday_name TEXT DEFAULT NULL,
    p_country_code TEXT DEFAULT 'ZA',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_id UUID;
    v_prev admin.business_calendar%ROWTYPE;
    v_new admin.business_calendar%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.calendar.edit') THEN
        RAISE EXCEPTION 'Permission denied: cob.calendar.edit required';
    END IF;

    IF p_calendar_date IS NULL THEN
        RAISE EXCEPTION 'calendar_date is required';
    END IF;

    IF p_day_type NOT IN ('working', 'weekend', 'holiday') THEN
        RAISE EXCEPTION 'Invalid day_type: %', p_day_type;
    END IF;

    SELECT * INTO v_prev
    FROM admin.business_calendar
    WHERE calendar_date = p_calendar_date;

    INSERT INTO admin.business_calendar (
        calendar_date,
        day_type,
        holiday_name,
        country_code,
        created_by
    )
    VALUES (
        p_calendar_date,
        p_day_type,
        NULLIF(trim(COALESCE(p_holiday_name, '')), ''),
        COALESCE(NULLIF(trim(p_country_code), ''), 'ZA'),
        v_admin_user_id
    )
    ON CONFLICT (calendar_date) DO UPDATE
    SET day_type = EXCLUDED.day_type,
        holiday_name = EXCLUDED.holiday_name,
        country_code = EXCLUDED.country_code
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.business_calendar WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        CASE WHEN v_prev.id IS NULL THEN 'cob.calendar.create' ELSE 'cob.calendar.update' END,
        'business_calendar',
        v_id,
        jsonb_build_object('calendar_date', p_calendar_date, 'day_type', p_day_type),
        CASE WHEN v_prev.id IS NULL THEN NULL ELSE to_jsonb(v_prev) END,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_calendar_entry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_calendar_entry(
    p_calendar_date DATE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.business_calendar%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.calendar.edit') THEN
        RAISE EXCEPTION 'Permission denied: cob.calendar.edit required';
    END IF;

    IF p_calendar_date IS NULL THEN
        RAISE EXCEPTION 'calendar_date is required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.business_calendar
    WHERE calendar_date = p_calendar_date;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    DELETE FROM admin.business_calendar
    WHERE calendar_date = p_calendar_date;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'cob.calendar.delete',
        'business_calendar',
        v_prev.id,
        jsonb_build_object('calendar_date', p_calendar_date),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_calendar_range
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_calendar_range(
    p_start_date DATE,
    p_end_date DATE,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    calendar_date DATE,
    day_type TEXT,
    holiday_name TEXT,
    country_code TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.calendar.view') THEN
        RAISE EXCEPTION 'Permission denied: cob.calendar.view required';
    END IF;

    IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'start_date and end_date are required';
    END IF;

    IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'end_date must be on or after start_date';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.calendar_date,
        c.day_type,
        c.holiday_name,
        c.country_code,
        c.created_by,
        c.created_at
    FROM admin.business_calendar c
    WHERE c.calendar_date BETWEEN p_start_date AND p_end_date
    ORDER BY c.calendar_date;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_cob_process
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_cob_process(
    p_process_id UUID,
    p_process_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_process_order INTEGER DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_parameters JSONB DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.cob_processes%ROWTYPE;
    v_new admin.cob_processes%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'cob.processes.edit') THEN
        RAISE EXCEPTION 'Permission denied: cob.processes.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.cob_processes
    WHERE id = p_process_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COB process not found: %', p_process_id;
    END IF;

    IF p_target_system IS NOT NULL
       AND p_target_system NOT IN ('platform', 'simulator', 'admin', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.cob_processes
    SET process_name = COALESCE(NULLIF(trim(p_process_name), ''), process_name),
        description = COALESCE(p_description, description),
        process_order = COALESCE(p_process_order, process_order),
        is_active = COALESCE(p_is_active, is_active),
        target_system = COALESCE(p_target_system, target_system),
        parameters = COALESCE(p_parameters, parameters)
    WHERE id = p_process_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'cob.process.update',
        'cob_process',
        p_process_id,
        jsonb_build_object('process_key', v_new.process_key),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('cob.calendar.view', 'View Business Calendar', 'cob', 'View business calendar entries'),
    ('cob.calendar.edit', 'Edit Business Calendar', 'cob', 'Create, update, and delete calendar entries'),
    ('cob.processes.view', 'View COB Processes', 'cob', 'View Close of Business process definitions'),
    ('cob.processes.edit', 'Edit COB Processes', 'cob', 'Configure COB process order, parameters, and status'),
    ('cob.run.view', 'View COB Runs', 'cob', 'View COB run history and step details'),
    ('cob.run.execute', 'Execute COB Runs', 'cob', 'Start and execute Close of Business runs'),
    ('cob.run.cancel', 'Cancel COB Runs', 'cob', 'Cancel in-progress COB runs')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key LIKE 'cob.%'
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'cob.calendar.view'),
    ('system_admin', 'cob.calendar.edit'),
    ('system_admin', 'cob.processes.view'),
    ('system_admin', 'cob.processes.edit'),
    ('system_admin', 'cob.run.view'),
    ('system_admin', 'cob.run.execute'),
    ('system_admin', 'cob.run.cancel')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._cob_get_setting(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._cob_set_setting(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._cob_day_type(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._cob_next_working_date(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin._cob_is_locked() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_current_business_date() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.advance_business_date(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_expire_subscriptions(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_close_resolved_tickets(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_archive_old_errors(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_generate_daily_summary(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_reset_daily_counters(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_lock_business_day(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_advance_business_date(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cob_generate_report(DATE, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.start_cob_run(DATE, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.execute_cob_step(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cancel_cob_run(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_cob_runs(INTEGER, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_cob_run_detail(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.upsert_calendar_entry(DATE, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_calendar_entry(DATE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_calendar_range(DATE, DATE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_cob_process(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT, JSONB, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v29: Close of Business infrastructure applied.';
END $$;
