-- ============================================================================
-- v36: Test management infrastructure (suites, cases, runs, results, auto-fix)
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v6.0_automated_testing_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.test_suites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_name TEXT NOT NULL,
    suite_key TEXT NOT NULL UNIQUE,
    system TEXT NOT NULL DEFAULT 'admin'
        CHECK (system IN ('admin', 'platform', 'simulator')),
    module TEXT NOT NULL,
    target_role TEXT NOT NULL,
    description TEXT,
    test_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_suites_system_module
    ON admin.test_suites (system, module, target_role);

-- ---------------------------------------------------------------------------
-- admin.test_cases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID NOT NULL REFERENCES admin.test_suites(id) ON DELETE CASCADE,
    case_name TEXT NOT NULL,
    case_key TEXT NOT NULL,
    test_type TEXT NOT NULL DEFAULT 'e2e'
        CHECK (test_type IN ('e2e', 'api', 'unit', 'access_control')),
    page_path TEXT,
    operation TEXT,
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    expected_outcome TEXT NOT NULL DEFAULT 'pass'
        CHECK (expected_outcome IN ('pass', 'fail')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (suite_id, case_key)
);

CREATE INDEX IF NOT EXISTS idx_test_cases_suite_id
    ON admin.test_cases (suite_id);

-- ---------------------------------------------------------------------------
-- admin.test_runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    trigger_type TEXT NOT NULL DEFAULT 'manual'
        CHECK (trigger_type IN ('manual', 'scheduled', 'cli')),
    target_suites UUID[],
    target_role TEXT,
    total_tests INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    environment TEXT NOT NULL DEFAULT 'local'
        CHECK (environment IN ('local', 'staging', 'production')),
    triggered_by UUID REFERENCES admin.admin_users(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_runs_status_created
    ON admin.test_runs (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- admin.test_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES admin.test_runs(id) ON DELETE CASCADE,
    case_id UUID REFERENCES admin.test_cases(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'passed', 'failed', 'skipped', 'error')),
    duration_ms INTEGER,
    error_message TEXT,
    error_stack TEXT,
    screenshot_url TEXT,
    trace_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_results_run_id
    ON admin.test_results (run_id, status);

-- ---------------------------------------------------------------------------
-- admin.test_auto_fixes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.test_auto_fixes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES admin.test_results(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES admin.test_runs(id) ON DELETE CASCADE,
    error_category TEXT NOT NULL
        CHECK (error_category IN (
            'missing_data', 'permission_denied', 'stale_state', 'validation_error',
            'element_not_found', 'db_constraint', 'timeout', 'session_expired', 'unknown'
        )),
    error_pattern TEXT NOT NULL,
    fix_strategy TEXT NOT NULL,
    fix_description TEXT NOT NULL,
    fix_actions JSONB NOT NULL DEFAULT '[]'::JSONB,
    fix_status TEXT NOT NULL DEFAULT 'attempted'
        CHECK (fix_status IN ('attempted', 'resolved', 'failed', 'skipped', 'manual_required')),
    confidence TEXT NOT NULL DEFAULT 'medium'
        CHECK (confidence IN ('high', 'medium', 'low')),
    retry_result_id UUID REFERENCES admin.test_results(id),
    retry_passed BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_auto_fixes_run_id
    ON admin.test_auto_fixes (run_id);

-- ---------------------------------------------------------------------------
-- admin.test_fix_patterns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.test_fix_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name TEXT NOT NULL,
    error_regex TEXT NOT NULL,
    error_category TEXT NOT NULL
        CHECK (error_category IN (
            'missing_data', 'permission_denied', 'stale_state', 'validation_error',
            'element_not_found', 'db_constraint', 'timeout', 'session_expired', 'unknown'
        )),
    fix_strategy TEXT NOT NULL,
    fix_config JSONB NOT NULL DEFAULT '{}'::JSONB,
    confidence TEXT NOT NULL DEFAULT 'medium'
        CHECK (confidence IN ('high', 'medium', 'low')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE admin.test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.test_auto_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.test_fix_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS test_suites_select ON admin.test_suites;
CREATE POLICY test_suites_select ON admin.test_suites
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS test_cases_select ON admin.test_cases;
CREATE POLICY test_cases_select ON admin.test_cases
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS test_runs_select ON admin.test_runs;
CREATE POLICY test_runs_select ON admin.test_runs
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS test_results_select ON admin.test_results;
CREATE POLICY test_results_select ON admin.test_results
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS test_auto_fixes_select ON admin.test_auto_fixes;
CREATE POLICY test_auto_fixes_select ON admin.test_auto_fixes
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS test_fix_patterns_select ON admin.test_fix_patterns;
CREATE POLICY test_fix_patterns_select ON admin.test_fix_patterns
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.test_suites TO authenticated;
GRANT SELECT ON admin.test_cases TO authenticated;
GRANT SELECT ON admin.test_runs TO authenticated;
GRANT SELECT ON admin.test_results TO authenticated;
GRANT SELECT ON admin.test_auto_fixes TO authenticated;
GRANT SELECT ON admin.test_fix_patterns TO authenticated;

GRANT ALL ON admin.test_suites TO service_role;
GRANT ALL ON admin.test_cases TO service_role;
GRANT ALL ON admin.test_runs TO service_role;
GRANT ALL ON admin.test_results TO service_role;
GRANT ALL ON admin.test_auto_fixes TO service_role;
GRANT ALL ON admin.test_fix_patterns TO service_role;

-- ---------------------------------------------------------------------------
-- admin.create_test_run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_test_run(
    p_name TEXT,
    p_suites UUID[] DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_trigger TEXT DEFAULT 'manual',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_run_id UUID;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'testing.manage') THEN
        RAISE EXCEPTION 'Permission denied: testing.manage required';
    END IF;

    IF trim(COALESCE(p_name, '')) = '' THEN
        RAISE EXCEPTION 'run name is required';
    END IF;

    INSERT INTO admin.test_runs (
        run_name,
        status,
        trigger_type,
        target_suites,
        target_role,
        triggered_by,
        started_at
    )
    VALUES (
        p_name,
        'running',
        COALESCE(NULLIF(trim(p_trigger), ''), 'manual'),
        p_suites,
        p_role,
        v_admin_user_id,
        NOW()
    )
    RETURNING id INTO v_run_id;

    RETURN v_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_test_run_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_test_run_status(
    p_run_id UUID,
    p_status TEXT,
    p_total INTEGER DEFAULT NULL,
    p_passed INTEGER DEFAULT NULL,
    p_failed INTEGER DEFAULT NULL,
    p_skipped INTEGER DEFAULT NULL,
    p_duration_ms INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF p_run_id IS NULL THEN
        RAISE EXCEPTION 'run_id is required';
    END IF;

    UPDATE admin.test_runs
    SET status = COALESCE(p_status, status),
        total_tests = COALESCE(p_total, total_tests),
        passed_count = COALESCE(p_passed, passed_count),
        failed_count = COALESCE(p_failed, failed_count),
        skipped_count = COALESCE(p_skipped, skipped_count),
        duration_ms = COALESCE(p_duration_ms, duration_ms),
        completed_at = CASE
            WHEN COALESCE(p_status, status) IN ('completed', 'failed', 'cancelled') THEN NOW()
            ELSE completed_at
        END
    WHERE id = p_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Test run not found: %', p_run_id;
    END IF;

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.record_test_result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.record_test_result(
    p_run_id UUID,
    p_case_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'pending',
    p_duration_ms INTEGER DEFAULT NULL,
    p_error TEXT DEFAULT NULL,
    p_error_stack TEXT DEFAULT NULL,
    p_screenshot_url TEXT DEFAULT NULL,
    p_trace_url TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_result_id UUID;
BEGIN
    IF p_run_id IS NULL THEN
        RAISE EXCEPTION 'run_id is required';
    END IF;

    INSERT INTO admin.test_results (
        run_id,
        case_id,
        status,
        duration_ms,
        error_message,
        error_stack,
        screenshot_url,
        trace_url,
        metadata,
        executed_at
    )
    VALUES (
        p_run_id,
        p_case_id,
        COALESCE(NULLIF(trim(p_status), ''), 'pending'),
        p_duration_ms,
        p_error,
        p_error_stack,
        p_screenshot_url,
        p_trace_url,
        COALESCE(p_metadata, '{}'::JSONB),
        NOW()
    )
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.record_auto_fix
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.record_auto_fix(
    p_result_id UUID,
    p_run_id UUID,
    p_category TEXT,
    p_pattern TEXT,
    p_strategy TEXT,
    p_description TEXT,
    p_actions JSONB DEFAULT '[]'::JSONB,
    p_confidence TEXT DEFAULT 'medium'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_fix_id UUID;
BEGIN
    INSERT INTO admin.test_auto_fixes (
        result_id,
        run_id,
        error_category,
        error_pattern,
        fix_strategy,
        fix_description,
        fix_actions,
        confidence
    )
    VALUES (
        p_result_id,
        p_run_id,
        p_category,
        p_pattern,
        p_strategy,
        p_description,
        COALESCE(p_actions, '[]'::JSONB),
        COALESCE(NULLIF(trim(p_confidence), ''), 'medium')
    )
    RETURNING id INTO v_fix_id;

    RETURN v_fix_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_auto_fix_result
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_auto_fix_result(
    p_fix_id UUID,
    p_retry_result_id UUID,
    p_retry_passed BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_pattern_id UUID;
    v_pattern TEXT;
BEGIN
    UPDATE admin.test_auto_fixes
    SET retry_result_id = p_retry_result_id,
        retry_passed = p_retry_passed,
        fix_status = CASE
            WHEN p_retry_passed THEN 'resolved'
            ELSE 'failed'
        END
    WHERE id = p_fix_id
    RETURNING error_pattern INTO v_pattern;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Auto-fix record not found: %', p_fix_id;
    END IF;

    SELECT id INTO v_pattern_id
    FROM admin.test_fix_patterns
    WHERE error_regex = v_pattern OR pattern_name = v_pattern
    LIMIT 1;

    IF v_pattern_id IS NOT NULL THEN
        IF p_retry_passed THEN
            UPDATE admin.test_fix_patterns
            SET success_count = success_count + 1, updated_at = NOW()
            WHERE id = v_pattern_id;
        ELSE
            UPDATE admin.test_fix_patterns
            SET failure_count = failure_count + 1, updated_at = NOW()
            WHERE id = v_pattern_id;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_auto_fix_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_auto_fix_summary(p_run_id UUID)
RETURNS TABLE (
    total_attempts BIGINT,
    resolved_count BIGINT,
    failed_count BIGINT,
    manual_required_count BIGINT,
    success_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'testing.view') THEN
        RAISE EXCEPTION 'Permission denied: testing.view required';
    END IF;

    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE fix_status = 'resolved')::BIGINT,
        COUNT(*) FILTER (WHERE fix_status = 'failed')::BIGINT,
        COUNT(*) FILTER (WHERE fix_status = 'manual_required')::BIGINT,
        CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
                (COUNT(*) FILTER (WHERE fix_status = 'resolved')::NUMERIC / COUNT(*)::NUMERIC) * 100,
                1
            )
        END
    FROM admin.test_auto_fixes
    WHERE run_id = p_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_fix_pattern_stats
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_fix_pattern_stats()
RETURNS TABLE (
    id UUID,
    pattern_name TEXT,
    error_category TEXT,
    fix_strategy TEXT,
    confidence TEXT,
    auto_apply BOOLEAN,
    success_count INTEGER,
    failure_count INTEGER,
    total_attempts BIGINT,
    success_rate NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'testing.view') THEN
        RAISE EXCEPTION 'Permission denied: testing.view required';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.pattern_name,
        p.error_category,
        p.fix_strategy,
        p.confidence,
        p.auto_apply,
        p.success_count,
        p.failure_count,
        (p.success_count + p.failure_count)::BIGINT AS total_attempts,
        CASE
            WHEN (p.success_count + p.failure_count) = 0 THEN 0
            ELSE ROUND(
                (p.success_count::NUMERIC / (p.success_count + p.failure_count)::NUMERIC) * 100,
                1
            )
        END AS success_rate
    FROM admin.test_fix_patterns p
    WHERE p.is_active = TRUE
    ORDER BY (p.success_count + p.failure_count) DESC, p.pattern_name;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_test_coverage_summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_test_coverage_summary()
RETURNS TABLE (
    system TEXT,
    module TEXT,
    target_role TEXT,
    total_cases BIGINT,
    last_passed BIGINT,
    last_failed BIGINT,
    pass_rate NUMERIC,
    coverage_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'testing.view') THEN
        RAISE EXCEPTION 'Permission denied: testing.view required';
    END IF;

    RETURN QUERY
    WITH latest_results AS (
        SELECT DISTINCT ON (tr.case_id)
            tr.case_id,
            tr.status
        FROM admin.test_results tr
        WHERE tr.case_id IS NOT NULL
        ORDER BY tr.case_id, tr.executed_at DESC NULLS LAST, tr.created_at DESC
    )
    SELECT
        s.system,
        s.module,
        s.target_role,
        COUNT(c.id)::BIGINT AS total_cases,
        COUNT(lr.case_id) FILTER (WHERE lr.status = 'passed')::BIGINT AS last_passed,
        COUNT(lr.case_id) FILTER (WHERE lr.status IN ('failed', 'error'))::BIGINT AS last_failed,
        CASE
            WHEN COUNT(c.id) = 0 THEN 0
            ELSE ROUND(
                (COUNT(lr.case_id) FILTER (WHERE lr.status = 'passed')::NUMERIC / COUNT(c.id)::NUMERIC) * 100,
                1
            )
        END AS pass_rate,
        CASE
            WHEN COUNT(c.id) = 0 THEN 'none'
            WHEN (COUNT(lr.case_id) FILTER (WHERE lr.status = 'passed')::NUMERIC / COUNT(c.id)::NUMERIC) >= 0.95 THEN 'green'
            WHEN (COUNT(lr.case_id) FILTER (WHERE lr.status = 'passed')::NUMERIC / COUNT(c.id)::NUMERIC) >= 0.80 THEN 'yellow'
            ELSE 'red'
        END AS coverage_status
    FROM admin.test_suites s
    LEFT JOIN admin.test_cases c ON c.suite_id = s.id AND c.is_active = TRUE
    LEFT JOIN latest_results lr ON lr.case_id = c.id
    WHERE s.is_active = TRUE
    GROUP BY s.system, s.module, s.target_role
    ORDER BY s.system, s.module, s.target_role;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_test_run_results
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_test_run_results(p_run_id UUID)
RETURNS TABLE (
    result_id UUID,
    case_id UUID,
    case_name TEXT,
    case_key TEXT,
    suite_name TEXT,
    module TEXT,
    system TEXT,
    status TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    error_stack TEXT,
    screenshot_url TEXT,
    trace_url TEXT,
    executed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'testing.view') THEN
        RAISE EXCEPTION 'Permission denied: testing.view required';
    END IF;

    RETURN QUERY
    SELECT
        tr.id,
        tc.id,
        tc.case_name,
        tc.case_key,
        ts.suite_name,
        ts.module,
        ts.system,
        tr.status,
        tr.duration_ms,
        tr.error_message,
        tr.error_stack,
        tr.screenshot_url,
        tr.trace_url,
        tr.executed_at
    FROM admin.test_results tr
    LEFT JOIN admin.test_cases tc ON tc.id = tr.case_id
    LEFT JOIN admin.test_suites ts ON ts.id = tc.suite_id
    WHERE tr.run_id = p_run_id
    ORDER BY tr.executed_at DESC NULLS LAST, tr.created_at DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.seed_test_suites_and_cases — returns count of cases inserted/updated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.seed_test_suites_and_cases()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'testing.manage') THEN
        RAISE EXCEPTION 'Permission denied: testing.manage required';
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_count
    FROM admin.test_cases
    WHERE is_active = TRUE;

    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Default fix patterns
-- ---------------------------------------------------------------------------
INSERT INTO admin.test_fix_patterns (
    pattern_name, error_regex, error_category, fix_strategy, fix_config, confidence, auto_apply
)
VALUES
    ('Missing currency data',        'no rows.*currencies|currency.*not found',           'missing_data',      'seed_missing_record', '{"rpc": "seed_currencies"}',        'high',   TRUE),
    ('Missing country data',         'no rows.*countries|country.*not found',             'missing_data',      'seed_missing_record', '{"rpc": "seed_countries"}',          'high',   TRUE),
    ('Missing exchange rates',       'no rows.*exchange_rates|rate.*not found',           'missing_data',      'seed_missing_record', '{"rpc": "seed_exchange_rates"}',     'high',   TRUE),
    ('Permission denied',            'Permission denied|permission.*required',            'permission_denied', 'grant_permission',    '{}',                                 'high',   TRUE),
    ('Duplicate test data',          'duplicate key|already exists|unique.*violation',     'stale_state',       'clear_stale_data',    '{"tag": "[TEST]"}',                  'high',   TRUE),
    ('Session expired',              'session.*expired|401|unauthorized|login.*redirect',  'session_expired',   'refresh_auth',        '{}',                                 'high',   TRUE),
    ('Navigation timeout',           'timeout.*exceeded|navigation.*timeout',             'timeout',           'increase_timeout',    '{"factor": 2}',                      'high',   TRUE),
    ('Validation: required field',   'required|cannot be empty|must provide',             'validation_error',  'adjust_factory_data', '{}',                                 'medium', TRUE),
    ('Foreign key violation',        'violates foreign key',                              'db_constraint',     'seed_dependency',     '{}',                                 'medium', TRUE),
    ('Check constraint violation',   'violates check constraint',                         'db_constraint',     'adjust_factory_data', '{}',                                 'medium', TRUE),
    ('Element not found on page',    'waiting for selector|locator.*0 elements',          'element_not_found', 'flag_selector_change','{}',                                 'low',    FALSE),
    ('Unmatched error',              '.*',                                                'unknown',           'flag_for_review',     '{}',                                 'low',    FALSE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('testing.view',   'View Testing',   'testing', 'View test suites, runs, results, and coverage'),
    ('testing.manage', 'Manage Testing', 'testing', 'Create test runs and manage test catalog'),
    ('testing.autofix','Auto-Fix Tests', 'testing', 'Apply and review automated test fixes')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN ('testing.view', 'testing.manage', 'testing.autofix')
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'testing.view'),
    ('system_admin', 'testing.manage'),
    ('system_admin', 'testing.autofix')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin.create_test_run(TEXT, UUID[], TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_test_run_status(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.record_test_result(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.record_auto_fix(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_auto_fix_result(UUID, UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_auto_fix_summary(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_fix_pattern_stats() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_test_coverage_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_test_run_results(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.seed_test_suites_and_cases() TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v36: Test management infrastructure applied.';
END $$;
