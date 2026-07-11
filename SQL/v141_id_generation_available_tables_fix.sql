-- ============================================================================
-- v141: get_available_tables — use pg_catalog for complete table listing
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

DO $$
BEGIN
    RAISE NOTICE 'v141: get_available_tables pg_catalog listing applied.';
END $$;
