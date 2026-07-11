-- ============================================================================
-- v28: Batch job queue infrastructure
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v3.0_batch_processing_plan.md
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin.batch_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.batch_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_records INTEGER NOT NULL DEFAULT 0,
    succeeded_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    parameters JSONB NOT NULL DEFAULT '{}'::JSONB,
    result_summary JSONB,
    error_log JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_by UUID REFERENCES admin.admin_users(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_status_created
    ON admin.batch_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_by
    ON admin.batch_jobs (created_by, created_at DESC);

COMMENT ON TABLE admin.batch_jobs IS
    'Background batch jobs for bulk operations, CSV import, and export';

-- ---------------------------------------------------------------------------
-- admin.batch_job_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin.batch_job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_job_id UUID NOT NULL REFERENCES admin.batch_jobs(id) ON DELETE CASCADE,
    record_id TEXT NOT NULL,
    record_label TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'skipped')),
    error_message TEXT,
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_job_status
    ON admin.batch_job_items (batch_job_id, status);

CREATE INDEX IF NOT EXISTS idx_batch_job_items_job_id
    ON admin.batch_job_items (batch_job_id, id);

COMMENT ON TABLE admin.batch_job_items IS
    'Per-record items tracked within a batch job';

-- ---------------------------------------------------------------------------
-- RLS — SELECT for active admins; mutations via SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE admin.batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin.batch_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_jobs_select ON admin.batch_jobs;
CREATE POLICY batch_jobs_select ON admin.batch_jobs
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

DROP POLICY IF EXISTS batch_job_items_select ON admin.batch_job_items;
CREATE POLICY batch_job_items_select ON admin.batch_job_items
    FOR SELECT TO authenticated
    USING (admin.is_active_admin());

GRANT SELECT ON admin.batch_jobs TO authenticated;
GRANT SELECT ON admin.batch_job_items TO authenticated;
GRANT ALL ON admin.batch_jobs TO service_role;
GRANT ALL ON admin.batch_job_items TO service_role;

-- ---------------------------------------------------------------------------
-- admin._batch_validate_job_type_permission
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._batch_validate_job_type_permission(
    p_job_type TEXT,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF p_job_type LIKE 'csv_import%' OR p_job_type LIKE 'import_%' THEN
        IF NOT admin.check_admin_permission(p_admin_user_id, 'batch.import.execute') THEN
            RAISE EXCEPTION 'Permission denied: batch.import.execute required';
        END IF;
        RETURN TRUE;
    END IF;

    IF p_job_type LIKE 'export%' OR p_job_type LIKE 'csv_export%' THEN
        IF NOT admin.check_admin_permission(p_admin_user_id, 'batch.export.execute') THEN
            RAISE EXCEPTION 'Permission denied: batch.export.execute required';
        END IF;
        RETURN TRUE;
    END IF;

    IF NOT admin.check_admin_permission(p_admin_user_id, 'batch.jobs.create') THEN
        RAISE EXCEPTION 'Permission denied: batch.jobs.create required';
    END IF;

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.create_batch_job
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.create_batch_job(
    p_job_type TEXT,
    p_parameters JSONB,
    p_record_ids TEXT[],
    p_record_labels TEXT[],
    p_admin_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_job_id UUID;
    v_new admin.batch_jobs%ROWTYPE;
    v_ids TEXT[];
    v_labels TEXT[];
    v_count INTEGER;
    i INTEGER;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF trim(COALESCE(p_job_type, '')) = '' THEN
        RAISE EXCEPTION 'job_type is required';
    END IF;

    PERFORM admin._batch_validate_job_type_permission(p_job_type, v_admin_user_id);

    v_ids := COALESCE(p_record_ids, ARRAY[]::TEXT[]);
    v_labels := COALESCE(p_record_labels, ARRAY[]::TEXT[]);
    v_count := COALESCE(array_length(v_ids, 1), 0);

    INSERT INTO admin.batch_jobs (
        job_type,
        status,
        total_records,
        parameters,
        created_by
    )
    VALUES (
        p_job_type,
        'queued',
        v_count,
        COALESCE(p_parameters, '{}'::JSONB),
        v_admin_user_id
    )
    RETURNING id INTO v_job_id;

    IF v_count > 0 THEN
        FOR i IN 1..v_count LOOP
            INSERT INTO admin.batch_job_items (
                batch_job_id,
                record_id,
                record_label,
                status
            )
            VALUES (
                v_job_id,
                v_ids[i],
                CASE
                    WHEN i <= COALESCE(array_length(v_labels, 1), 0) THEN NULLIF(trim(v_labels[i]), '')
                    ELSE NULL
                END,
                'pending'
            );
        END LOOP;
    END IF;

    SELECT * INTO v_new FROM admin.batch_jobs WHERE id = v_job_id;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'batch_job.create',
        'batch_job',
        v_job_id,
        jsonb_build_object(
            'job_type', p_job_type,
            'total_records', v_count
        ),
        NULL,
        to_jsonb(v_new)
    );

    RETURN v_job_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.process_batch_job_chunk
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.process_batch_job_chunk(
    p_job_id UUID,
    p_chunk_size INTEGER DEFAULT 50
)
RETURNS TABLE (
    item_id UUID,
    record_id TEXT,
    record_label TEXT,
    item_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_job admin.batch_jobs%ROWTYPE;
    v_limit INTEGER;
BEGIN
    IF p_job_id IS NULL THEN
        RAISE EXCEPTION 'job_id is required';
    END IF;

    v_limit := GREATEST(COALESCE(p_chunk_size, 50), 1);

    SELECT * INTO v_job
    FROM admin.batch_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch job not found: %', p_job_id;
    END IF;

    IF v_job.status IN ('completed', 'failed', 'cancelled') THEN
        RETURN;
    END IF;

    IF v_job.status = 'queued' THEN
        UPDATE admin.batch_jobs
        SET status = 'running',
            started_at = COALESCE(started_at, NOW())
        WHERE id = p_job_id;
    END IF;

    RETURN QUERY
    WITH picked AS (
        SELECT i.id
        FROM admin.batch_job_items i
        WHERE i.batch_job_id = p_job_id
          AND i.status = 'pending'
        ORDER BY i.id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    ),
    updated AS (
        UPDATE admin.batch_job_items i
        SET status = 'processing'
        FROM picked p
        WHERE i.id = p.id
        RETURNING i.id, i.record_id, i.record_label, i.status
    )
    SELECT u.id, u.record_id, u.record_label, u.status
    FROM updated u;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.update_batch_job_item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.update_batch_job_item(
    p_job_id UUID,
    p_item_id UUID,
    p_status TEXT,
    p_error_message TEXT DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_item admin.batch_job_items%ROWTYPE;
    v_prev_status TEXT;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF p_status NOT IN ('pending', 'processing', 'succeeded', 'failed', 'skipped') THEN
        RAISE EXCEPTION 'Invalid item status: %', p_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM admin.batch_jobs j WHERE j.id = p_job_id
    ) THEN
        RAISE EXCEPTION 'Batch job not found: %', p_job_id;
    END IF;

    SELECT * INTO v_item
    FROM admin.batch_job_items
    WHERE id = p_item_id
      AND batch_job_id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch job item not found: %', p_item_id;
    END IF;

    v_prev_status := v_item.status;

    UPDATE admin.batch_job_items
    SET status = p_status,
        error_message = CASE
            WHEN p_status IN ('failed', 'skipped') THEN NULLIF(trim(COALESCE(p_error_message, '')), '')
            ELSE NULL
        END,
        processed_at = CASE
            WHEN p_status IN ('succeeded', 'failed', 'skipped') THEN NOW()
            ELSE processed_at
        END
    WHERE id = p_item_id;

    IF v_prev_status IS DISTINCT FROM p_status
       AND p_status IN ('succeeded', 'failed', 'skipped')
       AND v_prev_status NOT IN ('succeeded', 'failed', 'skipped') THEN
        UPDATE admin.batch_jobs
        SET processed_records = processed_records + 1,
            succeeded_count = succeeded_count + CASE WHEN p_status = 'succeeded' THEN 1 ELSE 0 END,
            failed_count = failed_count + CASE WHEN p_status = 'failed' THEN 1 ELSE 0 END
        WHERE id = p_job_id;
    END IF;

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.complete_batch_job
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.complete_batch_job(
    p_job_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.batch_jobs%ROWTYPE;
    v_new admin.batch_jobs%ROWTYPE;
    v_pending INTEGER;
    v_processing INTEGER;
    v_final_status TEXT;
    v_summary JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    SELECT * INTO v_prev
    FROM admin.batch_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch job not found: %', p_job_id;
    END IF;

    IF v_prev.status = 'cancelled' THEN
        RETURN FALSE;
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'processing')
    INTO v_pending, v_processing
    FROM admin.batch_job_items
    WHERE batch_job_id = p_job_id;

    IF v_pending > 0 OR v_processing > 0 THEN
        RAISE EXCEPTION 'Batch job still has pending or processing items';
    END IF;

    IF v_prev.total_records > 0 AND v_prev.failed_count = v_prev.total_records THEN
        v_final_status := 'failed';
    ELSE
        v_final_status := 'completed';
    END IF;

    v_summary := jsonb_build_object(
        'total_records', v_prev.total_records,
        'processed_records', v_prev.processed_records,
        'succeeded_count', v_prev.succeeded_count,
        'failed_count', v_prev.failed_count,
        'skipped_count', GREATEST(v_prev.processed_records - v_prev.succeeded_count - v_prev.failed_count, 0),
        'completed_at', NOW()
    );

    UPDATE admin.batch_jobs
    SET status = v_final_status,
        result_summary = v_summary,
        completed_at = NOW()
    WHERE id = p_job_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'batch_job.complete',
        'batch_job',
        p_job_id,
        jsonb_build_object('status', v_final_status),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.cancel_batch_job
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.cancel_batch_job(
    p_job_id UUID,
    p_admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin_user_id UUID;
    v_prev admin.batch_jobs%ROWTYPE;
    v_new admin.batch_jobs%ROWTYPE;
    v_skipped INTEGER;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'batch.jobs.cancel') THEN
        RAISE EXCEPTION 'Permission denied: batch.jobs.cancel required';
    END IF;

    SELECT * INTO v_prev
    FROM admin.batch_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch job not found: %', p_job_id;
    END IF;

    IF v_prev.status IN ('completed', 'failed', 'cancelled') THEN
        RETURN FALSE;
    END IF;

    UPDATE admin.batch_job_items
    SET status = 'skipped',
        processed_at = COALESCE(processed_at, NOW())
    WHERE batch_job_id = p_job_id
      AND status IN ('pending', 'processing');

    GET DIAGNOSTICS v_skipped = ROW_COUNT;

    UPDATE admin.batch_jobs
    SET status = 'cancelled',
        processed_records = (
            SELECT COUNT(*)
            FROM admin.batch_job_items
            WHERE batch_job_id = p_job_id
              AND status IN ('succeeded', 'failed', 'skipped')
        ),
        completed_at = NOW(),
        result_summary = jsonb_build_object(
            'cancelled', TRUE,
            'skipped_items', v_skipped
        )
    WHERE id = p_job_id
    RETURNING * INTO v_new;

    PERFORM admin.log_admin_action(
        v_admin_user_id,
        'batch_job.cancel',
        'batch_job',
        p_job_id,
        jsonb_build_object('skipped_items', v_skipped),
        to_jsonb(v_prev),
        to_jsonb(v_new)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_batch_jobs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_batch_jobs(
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    job_type TEXT,
    status TEXT,
    total_records INTEGER,
    processed_records INTEGER,
    succeeded_count INTEGER,
    failed_count INTEGER,
    parameters JSONB,
    result_summary JSONB,
    created_by UUID,
    created_by_email TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
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

    IF NOT admin.check_admin_permission(v_admin_user_id, 'batch.jobs.view') THEN
        RAISE EXCEPTION 'Permission denied: batch.jobs.view required';
    END IF;

    RETURN QUERY
    SELECT
        j.id,
        j.job_type,
        j.status,
        j.total_records,
        j.processed_records,
        j.succeeded_count,
        j.failed_count,
        j.parameters,
        j.result_summary,
        j.created_by,
        au.email AS created_by_email,
        j.started_at,
        j.completed_at,
        j.created_at
    FROM admin.batch_jobs j
    LEFT JOIN admin.admin_users au ON au.id = j.created_by
    WHERE p_status IS NULL OR j.status = p_status
    ORDER BY j.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- admin.get_batch_job_detail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.get_batch_job_detail(
    p_job_id UUID,
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
    v_job JSONB;
    v_items JSONB;
BEGIN
    v_admin_user_id := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve acting admin user';
    END IF;

    IF NOT admin.check_admin_permission(v_admin_user_id, 'batch.jobs.view') THEN
        RAISE EXCEPTION 'Permission denied: batch.jobs.view required';
    END IF;

    SELECT jsonb_build_object(
        'id', j.id,
        'job_type', j.job_type,
        'status', j.status,
        'total_records', j.total_records,
        'processed_records', j.processed_records,
        'succeeded_count', j.succeeded_count,
        'failed_count', j.failed_count,
        'parameters', j.parameters,
        'result_summary', j.result_summary,
        'error_log', j.error_log,
        'created_by', j.created_by,
        'created_by_email', au.email,
        'started_at', j.started_at,
        'completed_at', j.completed_at,
        'created_at', j.created_at
    )
    INTO v_job
    FROM admin.batch_jobs j
    LEFT JOIN admin.admin_users au ON au.id = j.created_by
    WHERE j.id = p_job_id;

    IF v_job IS NULL THEN
        RAISE EXCEPTION 'Batch job not found: %', p_job_id;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', i.id,
                'record_id', i.record_id,
                'record_label', i.record_label,
                'status', i.status,
                'error_message', i.error_message,
                'processed_at', i.processed_at
            )
            ORDER BY i.id
        ),
        '[]'::JSONB
    )
    INTO v_items
    FROM admin.batch_job_items i
    WHERE i.batch_job_id = p_job_id;

    RETURN v_job || jsonb_build_object('items', v_items);
END;
$$;

-- ---------------------------------------------------------------------------
-- Permission keys
-- ---------------------------------------------------------------------------
INSERT INTO admin.admin_permissions (permission_key, permission_name, category, description)
VALUES
    ('batch.jobs.view', 'View Batch Jobs', 'batch', 'View batch job queue and item details'),
    ('batch.jobs.create', 'Create Batch Jobs', 'batch', 'Create bulk operation batch jobs'),
    ('batch.jobs.cancel', 'Cancel Batch Jobs', 'batch', 'Cancel running or queued batch jobs'),
    ('batch.import.execute', 'Execute Data Import', 'batch', 'Run CSV import batch jobs'),
    ('batch.export.execute', 'Execute Data Export', 'batch', 'Run data export batch jobs')
ON CONFLICT (permission_key) DO UPDATE SET
    permission_name = EXCLUDED.permission_name,
    category = EXCLUDED.category,
    description = EXCLUDED.description;

INSERT INTO admin.role_permissions (role, permission_key)
SELECT 'super_admin', permission_key
FROM admin.admin_permissions
WHERE permission_key IN (
    'batch.jobs.view',
    'batch.jobs.create',
    'batch.jobs.cancel',
    'batch.import.execute',
    'batch.export.execute'
)
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin.role_permissions (role, permission_key)
VALUES
    ('system_admin', 'batch.jobs.view'),
    ('system_admin', 'batch.jobs.create'),
    ('system_admin', 'batch.jobs.cancel'),
    ('system_admin', 'batch.import.execute'),
    ('system_admin', 'batch.export.execute'),
    ('support_admin', 'batch.export.execute'),
    ('content_admin', 'batch.export.execute')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GRANT EXECUTE on RPCs
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin._batch_validate_job_type_permission(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.create_batch_job(TEXT, JSONB, TEXT[], TEXT[], UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.process_batch_job_chunk(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.update_batch_job_item(UUID, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.complete_batch_job(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.cancel_batch_job(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_batch_jobs(TEXT, INTEGER, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.get_batch_job_detail(UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v28: Batch job queue infrastructure applied.';
END $$;
