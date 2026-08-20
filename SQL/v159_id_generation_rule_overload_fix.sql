-- ============================================================================
-- v159: Fix ambiguous admin.create_id_generation_rule() overload
-- PostgreSQL 15+ / Supabase (admin schema)
--
-- Root cause: v155_id_generation_sequential_mode.sql (superseded by v157)
-- added a new 17-parameter overload of admin.create_id_generation_rule()
-- but never dropped the old 13-parameter overload from v30/v138/v145. The
-- last 4 params of the 17-param version all have defaults, so a positional
-- call with exactly 13 arguments (as used by admin.bulk_seed_id_generation_rules,
-- see v148/v150) matches both overloads and Postgres raises
-- "function ... is not unique" — this is what broke bulk-configure for the
-- newly-registered public.languages / public.form_field_translations /
-- sim.languages / sim.form_field_translations tables.
--
-- Fix: drop the stale 13-param overload, leaving only the current 17-param
-- version (as defined in v157_id_generation_random_date.sql).
-- ============================================================================

DROP FUNCTION IF EXISTS admin.create_id_generation_rule(
    TEXT,           -- p_target_table
    VARCHAR(4),     -- p_table_abbreviation
    TEXT,           -- p_table_description
    VARCHAR(2),     -- p_separator
    TEXT,           -- p_suffix
    TEXT,           -- p_letter_case
    TEXT,           -- p_segment_type
    INTEGER,        -- p_num_letters
    INTEGER,        -- p_num_digits
    TEXT,           -- p_excluded_chars
    BIGINT,         -- p_seed_value
    BOOLEAN,        -- p_is_active
    UUID            -- p_admin_user_id
);

DO $$
DECLARE
    v_overload_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_overload_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'admin' AND p.proname = 'create_id_generation_rule';

    RAISE NOTICE '================================================';
    RAISE NOTICE 'v159 create_id_generation_rule overload fix complete';
    RAISE NOTICE 'Remaining admin.create_id_generation_rule() overloads: %', v_overload_count;
    RAISE NOTICE '================================================';

    IF v_overload_count <> 1 THEN
        RAISE WARNING 'Expected exactly 1 overload of admin.create_id_generation_rule() to remain, found %', v_overload_count;
    END IF;
END $$;
