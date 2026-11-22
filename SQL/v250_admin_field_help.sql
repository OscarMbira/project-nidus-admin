-- ============================================================================
-- v250: Admin field-level help store (Admin rule 23; monorepo v1345 slice 6)
-- PostgreSQL 15+ / Supabase
--
--   admin.field_help — help text for Admin form fields, keyed admin.<table>.<column>.
--   Same columns as public.field_help (minus Simulator aliases). Admin never reads public.field_help.
--   Read: active Admin users (admin.is_active_admin()). Write: versioned SQL only (no client write policy).
--
-- Idempotent. Run before the Admin help seed files (v251+).
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.field_help (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  help_key        TEXT NOT NULL,
  form_key        TEXT NOT NULL DEFAULT '',
  locale          TEXT NOT NULL DEFAULT 'en',
  title           TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  examples        TEXT NOT NULL,
  format_notes    TEXT,
  extra_notes     TEXT,
  module_code     TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_admin_field_help_key UNIQUE (help_key, form_key, locale),
  CONSTRAINT chk_admin_field_help_key CHECK (help_key LIKE 'admin.%')
);

CREATE INDEX IF NOT EXISTS idx_admin_field_help_module ON admin.field_help (module_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_admin_field_help_updated ON admin.field_help (updated_at DESC);

ALTER TABLE admin.field_help ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_field_help_select ON admin.field_help;
CREATE POLICY admin_field_help_select ON admin.field_help
  FOR SELECT TO authenticated
  USING (is_active AND admin.is_active_admin());

GRANT SELECT ON admin.field_help TO authenticated;

-- Register in the table catalogue. public.database_tables is unique on table_name only and 'field_help' is
-- already registered for the public schema (monorepo v1490), so this row is skipped there rather than
-- overwriting the public entry. The table has no human-readable reference column, so ID Generation is not used.
INSERT INTO public.database_tables (table_name, table_description, schema_name, is_system_table, is_active, table_category)
VALUES ('field_help', 'Admin field-level help text (admin.field_help), keys admin.<table>.<column>', 'admin', TRUE, TRUE, 'admin')
ON CONFLICT (table_name) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'v250: admin.field_help ready (RLS: active Admin users read; writes by migration only).';
END $$;
