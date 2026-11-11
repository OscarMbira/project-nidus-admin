-- ============================================================================
-- v245: ID Generation rule for sim.requirements_register (Simulator requirement codes)
-- Admin schema — companion to project-nidus SQL/v1392_sim_requirements_register_id_generation.sql
-- Feature: project-nidus projectprd/v1338_ict_requirements_specification_PRD.md (D11 samples, rule 16.2)
-- public.requirements_register already has its rule (v206: REQ, per project). The Simulator table
-- gets the same format with the Simulator prefix convention (SREQ — abbreviations must be unique
-- across active rules, cf. SPD / SCI / SWP in v156), numbered per practice project.
-- Pattern: v206_id_generation_v882_greenfield_rules_seed.sql. Idempotent.
-- ============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_rule_id UUID;
BEGIN
    IF to_regclass('sim.requirements_register') IS NULL THEN
        RAISE NOTICE 'v245: skipping — sim.requirements_register does not exist in this database';
        RETURN;
    END IF;

    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE target_table = 'sim.requirements_register'
    LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
        PERFORM admin.update_id_generation_rule(
            v_rule_id, 'sim.requirements_register', 'SREQ', 'Simulator requirement identifiers',
            '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE, v_admin,
            'sequential', FALSE, NULL, 'practice_project_id'
        );
    ELSE
        PERFORM admin.create_id_generation_rule(
            'sim.requirements_register', 'SREQ', 'Simulator requirement identifiers',
            '-', '', 'uppercase', 'numeric', 0, 3, '', 1, TRUE, v_admin,
            'sequential', FALSE, NULL, 'practice_project_id'
        );
    END IF;
END $$;

DO $$
BEGIN
    RAISE NOTICE 'v245_sim_requirements_register_id_generation_seed.sql applied';
END $$;
