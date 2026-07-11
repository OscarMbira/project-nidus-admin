-- ============================================================================
-- v20: ID generation seed data — rules + display ID backfill
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v19_id_generation.sql
--
-- Idempotent: fixed rule UUIDs + ON CONFLICT. Safe to re-run.
-- For abbreviation-uniqueness regeneration across all seeds, run v146 after v145.
-- Skips gracefully when target tables are missing or empty.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Seed rules for all admin UI target tables (plan v2.0)
-- ---------------------------------------------------------------------------
INSERT INTO admin.id_generation_rules (
    id,
    target_table,
    table_abbreviation,
    table_description,
    separator,
    suffix,
    letter_case,
    num_letters,
    num_digits,
    excluded_chars,
    seed_value,
    current_sequence,
    is_active,
    created_by,
    updated_by
)
VALUES
    (
        'a1000001-0001-4001-8001-000000000001'::uuid,
        'public.users',
        'USR',
        'Platform user accounts',
        '-',
        '',
        'uppercase',
        3,
        4,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000001-0001-4001-8001-000000000002'::uuid,
        'public.accounts',
        'ACC',
        'Platform organisations / accounts',
        '-',
        '',
        'uppercase',
        2,
        3,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000001-0001-4001-8001-000000000003'::uuid,
        'public.platform_subscriptions',
        'SUB',
        'Platform and simulator subscription records',
        '-',
        '',
        'uppercase',
        3,
        4,
        'O0I1L',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000001-0001-4001-8001-000000000004'::uuid,
        'public.projects',
        'PRJ',
        'Platform projects overview',
        '-',
        '',
        'uppercase',
        2,
        4,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000002-0002-4002-8002-000000000001'::uuid,
        'sim.scenarios',
        'SCE',
        'Simulator training scenarios',
        '.',
        '',
        'uppercase',
        2,
        4,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000002-0002-4002-8002-000000000002'::uuid,
        'sim.certificates',
        'CRT',
        'Simulator completion certificates',
        '',
        '',
        'uppercase',
        3,
        3,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000002-0002-4002-8002-000000000003'::uuid,
        'sim.leaderboard_entries',
        'LDB',
        'Simulator leaderboard rows',
        '-',
        '',
        'uppercase',
        2,
        4,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000002-0002-4002-8002-000000000004'::uuid,
        'sim.learning_paths',
        'LRN',
        'Simulator learning paths',
        '-',
        '',
        'uppercase',
        3,
        3,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000002-0002-4002-8002-000000000005'::uuid,
        'sim.npcs',
        'NPC',
        'Simulator non-player characters',
        '-',
        '',
        'uppercase',
        3,
        3,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000003-0003-4003-8003-000000000001'::uuid,
        'admin.admin_users',
        'ADU',
        'Admin panel user accounts',
        '-',
        '',
        'uppercase',
        3,
        4,
        '',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    ),
    (
        'a1000003-0003-4003-8003-000000000002'::uuid,
        'admin.support_tickets',
        'SPT',
        'Customer support tickets',
        '*',
        '',
        'uppercase',
        4,
        4,
        'O0I1L',
        1,
        0,
        TRUE,
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1),
        (SELECT id FROM admin.admin_users WHERE role = 'super_admin' AND activation_status = 'active' ORDER BY created_at LIMIT 1)
    )
ON CONFLICT (target_table) WHERE is_active = TRUE
DO UPDATE SET
    table_abbreviation = EXCLUDED.table_abbreviation,
    table_description = EXCLUDED.table_description,
    separator = EXCLUDED.separator,
    suffix = EXCLUDED.suffix,
    letter_case = EXCLUDED.letter_case,
    num_letters = EXCLUDED.num_letters,
    num_digits = EXCLUDED.num_digits,
    excluded_chars = EXCLUDED.excluded_chars,
    seed_value = EXCLUDED.seed_value,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Deterministic demo display IDs for v14 subscription seed UUIDs (when present)
-- ---------------------------------------------------------------------------
INSERT INTO admin.generated_ids (id, target_table, record_id, display_id, rule_id)
SELECT
    v.id,
    v.target_table,
    v.record_id,
    v.display_id,
    r.id
FROM (
    VALUES
        ('b2000001-0001-4001-8001-000000000001'::uuid, 'public.platform_subscriptions'::text, 'b7360001-0001-4000-8000-000000000001'::uuid, 'SUB-A1B2C34'::text),
        ('b2000001-0001-4001-8001-000000000002'::uuid, 'public.platform_subscriptions', 'b7360001-0001-4000-8000-000000000003'::uuid, 'SUB-D5E6F78'),
        ('b2000001-0001-4001-8001-000000000003'::uuid, 'public.platform_subscriptions', 'b7360001-0001-4000-8000-000000000006'::uuid, 'SUB-G9H2J45')
) AS v(id, target_table, record_id, display_id)
INNER JOIN admin.id_generation_rules r
    ON r.target_table = v.target_table
   AND r.is_active = TRUE
WHERE EXISTS (
    SELECT 1
    FROM public.platform_subscriptions ps
    WHERE ps.id = v.record_id
)
ON CONFLICT (target_table, record_id) DO UPDATE SET
    display_id = EXCLUDED.display_id,
    rule_id = EXCLUDED.rule_id;

-- ---------------------------------------------------------------------------
-- Backfill display IDs for existing rows (uses generate_display_id — idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._id_gen_seed_backfill(
    p_target_table TEXT,
    p_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public, sim
AS $$
DECLARE
    v_schema TEXT;
    v_table TEXT;
    v_row RECORD;
    v_count INTEGER := 0;
    v_sql TEXT;
BEGIN
    IF trim(COALESCE(p_target_table, '')) = '' THEN
        RETURN 0;
    END IF;

    v_schema := split_part(p_target_table, '.', 1);
    v_table := split_part(p_target_table, '.', 2);

    IF v_table = '' OR v_table = p_target_table THEN
        RAISE NOTICE 'Skipping invalid target table: %', p_target_table;
        RETURN 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = v_schema
          AND t.table_name = v_table
          AND t.table_type = 'BASE TABLE'
    ) THEN
        RAISE NOTICE 'Table % does not exist — skipping backfill', p_target_table;
        RETURN 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM admin.id_generation_rules r
        WHERE r.target_table = p_target_table
          AND r.is_active = TRUE
    ) THEN
        RAISE NOTICE 'No active rule for % — skipping backfill', p_target_table;
        RETURN 0;
    END IF;

    v_sql := format(
        'SELECT id FROM %I.%I ORDER BY created_at NULLS LAST, id LIMIT %s',
        v_schema,
        v_table,
        GREATEST(COALESCE(p_limit, 100), 1)
    );

    FOR v_row IN EXECUTE v_sql
    LOOP
        PERFORM admin.generate_display_id(p_target_table, v_row.id);
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

DO $$
DECLARE
    v_table TEXT;
    v_total INTEGER := 0;
    v_batch INTEGER;
    v_targets TEXT[] := ARRAY[
        'public.users',
        'public.accounts',
        'public.platform_subscriptions',
        'public.projects',
        'sim.scenarios',
        'sim.certificates',
        'sim.leaderboard_entries',
        'sim.learning_paths',
        'sim.npcs',
        'admin.admin_users',
        'admin.support_tickets'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_targets
    LOOP
        v_batch := admin._id_gen_seed_backfill(v_table, 100);
        v_total := v_total + COALESCE(v_batch, 0);
        RAISE NOTICE 'ID generation backfill: % → % rows', v_table, v_batch;
    END LOOP;

    RAISE NOTICE 'v20: ID generation seed complete — % display IDs ensured across target tables.', v_total;
END $$;

DROP FUNCTION IF EXISTS admin._id_gen_seed_backfill(TEXT, INTEGER);

-- ---------------------------------------------------------------------------
-- Register tables in database_tables (when catalog exists)
-- ---------------------------------------------------------------------------
INSERT INTO public.database_tables (table_name, table_description, schema_name, is_system_table, is_active, table_category)
VALUES
    ('id_generation_rules', 'Human-readable display ID format rules per schema-qualified table', 'admin', TRUE, TRUE, 'admin'),
    ('generated_ids', 'Maps schema-qualified table rows to human-readable display IDs', 'admin', FALSE, TRUE, 'admin')
ON CONFLICT (table_name) DO UPDATE SET
    table_description = EXCLUDED.table_description,
    schema_name = EXCLUDED.schema_name,
    is_system_table = EXCLUDED.is_system_table,
    is_active = EXCLUDED.is_active,
    table_category = EXCLUDED.table_category,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v20: ID generation seed data applied.';
END $$;
