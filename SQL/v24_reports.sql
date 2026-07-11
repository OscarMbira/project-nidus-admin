-- ============================================================================
-- v24: Report definitions, scheduled reports, and report runs
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v5.0_sidebar_completeness_plan.md (B4)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.report_definitions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_name TEXT NOT NULL,
    report_key TEXT NOT NULL UNIQUE,
    description TEXT,
    report_type TEXT NOT NULL
        CHECK (report_type IN (
            'user_growth', 'churn', 'retention', 'revenue',
            'system_usage', 'support_volume', 'error_trends', 'custom'
        )),
    query_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    chart_type TEXT NOT NULL DEFAULT 'table'
        CHECK (chart_type IN ('table', 'bar', 'line', 'pie')),
    target_system TEXT NOT NULL DEFAULT 'all'
        CHECK (target_system IN ('platform', 'simulator', 'all')),
    is_system_report BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_definitions_report_type
    ON admin.report_definitions (report_type);

CREATE INDEX IF NOT EXISTS idx_report_definitions_target_system
    ON admin.report_definitions (target_system);

CREATE INDEX IF NOT EXISTS idx_report_definitions_is_system_report
    ON admin.report_definitions (is_system_report);

COMMENT ON TABLE admin.report_definitions IS
    'Built-in and custom report definitions with query configuration';

-- ---------------------------------------------------------------------------
-- admin.scheduled_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.scheduled_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES admin.report_definitions(id) ON DELETE CASCADE,
    schedule_type TEXT NOT NULL
        CHECK (schedule_type IN ('daily', 'weekly', 'monthly')),
    schedule_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    format TEXT NOT NULL DEFAULT 'csv'
        CHECK (format IN ('csv', 'pdf', 'json')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_by UUID REFERENCES admin.admin_users(id),
    updated_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (cardinality(recipients) > 0)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_report_id
    ON admin.scheduled_reports (report_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_is_active
    ON admin.scheduled_reports (is_active);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run_at
    ON admin.scheduled_reports (next_run_at)
    WHERE is_active = TRUE;

COMMENT ON TABLE admin.scheduled_reports IS
    'Scheduled delivery configuration for report definitions';

-- ---------------------------------------------------------------------------
-- admin.report_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.report_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES admin.report_definitions(id) ON DELETE CASCADE,
    scheduled_report_id UUID REFERENCES admin.scheduled_reports(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    result_data JSONB,
    row_count INTEGER,
    file_url TEXT,
    run_by UUID REFERENCES admin.admin_users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_report_runs_report_id
    ON admin.report_runs (report_id);

CREATE INDEX IF NOT EXISTS idx_report_runs_scheduled_report_id
    ON admin.report_runs (scheduled_report_id);

CREATE INDEX IF NOT EXISTS idx_report_runs_status
    ON admin.report_runs (status);

CREATE INDEX IF NOT EXISTS idx_report_runs_started_at
    ON admin.report_runs (started_at DESC);

COMMENT ON TABLE admin.report_runs IS
    'Execution history for ad-hoc and scheduled report runs';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_report_definitions_updated_at ON admin.report_definitions;
CREATE TRIGGER trg_report_definitions_updated_at
    BEFORE UPDATE ON admin.report_definitions
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

DROP TRIGGER IF EXISTS trg_scheduled_reports_updated_at ON admin.scheduled_reports;
CREATE TRIGGER trg_scheduled_reports_updated_at
    BEFORE UPDATE ON admin.scheduled_reports
    FOR EACH ROW
    EXECUTE FUNCTION admin.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.report_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_definitions_select ON admin.report_definitions;
CREATE POLICY report_definitions_select ON admin.report_definitions
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS scheduled_reports_select ON admin.scheduled_reports;
CREATE POLICY scheduled_reports_select ON admin.scheduled_reports
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS report_runs_select ON admin.report_runs;
CREATE POLICY report_runs_select ON admin.report_runs
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.report_definitions TO authenticated;
GRANT SELECT ON admin.scheduled_reports TO authenticated;
GRANT SELECT ON admin.report_runs TO authenticated;
GRANT ALL ON admin.report_definitions TO service_role;
GRANT ALL ON admin.scheduled_reports TO service_role;
GRANT ALL ON admin.report_runs TO service_role;

-- ---------------------------------------------------------------------------
-- admin.create_report_definition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_report_definition(
    p_report_name TEXT,
    p_report_key TEXT,
    p_description TEXT DEFAULT NULL,
    p_report_type TEXT DEFAULT 'custom',
    p_query_config JSONB DEFAULT '{}'::JSONB,
    p_chart_type TEXT DEFAULT 'table',
    p_target_system TEXT DEFAULT 'all',
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
    v_key TEXT;
    v_new admin.report_definitions%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    IF trim(COALESCE(p_report_name, '')) = '' THEN
        RAISE EXCEPTION 'report_name is required';
    END IF;

    v_key := lower(trim(COALESCE(p_report_key, '')));
    IF v_key = '' THEN
        RAISE EXCEPTION 'report_key is required';
    END IF;

    IF COALESCE(p_report_type, 'custom') NOT IN (
        'user_growth', 'churn', 'retention', 'revenue',
        'system_usage', 'support_volume', 'error_trends', 'custom'
    ) THEN
        RAISE EXCEPTION 'Invalid report_type: %', p_report_type;
    END IF;

    IF COALESCE(p_chart_type, 'table') NOT IN ('table', 'bar', 'line', 'pie') THEN
        RAISE EXCEPTION 'Invalid chart_type: %', p_chart_type;
    END IF;

    IF COALESCE(p_target_system, 'all') NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    INSERT INTO admin.report_definitions (
        report_name,
        report_key,
        description,
        report_type,
        query_config,
        chart_type,
        target_system,
        is_system_report,
        created_by,
        updated_by
    )
    VALUES (
        trim(p_report_name),
        v_key,
        NULLIF(trim(COALESCE(p_description, '')), ''),
        COALESCE(p_report_type, 'custom'),
        COALESCE(p_query_config, '{}'::JSONB),
        COALESCE(p_chart_type, 'table'),
        COALESCE(p_target_system, 'all'),
        FALSE,
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.report_definitions WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'report_definition.create',
        'report_definition',
        v_id,
        jsonb_build_object('report_key', v_key),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_report_definition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_report_definition(
    p_report_id UUID,
    p_report_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_report_type TEXT DEFAULT NULL,
    p_query_config JSONB DEFAULT NULL,
    p_chart_type TEXT DEFAULT NULL,
    p_target_system TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.report_definitions%ROWTYPE;
    v_new admin.report_definitions%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.report_definitions
    WHERE id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report definition not found: %', p_report_id;
    END IF;

    IF v_prev.is_system_report THEN
        RAISE EXCEPTION 'System reports cannot be modified';
    END IF;

    IF p_report_type IS NOT NULL AND p_report_type NOT IN (
        'user_growth', 'churn', 'retention', 'revenue',
        'system_usage', 'support_volume', 'error_trends', 'custom'
    ) THEN
        RAISE EXCEPTION 'Invalid report_type: %', p_report_type;
    END IF;

    IF p_chart_type IS NOT NULL AND p_chart_type NOT IN ('table', 'bar', 'line', 'pie') THEN
        RAISE EXCEPTION 'Invalid chart_type: %', p_chart_type;
    END IF;

    IF p_target_system IS NOT NULL AND p_target_system NOT IN ('platform', 'simulator', 'all') THEN
        RAISE EXCEPTION 'Invalid target_system: %', p_target_system;
    END IF;

    UPDATE admin.report_definitions
    SET report_name = COALESCE(NULLIF(trim(p_report_name), ''), report_name),
        description = CASE
            WHEN p_description IS NULL THEN description
            ELSE NULLIF(trim(p_description), '')
        END,
        report_type = COALESCE(p_report_type, report_type),
        query_config = COALESCE(p_query_config, query_config),
        chart_type = COALESCE(p_chart_type, chart_type),
        target_system = COALESCE(p_target_system, target_system),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_report_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'report_definition.update',
        'report_definition',
        p_report_id,
        jsonb_build_object('report_key', v_new.report_key),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_report_definition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_report_definition(
    p_report_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.report_definitions%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.report_definitions
    WHERE id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report definition not found: %', p_report_id;
    END IF;

    IF v_prev.is_system_report THEN
        RAISE EXCEPTION 'System reports cannot be deleted';
    END IF;

    DELETE FROM admin.report_definitions
    WHERE id = p_report_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'report_definition.delete',
        'report_definition',
        p_report_id,
        jsonb_build_object('report_key', v_prev.report_key),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_scheduled_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_scheduled_report(
    p_report_id UUID,
    p_schedule_type TEXT,
    p_schedule_config JSONB DEFAULT '{}'::JSONB,
    p_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
    p_format TEXT DEFAULT 'csv',
    p_is_active BOOLEAN DEFAULT TRUE,
    p_next_run_at TIMESTAMPTZ DEFAULT NULL,
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
    v_new admin.scheduled_reports%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM admin.report_definitions WHERE id = p_report_id) THEN
        RAISE EXCEPTION 'Report definition not found: %', p_report_id;
    END IF;

    IF COALESCE(p_schedule_type, '') NOT IN ('daily', 'weekly', 'monthly') THEN
        RAISE EXCEPTION 'Invalid schedule_type: %', p_schedule_type;
    END IF;

    IF COALESCE(p_format, 'csv') NOT IN ('csv', 'pdf', 'json') THEN
        RAISE EXCEPTION 'Invalid format: %', p_format;
    END IF;

    IF COALESCE(cardinality(p_recipients), 0) = 0 THEN
        RAISE EXCEPTION 'At least one recipient email is required';
    END IF;

    INSERT INTO admin.scheduled_reports (
        report_id,
        schedule_type,
        schedule_config,
        recipients,
        format,
        is_active,
        next_run_at,
        created_by,
        updated_by
    )
    VALUES (
        p_report_id,
        p_schedule_type,
        COALESCE(p_schedule_config, '{}'::JSONB),
        p_recipients,
        COALESCE(p_format, 'csv'),
        COALESCE(p_is_active, TRUE),
        p_next_run_at,
        v_admin_user_id,
        v_admin_user_id
    )
    RETURNING id INTO v_id;

    SELECT * INTO v_new FROM admin.scheduled_reports WHERE id = v_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'scheduled_report.create',
        'scheduled_report',
        v_id,
        jsonb_build_object('report_id', p_report_id),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_scheduled_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_scheduled_report(
    p_scheduled_report_id UUID,
    p_schedule_type TEXT DEFAULT NULL,
    p_schedule_config JSONB DEFAULT NULL,
    p_recipients TEXT[] DEFAULT NULL,
    p_format TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL,
    p_next_run_at TIMESTAMPTZ DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.scheduled_reports%ROWTYPE;
    v_new admin.scheduled_reports%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.scheduled_reports
    WHERE id = p_scheduled_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Scheduled report not found: %', p_scheduled_report_id;
    END IF;

    IF p_schedule_type IS NOT NULL AND p_schedule_type NOT IN ('daily', 'weekly', 'monthly') THEN
        RAISE EXCEPTION 'Invalid schedule_type: %', p_schedule_type;
    END IF;

    IF p_format IS NOT NULL AND p_format NOT IN ('csv', 'pdf', 'json') THEN
        RAISE EXCEPTION 'Invalid format: %', p_format;
    END IF;

    IF p_recipients IS NOT NULL AND cardinality(p_recipients) = 0 THEN
        RAISE EXCEPTION 'At least one recipient email is required';
    END IF;

    UPDATE admin.scheduled_reports
    SET schedule_type = COALESCE(p_schedule_type, schedule_type),
        schedule_config = COALESCE(p_schedule_config, schedule_config),
        recipients = COALESCE(p_recipients, recipients),
        format = COALESCE(p_format, format),
        is_active = COALESCE(p_is_active, is_active),
        next_run_at = COALESCE(p_next_run_at, next_run_at),
        updated_by = v_admin_user_id,
        updated_at = NOW()
    WHERE id = p_scheduled_report_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'scheduled_report.update',
        'scheduled_report',
        p_scheduled_report_id,
        jsonb_build_object('report_id', v_new.report_id),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.delete_scheduled_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.delete_scheduled_report(
    p_scheduled_report_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.scheduled_reports%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.scheduled_reports
    WHERE id = p_scheduled_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Scheduled report not found: %', p_scheduled_report_id;
    END IF;

    DELETE FROM admin.scheduled_reports
    WHERE id = p_scheduled_report_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'scheduled_report.delete',
        'scheduled_report',
        p_scheduled_report_id,
        jsonb_build_object('report_id', v_prev.report_id),
        to_jsonb(v_prev),
        NULL
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.run_report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.run_report(
    p_report_id UUID,
    p_scheduled_report_id UUID DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_report admin.report_definitions%ROWTYPE;
    v_run_id UUID;
    v_new admin.report_runs%ROWTYPE;
    v_stub JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.edit') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.edit required';
    END IF;

    SELECT * INTO v_report
    FROM admin.report_definitions
    WHERE id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report definition not found: %', p_report_id;
    END IF;

    IF p_scheduled_report_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM admin.scheduled_reports
            WHERE id = p_scheduled_report_id
              AND report_id = p_report_id
        ) THEN
            RAISE EXCEPTION 'Scheduled report % is not linked to report %', p_scheduled_report_id, p_report_id;
        END IF;
    END IF;

    INSERT INTO admin.report_runs (
        report_id,
        scheduled_report_id,
        status,
        run_by,
        started_at
    )
    VALUES (
        p_report_id,
        p_scheduled_report_id,
        'running',
        v_admin_user_id,
        NOW()
    )
    RETURNING id INTO v_run_id;

    v_stub := jsonb_build_object(
        'stub', TRUE,
        'report_key', v_report.report_key,
        'report_type', v_report.report_type,
        'target_system', v_report.target_system,
        'generated_at', NOW(),
        'message', 'Stub result — wire to real query engine in application layer',
        'rows', jsonb_build_array()
    );

    UPDATE admin.report_runs
    SET status = 'completed',
        result_data = v_stub,
        row_count = 0,
        completed_at = NOW()
    WHERE id = v_run_id
    RETURNING * INTO v_new;

    IF p_scheduled_report_id IS NOT NULL THEN
        UPDATE admin.scheduled_reports
        SET last_run_at = NOW(),
            updated_at = NOW()
        WHERE id = p_scheduled_report_id;
    END IF;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'report.run',
        'report_run',
        v_run_id,
        jsonb_build_object(
            'report_id', p_report_id,
            'scheduled_report_id', p_scheduled_report_id
        ),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_report_run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_report_run(
    p_run_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS admin.report_runs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_run admin.report_runs%ROWTYPE;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'audit.reports.view') THEN
        RAISE EXCEPTION 'Permission denied: audit.reports.view required';
    END IF;

    SELECT * INTO v_run
    FROM admin.report_runs
    WHERE id = p_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Report run not found: %', p_run_id;
    END IF;

    RETURN v_run;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed built-in system reports
-- ---------------------------------------------------------------------------
INSERT INTO admin.report_definitions (
    report_name,
    report_key,
    description,
    report_type,
    query_config,
    chart_type,
    target_system,
    is_system_report
)
VALUES
    (
        'User Growth',
        'user_growth',
        'Daily, weekly, and monthly new registrations across Platform and Simulator',
        'user_growth',
        '{"date_granularity": ["daily", "weekly", "monthly"], "metrics": ["new_registrations"]}'::JSONB,
        'line',
        'all',
        TRUE
    ),
    (
        'Churn Report',
        'churn',
        'Subscription cancellations by reason across Platform and Simulator',
        'churn',
        '{"group_by": ["cancellation_reason", "plan"], "metrics": ["cancelled_subscriptions"]}'::JSONB,
        'bar',
        'all',
        TRUE
    ),
    (
        'Retention Report',
        'retention',
        'User retention cohort analysis',
        'retention',
        '{"cohort_period": "monthly", "metrics": ["retention_rate"]}'::JSONB,
        'table',
        'all',
        TRUE
    ),
    (
        'Revenue Summary',
        'revenue',
        'Revenue by currency, plan, and system',
        'revenue',
        '{"group_by": ["currency", "plan", "target_system"], "metrics": ["mrr", "total_revenue"]}'::JSONB,
        'bar',
        'all',
        TRUE
    ),
    (
        'System Usage',
        'system_usage',
        'Active users, API calls, and storage consumption',
        'system_usage',
        '{"metrics": ["active_users", "api_calls", "storage_bytes"]}'::JSONB,
        'line',
        'all',
        TRUE
    ),
    (
        'Support Volume',
        'support_volume',
        'Support tickets by status, priority, and category',
        'support_volume',
        '{"group_by": ["status", "priority", "category"], "metrics": ["ticket_count"]}'::JSONB,
        'bar',
        'all',
        TRUE
    ),
    (
        'Error Trends',
        'error_trends',
        'Error aggregations and trends over time',
        'error_trends',
        '{"group_by": ["severity", "error_code"], "metrics": ["error_count"]}'::JSONB,
        'line',
        'all',
        TRUE
    )
ON CONFLICT (report_key) DO UPDATE SET
    report_name = EXCLUDED.report_name,
    description = EXCLUDED.description,
    report_type = EXCLUDED.report_type,
    query_config = EXCLUDED.query_config,
    chart_type = EXCLUDED.chart_type,
    target_system = EXCLUDED.target_system,
    is_system_report = TRUE,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('audit.reports.view', 'View Reports', 'audit', 'View report definitions, schedules, and run history'),
    ('audit.reports.edit', 'Edit Reports', 'audit', 'Create and manage reports, schedules, and ad-hoc runs')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('audit.reports.view', 'audit.reports.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'audit.reports.view'),
    ('system_admin', 'audit.reports.edit')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.create_report_definition(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_report_definition(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_report_definition(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_scheduled_report(UUID, TEXT, JSONB, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_scheduled_report(UUID, TEXT, JSONB, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.delete_scheduled_report(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.run_report(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_report_run(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v24: Report definitions, scheduled reports, and report runs applied.';
END $$;
