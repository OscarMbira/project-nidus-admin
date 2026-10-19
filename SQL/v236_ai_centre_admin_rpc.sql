-- ============================================================================
-- v236: AI Centre — Admin RPCs (monorepo v1272, PRD D6, D7, D8, D16a, D17)
--
-- Narrow Admin → public/sim exception (documented in both CLAUDE.md files, like v225/v227):
-- Admin reads AI usage and writes public.ai_platform_settings, public.ai_settings (admin columns
-- only), public.ai_credit_ledger (top-ups/adjustments), public.subscription_plans.monthly_ai_credits
-- and public.planner_plan_limits.monthly_ai_credits ONLY through these SECURITY DEFINER RPCs,
-- each gated by an ai.* permission and written to admin.log_admin_action.
--
--   admin_ai_get_settings / admin_ai_update_settings          (ai.view / ai.settings.edit)
--   admin_ai_list_plans / admin_ai_set_plan_credits / admin_ai_set_planner_credits (ai.view / ai.credits.edit)
--   admin_ai_list_organisations / admin_ai_update_organisation / admin_ai_add_credits (ai.view / ai.credits.edit)
--   admin_ai_usage_summary / admin_ai_list_runs                (ai.view)
-- Prerequisites: monorepo SQL v1272–v1273; Admin v225 (admin_require_public_site_permission), v235.
-- Idempotent.
-- ============================================================================

-- ── Settings ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ai_get_settings(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN (SELECT to_jsonb(s) FROM public.ai_platform_settings s WHERE id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_update_settings(p_changes JSONB, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE
  v_admin  UUID := public.admin_require_public_site_permission('ai.settings.edit', p_admin_user_id);
  v_before JSONB;
  v_after  JSONB;
  v_allowed TEXT[] := ARRAY['kill_switch', 'kill_switch_reason', 'model_routing', 'model_quick', 'model_agent', 'approved_models',
    'model_prices', 'credit_unit_usd', 'warn_percent', 'default_trial_credits', 'conversation_retention_months',
    'audit_retention_months', 'retention_min_months', 'retention_max_months', 'max_agent_iterations', 'query_row_cap', 'query_timeout_ms'];
  k TEXT;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN RAISE EXCEPTION 'Nothing to change'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (k = ANY (v_allowed)) THEN RAISE EXCEPTION 'Setting "%" cannot be changed here', k; END IF;
  END LOOP;

  SELECT to_jsonb(s) INTO v_before FROM public.ai_platform_settings s WHERE id;

  UPDATE public.ai_platform_settings s SET
    kill_switch                   = COALESCE((p_changes ->> 'kill_switch')::boolean, s.kill_switch),
    kill_switch_reason            = CASE WHEN p_changes ? 'kill_switch_reason' THEN p_changes ->> 'kill_switch_reason' ELSE s.kill_switch_reason END,
    approved_models               = CASE WHEN p_changes ? 'approved_models'
                                         THEN ARRAY(SELECT jsonb_array_elements_text(p_changes -> 'approved_models'))
                                         ELSE s.approved_models END,
    model_routing                 = COALESCE(p_changes ->> 'model_routing', s.model_routing),
    model_quick                   = COALESCE(p_changes ->> 'model_quick', s.model_quick),
    model_agent                   = COALESCE(p_changes ->> 'model_agent', s.model_agent),
    model_prices                  = COALESCE(p_changes -> 'model_prices', s.model_prices),
    credit_unit_usd               = COALESCE((p_changes ->> 'credit_unit_usd')::numeric, s.credit_unit_usd),
    warn_percent                  = COALESCE((p_changes ->> 'warn_percent')::int, s.warn_percent),
    default_trial_credits         = COALESCE((p_changes ->> 'default_trial_credits')::int, s.default_trial_credits),
    conversation_retention_months = COALESCE((p_changes ->> 'conversation_retention_months')::int, s.conversation_retention_months),
    audit_retention_months        = COALESCE((p_changes ->> 'audit_retention_months')::int, s.audit_retention_months),
    retention_min_months          = COALESCE((p_changes ->> 'retention_min_months')::int, s.retention_min_months),
    retention_max_months          = COALESCE((p_changes ->> 'retention_max_months')::int, s.retention_max_months),
    max_agent_iterations          = COALESCE((p_changes ->> 'max_agent_iterations')::int, s.max_agent_iterations),
    query_row_cap                 = COALESCE((p_changes ->> 'query_row_cap')::int, s.query_row_cap),
    query_timeout_ms              = COALESCE((p_changes ->> 'query_timeout_ms')::int, s.query_timeout_ms),
    updated_at = NOW(),
    updated_by_admin = v_admin
  WHERE id;

  SELECT to_jsonb(s) INTO v_after FROM public.ai_platform_settings s WHERE id;
  IF NOT ((v_after ->> 'model_routing') = ANY (ARRAY(SELECT jsonb_array_elements_text(v_after -> 'approved_models')))
          AND (v_after ->> 'model_quick') = ANY (ARRAY(SELECT jsonb_array_elements_text(v_after -> 'approved_models')))
          AND (v_after ->> 'model_agent') = ANY (ARRAY(SELECT jsonb_array_elements_text(v_after -> 'approved_models')))) THEN
    RAISE EXCEPTION 'Every routed model must be in the approved model list';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_after -> 'approved_models') m WHERE NOT ((v_after -> 'model_prices') ? m)) THEN
    RAISE EXCEPTION 'Every approved model needs a price (input/output per 1M tokens)';
  END IF;

  PERFORM admin.log_admin_action(v_admin, 'ai.settings_update', 'ai_platform_settings', NULL,
    jsonb_build_object('reason', p_reason), v_before, v_after);
  RETURN v_after;
END;
$$;

-- ── Plans & credits ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ai_list_plans(p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN jsonb_build_object(
    'platform', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'plan_name', plan_name, 'plan_type', plan_type,
                         'billing_cycle', billing_cycle, 'is_active', is_active, 'monthly_ai_credits', monthly_ai_credits)
                         ORDER BY lower(plan_name), created_at) FROM public.subscription_plans), '[]'::jsonb),
    'planner', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_code', plan_code, 'is_active', is_active, 'monthly_ai_credits', monthly_ai_credits)
                         ORDER BY plan_code) FROM public.planner_plan_limits), '[]'::jsonb),
    'default_trial_credits', (SELECT default_trial_credits FROM public.ai_platform_settings WHERE id),
    'credit_unit_usd', (SELECT credit_unit_usd FROM public.ai_platform_settings WHERE id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_set_plan_credits(p_plan_id UUID, p_credits INTEGER, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.credits.edit', p_admin_user_id); v_old INTEGER; v_type TEXT;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_credits IS NOT NULL AND p_credits < 0 THEN RAISE EXCEPTION 'Credits cannot be negative'; END IF;
  SELECT monthly_ai_credits, plan_type INTO v_old, v_type FROM public.subscription_plans WHERE id = p_plan_id;
  IF v_type IS NULL THEN RAISE EXCEPTION 'Plan not found'; END IF;
  IF v_type = 'planner' THEN RAISE EXCEPTION 'Planner plans use the Planner credit settings'; END IF;
  UPDATE public.subscription_plans SET monthly_ai_credits = p_credits, updated_at = NOW() WHERE id = p_plan_id;
  PERFORM admin.log_admin_action(v_admin, 'ai.plan_credits', 'subscription_plan', p_plan_id, jsonb_build_object('reason', p_reason),
    jsonb_build_object('monthly_ai_credits', v_old), jsonb_build_object('monthly_ai_credits', p_credits));
  RETURN jsonb_build_object('plan_id', p_plan_id, 'monthly_ai_credits', p_credits);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_set_planner_credits(p_plan_code TEXT, p_credits INTEGER, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.credits.edit', p_admin_user_id); v_old INTEGER;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_credits IS NOT NULL AND p_credits < 0 THEN RAISE EXCEPTION 'Credits cannot be negative'; END IF;
  SELECT monthly_ai_credits INTO v_old FROM public.planner_plan_limits WHERE plan_code = p_plan_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planner plan not found'; END IF;
  UPDATE public.planner_plan_limits SET monthly_ai_credits = p_credits, updated_at = NOW() WHERE plan_code = p_plan_code;
  PERFORM admin.log_admin_action(v_admin, 'ai.planner_credits', 'planner_plan_limits', NULL,
    jsonb_build_object('reason', p_reason, 'plan_code', p_plan_code),
    jsonb_build_object('monthly_ai_credits', v_old), jsonb_build_object('monthly_ai_credits', p_credits));
  RETURN jsonb_build_object('plan_code', p_plan_code, 'monthly_ai_credits', p_credits);
END;
$$;

-- ── Organisations ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ai_list_organisations(p_search TEXT DEFAULT NULL, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, admin SET row_security = off
AS $$
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN COALESCE((
    SELECT jsonb_agg(row ORDER BY lower(row ->> 'account_name'))
      FROM (
        SELECT jsonb_build_object(
          'account_id', a.id, 'account_name', COALESCE(a.account_display_name, a.account_name),
          'account_code', a.account_code, 'edition', a.product_edition,
          'ai_enabled', COALESCE(s.ai_enabled, FALSE), 'consent_accepted_at', s.data_privacy_accepted_at,
          'admin_ai_disabled', COALESCE(s.admin_ai_disabled, FALSE), 'admin_disabled_reason', s.admin_disabled_reason,
          'credit_allowance_override', s.credit_allowance_override,
          'retention_admin_override', COALESCE(s.retention_admin_override, FALSE),
          'conversation_retention_months', s.conversation_retention_months, 'audit_retention_months', s.audit_retention_months,
          'period_start', p.start_at,
          'allowance', public.ai_account_allowance(a.id)
                       + COALESCE((SELECT SUM(credits) FROM public.ai_credit_ledger l WHERE l.account_id = a.id AND l.entry_type IN ('topup', 'adjustment') AND l.created_at >= p.start_at), 0),
          'used', COALESCE((SELECT SUM(credits) FROM public.ai_credit_ledger l WHERE l.account_id = a.id AND l.entry_type = 'usage' AND l.created_at >= p.start_at), 0)
        ) AS row
          FROM public.accounts a
          LEFT JOIN public.ai_settings s ON s.organisation_id = a.id
          CROSS JOIN LATERAL (SELECT public.ai_period_start(a.id) AS start_at) p
         WHERE COALESCE(a.is_deleted, FALSE) = FALSE
           AND (p_search IS NULL OR COALESCE(a.account_display_name, a.account_name) ILIKE '%' || p_search || '%' OR a.account_code ILIKE '%' || p_search || '%')
         LIMIT 300
      ) x), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_update_organisation(
  p_account_id UUID, p_admin_ai_disabled BOOLEAN, p_admin_disabled_reason TEXT, p_credit_allowance_override INTEGER,
  p_retention_admin_override BOOLEAN, p_conversation_retention_months INTEGER, p_audit_retention_months INTEGER,
  p_reason TEXT, p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin SET row_security = off
AS $$
DECLARE
  v_admin UUID := public.admin_require_public_site_permission('ai.credits.edit', p_admin_user_id);
  v_before JSONB;
  v_after JSONB;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  IF p_credit_allowance_override IS NOT NULL AND p_credit_allowance_override < 0 THEN RAISE EXCEPTION 'Allowance cannot be negative'; END IF;
  IF COALESCE(p_retention_admin_override, FALSE) AND (COALESCE(p_conversation_retention_months, 0) < 1 OR COALESCE(p_audit_retention_months, 0) < 1) THEN
    RAISE EXCEPTION 'Set both retention periods (at least 1 month) when overriding retention';
  END IF;

  SELECT to_jsonb(s) INTO v_before FROM public.ai_settings s WHERE organisation_id = p_account_id;
  INSERT INTO public.ai_settings (organisation_id, ai_enabled, admin_ai_disabled, admin_disabled_reason, credit_allowance_override,
                                  retention_admin_override, conversation_retention_months, audit_retention_months, updated_at)
  VALUES (p_account_id, FALSE, COALESCE(p_admin_ai_disabled, FALSE), p_admin_disabled_reason, p_credit_allowance_override,
          COALESCE(p_retention_admin_override, FALSE),
          CASE WHEN p_retention_admin_override THEN p_conversation_retention_months END,
          CASE WHEN p_retention_admin_override THEN p_audit_retention_months END, NOW())
  ON CONFLICT (organisation_id) DO UPDATE SET
    admin_ai_disabled = COALESCE(p_admin_ai_disabled, FALSE),
    admin_disabled_reason = p_admin_disabled_reason,
    credit_allowance_override = p_credit_allowance_override,
    retention_admin_override = COALESCE(p_retention_admin_override, FALSE),
    conversation_retention_months = CASE WHEN p_retention_admin_override THEN p_conversation_retention_months ELSE public.ai_settings.conversation_retention_months END,
    audit_retention_months = CASE WHEN p_retention_admin_override THEN p_audit_retention_months ELSE public.ai_settings.audit_retention_months END,
    updated_at = NOW();
  SELECT to_jsonb(s) INTO v_after FROM public.ai_settings s WHERE organisation_id = p_account_id;

  PERFORM admin.log_admin_action(v_admin, 'ai.organisation_update', 'account', p_account_id, jsonb_build_object('reason', p_reason), v_before, v_after);
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_add_credits(p_account_id UUID, p_credits NUMERIC, p_entry_type TEXT, p_note TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin SET row_security = off
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.credits.edit', p_admin_user_id); v_id UUID;
BEGIN
  IF COALESCE(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'A note is required'; END IF;
  IF p_entry_type NOT IN ('topup', 'adjustment') THEN RAISE EXCEPTION 'Entry type must be topup or adjustment'; END IF;
  IF p_entry_type = 'topup' AND COALESCE(p_credits, 0) <= 0 THEN RAISE EXCEPTION 'A top-up must be positive'; END IF;
  IF COALESCE(p_credits, 0) = 0 THEN RAISE EXCEPTION 'Enter a number of credits'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  INSERT INTO public.ai_credit_ledger (account_id, entry_type, credits, note, created_by)
  VALUES (p_account_id, p_entry_type, p_credits, p_note, v_admin) RETURNING id INTO v_id;
  PERFORM admin.log_admin_action(v_admin, 'ai.credits_' || p_entry_type, 'account', p_account_id,
    jsonb_build_object('credits', p_credits, 'note', p_note, 'ledger_id', v_id), NULL, NULL);
  RETURN jsonb_build_object('ledger_id', v_id, 'credits', p_credits);
END;
$$;

-- ── Usage ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ai_usage_summary(p_days INTEGER DEFAULT 30, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v_since TIMESTAMPTZ := NOW() - make_interval(days => GREATEST(LEAST(COALESCE(p_days, 30), 366), 1));
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN (
    WITH runs AS (
      SELECT account_id, app, agent, model, status, credits, input_tokens + output_tokens AS tokens, started_at FROM public.agent_runs WHERE started_at >= v_since
      UNION ALL
      SELECT account_id, app, agent, model, status, credits, input_tokens + output_tokens, started_at FROM sim.agent_runs WHERE started_at >= v_since
    )
    SELECT jsonb_build_object(
      'since', v_since,
      'totals', (SELECT jsonb_build_object('runs', COUNT(*), 'succeeded', COUNT(*) FILTER (WHERE status = 'succeeded'),
                   'failed', COUNT(*) FILTER (WHERE status = 'failed'), 'blocked', COUNT(*) FILTER (WHERE status = 'blocked'),
                   'credits', COALESCE(SUM(credits), 0), 'tokens', COALESCE(SUM(tokens), 0),
                   'organisations', COUNT(DISTINCT account_id)) FROM runs),
      'cost_usd', (SELECT ROUND(COALESCE(SUM(credits), 0) * (SELECT credit_unit_usd FROM public.ai_platform_settings WHERE id), 2) FROM runs),
      'by_day', COALESCE((SELECT jsonb_agg(d ORDER BY d ->> 'day') FROM (SELECT jsonb_build_object('day', started_at::date, 'runs', COUNT(*), 'credits', COALESCE(SUM(credits), 0)) d
                  FROM runs GROUP BY started_at::date) x), '[]'::jsonb),
      'by_agent', COALESCE((SELECT jsonb_agg(d ORDER BY (d ->> 'credits')::numeric DESC) FROM (SELECT jsonb_build_object('agent', agent, 'runs', COUNT(*), 'credits', COALESCE(SUM(credits), 0)) d
                  FROM runs GROUP BY agent) x), '[]'::jsonb),
      'by_model', COALESCE((SELECT jsonb_agg(d ORDER BY (d ->> 'credits')::numeric DESC) FROM (SELECT jsonb_build_object('model', COALESCE(model, '—'), 'runs', COUNT(*), 'credits', COALESCE(SUM(credits), 0)) d
                  FROM runs GROUP BY model) x), '[]'::jsonb),
      'by_app', COALESCE((SELECT jsonb_agg(d) FROM (SELECT jsonb_build_object('app', app, 'runs', COUNT(*), 'credits', COALESCE(SUM(credits), 0)) d
                  FROM runs GROUP BY app) x), '[]'::jsonb),
      'top_organisations', COALESCE((SELECT jsonb_agg(d ORDER BY (d ->> 'credits')::numeric DESC) FROM (
                  SELECT jsonb_build_object('account_id', r.account_id, 'account_name', COALESCE(a.account_display_name, a.account_name),
                                            'runs', COUNT(*), 'credits', COALESCE(SUM(r.credits), 0)) d
                    FROM runs r LEFT JOIN public.accounts a ON a.id = r.account_id
                   WHERE r.account_id IS NOT NULL GROUP BY r.account_id, a.account_display_name, a.account_name
                   ORDER BY COALESCE(SUM(r.credits), 0) DESC LIMIT 20) x), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_list_runs(p_filter JSONB DEFAULT '{}'::jsonb, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, sim, admin SET row_security = off
AS $$
DECLARE v_since TIMESTAMPTZ := NOW() - make_interval(days => GREATEST(LEAST(COALESCE((p_filter ->> 'days')::int, 30), 366), 1));
BEGIN
  PERFORM public.admin_require_public_site_permission('ai.view', p_admin_user_id);
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC)
      FROM (
        SELECT x.id, x.app, x.agent, x.model, x.status, x.block_reason, x.credits, x.input_tokens, x.output_tokens, x.tool_calls,
               x.duration_ms, x.started_at, x.error_text, x.account_id, COALESCE(a.account_display_name, a.account_name) AS account_name
          FROM (
            SELECT id, app, agent, model, status, block_reason, credits, input_tokens, output_tokens, tool_calls, duration_ms, started_at, error_text, account_id
              FROM public.agent_runs WHERE started_at >= v_since
            UNION ALL
            SELECT id, app, agent, model, status, block_reason, credits, input_tokens, output_tokens, tool_calls, duration_ms, started_at, error_text, account_id
              FROM sim.agent_runs WHERE started_at >= v_since
          ) x
          LEFT JOIN public.accounts a ON a.id = x.account_id
         WHERE (p_filter ->> 'status' IS NULL OR x.status = p_filter ->> 'status')
           AND (p_filter ->> 'agent' IS NULL OR x.agent = p_filter ->> 'agent')
           AND (p_filter ->> 'app' IS NULL OR x.app = p_filter ->> 'app')
           AND (p_filter ->> 'account_id' IS NULL OR x.account_id = (p_filter ->> 'account_id')::uuid)
         ORDER BY x.started_at DESC
         LIMIT 500
      ) r), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ai_get_settings(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_update_settings(JSONB, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_list_plans(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_set_plan_credits(UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_set_planner_credits(TEXT, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_list_organisations(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_update_organisation(UUID, BOOLEAN, TEXT, INTEGER, BOOLEAN, INTEGER, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_add_credits(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_summary(INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_list_runs(JSONB, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT 'v236 applied' AS status,
       (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'admin\_ai\_%') AS ai_functions_present;
