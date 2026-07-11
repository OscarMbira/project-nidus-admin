-- ============================================================================
-- v72: User feedback seed data (Feedback Analysis page)
-- Prerequisites: v71_user_feedback_admin_rls.sql, public.users
-- Idempotent: fixed UUIDs + ON CONFLICT (id). Safe to re-run.
-- Run: pnpm run admin:seed-user-feedback
-- ============================================================================

DO $$
DECLARE
    v_user UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_feedback'
    ) THEN
        RAISE NOTICE 'v72: public.user_feedback not found — run v71 first.';
        RETURN;
    END IF;

    SELECT u.id INTO v_user
    FROM public.users u
    WHERE COALESCE(u.is_deleted, FALSE) = FALSE
    ORDER BY u.created_at
    LIMIT 1;

    INSERT INTO public.user_feedback (
        id, user_id, feedback_type, feedback_text, rating, page_url, status, created_at, updated_at
    )
    VALUES
        (
            'b7720001-0001-4001-8072-000000000001'::uuid,
            v_user,
            'rating',
            'Overall platform experience is excellent — scheduling and reporting are intuitive.',
            5,
            '/platform/dashboard',
            'acknowledged',
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7720001-0001-4001-8072-000000000002'::uuid,
            v_user,
            'general_feedback',
            'The onboarding wizard felt long. Consider a shorter path for experienced PMs.',
            3,
            '/platform/onboarding',
            'reviewing',
            NOW() - INTERVAL '5 days',
            NOW() - INTERVAL '4 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000003'::uuid,
            v_user,
            'feature_request',
            'Would love CSV export for risk register entries with custom field mapping.',
            4,
            '/platform/risks',
            'new',
            NOW() - INTERVAL '8 days',
            NOW() - INTERVAL '8 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000004'::uuid,
            v_user,
            'bug_report',
            'Notification bell badge does not clear after marking all items read.',
            2,
            '/platform/notifications',
            'reviewing',
            NOW() - INTERVAL '3 days',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000005'::uuid,
            v_user,
            'rating',
            'Simulator practice scenarios are engaging but loading times spike on mobile.',
            4,
            '/simulator/scenarios',
            'acknowledged',
            NOW() - INTERVAL '12 days',
            NOW() - INTERVAL '10 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000006'::uuid,
            v_user,
            'general_feedback',
            'Support response was fast and helpful when I had billing questions.',
            5,
            '/platform/billing',
            'resolved',
            NOW() - INTERVAL '20 days',
            NOW() - INTERVAL '18 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000007'::uuid,
            v_user,
            'rating',
            'Gantt zoom controls are hard to discover on first use.',
            2,
            '/platform/schedule/gantt',
            'new',
            NOW() - INTERVAL '1 day',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7720001-0001-4001-8072-000000000008'::uuid,
            v_user,
            'feature_request',
            'Please add keyboard shortcuts for common task edits in the task board.',
            4,
            '/platform/tasks/board',
            'acknowledged',
            NOW() - INTERVAL '15 days',
            NOW() - INTERVAL '14 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000009'::uuid,
            v_user,
            'general_feedback',
            'Dark theme contrast on disabled buttons could be improved for accessibility.',
            3,
            '/platform/settings/appearance',
            'closed',
            NOW() - INTERVAL '45 days',
            NOW() - INTERVAL '40 days'
        ),
        (
            'b7720001-0001-4001-8072-000000000010'::uuid,
            v_user,
            'bug_report',
            'PDF export of portfolio dashboard shows blank charts in Firefox.',
            1,
            '/platform/portfolio/dashboard',
            'resolved',
            NOW() - INTERVAL '25 days',
            NOW() - INTERVAL '22 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        feedback_type = EXCLUDED.feedback_type,
        feedback_text = EXCLUDED.feedback_text,
        rating = EXCLUDED.rating,
        page_url = EXCLUDED.page_url,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'v72: User feedback seed data applied (10 rows).';
END $$;
