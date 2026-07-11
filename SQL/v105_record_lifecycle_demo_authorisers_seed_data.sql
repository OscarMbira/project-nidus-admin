-- ============================================================================
-- v105: Optional demo authorisers for record lifecycle (dev / QA only)
-- PostgreSQL 15+ / Supabase
-- Run: pnpm run admin:seed-record-lifecycle-demo-authorisers
-- Prerequisites:
--   v101_record_lifecycle_config_seed_data.sql (recommended)
--   at least one active super_admin (pnpm run admin:seed-super)
--
-- If admin.record_authorisers is missing (v95 not applied yet), this file
-- bootstraps that table only so the demo row can be inserted. For full
-- lifecycle features still run: pnpm run admin:migrate-record-lifecycle
--
-- Assigns the first active super_admin as level-1 authoriser on the low-risk
-- pilot table only (cancellation_reason_categories).
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.record_authorisers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    authoriser_admin_user_id UUID NOT NULL REFERENCES admin.admin_users(id) ON DELETE CASCADE,
    approval_level INTEGER NOT NULL DEFAULT 1 CHECK (approval_level >= 1),
    role_label TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES admin.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_record_authorisers UNIQUE (table_name, authoriser_admin_user_id)
);

CREATE INDEX IF NOT EXISTS idx_record_authorisers_table_level
    ON admin.record_authorisers (table_name, approval_level) WHERE is_active = TRUE;

GRANT SELECT, INSERT, UPDATE, DELETE ON admin.record_authorisers TO authenticated, service_role;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'admin'
          AND table_name = 'record_lifecycle_config'
    ) THEN
        RAISE NOTICE 'v105: record_lifecycle_config missing — run v95/v101 for full lifecycle setup.';
    END IF;
END $$;

INSERT INTO admin.record_authorisers (
    id,
    table_name,
    authoriser_admin_user_id,
    approval_level,
    role_label,
    is_active,
    created_by
)
SELECT
    'b8050001-0001-4001-8105-000000000001'::uuid,
    'cancellation_reason_categories',
    au.id,
    1,
    'Super Admin',
    TRUE,
    au.id
FROM admin.admin_users au
WHERE au.role = 'super_admin'
  AND au.activation_status = 'active'
ORDER BY au.created_at
LIMIT 1
ON CONFLICT (table_name, authoriser_admin_user_id) DO UPDATE SET
    approval_level = EXCLUDED.approval_level,
    role_label = EXCLUDED.role_label,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM admin.record_authorisers
    WHERE table_name = 'cancellation_reason_categories';

    IF v_count = 0 THEN
        RAISE NOTICE 'v105: No active super_admin found — demo authoriser skipped. Run pnpm run admin:seed-super first.';
    ELSE
        RAISE NOTICE 'v105: Demo authoriser seeded for cancellation_reason_categories (% row(s)).', v_count;
    END IF;
END $$;
