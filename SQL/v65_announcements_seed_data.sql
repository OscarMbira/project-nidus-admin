-- ============================================================================
-- v65: Announcements seed data
-- Prerequisites: admin.announcements table (project-nidus v735_05), v04_support_functions
-- Idempotent: fixed UUIDs + ON CONFLICT (id). Safe to re-run.
-- Run: pnpm run admin:seed-announcements
-- ============================================================================

DO $$
DECLARE
    v_super UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'admin' AND table_name = 'announcements'
    ) THEN
        RAISE NOTICE 'v65: admin.announcements not found — ensure platform support tables are applied.';
        RETURN;
    END IF;

    SELECT id INTO v_super
    FROM admin.admin_users
    WHERE role = 'super_admin' AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_super IS NULL THEN
        SELECT id INTO v_super
        FROM admin.admin_users
        WHERE activation_status = 'active'
        ORDER BY created_at
        LIMIT 1;
    END IF;

    INSERT INTO admin.announcements (
        id,
        title,
        body,
        announcement_type,
        target_audience,
        target_subscription_tier,
        status,
        publish_at,
        expires_at,
        created_by,
        updated_by,
        created_at,
        updated_at
    )
    VALUES
        (
            'b7650001-0001-4001-8065-000000000001'::uuid,
            'New dashboard analytics available',
            'We have rolled out enhanced analytics on the Platform dashboard, including cohort retention charts and revenue breakdowns by plan. No action is required — the new widgets appear automatically on your next login.',
            'feature_update',
            'all',
            NULL,
            'published',
            NOW() - INTERVAL '14 days',
            NOW() + INTERVAL '30 days',
            v_super,
            v_super,
            NOW() - INTERVAL '16 days',
            NOW() - INTERVAL '14 days'
        ),
        (
            'b7650001-0001-4001-8065-000000000002'::uuid,
            'Platform API rate limits updated',
            'Effective immediately, authenticated API requests are limited to 120 requests per minute per organization (up from 60). Burst allowances for webhook endpoints remain unchanged. See the API documentation for details.',
            'info',
            'platform',
            NULL,
            'published',
            NOW() - INTERVAL '7 days',
            NULL,
            v_super,
            v_super,
            NOW() - INTERVAL '8 days',
            NOW() - INTERVAL '7 days'
        ),
        (
            'b7650001-0001-4001-8065-000000000003'::uuid,
            'Simulator cluster upgrade (draft)',
            'Draft notice for a planned Simulator infrastructure upgrade. Final maintenance window and user impact summary will be confirmed before scheduling.',
            'maintenance',
            'simulator',
            NULL,
            'draft',
            NULL,
            NULL,
            v_super,
            v_super,
            NOW() - INTERVAL '3 days',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7650001-0001-4001-8065-000000000004'::uuid,
            'Scheduled billing maintenance',
            'Billing and subscription renewal processing will be briefly unavailable on Sunday 06:00–08:00 UTC while we apply database patches. Active sessions are unaffected; only payment capture may be delayed.',
            'warning',
            'all',
            NULL,
            'scheduled',
            NOW() + INTERVAL '5 days',
            NOW() + INTERVAL '12 days',
            v_super,
            v_super,
            NOW() - INTERVAL '2 days',
            NOW() - INTERVAL '2 days'
        ),
        (
            'b7650001-0001-4001-8065-000000000005'::uuid,
            'Enterprise SSO improvements coming soon',
            'Enterprise customers will soon be able to configure multiple SAML identity providers and enforce step-up MFA for admin roles. This announcement is scheduled ahead of the release window.',
            'feature_update',
            'subscription_tier',
            'enterprise',
            'scheduled',
            NOW() + INTERVAL '10 days',
            NOW() + INTERVAL '45 days',
            v_super,
            v_super,
            NOW() - INTERVAL '1 day',
            NOW() - INTERVAL '1 day'
        ),
        (
            'b7650001-0001-4001-8065-000000000006'::uuid,
            'Simulator session recording beta',
            'Simulator users can now opt in to session recording for training review. Enable the feature under Account → Preferences. Recordings are retained for 30 days unless your organization policy says otherwise.',
            'info',
            'simulator',
            NULL,
            'published',
            NOW() - INTERVAL '21 days',
            NOW() + INTERVAL '14 days',
            v_super,
            v_super,
            NOW() - INTERVAL '22 days',
            NOW() - INTERVAL '21 days'
        ),
        (
            'b7650001-0001-4001-8065-000000000007'::uuid,
            'Holiday support hours (expired)',
            'Support operated on reduced hours during the holiday period. This notice has expired; standard 24/5 coverage has resumed.',
            'info',
            'platform',
            NULL,
            'expired',
            NOW() - INTERVAL '45 days',
            NOW() - INTERVAL '30 days',
            v_super,
            v_super,
            NOW() - INTERVAL '50 days',
            NOW() - INTERVAL '30 days'
        ),
        (
            'b7650001-0001-4001-8065-000000000008'::uuid,
            'Legacy mobile app deprecation',
            'The legacy Project Nidus mobile app was retired. Users were directed to the responsive web experience. This announcement is archived for audit history.',
            'warning',
            'all',
            NULL,
            'archived',
            NOW() - INTERVAL '90 days',
            NOW() - INTERVAL '60 days',
            v_super,
            v_super,
            NOW() - INTERVAL '95 days',
            NOW() - INTERVAL '60 days'
        )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        announcement_type = EXCLUDED.announcement_type,
        target_audience = EXCLUDED.target_audience,
        target_subscription_tier = EXCLUDED.target_subscription_tier,
        status = EXCLUDED.status,
        publish_at = EXCLUDED.publish_at,
        expires_at = EXCLUDED.expires_at,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

    RAISE NOTICE 'v65: Announcements seed data applied (% rows upserted).', 8;
END $$;
