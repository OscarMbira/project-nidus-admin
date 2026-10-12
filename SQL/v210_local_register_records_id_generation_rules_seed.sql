-- ============================================================================
-- v210: ID Generation rules for the Local Register Engine's record tables
-- Admin schema — companion to project-nidus SQL/v931 (public.local_register_records) and
-- SQL/v938 (sim.local_register_records, Simulator's practice-hierarchy extension)
--
-- Both tables' display_id column is wired to trg_apply_admin_display_id (v756 helper) and
-- would already fall back to an auto-created default rule via admin._id_gen_ensure_rule() on
-- first insert if left unseeded (v30) — this seed just gives them a curated
-- abbreviation/description up front per rule 14, rather than relying on that fallback.
-- ============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_rule_id UUID;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    -- public.local_register_records (Platform)
    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE target_table = 'public.local_register_records'
    LIMIT 1;

    IF v_rule_id IS NULL THEN
        PERFORM admin.create_id_generation_rule(
            'public.local_register_records',
            'LREG',
            'Local Register Engine record references (Platform)',
            '-',
            '',
            'uppercase',
            'numeric',
            0,
            3,
            '',
            1,
            TRUE,
            v_admin,
            'sequential',
            TRUE,
            'YYYY',
            NULL
        );
    END IF;

    -- sim.local_register_records (Simulator practice hierarchy)
    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE target_table = 'sim.local_register_records'
    LIMIT 1;

    IF v_rule_id IS NULL THEN
        PERFORM admin.create_id_generation_rule(
            'sim.local_register_records',
            'SLRG',
            'Local Register Engine record references (Simulator)',
            '-',
            '',
            'uppercase',
            'numeric',
            0,
            3,
            '',
            1,
            TRUE,
            v_admin,
            'sequential',
            TRUE,
            'YYYY',
            NULL
        );
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v210_local_register_records_id_generation_rules_seed.sql applied successfully';
END $$;
