-- =============================================================================
-- v197: Seed sequential ID rules for Platform/Simulator pm_template_nodes
-- (Organisational Template URLs — CLAUDE.md rule 16.1)
-- Plan: E:\project-nidus\projectplan\v808_form_template_org_required_field_override_plan.md (Phase 9)
-- Prerequisites: E:\project-nidus\SQL\v811_pm_template_nodes_display_id.sql (column/trigger/backfill),
--                v157 (create/update rule RPCs)
-- Idempotent: safe to re-run
-- =============================================================================

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

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v197: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    -- -----------------------------------------------------------------------
    -- Sequential rules: TPL (Platform, public.pm_template_nodes) / STPL (Simulator,
    -- sim.pm_template_nodes) — kept distinct so a reference number alone tells you
    -- which app it came from (4 digits → TPL-0001 / STPL-0001).
    -- -----------------------------------------------------------------------
    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.pm_template_nodes'::text,
                    'TPL'::varchar,
                    'Organisational Template node references (Platform)'::text,
                    4
                ),
                (
                    'sim.pm_template_nodes'::text,
                    'STPL'::varchar,
                    'Organisational Template node references (Simulator)'::text,
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

    RAISE NOTICE 'v197: pm_template_nodes ID rules (TPL/STPL) seeded — re-apply E:\project-nidus\SQL\v811_pm_template_nodes_display_id.sql to backfill existing rows now that the rules exist';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v197_pm_template_nodes_id_generation_seed.sql applied';
END $$;
