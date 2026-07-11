-- ============================================================================
-- v147: Resolve ID generation rule by target table (normalized lookup)
-- PostgreSQL 15+ / Supabase
-- Fixes create/edit form when target_table is stored qualified or legacy bare.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin.normalize_id_generation_target_table(p_target_table TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN trim(COALESCE(p_target_table, '')) = '' THEN ''
        WHEN position('.' IN trim(p_target_table)) > 0 THEN
            lower(split_part(trim(p_target_table), '.', 1))
            || '.'
            || trim(substring(trim(p_target_table) FROM position('.' IN trim(p_target_table)) + 1))
        ELSE 'public.' || trim(p_target_table)
    END;
$$;

COMMENT ON FUNCTION admin.normalize_id_generation_target_table(TEXT) IS
    'Canonical schema.table for id_generation_rules.target_table (bare names -> public.*).';

CREATE OR REPLACE FUNCTION admin.resolve_id_generation_rule_by_target_table(p_target_table TEXT)
RETURNS SETOF admin.id_generation_rules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_normalized TEXT;
BEGIN
    IF NOT admin.check_admin_permission(admin.current_admin_user_id(), 'system.id_generation.view') THEN
        RAISE EXCEPTION 'Permission denied: system.id_generation.view required';
    END IF;

    v_normalized := admin.normalize_id_generation_target_table(p_target_table);
    IF v_normalized = '' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT r.*
    FROM admin.id_generation_rules r
    WHERE admin.normalize_id_generation_target_table(r.target_table) = v_normalized
    ORDER BY r.is_active DESC, r.updated_at DESC NULLS LAST, r.created_at DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION admin.normalize_id_generation_target_table(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin.resolve_id_generation_rule_by_target_table(TEXT) TO authenticated, service_role;

DO $$
BEGIN
    RAISE NOTICE 'v147: resolve_id_generation_rule_by_target_table applied.';
END $$;
