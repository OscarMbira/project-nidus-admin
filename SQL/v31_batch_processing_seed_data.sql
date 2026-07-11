-- ============================================================================
-- v31: Batch processing & COB seed data
-- PostgreSQL 15+ / Supabase
-- Plan: projectplans/v3.0_batch_processing_plan.md
-- Prerequisites: v28 (batch infrastructure), v29 (COB infrastructure)
--
-- Idempotent: fixed UUIDs + ON CONFLICT. Safe to re-run.
-- Demo rows for Batch Jobs, Business Calendar, and COB run history.
-- Does NOT re-seed COB processes or system settings (already in v29).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper notice when super_admin is absent
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM admin.admin_users
        WHERE role = 'super_admin' AND activation_status = 'active'
    ) THEN
        RAISE NOTICE 'v31: No active super_admin — created_by/triggered_by columns will remain NULL where applicable.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Business calendar — South Africa public holidays (2026)
-- ---------------------------------------------------------------------------
INSERT INTO admin.business_calendar (
    id,
    calendar_date,
    day_type,
    holiday_name,
    country_code,
    created_by
)
SELECT
    seed.id,
    seed.calendar_date,
    seed.day_type,
    seed.holiday_name,
    seed.country_code,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
FROM (
    VALUES
        ('b7380028-0003-4000-8000-000000000001'::uuid, DATE '2026-01-01', 'holiday', 'New Year''s Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000002'::uuid, DATE '2026-03-21', 'holiday', 'Human Rights Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000003'::uuid, DATE '2026-04-03', 'holiday', 'Good Friday', 'ZA'),
        ('b7380028-0003-4000-8000-000000000004'::uuid, DATE '2026-04-06', 'holiday', 'Family Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000005'::uuid, DATE '2026-04-27', 'holiday', 'Freedom Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000006'::uuid, DATE '2026-05-01', 'holiday', 'Workers'' Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000007'::uuid, DATE '2026-06-16', 'holiday', 'Youth Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000008'::uuid, DATE '2026-08-09', 'holiday', 'National Women''s Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000009'::uuid, DATE '2026-09-24', 'holiday', 'Heritage Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000010'::uuid, DATE '2026-12-16', 'holiday', 'Day of Reconciliation', 'ZA'),
        ('b7380028-0003-4000-8000-000000000011'::uuid, DATE '2026-12-25', 'holiday', 'Christmas Day', 'ZA'),
        ('b7380028-0003-4000-8000-000000000012'::uuid, DATE '2026-12-26', 'holiday', 'Day of Goodwill', 'ZA')
) AS seed(id, calendar_date, day_type, holiday_name, country_code)
ON CONFLICT (calendar_date) DO UPDATE SET
    day_type = EXCLUDED.day_type,
    holiday_name = EXCLUDED.holiday_name,
    country_code = EXCLUDED.country_code;

-- ---------------------------------------------------------------------------
-- Batch jobs — representative statuses for the Batch Jobs UI
-- ---------------------------------------------------------------------------
INSERT INTO admin.batch_jobs (
    id,
    job_type,
    status,
    total_records,
    processed_records,
    succeeded_count,
    failed_count,
    parameters,
    result_summary,
    error_log,
    created_by,
    started_at,
    completed_at,
    created_at
)
SELECT
    seed.id,
    seed.job_type,
    seed.status,
    seed.total_records,
    seed.processed_records,
    seed.succeeded_count,
    seed.failed_count,
    seed.parameters,
    seed.result_summary,
    seed.error_log,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    seed.started_at,
    seed.completed_at,
    seed.created_at
FROM (
    VALUES
        (
            'b7380028-0001-4000-8000-000000000001'::uuid,
            'export_users',
            'completed',
            8,
            8,
            8,
            0,
            '{"format": "csv", "filters": {"status": "active"}, "source": "UserListPage"}'::jsonb,
            '{"exported_rows": 8, "filename": "users_2026-06-18_active.csv"}'::jsonb,
            '[]'::jsonb,
            NOW() - INTERVAL '3 days',
            NOW() - INTERVAL '3 days' + INTERVAL '12 seconds',
            NOW() - INTERVAL '3 days'
        ),
        (
            'b7380028-0001-4000-8000-000000000002'::uuid,
            'csv_import_public_users',
            'completed',
            10,
            10,
            7,
            2,
            '{"table": "public.users", "dry_run": false, "filename": "users_import_demo.csv"}'::jsonb,
            '{"succeeded": 7, "failed": 2, "skipped": 1}'::jsonb,
            jsonb_build_array(
                jsonb_build_object('record_id', 'row-8', 'error', 'Duplicate email: demo.import@example.com'),
                jsonb_build_object('record_id', 'row-9', 'error', 'Missing required field: full_name')
            ),
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '2 days' + INTERVAL '45 seconds',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7380028-0001-4000-8000-000000000003'::uuid,
            'bulk_assign_tickets',
            'cancelled',
            15,
            6,
            6,
            0,
            '{"assignee_id": null, "reason": "Operator cancelled mid-run"}'::jsonb,
            '{"cancelled_at_item": 6, "message": "Cancelled by admin"}'::jsonb,
            '[]'::jsonb,
            NOW() - INTERVAL '1 day',
            NOW() - INTERVAL '1 day' + INTERVAL '18 seconds',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7380028-0001-4000-8000-000000000004'::uuid,
            'bulk_deactivate_users',
            'failed',
            5,
            3,
            2,
            1,
            '{"reason": "Bulk deactivation — policy review"}'::jsonb,
            '{"succeeded": 2, "failed": 1, "aborted": true}'::jsonb,
            jsonb_build_array(
                jsonb_build_object('record_id', 'user-seed-003', 'error', 'Cannot deactivate organisation owner')
            ),
            NOW() - INTERVAL '6 hours',
            NOW() - INTERVAL '6 hours' + INTERVAL '8 seconds',
            NOW() - INTERVAL '6 hours'
        ),
        (
            'b7380028-0001-4000-8000-000000000005'::uuid,
            'export_audit_log',
            'queued',
            0,
            0,
            0,
            0,
            '{"format": "csv", "date_from": "2026-06-01", "date_to": "2026-06-20"}'::jsonb,
            NULL,
            '[]'::jsonb,
            NULL,
            NULL,
            NOW() - INTERVAL '20 minutes'
        )
) AS seed(
    id, job_type, status, total_records, processed_records, succeeded_count, failed_count,
    parameters, result_summary, error_log, started_at, completed_at, created_at
)
ON CONFLICT (id) DO UPDATE SET
    job_type = EXCLUDED.job_type,
    status = EXCLUDED.status,
    total_records = EXCLUDED.total_records,
    processed_records = EXCLUDED.processed_records,
    succeeded_count = EXCLUDED.succeeded_count,
    failed_count = EXCLUDED.failed_count,
    parameters = EXCLUDED.parameters,
    result_summary = EXCLUDED.result_summary,
    error_log = EXCLUDED.error_log,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at;

-- ---------------------------------------------------------------------------
-- Batch job items
-- ---------------------------------------------------------------------------
INSERT INTO admin.batch_job_items (
    id,
    batch_job_id,
    record_id,
    record_label,
    status,
    error_message,
    processed_at
)
SELECT seed.id, seed.batch_job_id, seed.record_id, seed.record_label, seed.status, seed.error_message, seed.processed_at
FROM (
    VALUES
        -- export_users (8 succeeded)
        ('b7380028-0004-4000-8000-000000000001'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-001', 'alice@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '2 seconds'),
        ('b7380028-0004-4000-8000-000000000002'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-002', 'bob@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '4 seconds'),
        ('b7380028-0004-4000-8000-000000000003'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-003', 'carol@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '6 seconds'),
        ('b7380028-0004-4000-8000-000000000004'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-004', 'dave@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '8 seconds'),
        ('b7380028-0004-4000-8000-000000000005'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-005', 'eve@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '10 seconds'),
        ('b7380028-0004-4000-8000-000000000006'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-006', 'frank@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '11 seconds'),
        ('b7380028-0004-4000-8000-000000000007'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-007', 'grace@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '11 seconds'),
        ('b7380028-0004-4000-8000-000000000008'::uuid, 'b7380028-0001-4000-8000-000000000001'::uuid, 'usr-008', 'henry@demo.example.com', 'succeeded', NULL, NOW() - INTERVAL '3 days' + INTERVAL '12 seconds'),
        -- csv_import (7 ok, 2 failed, 1 skipped)
        ('b7380028-0004-4000-8000-000000000010'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-1', 'import.one@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '5 seconds'),
        ('b7380028-0004-4000-8000-000000000011'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-2', 'import.two@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '10 seconds'),
        ('b7380028-0004-4000-8000-000000000012'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-3', 'import.three@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '15 seconds'),
        ('b7380028-0004-4000-8000-000000000013'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-4', 'import.four@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '20 seconds'),
        ('b7380028-0004-4000-8000-000000000014'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-5', 'import.five@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '25 seconds'),
        ('b7380028-0004-4000-8000-000000000015'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-6', 'import.six@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '30 seconds'),
        ('b7380028-0004-4000-8000-000000000016'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-7', 'import.seven@example.com', 'succeeded', NULL, NOW() - INTERVAL '2 days' + INTERVAL '35 seconds'),
        ('b7380028-0004-4000-8000-000000000017'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-8', 'demo.import@example.com', 'failed', 'Duplicate email: demo.import@example.com', NOW() - INTERVAL '2 days' + INTERVAL '40 seconds'),
        ('b7380028-0004-4000-8000-000000000018'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-9', '(missing name)', 'failed', 'Missing required field: full_name', NOW() - INTERVAL '2 days' + INTERVAL '42 seconds'),
        ('b7380028-0004-4000-8000-000000000019'::uuid, 'b7380028-0001-4000-8000-000000000002'::uuid, 'row-10', 'duplicate.skip@example.com', 'skipped', 'Skipped — duplicate in file', NOW() - INTERVAL '2 days' + INTERVAL '45 seconds'),
        -- bulk_assign cancelled (6 processed, rest skipped implicitly)
        ('b7380028-0004-4000-8000-000000000020'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-101', 'Login issue — seed ticket', 'succeeded', NULL, NOW() - INTERVAL '1 day' + INTERVAL '3 seconds'),
        ('b7380028-0004-4000-8000-000000000021'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-102', 'Billing enquiry', 'succeeded', NULL, NOW() - INTERVAL '1 day' + INTERVAL '6 seconds'),
        ('b7380028-0004-4000-8000-000000000022'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-103', 'Feature request — export', 'succeeded', NULL, NOW() - INTERVAL '1 day' + INTERVAL '9 seconds'),
        ('b7380028-0004-4000-8000-000000000023'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-104', 'Password reset', 'succeeded', NULL, NOW() - INTERVAL '1 day' + INTERVAL '12 seconds'),
        ('b7380028-0004-4000-8000-000000000024'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-105', 'API integration', 'succeeded', NULL, NOW() - INTERVAL '1 day' + INTERVAL '15 seconds'),
        ('b7380028-0004-4000-8000-000000000025'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-106', 'Subscription upgrade', 'succeeded', NULL, NOW() - INTERVAL '1 day' + INTERVAL '18 seconds'),
        ('b7380028-0004-4000-8000-000000000026'::uuid, 'b7380028-0001-4000-8000-000000000003'::uuid, 'tkt-107', 'Pending assign', 'skipped', 'Job cancelled before processing', NULL),
        -- bulk_deactivate failed
        ('b7380028-0004-4000-8000-000000000030'::uuid, 'b7380028-0001-4000-8000-000000000004'::uuid, 'user-seed-001', 'inactive.user@example.com', 'succeeded', NULL, NOW() - INTERVAL '6 hours' + INTERVAL '2 seconds'),
        ('b7380028-0004-4000-8000-000000000031'::uuid, 'b7380028-0001-4000-8000-000000000004'::uuid, 'user-seed-002', 'trial.user@example.com', 'succeeded', NULL, NOW() - INTERVAL '6 hours' + INTERVAL '4 seconds'),
        ('b7380028-0004-4000-8000-000000000032'::uuid, 'b7380028-0001-4000-8000-000000000004'::uuid, 'user-seed-003', 'owner@demo.example.com', 'failed', 'Cannot deactivate organisation owner', NOW() - INTERVAL '6 hours' + INTERVAL '6 seconds')
) AS seed(id, batch_job_id, record_id, record_label, status, error_message, processed_at)
ON CONFLICT (id) DO UPDATE SET
    batch_job_id = EXCLUDED.batch_job_id,
    record_id = EXCLUDED.record_id,
    record_label = EXCLUDED.record_label,
    status = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    processed_at = EXCLUDED.processed_at;

-- ---------------------------------------------------------------------------
-- COB runs — completed and failed history for the COB Dashboard
-- ---------------------------------------------------------------------------
INSERT INTO admin.cob_runs (
    id,
    business_date,
    status,
    trigger_type,
    triggered_by,
    started_at,
    completed_at,
    next_business_date,
    cob_report,
    created_at
)
SELECT
    seed.id,
    seed.business_date,
    seed.status,
    seed.trigger_type,
    (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
    seed.started_at,
    seed.completed_at,
    seed.next_business_date,
    seed.cob_report,
    seed.created_at
FROM (
    VALUES
        (
            'b7380028-0002-4000-8000-000000000001'::uuid,
            CURRENT_DATE - INTERVAL '3 days',
            'completed',
            'manual',
            (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:05',
            (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:12',
            CURRENT_DATE - INTERVAL '2 days',
            jsonb_build_object(
                'business_date', to_char(CURRENT_DATE - INTERVAL '3 days', 'YYYY-MM-DD'),
                'status', 'completed',
                'steps_completed', 8,
                'steps_failed', 0,
                'summary', jsonb_build_object(
                    'subscriptions_expired', 2,
                    'tickets_closed', 4,
                    'errors_archived', 12,
                    'next_business_date', to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD')
                )
            ),
            (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:05'
        ),
        (
            'b7380028-0002-4000-8000-000000000002'::uuid,
            CURRENT_DATE - INTERVAL '1 day',
            'failed',
            'scheduled',
            (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:00',
            (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:04',
            NULL,
            jsonb_build_object(
                'business_date', to_char(CURRENT_DATE - INTERVAL '1 day', 'YYYY-MM-DD'),
                'status', 'failed',
                'failed_step', 'archive_old_errors',
                'error', 'Timeout waiting for error aggregation lock'
            ),
            (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:00'
        )
) AS seed(id, business_date, status, trigger_type, started_at, completed_at, next_business_date, cob_report, created_at)
ON CONFLICT (id) DO UPDATE SET
    business_date = EXCLUDED.business_date,
    status = EXCLUDED.status,
    trigger_type = EXCLUDED.trigger_type,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    next_business_date = EXCLUDED.next_business_date,
    cob_report = EXCLUDED.cob_report;

-- ---------------------------------------------------------------------------
-- COB run steps — pipeline steps for seeded runs
-- ---------------------------------------------------------------------------
INSERT INTO admin.cob_run_steps (
    id,
    cob_run_id,
    process_id,
    process_name,
    step_order,
    status,
    records_processed,
    result_summary,
    error_message,
    started_at,
    completed_at
)
SELECT
    seed.id,
    seed.cob_run_id,
    cp.id,
    seed.process_name,
    seed.step_order,
    seed.status,
    seed.records_processed,
    seed.result_summary,
    seed.error_message,
    seed.started_at,
    seed.completed_at
FROM (
    VALUES
        -- Completed run — all 8 steps succeeded
        ('b7380028-0005-4000-8000-000000000001'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'expire_subscriptions', 'Expire Overdue Subscriptions', 10, 'completed', 2, '{"expired_count": 2}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:05', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:05:30'),
        ('b7380028-0005-4000-8000-000000000002'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'close_resolved_tickets', 'Close Resolved Tickets', 20, 'completed', 4, '{"closed_count": 4, "days_threshold": 7}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:05:30', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:06'),
        ('b7380028-0005-4000-8000-000000000003'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'archive_old_errors', 'Archive Old Errors', 30, 'completed', 12, '{"archived_count": 12}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:06', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:07'),
        ('b7380028-0005-4000-8000-000000000004'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'generate_daily_summary', 'Generate Daily Summary', 40, 'completed', 1, '{"audit_events": 156, "new_tickets": 3}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:07', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:08'),
        ('b7380028-0005-4000-8000-000000000005'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'reset_daily_counters', 'Reset Daily Counters', 50, 'completed', 0, '{"reset": true}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:08', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:08:15'),
        ('b7380028-0005-4000-8000-000000000006'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'lock_business_day', 'Lock Business Day', 60, 'completed', 0, '{"lock_set": true}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:08:15', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:09'),
        ('b7380028-0005-4000-8000-000000000007'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'advance_business_date', 'Advance Business Date', 70, 'completed', 1, jsonb_build_object('previous_date', to_char(CURRENT_DATE - INTERVAL '3 days', 'YYYY-MM-DD'), 'new_date', to_char(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM-DD')), NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:09', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:10'),
        ('b7380028-0005-4000-8000-000000000008'::uuid, 'b7380028-0002-4000-8000-000000000001'::uuid, 'generate_cob_report', 'Generate COB Report', 80, 'completed', 8, '{"report_generated": true}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:10', (CURRENT_DATE - INTERVAL '3 days')::timestamptz + TIME '17:12'),
        -- Failed run — fails at step 3; earlier steps completed
        ('b7380028-0005-4000-8000-000000000010'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'expire_subscriptions', 'Expire Overdue Subscriptions', 10, 'completed', 0, '{"expired_count": 0}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:00', (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:00:20'),
        ('b7380028-0005-4000-8000-000000000011'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'close_resolved_tickets', 'Close Resolved Tickets', 20, 'completed', 1, '{"closed_count": 1}'::jsonb, NULL, (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:00:20', (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:01'),
        ('b7380028-0005-4000-8000-000000000012'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'archive_old_errors', 'Archive Old Errors', 30, 'failed', 0, NULL, 'Timeout waiting for error aggregation lock', (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:01', (CURRENT_DATE - INTERVAL '1 day')::timestamptz + TIME '17:04'),
        ('b7380028-0005-4000-8000-000000000013'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'generate_daily_summary', 'Generate Daily Summary', 40, 'skipped', 0, NULL, NULL, NULL, NULL),
        ('b7380028-0005-4000-8000-000000000014'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'reset_daily_counters', 'Reset Daily Counters', 50, 'skipped', 0, NULL, NULL, NULL, NULL),
        ('b7380028-0005-4000-8000-000000000015'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'lock_business_day', 'Lock Business Day', 60, 'skipped', 0, NULL, NULL, NULL, NULL),
        ('b7380028-0005-4000-8000-000000000016'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'advance_business_date', 'Advance Business Date', 70, 'skipped', 0, NULL, NULL, NULL, NULL),
        ('b7380028-0005-4000-8000-000000000017'::uuid, 'b7380028-0002-4000-8000-000000000002'::uuid, 'generate_cob_report', 'Generate COB Report', 80, 'skipped', 0, NULL, NULL, NULL, NULL)
) AS seed(id, cob_run_id, process_key, process_name, step_order, status, records_processed, result_summary, error_message, started_at, completed_at)
INNER JOIN admin.cob_processes cp ON cp.process_key = seed.process_key
ON CONFLICT (id) DO UPDATE SET
    cob_run_id = EXCLUDED.cob_run_id,
    process_id = EXCLUDED.process_id,
    process_name = EXCLUDED.process_name,
    step_order = EXCLUDED.step_order,
    status = EXCLUDED.status,
    records_processed = EXCLUDED.records_processed,
    result_summary = EXCLUDED.result_summary,
    error_message = EXCLUDED.error_message,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at;

-- ---------------------------------------------------------------------------
-- Register batch/COB tables in database_tables catalog
-- ---------------------------------------------------------------------------
INSERT INTO public.database_tables (table_name, table_description, schema_name, is_system_table, is_active, table_category)
VALUES
    ('batch_jobs', 'Background batch jobs for bulk operations and CSV import/export', 'admin', FALSE, TRUE, 'admin'),
    ('batch_job_items', 'Per-record items tracked within a batch job', 'admin', FALSE, TRUE, 'admin'),
    ('business_calendar', 'Business calendar overrides for working days and holidays', 'admin', FALSE, TRUE, 'admin'),
    ('cob_processes', 'Configurable Close of Business pipeline process definitions', 'admin', TRUE, TRUE, 'admin'),
    ('cob_runs', 'Close of Business run history and aggregated reports', 'admin', FALSE, TRUE, 'admin'),
    ('cob_run_steps', 'Per-process execution steps within a COB run', 'admin', FALSE, TRUE, 'admin')
ON CONFLICT (table_name) DO UPDATE SET
    table_description = EXCLUDED.table_description,
    schema_name = EXCLUDED.schema_name,
    is_system_table = EXCLUDED.is_system_table,
    is_active = EXCLUDED.is_active,
    table_category = EXCLUDED.table_category,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v31: Batch processing & COB seed data applied.';
END $$;
