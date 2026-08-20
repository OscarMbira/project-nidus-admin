-- =============================================================================
-- v202: Seed sequential ID rules for Platform/Simulator
--       form_field_attachments.display_id (v863 PRD/plan, monorepo CLAUDE.md
--       rule 16.2 — attachment versioning decision #16).
-- Companion monorepo SQL: E:\project-nidus\SQL\v861_form_field_attachments_table.sql,
--                          v862_form_field_attachments_sim.sql,
--                          v864_form_field_attachments_display_id_trigger.sql
--                          (trigger fires only on version_number = 1 inserts —
--                          later versions copy display_id forward client-side).
-- Idempotent: safe to re-run.
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
        RAISE NOTICE 'v202: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    -- IMG (Platform) / SIMG (Simulator) — sequential, no date, uppercase, separator -
    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.form_field_attachments'::text,
                    'IMG'::varchar,
                    'Form field attachment codes (Platform)'::text,
                    4
                ),
                (
                    'sim.form_field_attachments'::text,
                    'SIMG'::varchar,
                    'Form field attachment codes (Simulator)'::text,
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

    RAISE NOTICE 'v202: form_field_attachments ID rules (IMG/SIMG) seeded — new (version_number=1) rows get codes via E:\project-nidus\SQL\v864_form_field_attachments_display_id_trigger.sql';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v202_form_field_attachments_id_generation_seed.sql applied';
END $$;
