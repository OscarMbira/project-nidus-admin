-- =============================================================================
-- v193b: Seed sequential ID rules for Global Templates + backfill display_id
-- Plan: projectplans/v195_global_template_id_generation_plan.md
-- Prerequisites: v193_global_template_id_generation.sql, v157 (create/update rule RPCs)
-- Idempotent: safe to re-run
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    r RECORD;
    v_rule_id UUID;
    v_row RECORD;
    v_display TEXT;
    v_n INTEGER := 0;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v193b: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    -- -----------------------------------------------------------------------
    -- 1) Sequential rules: GTL / GTV (4 digits → GTL-0001)
    -- -----------------------------------------------------------------------
    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'admin.global_template_library'::text,
                    'GTL'::varchar,
                    'Global Template Library references'::text,
                    4
                ),
                (
                    'admin.global_template_versions'::text,
                    'GTV'::varchar,
                    'Global Template version snapshot references'::text,
                    4
                )
        ) AS t(target_table, table_abbreviation, table_description, num_digits)
    LOOP
        SELECT id INTO v_rule_id
        FROM admin.id_generation_rules
        WHERE admin.normalize_id_generation_target_table(target_table)
            = admin.normalize_id_generation_target_table(r.target_table)
        LIMIT 1;

        IF v_rule_id IS NOT NULL THEN
            PERFORM admin.update_id_generation_rule(
                v_rule_id,
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                '-',
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
                FALSE,
                NULL,
                NULL
            );
        ELSE
            PERFORM admin.create_id_generation_rule(
                r.target_table,
                r.table_abbreviation,
                r.table_description,
                '-',
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
                FALSE,
                NULL,
                NULL
            );
        END IF;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 2) Backfill display_id on library rows
    -- -----------------------------------------------------------------------
    FOR v_row IN
        SELECT id
        FROM admin.global_template_library
        WHERE display_id IS NULL
        ORDER BY created_at NULLS LAST, name, id
    LOOP
        v_display := admin.generate_display_id('admin.global_template_library', v_row.id);
        UPDATE admin.global_template_library
        SET display_id = v_display
        WHERE id = v_row.id
          AND display_id IS NULL;
        v_n := v_n + 1;
    END LOOP;

    RAISE NOTICE 'v193b: backfilled % global_template_library display_id value(s)', v_n;

    v_n := 0;
    FOR v_row IN
        SELECT id
        FROM admin.global_template_versions
        WHERE display_id IS NULL
        ORDER BY changed_at NULLS LAST, template_id, version_number, id
    LOOP
        v_display := admin.generate_display_id('admin.global_template_versions', v_row.id);
        UPDATE admin.global_template_versions
        SET display_id = v_display
        WHERE id = v_row.id
          AND display_id IS NULL;
        v_n := v_n + 1;
    END LOOP;

    RAISE NOTICE 'v193b: backfilled % global_template_versions display_id value(s)', v_n;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v193b_global_template_id_generation_seed.sql applied';
END $$;
