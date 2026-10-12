-- ============================================================================
-- v220: ID Generation rules — control_accounts + deliverable_register (Platform + Sim)
-- Companion to project-nidus SQL/v1025 and v1026.
--
-- Abbreviation note: preferred "CA" is often already claimed by an earlier active
-- rule (bulk seed). This script picks the first free candidate instead of
-- raising P0001 from admin.create_id_generation_rule.
-- ============================================================================

CREATE OR REPLACE FUNCTION admin._v220_pick_id_abbrev(p_target TEXT, p_candidates TEXT[])
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  c TEXT;
BEGIN
  FOREACH c IN ARRAY p_candidates LOOP
    c := upper(trim(c));
    IF c !~ '^[A-Z]{1,4}$' THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM admin.id_generation_rules r
      WHERE r.table_abbreviation = c
        AND r.is_active = TRUE
        AND r.target_table IS DISTINCT FROM p_target
    ) THEN
      RETURN c;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'No free abbreviation among % for %', p_candidates, p_target;
END;
$$;

DO $$
DECLARE
  v_admin UUID;
  v_rule_id UUID;
  v_abbrev TEXT;
BEGIN
  SELECT id INTO v_admin
  FROM admin.admin_users
  WHERE role = 'super_admin' AND activation_status = 'active'
  ORDER BY created_at
  LIMIT 1;

  -- public.control_accounts (prefer CA, then CAC / CTA / CACC)
  SELECT id INTO v_rule_id FROM admin.id_generation_rules WHERE target_table = 'public.control_accounts' LIMIT 1;
  IF v_rule_id IS NULL THEN
    v_abbrev := admin._v220_pick_id_abbrev('public.control_accounts', ARRAY['CA', 'CAC', 'CTA', 'CACC']);
    PERFORM admin.create_id_generation_rule(
      'public.control_accounts', v_abbrev, 'Control Accounts display ID (Platform)',
      '-', '', 'uppercase', 'numeric', 0, 4, '', 1, TRUE, v_admin,
      'sequential', TRUE, 'YYYY', 'project_id'
    );
    RAISE NOTICE 'v220: public.control_accounts → abbreviation %', v_abbrev;
  END IF;

  -- public.deliverable_register
  SELECT id INTO v_rule_id FROM admin.id_generation_rules WHERE target_table = 'public.deliverable_register' LIMIT 1;
  IF v_rule_id IS NULL THEN
    v_abbrev := admin._v220_pick_id_abbrev('public.deliverable_register', ARRAY['DEL', 'DLVR', 'DREG']);
    PERFORM admin.create_id_generation_rule(
      'public.deliverable_register', v_abbrev, 'Deliverable Register display ID (Platform)',
      '-', '', 'uppercase', 'numeric', 0, 4, '', 1, TRUE, v_admin,
      'sequential', TRUE, 'YYYY', 'project_id'
    );
    RAISE NOTICE 'v220: public.deliverable_register → abbreviation %', v_abbrev;
  END IF;

  -- sim.control_accounts
  SELECT id INTO v_rule_id FROM admin.id_generation_rules WHERE target_table = 'sim.control_accounts' LIMIT 1;
  IF v_rule_id IS NULL THEN
    v_abbrev := admin._v220_pick_id_abbrev('sim.control_accounts', ARRAY['SCA', 'SCAC', 'SCTA']);
    PERFORM admin.create_id_generation_rule(
      'sim.control_accounts', v_abbrev, 'Control Accounts display ID (Simulator)',
      '-', '', 'uppercase', 'numeric', 0, 4, '', 1, TRUE, v_admin,
      'sequential', TRUE, 'YYYY', 'practice_project_id'
    );
    RAISE NOTICE 'v220: sim.control_accounts → abbreviation %', v_abbrev;
  END IF;

  -- sim.deliverable_register
  SELECT id INTO v_rule_id FROM admin.id_generation_rules WHERE target_table = 'sim.deliverable_register' LIMIT 1;
  IF v_rule_id IS NULL THEN
    v_abbrev := admin._v220_pick_id_abbrev('sim.deliverable_register', ARRAY['SDEL', 'SDLV', 'SDRG']);
    PERFORM admin.create_id_generation_rule(
      'sim.deliverable_register', v_abbrev, 'Deliverable Register display ID (Simulator)',
      '-', '', 'uppercase', 'numeric', 0, 4, '', 1, TRUE, v_admin,
      'sequential', TRUE, 'YYYY', 'practice_project_id'
    );
    RAISE NOTICE 'v220: sim.deliverable_register → abbreviation %', v_abbrev;
  END IF;

  RAISE NOTICE 'v220: Scope & Deliverables ID generation rules seeded';
END $$;

DROP FUNCTION IF EXISTS admin._v220_pick_id_abbrev(TEXT, TEXT[]);
