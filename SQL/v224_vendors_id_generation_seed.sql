-- =============================================================================
-- v224: Sequential ID rule for vendor codes
-- Companion monorepo SQL: E:\project-nidus\SQL\v1210_vendor_code_id_generation.sql
-- Code: VEN-2026-001 per organisation (public.vendors.vendor_code)
--       VND-2026-001 when VEN is already an active abbreviation
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
        RAISE NOTICE 'v224: no active super_admin — skipping ID rule seed (apply when an admin exists)';
        RETURN;
    END IF;

    v_abbrev := 'VEN';
    IF EXISTS (
        SELECT 1
        FROM admin.id_generation_rules
        WHERE upper(table_abbreviation) = 'VEN'
          AND is_active = TRUE
          AND admin.normalize_id_generation_target_table(target_table)
              <> admin.normalize_id_generation_target_table('public.vendors')
    ) THEN
        v_abbrev := 'VND';
    END IF;

    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE admin.normalize_id_generation_target_table(target_table)
        = admin.normalize_id_generation_target_table('public.vendors')
    LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
        PERFORM admin.update_id_generation_rule(
            v_rule_id,
            'public.vendors',
            v_abbrev,
            'Vendor codes',
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
            'account_id'
        );
    ELSE
        PERFORM admin.create_id_generation_rule(
            'public.vendors',
            v_abbrev,
            'Vendor codes',
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
            'account_id'
        );
    END IF;

    RAISE NOTICE 'v224: vendor code ID rule seeded (%)', v_abbrev;
END $$;
