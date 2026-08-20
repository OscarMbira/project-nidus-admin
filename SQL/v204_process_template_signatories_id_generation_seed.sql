-- =============================================================================
-- v204: Seed sequential ID rules for Platform/Simulator
--       process_template_document_signatories.display_id (v868 PRD/plan).
-- Companion monorepo SQL: E:\project-nidus\SQL\v868_process_template_signatories_tables.sql,
--                          v868b_process_template_signatories_storage_rls.sql,
--                          v868c_process_template_signatories_display_id_trigger.sql
-- Idempotent: safe to re-run.
--
-- Abbreviations: SIG (Platform) / SSIG (Simulator), with fallbacks in case those
-- collide with an existing rule (same defensive candidate-list pattern as v203,
-- which had to fall back after DAT/PTA collisions on the previous feature).
--
-- process_template_signatory_requirements (PMO Admin config) and
-- user_signature_images (personal asset) intentionally have NO rule here —
-- they don't carry a display_id (see v868 PRD §d).
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
        RAISE NOTICE 'v204: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    -- Preferred → fallbacks (<= 4 uppercase letters). SIG/SSIG preferred.
    FOR r IN
        SELECT *
        FROM (
            VALUES
                (
                    'public.process_template_document_signatories'::text,
                    ARRAY['SIG', 'PSG', 'DSG', 'SGN']::text[],
                    'Process template document signatory codes (Platform)'::text,
                    4
                ),
                (
                    'sim.process_template_document_signatories'::text,
                    ARRAY['SSIG', 'SPSG', 'SDSG', 'SSGN']::text[],
                    'Process template document signatory codes (Simulator)'::text,
                    4
                )
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
            RAISE NOTICE 'v204: updated rule for % with abbreviation %', r.target_table, v_picked;
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
                'v204: no free abbreviation for % among % — free one of these (or extend the candidate list)',
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
        RAISE NOTICE 'v204: created rule for % with abbreviation %', r.target_table, v_picked;
    END LOOP;

    RAISE NOTICE 'v204: process_template_document_signatories ID rules seeded — new rows get codes via E:\project-nidus\SQL\v868c_process_template_signatories_display_id_trigger.sql';
END $$;

DO $$
BEGIN
  RAISE NOTICE 'v204_process_template_signatories_id_generation_seed.sql applied';
END $$;
