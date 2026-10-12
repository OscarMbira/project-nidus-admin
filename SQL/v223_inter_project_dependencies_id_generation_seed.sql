-- =============================================================================
-- v223: Sequential ID rule for inter-project dependency codes
-- Companion monorepo SQL: E:\project-nidus\SQL\v1120_inter_project_dependencies_id_generation.sql
-- Code: DEP-2026-001 (public.inter_project_dependencies.dependency_code)
--       IPD-2026-001 when DEP is already an active abbreviation
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
    v_admin UUID;
    v_rule_id UUID;
    v_abbrev VARCHAR(4);
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'v223: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    v_abbrev := 'DEP';
    IF EXISTS (
        SELECT 1
        FROM admin.id_generation_rules
        WHERE upper(table_abbreviation) = 'DEP'
          AND is_active = TRUE
          AND admin.normalize_id_generation_target_table(target_table)
              <> admin.normalize_id_generation_target_table('public.inter_project_dependencies')
    ) THEN
        v_abbrev := 'IPD';
    END IF;

    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE admin.normalize_id_generation_target_table(target_table)
        = admin.normalize_id_generation_target_table('public.inter_project_dependencies')
    LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
        PERFORM admin.update_id_generation_rule(
            v_rule_id,
            'public.inter_project_dependencies',
            v_abbrev,
            'Inter-project dependency codes',
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
    ELSE
        PERFORM admin.create_id_generation_rule(
            'public.inter_project_dependencies',
            v_abbrev,
            'Inter-project dependency codes',
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

    RAISE NOTICE 'v223: inter-project dependency ID rule seeded (%)', v_abbrev;
END $$;
