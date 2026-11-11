-- =============================================================================
-- v244: Seed sequential ID rules for Platform/Simulator
--       local_register_templates display_id (v1336 PRD/plan — register record templates).
-- Companion monorepo SQL: E:\project-nidus\SQL\v1336_register_templates_schema.sql
-- Idempotent: safe to re-run.
--
-- Abbreviations: RTPL (Platform) / SRTP (Simulator), with fallbacks.
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    r RECORD;
    v_rule_id UUID;
    v_abbrev_owner UUID;
    v_abbrev TEXT;
    v_candidates TEXT[];
    v_picked TEXT;
    i INT;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v244: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    -- Preferred → fallbacks (≤ 4 uppercase letters).
    FOR r IN
        SELECT *
        FROM (
            VALUES
                ('public.local_register_templates'::text, ARRAY['RTPL', 'RGT', 'LRT']::text[], 'Register record template codes (Platform)'::text, 4),
                ('sim.local_register_templates'::text, ARRAY['SRTP', 'SRGT', 'SLRT']::text[], 'Register record template codes (Simulator)'::text, 4)
        ) AS t(target_table, abbrev_candidates, table_description, num_digits)
    LOOP
        SELECT id INTO v_rule_id
        FROM admin.id_generation_rules
        WHERE admin.normalize_id_generation_target_table(target_table)
            = admin.normalize_id_generation_target_table(r.target_table)
        LIMIT 1;

        -- Keep existing abbreviation if this target already has a rule.
        IF v_rule_id IS NOT NULL THEN
            SELECT table_abbreviation INTO v_picked
            FROM admin.id_generation_rules
            WHERE id = v_rule_id;

            PERFORM admin.update_id_generation_rule(
                v_rule_id,
                r.target_table,
                v_picked,
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
            RAISE NOTICE 'v244: updated rule for % with abbreviation %', r.target_table, v_picked;
            CONTINUE;
        END IF;

        v_picked := NULL;
        v_candidates := r.abbrev_candidates;
        FOR i IN 1 .. array_length(v_candidates, 1) LOOP
            v_abbrev := upper(trim(v_candidates[i]));
            SELECT id INTO v_abbrev_owner
            FROM admin.id_generation_rules
            WHERE upper(table_abbreviation) = v_abbrev
              AND is_active = TRUE
            LIMIT 1;

            IF v_abbrev_owner IS NULL THEN
                v_picked := v_abbrev;
                EXIT;
            END IF;
        END LOOP;

        IF v_picked IS NULL THEN
            RAISE EXCEPTION
                'v244: no free abbreviation for % among % — free one of these (or extend the candidate list)',
                r.target_table,
                array_to_string(v_candidates, ', ');
        END IF;

        PERFORM admin.create_id_generation_rule(
            r.target_table,
            v_picked,
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
        RAISE NOTICE 'v244: created rule for % with abbreviation %', r.target_table, v_picked;
    END LOOP;

    RAISE NOTICE 'v244: register template ID rules seeded (trigger in E:\project-nidus\SQL\v1336_register_templates_schema.sql)';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v244_local_register_templates_id_generation_seed.sql applied';
END $$;
