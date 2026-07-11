-- ============================================================================
-- v61: Platform admin console seed data (admin DB)
-- Prerequisites: v60_platform_simulator_admin_rls.sql, admin.system_settings
-- Idempotent: ON CONFLICT on setting_key. Safe to re-run.
-- Run: pnpm run admin:seed-platform-admin-console
-- ============================================================================

INSERT INTO admin.system_settings (
    setting_key,
    setting_value,
    setting_type,
    category,
    description
)
VALUES
    (
        'platform.maintenance_mode',
        'false',
        'boolean',
        'platform',
        'When true, non-admin users see a maintenance banner on the platform app'
    ),
    (
        'platform.default_methodology',
        'structured',
        'text',
        'platform',
        'Default methodology applied to new projects when none is specified'
    ),
    (
        'platform.max_upload_mb',
        '25',
        'integer',
        'platform',
        'Maximum attachment upload size in megabytes for platform documents'
    ),
    (
        'platform.session_timeout_minutes',
        '480',
        'integer',
        'platform',
        'Idle session timeout for platform users (minutes)'
    ),
    (
        'platform.feature_flags_preview',
        'true',
        'boolean',
        'platform',
        'Expose beta feature toggles to organisation admins in settings'
    ),
    (
        'platform.health.api_gateway',
        'healthy',
        'text',
        'platform_health',
        'Edge API gateway availability — healthy | degraded | down'
    ),
    (
        'platform.health.database',
        'healthy',
        'text',
        'platform_health',
        'Primary Postgres cluster connectivity'
    ),
    (
        'platform.health.auth_service',
        'healthy',
        'text',
        'platform_health',
        'Supabase Auth / JWT issuance status'
    ),
    (
        'platform.health.storage',
        'healthy',
        'text',
        'platform_health',
        'Object storage (attachments, exports) availability'
    ),
    (
        'platform.health.background_jobs',
        'degraded',
        'text',
        'platform_health',
        'Scheduled jobs queue — healthy | degraded | down'
    ),
    (
        'platform.health.last_checked_at',
        to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'text',
        'platform_health',
        'Timestamp of the last automated health probe (UTC ISO-8601)'
    )
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    setting_type = EXCLUDED.setting_type,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    updated_at = NOW();
