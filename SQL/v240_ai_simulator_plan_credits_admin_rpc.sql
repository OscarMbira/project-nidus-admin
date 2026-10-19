-- ============================================================================
-- v240: AI Centre — Simulator plan AI credits (monorepo v1272 Phase 3 S3.4 / SQL v1288, story 49)
--
-- Narrow Admin → public exception (both CLAUDE.md files, with v236): Admin writes
-- public.ai_simulator_plan_credits.monthly_ai_credits ONLY through admin_ai_set_simulator_credits,
-- gated by ai.credits.edit and audited. admin_ai_list_plans (v236) now also returns the Simulator plans.
-- Prerequisites: monorepo SQL v1288; Admin v235, v236. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_ai_set_simulator_credits(p_plan_type TEXT, p_credits INTEGER, p_reason TEXT, p_admin_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, admin
AS $$
DECLARE v_admin UUID := public.admin_require_public_site_permission('ai.credits.edit', p_admin_user_id); v_old INTEGER;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_credits IS NOT NULL AND p_credits < 0 THEN RAISE EXCEPTION 'Credits cannot be negative'; END IF;
  SELECT monthly_ai_credits INTO v_old FROM public.ai_simulator_plan_credits WHERE plan_type = p_plan_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Simulator plan not found'; END IF;
  UPDATE public.ai_simulator_plan_credits SET monthly_ai_credits = p_credits, updated_at = NOW(), updated_by_admin = v_admin
   WHERE plan_type = p_plan_type;
  PERFORM admin.log_admin_action(v_admin, 'ai.simulator_credits', 'ai_simulator_plan_credits', NULL,
    jsonb_build_object('reason', p_reason, 'plan_type', p_plan_type),
    jsonb_build_object('monthly_ai_credits', v_old), jsonb_build_object('monthly_ai_credits', p_credits));
  RETURN jsonb_build_object('plan_type', p_plan_type, 'monthly_ai_credits', p_credits);
END;
$$;

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
    'simulator', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_type', plan_type, 'monthly_ai_credits', monthly_ai_credits)
                         ORDER BY sort_order, plan_type) FROM public.ai_simulator_plan_credits), '[]'::jsonb),
    'default_trial_credits', (SELECT default_trial_credits FROM public.ai_platform_settings WHERE id),
    'credit_unit_usd', (SELECT credit_unit_usd FROM public.ai_platform_settings WHERE id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ai_set_simulator_credits(TEXT, INTEGER, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_list_plans(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
SELECT 'v240 applied' AS status;
