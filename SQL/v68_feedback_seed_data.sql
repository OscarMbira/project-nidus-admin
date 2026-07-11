-- ============================================================================
-- v68: Feedback seed data (bugs + feature requests)
-- Prerequisites: v67_feedback_tables_admin_rls.sql, public.users
-- Idempotent: fixed UUIDs + ON CONFLICT (id). Safe to re-run.
-- Run: pnpm run admin:seed-feedback
-- ============================================================================

DO $$
DECLARE
    v_reporter UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bugs'
    ) THEN
        RAISE NOTICE 'v68: public.bugs not found — run v67 first.';
        RETURN;
    END IF;

    SELECT u.id INTO v_reporter
    FROM public.users u
    WHERE COALESCE(u.is_deleted, FALSE) = FALSE
    ORDER BY u.created_at
    LIMIT 1;

    INSERT INTO public.bugs (
        id, title, description, severity, priority, status, reporter_id,
        steps_to_reproduce, created_at, updated_at
    )
    VALUES
        (
            'b7680001-0001-4001-8068-000000000001'::uuid,
            'Gantt chart export truncates task names',
            'Exporting the Gantt view to PDF cuts off long task names after roughly 40 characters.',
            'medium',
            'p2',
            'new',
            v_reporter,
            '1. Open any project schedule\n2. Add a task with a 60+ character name\n3. Export Gantt to PDF',
            NOW() - INTERVAL '5 days',
            NOW() - INTERVAL '5 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000002'::uuid,
            'Login redirect loop on Safari',
            'Some users on Safari 17 are redirected endlessly between login and dashboard after SSO.',
            'high',
            'p1',
            'in_progress',
            v_reporter,
            '1. Use Safari 17\n2. Sign in via corporate SSO\n3. Observe redirect loop',
            NOW() - INTERVAL '3 days',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7680001-0001-4001-8068-000000000003'::uuid,
            'Simulator session timer freezes on tab blur',
            'Practice session countdown stops updating when the browser tab loses focus.',
            'low',
            'p3',
            'assigned',
            v_reporter,
            '1. Start a timed simulator session\n2. Switch to another tab for 2 minutes\n3. Return — timer unchanged',
            NOW() - INTERVAL '10 days',
            NOW() - INTERVAL '8 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000004'::uuid,
            'Billing invoice PDF missing tax line',
            'Enterprise invoices generated last month omit the VAT breakdown section.',
            'critical',
            'p0',
            'fixed',
            v_reporter,
            NULL,
            NOW() - INTERVAL '20 days',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000005'::uuid,
            'Mobile nav overlaps notification drawer',
            'On viewports under 400px the hamburger menu covers the notification panel.',
            'medium',
            'p2',
            'closed',
            v_reporter,
            NULL,
            NOW() - INTERVAL '30 days',
            NOW() - INTERVAL '25 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        severity = EXCLUDED.severity,
        priority = EXCLUDED.priority,
        status = EXCLUDED.status,
        steps_to_reproduce = EXCLUDED.steps_to_reproduce,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO public.feature_requests (
        id, title, description, category, priority, status, user_id, vote_count,
        created_at, updated_at
    )
    VALUES
        (
            'b7680001-0001-4001-8068-000000000101'::uuid,
            'Dark mode for printable reports',
            'Allow exported PDFs to respect the user''s dark theme preference for on-screen preview.',
            'ui',
            'medium',
            'under_review',
            v_reporter,
            12,
            NOW() - INTERVAL '14 days',
            NOW() - INTERVAL '14 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000102'::uuid,
            'Bulk invite organisation members',
            'Upload a CSV to invite multiple PMO admins to an organisation in one step.',
            'feature',
            'high',
            'approved',
            v_reporter,
            28,
            NOW() - INTERVAL '21 days',
            NOW() - INTERVAL '7 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000103'::uuid,
            'Slack integration for critical alerts',
            'Post critical system errors and maintenance windows to a configured Slack channel.',
            'integration',
            'high',
            'in_progress',
            v_reporter,
            45,
            NOW() - INTERVAL '45 days',
            NOW() - INTERVAL '3 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000104'::uuid,
            'Offline mode for simulator scenarios',
            'Cache the next scenario so learners can continue with limited connectivity.',
            'feature',
            'medium',
            'under_review',
            v_reporter,
            8,
            NOW() - INTERVAL '6 days',
            NOW() - INTERVAL '6 days'
        ),
        (
            'b7680001-0001-4001-8068-000000000105'::uuid,
            'Custom cancellation reason analytics',
            'Dashboard widget summarising cancellation reasons by plan tier over time.',
            'enhancement',
            'low',
            'declined',
            v_reporter,
            3,
            NOW() - INTERVAL '60 days',
            NOW() - INTERVAL '30 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        priority = EXCLUDED.priority,
        status = EXCLUDED.status,
        vote_count = EXCLUDED.vote_count,
        updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'v68: Feedback seed data applied.';
END $$;
