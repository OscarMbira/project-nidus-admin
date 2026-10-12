-- v212_seed_daily_logs_sequence_from_existing_max.sql
--
-- Root cause: v211 correctly switched public.daily_logs' rule to sequential mode, but the
-- actual per-period counter lives in a SEPARATE table (admin.id_generation_sequences, keyed
-- by rule_id + scope_value + period_key), not the rules row itself. Since this table had no
-- prior row for daily_logs (sequential mode was never actually exercised for this table
-- before now), its first real call inserts a fresh counter starting at the rule's seed_value
-- (1) — colliding immediately with "DL-2026-001", a row created years ago by the old,
-- now-removed generate_log_reference() function, before any of this Admin ID Generation
-- machinery applied to daily_logs at all.
--
-- Fix: seed admin.id_generation_sequences for this rule + the current YYYY period so the
-- counter starts past every log_reference already in use, computed dynamically from
-- public.daily_logs itself (not hand-typed) so this is accurate regardless of what's
-- actually in the table.

DO $$
DECLARE
    v_rule_id    UUID;
    v_period_key TEXT := to_char(CURRENT_DATE, 'YYYY');
    v_max_seq    BIGINT;
BEGIN
    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE target_table = 'public.daily_logs'
    LIMIT 1;

    IF v_rule_id IS NULL THEN
        RAISE EXCEPTION 'v212: no id_generation_rules row for public.daily_logs — run v211 first.';
    END IF;

    -- Highest numeric suffix already in use for the current year's references
    -- (format: DL-YYYY-NNN — take everything after the last '-').
    SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(log_reference, '-', 3), '\D', '', 'g'), '')::BIGINT), 0)
    INTO v_max_seq
    FROM public.daily_logs
    WHERE log_reference LIKE 'DL-' || v_period_key || '-%';

    INSERT INTO admin.id_generation_sequences (rule_id, scope_value, period_key, current_value)
    VALUES (v_rule_id, NULL, v_period_key, v_max_seq)
    ON CONFLICT ON CONSTRAINT uq_id_generation_sequences_rule_scope_period
    DO UPDATE SET
        current_value = GREATEST(admin.id_generation_sequences.current_value, EXCLUDED.current_value),
        updated_at = NOW();

    RAISE NOTICE 'v212: daily_logs % sequence counter seeded at % — next generated reference will be DL-%-%.',
        v_period_key, v_max_seq, v_period_key, LPAD((v_max_seq + 1)::TEXT, 3, '0');
END $$;
