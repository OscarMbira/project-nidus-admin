-- v211_fix_daily_logs_id_generation_mode.sql
--
-- Root cause: admin.id_generation_rules currently has public.daily_logs' rule set to
-- generation_mode = 'random' — but v156_id_generation_sequential_entity_rules_seed.sql
-- explicitly intended 'sequential' for this table (DL-YYYY-NNN, matching daily_logs'
-- documented reference format). The rule live today does not match what v156 seeded,
-- most likely because admin._id_gen_ensure_rule() auto-created a fallback rule the first
-- time admin.generate_display_id('public.daily_logs', ...) was ever actually called —
-- which only started happening once project-nidus SQL/v1006 stopped calling the removed
-- generate_log_reference() and let the Admin ID Generation trigger take over — and that
-- fallback defaulted to 'random' mode instead of picking up v156's intended settings.
--
-- Random mode's retry-until-unique loop is almost certainly why project creation was
-- timing out ("canceling statement due to statement timeout") — every automatic Daily Log
-- creation was retrying random code generation inside the same transaction as the project
-- insert, at least until it either succeeded slowly or exhausted attempts.
--
-- Fix: use the SAME admin.update_id_generation_rule() RPC v156 itself uses, to bring this
-- one rule back to v156's original intent — not a raw UPDATE, so any validation/bookkeeping
-- that RPC does still runs.

DO $$
DECLARE
    v_admin   UUID;
    v_rule_id UUID;
BEGIN
    SELECT id INTO v_admin
    FROM admin.admin_users
    WHERE role = 'super_admin'
      AND activation_status = 'active'
    ORDER BY created_at
    LIMIT 1;

    SELECT id INTO v_rule_id
    FROM admin.id_generation_rules
    WHERE target_table = 'public.daily_logs'
    LIMIT 1;

    IF v_rule_id IS NULL THEN
        RAISE EXCEPTION 'v211: no id_generation_rules row found for public.daily_logs — expected one to already exist (random-mode) for this fix to correct.';
    END IF;

    PERFORM admin.update_id_generation_rule(
        v_rule_id,
        'public.daily_logs',
        'DL',
        'Daily log references',
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

    RAISE NOTICE 'v211: public.daily_logs id_generation_rules row switched to sequential mode (DL-YYYY-NNN), matching v156''s original seed intent.';
END $$;
