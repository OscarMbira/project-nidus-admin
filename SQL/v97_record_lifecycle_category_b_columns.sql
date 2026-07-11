-- ============================================================================
-- v97: Record lifecycle Category B columns for pilot tables
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v96_record_lifecycle_functions.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.ensure_lifecycle_live_columns(p_target_table regclass)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_schema_name TEXT;
    v_table_name TEXT;
    v_constraint_name TEXT;
BEGIN
    SELECT n.nspname, c.relname
    INTO v_schema_name, v_table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = p_target_table;

    IF v_schema_name IS NULL OR v_table_name IS NULL THEN
        RAISE EXCEPTION 'Table not found for regclass: %', p_target_table;
    END IF;

    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS record_status TEXT NOT NULL DEFAULT ''live''',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS root_record_id UUID',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS parent_record_id UUID',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS authorised_by UUID REFERENCES admin.admin_users(id)',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS authorised_at TIMESTAMPTZ',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ',
        v_schema_name, v_table_name
    );
    EXECUTE format(
        'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES admin.admin_users(id)',
        v_schema_name, v_table_name
    );

    v_constraint_name := format('ck_%s_record_status', v_table_name);
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint co
        WHERE co.conname = v_constraint_name
          AND co.conrelid = p_target_table
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I.%I
             ADD CONSTRAINT %I
             CHECK (record_status IN (''unauthorised'', ''live'', ''history'', ''archived''))',
            v_schema_name, v_table_name, v_constraint_name
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin.ensure_lifecycle_category_b(p_table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_table_qualified TEXT := admin.resolve_lifecycle_table(p_table_name);
    v_table_name TEXT := split_part(v_table_qualified, '.', 2);
BEGIN
    PERFORM admin.ensure_lifecycle_live_columns(v_table_qualified::regclass);

    EXECUTE format(
        'UPDATE %s
         SET record_status = ''live'',
             root_record_id = COALESCE(root_record_id, id),
             record_version = COALESCE(record_version, 1),
             updated_at = NOW()
         WHERE record_status IS DISTINCT FROM ''live''
            OR root_record_id IS NULL
            OR record_version IS NULL',
        v_table_qualified
    );

END;
$$;

-- Pilot tables
SELECT admin.ensure_lifecycle_category_b('subscription_plans');
SELECT admin.ensure_lifecycle_category_b('affiliates');
SELECT admin.ensure_lifecycle_category_b('payment_gateways');
SELECT admin.ensure_lifecycle_category_b('cancellation_reason_categories');

GRANT EXECUTE ON FUNCTION admin.ensure_lifecycle_live_columns(regclass) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.ensure_lifecycle_category_b(TEXT) TO authenticated, service_role;
