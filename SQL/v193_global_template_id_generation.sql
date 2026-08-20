-- =============================================================================
-- v193: Global Template Library — display_id columns + generate-on-insert
-- Plan: projectplans/v195_global_template_id_generation_plan.md
-- Prerequisites: v160 (GTL tables), v157 (generate_display_id sequential)
-- Companion seed: v193b_global_template_id_generation_seed.sql (apply after this)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) display_id columns
-- ---------------------------------------------------------------------------
ALTER TABLE admin.global_template_library
  ADD COLUMN IF NOT EXISTS display_id TEXT;

ALTER TABLE admin.global_template_versions
  ADD COLUMN IF NOT EXISTS display_id TEXT;

COMMENT ON COLUMN admin.global_template_library.display_id IS
  'Human-readable ID from admin.id_generation_rules (abbrev GTL, sequential).';
COMMENT ON COLUMN admin.global_template_versions.display_id IS
  'Human-readable ID from admin.id_generation_rules (abbrev GTV, sequential).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_gtl_display_id
  ON admin.global_template_library (display_id)
  WHERE display_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gtv_display_id
  ON admin.global_template_versions (display_id)
  WHERE display_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gtl_display_id
  ON admin.global_template_library (display_id)
  WHERE display_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Admin-schema AFTER INSERT helper (mirrors public.trg_apply_admin_display_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin.trg_apply_admin_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_target_table TEXT := TG_ARGV[0];
    v_column       TEXT := TG_ARGV[1];
    v_display_id   TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RETURN NULL;
    END IF;

    EXECUTE format('SELECT ($1).%I', v_column)
    INTO v_display_id
    USING NEW;

    IF v_display_id IS NOT NULL AND btrim(v_display_id) <> '' THEN
        RETURN NULL;
    END IF;

    -- Rule may not exist yet (seed order); skip quietly so content seeds still insert.
    IF NOT EXISTS (
        SELECT 1
        FROM admin.id_generation_rules r
        WHERE admin.normalize_id_generation_target_table(r.target_table)
            = admin.normalize_id_generation_target_table(v_target_table)
          AND COALESCE(r.is_active, TRUE) = TRUE
        LIMIT 1
    ) THEN
        RETURN NULL;
    END IF;

    v_display_id := admin.generate_display_id(v_target_table, NEW.id);

    EXECUTE format(
        'UPDATE %s SET %I = $1 WHERE id = $2',
        v_target_table,
        v_column
    )
    USING v_display_id, NEW.id;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION admin.trg_apply_admin_display_id() IS
  'AFTER INSERT — sets display_id via admin.generate_display_id when an active rule exists.';

DROP TRIGGER IF EXISTS trg_gtl_admin_display_id ON admin.global_template_library;
CREATE TRIGGER trg_gtl_admin_display_id
  AFTER INSERT ON admin.global_template_library
  FOR EACH ROW
  EXECUTE FUNCTION admin.trg_apply_admin_display_id(
    'admin.global_template_library',
    'display_id'
  );

DROP TRIGGER IF EXISTS trg_gtv_admin_display_id ON admin.global_template_versions;
CREATE TRIGGER trg_gtv_admin_display_id
  AFTER INSERT ON admin.global_template_versions
  FOR EACH ROW
  EXECUTE FUNCTION admin.trg_apply_admin_display_id(
    'admin.global_template_versions',
    'display_id'
  );

-- ---------------------------------------------------------------------------
-- 3) Register in database_tables (when catalog exists)
-- ---------------------------------------------------------------------------
INSERT INTO public.database_tables (
  table_name, table_description, schema_name, is_system_table, is_active, table_category
)
VALUES
  (
    'global_template_library',
    'Nidus-authored Global Template Library (Admin source of truth)',
    'admin',
    FALSE,
    TRUE,
    'admin'
  ),
  (
    'global_template_versions',
    'Version snapshots for Global Template Library rows',
    'admin',
    FALSE,
    TRUE,
    'admin'
  )
ON CONFLICT (table_name) DO UPDATE SET
  table_description = EXCLUDED.table_description,
  schema_name = EXCLUDED.schema_name,
  is_system_table = EXCLUDED.is_system_table,
  is_active = EXCLUDED.is_active,
  table_category = EXCLUDED.table_category,
  updated_at = NOW();

DO $$
BEGIN
  RAISE NOTICE 'v193_global_template_id_generation.sql applied';
END $$;
