-- ============================================================================
-- v101: Record lifecycle config seed data (pilot tables)
-- PostgreSQL 15+ / Supabase
-- ============================================================================

INSERT INTO admin.record_lifecycle_config (
    id,
    table_name,
    approval_enabled,
    level_approval_mode,
    history_retention_days,
    auto_archive_enabled,
    archive_retention_years,
    is_active,
    configured_by
)
VALUES
    ('b8010001-0001-4001-8101-000000000001'::uuid, 'subscription_plans', TRUE, 'any', 90, FALSE, NULL, TRUE, NULL),
    ('b8010001-0001-4001-8101-000000000002'::uuid, 'affiliates', TRUE, 'any', 90, FALSE, NULL, TRUE, NULL),
    ('b8010001-0001-4001-8101-000000000003'::uuid, 'payment_gateways', TRUE, 'any', 90, FALSE, NULL, TRUE, NULL),
    ('b8010001-0001-4001-8101-000000000004'::uuid, 'cancellation_reason_categories', TRUE, 'any', 90, FALSE, NULL, TRUE, NULL)
ON CONFLICT (table_name) DO UPDATE SET
    approval_enabled = EXCLUDED.approval_enabled,
    level_approval_mode = EXCLUDED.level_approval_mode,
    history_retention_days = EXCLUDED.history_retention_days,
    auto_archive_enabled = EXCLUDED.auto_archive_enabled,
    archive_retention_years = EXCLUDED.archive_retention_years,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
