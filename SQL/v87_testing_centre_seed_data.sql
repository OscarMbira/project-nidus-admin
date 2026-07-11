-- ============================================================================
-- v87: Testing Centre settings seed
-- Prerequisites: v86_testing_centre_enhancements.sql
-- Run: pnpm run admin:seed-testing-centre
-- ============================================================================

INSERT INTO admin.tc_settings (setting_key, setting_value, setting_type, description)
VALUES
    ('tc.env.local_url', 'http://localhost:5175', 'text', 'Local admin shell base URL for Playwright'),
    ('tc.env.staging_url', '', 'text', 'Staging admin base URL'),
    ('tc.env.production_url', '', 'text', 'Production admin base URL'),
    ('tc.failure_alert_threshold', '5', 'integer', 'Number of failures in a run before alert'),
    ('tc.reporter_enabled', 'true', 'boolean', 'Enable real-time Supabase reporter during E2E runs'),
    ('tc.run_retention_days', '90', 'integer', 'Auto-delete test runs older than N days (0 = keep all)')
ON CONFLICT (setting_key) DO NOTHING;
