-- ============================================================================
-- v246: ID Generation — realign sequential counters with the IDs already issued
-- ============================================================================
-- Incident 2026-11-10: the monorepo seed SQL/v1402 failed with
--   23505 duplicate key ... uq_generated_ids_table_display (public.local_register_records, LREG-2026-100)
-- The sequential counter for the LREG rule (admin.id_generation_sequences) was behind the highest
-- number in admin.generated_ids, so admin.generate_display_id handed out a number already used.
--
-- Fix: for every sequential rule without a scope column, read the highest number already issued
-- per period (e.g. 2026 for LREG-2026-nnn) and move the counter up to it. Counters only move up,
-- never down, so running this again is safe and changes nothing once counters are aligned.
-- Rules with a scope column are left alone (their scope value is not in the issued ID).
-- Written as a single statement with no functions, so the Supabase SQL editor does not add its
-- automatic row-level-security statement. Run before re-running monorepo v1402.
-- Idempotent.
-- ============================================================================

INSERT INTO admin.id_generation_sequences (rule_id, scope_value, period_key, current_value)
SELECT m.rule_id, NULL, m.period_key, m.max_n
FROM (
  SELECT p.rule_id, p.period_key, max(p.n) AS max_n
  FROM (
    SELECT u.rule_id,
           CASE WHEN u.include_date
                THEN NULLIF(left(u.rest, length(u.rest) - length(substring(u.rest from '([0-9]+)$')) - length(u.sep)), '')
           END AS period_key,
           substring(u.rest from '([0-9]+)$')::BIGINT AS n
    FROM (
      SELECT r.id AS rule_id, r.include_date, COALESCE(r.separator, '') AS sep,
             substr(g.display_id,
                    length(r.table_abbreviation || COALESCE(r.separator, '')) + 1,
                    length(g.display_id) - length(r.table_abbreviation || COALESCE(r.separator, '')) - length(COALESCE(r.suffix, ''))) AS rest
      FROM admin.id_generation_rules r
      JOIN admin.generated_ids g ON g.target_table = r.target_table
      WHERE r.generation_mode = 'sequential'
        AND r.scope_column IS NULL
        AND left(g.display_id, length(r.table_abbreviation || COALESCE(r.separator, ''))) = r.table_abbreviation || COALESCE(r.separator, '')
        AND (COALESCE(r.suffix, '') = '' OR right(g.display_id, length(r.suffix)) = r.suffix)
    ) u
    WHERE u.rest ~ '[0-9]+$'
  ) p
  GROUP BY p.rule_id, p.period_key
) m
ON CONFLICT ON CONSTRAINT uq_id_generation_sequences_rule_scope_period
DO UPDATE SET current_value = GREATEST(admin.id_generation_sequences.current_value, EXCLUDED.current_value),
              updated_at = NOW();

-- Check: the LREG counter now matches the highest LREG number issued (next ID = current_value + 1).
SELECT r.target_table, r.table_abbreviation, s.period_key, s.current_value,
       (SELECT max(substring(g.display_id from '([0-9]+)$')::BIGINT)
        FROM admin.generated_ids g
        WHERE g.target_table = r.target_table AND g.display_id LIKE r.table_abbreviation || '%') AS highest_issued
FROM admin.id_generation_sequences s
JOIN admin.id_generation_rules r ON r.id = s.rule_id
WHERE r.target_table = 'public.local_register_records'
ORDER BY s.period_key;
