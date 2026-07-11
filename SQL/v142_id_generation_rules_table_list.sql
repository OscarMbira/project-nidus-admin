-- ============================================================================
-- v142: Expose admin.id_generation_rules in get_available_tables
-- PostgreSQL 15+ / Supabase
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.get_available_tables()
RETURNS TABLE(table_schema TEXT, table_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    RETURN QUERY
    SELECT pt.schemaname::TEXT, pt.tablename::TEXT
    FROM pg_catalog.pg_tables pt
    WHERE pt.schemaname IN ('public', 'sim', 'admin')
      AND pt.tablename NOT LIKE 'pg\_%' ESCAPE '\'
      AND pt.tablename NOT IN (
          'schema_migrations',
          'supabase_migrations',
          'supabase_functions_migrations',
          'generated_ids'
      )
    ORDER BY pt.schemaname, pt.tablename;
END;
$$;

COMMENT ON FUNCTION admin.get_available_tables() IS
    'Lists schema-qualified tables eligible for ID generation rules (excludes internal generated_ids registry only)';

DO $$
BEGIN
    RAISE NOTICE 'v142: admin.id_generation_rules exposed in get_available_tables.';
END $$;
