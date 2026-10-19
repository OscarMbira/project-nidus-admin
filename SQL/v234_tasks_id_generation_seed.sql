-- =============================================================================
-- v234: Sequential ID rules for task references (rule 16.2)
-- Companion monorepo SQL: E:\project-nidus\SQL\v1271_tasks_id_generation.sql (also wires the
-- triggers and fills blank codes; running either file creates the same rules).
-- Codes: TSK-0001  (public.tasks.task_code)
--        STSK-0001 (sim.tasks.task_code)
-- Numbered across all projects: generated codes are unique per table (admin.generated_ids),
-- so per-project numbering would repeat codes and fail.
-- Stops if TSK / STSK already belongs to another table's rule. Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    r RECORD;
    v_rule_id UUID;
    v_taken TEXT;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v234: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    FOR r IN
        SELECT *
        FROM (
            VALUES
                ('public.tasks'::text, 'TSK'::varchar, 'Task references (Platform / Planner)'::text, ''::text, 4),
                ('sim.tasks'::text, 'STSK'::varchar, 'Task references (Simulator)'::text, ''::text, 4)
        ) AS t(target_table, table_abbreviation, table_description, scope_column, num_digits)
    LOOP
        SELECT target_table INTO v_taken
        FROM admin.id_generation_rules
        WHERE upper(table_abbreviation) = upper(r.table_abbreviation)
          AND admin.normalize_id_generation_target_table(target_table) <> admin.normalize_id_generation_target_table(r.target_table)
        LIMIT 1;
        IF v_taken IS NOT NULL THEN
            RAISE EXCEPTION 'v234: prefix % is already used by the ID rule for %', r.table_abbreviation, v_taken;
        END IF;

        SELECT id INTO v_rule_id
        FROM admin.id_generation_rules
        WHERE admin.normalize_id_generation_target_table(target_table)
            = admin.normalize_id_generation_target_table(r.target_table)
        LIMIT 1;

        -- sequential, no date part
        IF v_rule_id IS NOT NULL THEN
            PERFORM admin.update_id_generation_rule(
                v_rule_id, r.target_table, r.table_abbreviation, r.table_description,
                '-', '', 'uppercase', 'numeric', 0, r.num_digits, '', 1, TRUE, v_admin,
                'sequential', FALSE, 'YYYY', r.scope_column
            );
        ELSE
            PERFORM admin.create_id_generation_rule(
                r.target_table, r.table_abbreviation, r.table_description,
                '-', '', 'uppercase', 'numeric', 0, r.num_digits, '', 1, TRUE, v_admin,
                'sequential', FALSE, 'YYYY', r.scope_column
            );
        END IF;
    END LOOP;

    RAISE NOTICE 'v234: task ID generation rules seeded';
END $$;
