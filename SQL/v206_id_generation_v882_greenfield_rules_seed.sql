-- ============================================================================
-- v206: ID Generation rules for the 4 v882 "greenfield" Platform tables
-- Admin schema — companion to project-nidus SQL/v887_v882_greenfield_reference_columns.sql
-- Prerequisites: v156_id_generation_sequential_entity_rules_seed.sql (pattern reference)
-- Tables: public.agile_releases, public.requirements_register, public.activity_list,
--         public.project_opa_customisations — see project-nidus
--         projectplan/v882_friendly_urls_systemwide_plan.md (Phase 2)
--
-- Single self-contained DO block (no separate CREATE TEMP TABLE statement) —
-- Supabase's pooled SQL editor connection does not reliably preserve a session
-- temp table across separate statements, so the row data lives in an inline
-- VALUES list instead.
-- ============================================================================

DO $$
DECLARE
    v_admin UUID;
    r RECORD;
    v_rule_id UUID;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    FOR r IN
        SELECT * FROM (VALUES
            ('public.agile_releases'::TEXT, 'REL'::VARCHAR(4), 'Agile release references'::TEXT, FALSE::BOOLEAN, NULL::TEXT, 'project_id'::TEXT, 3::INTEGER, '-'::VARCHAR(2)),
            ('public.requirements_register', 'REQ', 'Requirement identifiers', FALSE, NULL, 'project_id', 3, '-'),
            ('public.activity_list', 'ACT', 'Schedule activity identifiers', FALSE, NULL, 'project_id', 3, '-'),
            ('public.project_opa_customisations', 'OPAC', 'Project OPA customisation references', FALSE, NULL, 'project_id', 3, '-')
        ) AS t(target_table, table_abbreviation, table_description, include_date, date_format, scope_column, num_digits, separator)
        ORDER BY target_table
    LOOP
        IF to_regclass(r.target_table) IS NULL THEN
            RAISE NOTICE 'v206: skipping % — table does not exist yet in this database', r.target_table;
            CONTINUE;
        END IF;

        SELECT id INTO v_rule_id
        FROM admin.id_generation_rules
        WHERE target_table = r.target_table
        LIMIT 1;

        IF v_rule_id IS NOT NULL THEN
            PERFORM admin.update_id_generation_rule(
                v_rule_id,
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                r.separator,
                '',
                'uppercase',
                'numeric',
                0,
                r.num_digits,
                '',
                1,
                TRUE,
                v_admin,
                'sequential',
                r.include_date,
                r.date_format,
                r.scope_column
            );
        ELSE
            PERFORM admin.create_id_generation_rule(
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                r.separator,
                '',
                'uppercase',
                'numeric',
                0,
                r.num_digits,
                '',
                1,
                TRUE,
                v_admin,
                'sequential',
                r.include_date,
                r.date_format,
                r.scope_column
            );
        END IF;
    END LOOP;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v206_id_generation_v882_greenfield_rules_seed.sql applied';
END $$;
