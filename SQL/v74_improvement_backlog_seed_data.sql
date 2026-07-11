-- ============================================================================
-- v74: Improvement backlog seed data
-- Prerequisites: v73_improvement_backlog_admin_rls.sql
-- Optional links: v68 bugs/feature_requests, v72 user_feedback seed UUIDs
-- Idempotent: fixed UUIDs + ON CONFLICT (id). Safe to re-run.
-- Run: pnpm run admin:seed-improvement-backlog
-- ============================================================================

DO $$
DECLARE
    v_user UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'improvement_backlog'
    ) THEN
        RAISE NOTICE 'v74: public.improvement_backlog not found — run v73 first.';
        RETURN;
    END IF;

    SELECT u.id INTO v_user
    FROM public.users u
    WHERE COALESCE(u.is_deleted, FALSE) = FALSE
    ORDER BY u.created_at
    LIMIT 1;

    INSERT INTO public.improvement_backlog (
        id, title, description, improvement_type, impact_score, effort_score, status,
        source_type, related_bug_id, related_feature_request_id, related_feedback_id,
        planned_release, target_completion_date, improvement_notes, tags, created_at, updated_at
    )
    VALUES
        (
            'b7740001-0001-4001-8074-000000000001'::uuid,
            'Fix Safari SSO redirect loop',
            'Investigate and patch infinite redirect when corporate IdP returns stale session cookies on Safari 17.',
            'bug_fix',
            85, 40, 'in_progress',
            'bug_report',
            'b7680001-0001-4001-8068-000000000002'::uuid,
            NULL, NULL,
            'v9.2',
            (CURRENT_DATE + INTERVAL '21 days')::DATE,
            'Reproduced on staging with customer IdP metadata.',
            ARRAY['sso', 'safari', 'auth'],
            NOW() - INTERVAL '10 days',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000002'::uuid,
            'Bulk organisation member invite',
            'Ship CSV upload flow for inviting multiple PMO admins to an organisation in one operation.',
            'enhancement',
            72, 55, 'planned',
            'feature_request',
            NULL,
            'b7680001-0001-4001-8068-000000000101'::uuid,
            NULL,
            'v9.3',
            (CURRENT_DATE + INTERVAL '45 days')::DATE,
            'Design review scheduled with platform team.',
            ARRAY['organisations', 'onboarding'],
            NOW() - INTERVAL '20 days',
            NOW() - INTERVAL '5 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000003'::uuid,
            'Notification badge clear reliability',
            'Ensure bell icon unread count resets when user marks all notifications read across tabs.',
            'bug_fix',
            60, 25, 'testing',
            'feedback',
            NULL, NULL,
            'b7720001-0001-4001-8072-000000000004'::uuid,
            'v9.2',
            (CURRENT_DATE + INTERVAL '14 days')::DATE,
            'Fix merged to staging; QA in progress.',
            ARRAY['notifications', 'ux'],
            NOW() - INTERVAL '8 days',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7740001-0001-4001-8074-000000000004'::uuid,
            'Gantt chart PDF export polish',
            'Truncate long task names with ellipsis and tooltip in PDF exports instead of hard clipping.',
            'ux',
            55, 30, 'backlog',
            'bug_report',
            'b7680001-0001-4001-8068-000000000001'::uuid,
            NULL, NULL,
            'v9.4',
            (CURRENT_DATE + INTERVAL '60 days')::DATE,
            NULL,
            ARRAY['gantt', 'export', 'pdf'],
            NOW() - INTERVAL '12 days',
            NOW() - INTERVAL '12 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000005'::uuid,
            'Simulator mobile load time reduction',
            'Lazy-load scenario assets and compress intro media for sub-3s first paint on 4G.',
            'performance',
            70, 65, 'planned',
            'analytics',
            NULL, NULL, NULL,
            'v9.5',
            (CURRENT_DATE + INTERVAL '90 days')::DATE,
            'Baseline metrics captured from RUM dashboard.',
            ARRAY['simulator', 'mobile', 'performance'],
            NOW() - INTERVAL '30 days',
            NOW() - INTERVAL '7 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000006'::uuid,
            'Dark theme button contrast (WCAG AA)',
            'Raise contrast on disabled primary buttons in dark mode to meet accessibility guidelines.',
            'accessibility',
            45, 20, 'completed',
            'feedback',
            NULL, NULL,
            'b7720001-0001-4001-8072-000000000009'::uuid,
            'v9.1',
            (CURRENT_DATE - INTERVAL '10 days')::DATE,
            'Shipped in v9.1 theme token update.',
            ARRAY['accessibility', 'theme'],
            NOW() - INTERVAL '50 days',
            NOW() - INTERVAL '10 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000007'::uuid,
            'Slack critical alert integration',
            'Post P0/P1 errors and maintenance windows to customer-configured Slack channels.',
            'enhancement',
            80, 70, 'in_progress',
            'feature_request',
            NULL,
            'b7680001-0001-4001-8068-000000000103'::uuid,
            NULL,
            'v9.3',
            (CURRENT_DATE + INTERVAL '35 days')::DATE,
            'Webhook payload schema drafted.',
            ARRAY['integrations', 'alerts'],
            NOW() - INTERVAL '40 days',
            NOW() - INTERVAL '3 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000008'::uuid,
            'Keyboard shortcuts for task board',
            'Add vim-style shortcuts for edit, move, and assign on the kanban task board.',
            'ux',
            50, 45, 'backlog',
            'feature_request',
            NULL,
            'b7680001-0001-4001-8068-000000000104'::uuid,
            NULL,
            NULL,
            (CURRENT_DATE + INTERVAL '120 days')::DATE,
            NULL,
            ARRAY['tasks', 'keyboard'],
            NOW() - INTERVAL '6 days',
            NOW() - INTERVAL '6 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000009'::uuid,
            'Admin onboarding documentation refresh',
            'Update support playbooks for bug triage, feature pipeline, and feedback analysis workflows.',
            'documentation',
            35, 15, 'backlog',
            'internal',
            NULL, NULL, NULL,
            'v9.2',
            (CURRENT_DATE + INTERVAL '30 days')::DATE,
            NULL,
            ARRAY['docs', 'support'],
            NOW() - INTERVAL '4 days',
            NOW() - INTERVAL '4 days'
        ),
        (
            'b7740001-0001-4001-8074-000000000010'::uuid,
            'Offline simulator scenario cache',
            'Allow prefetch of next scenario for low-connectivity training environments.',
            'mobile',
            65, 80, 'cancelled',
            'feature_request',
            NULL,
            'b7680001-0001-4001-8068-000000000104'::uuid,
            NULL,
            NULL,
            NULL,
            'Deferred pending native app roadmap decision.',
            ARRAY['simulator', 'offline'],
            NOW() - INTERVAL '25 days',
            NOW() - INTERVAL '15 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        improvement_type = EXCLUDED.improvement_type,
        impact_score = EXCLUDED.impact_score,
        effort_score = EXCLUDED.effort_score,
        status = EXCLUDED.status,
        source_type = EXCLUDED.source_type,
        related_bug_id = EXCLUDED.related_bug_id,
        related_feature_request_id = EXCLUDED.related_feature_request_id,
        related_feedback_id = EXCLUDED.related_feedback_id,
        planned_release = EXCLUDED.planned_release,
        target_completion_date = EXCLUDED.target_completion_date,
        improvement_notes = EXCLUDED.improvement_notes,
        tags = EXCLUDED.tags,
        updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'v74: Improvement backlog seed data applied (10 rows).';
END $$;
