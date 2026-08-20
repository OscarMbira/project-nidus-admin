-- =============================================================================
-- v192: Fix process_template catalog sync for Simulator (practice_project_id)
-- Mirror of monorepo SQL/v796_fix_process_template_sim_catalog_sync.sql — apply either once.
--
-- Symptom: Publish to Simulator → HTTP 400
--   column "project_id" of relation "<process_table>" does not exist (42703)
--
-- Cause: public._sync_global_process_template_catalog (v778/v783) INSERTs into
--   sim.<table> using column project_id. Simulator process tables use
--   practice_project_id (v629 / v632), so every process_template publish to
--   simulator fails. Platform publish is unaffected.
--
-- Fix: use practice_project_id on sim inserts; upsert by reference_code on sim.
--
-- Prerequisites: monorepo v629/v632 process tables; v778+ catalog sync with p_target
-- Plan: projectplans/v192_fix_process_template_sim_catalog_sync_plan.md
-- =============================================================================

CREATE OR REPLACE FUNCTION public._sync_global_process_template_catalog(
    p_global_template_id UUID,
    p_payload JSONB,
    p_name TEXT,
    p_target TEXT DEFAULT 'both'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sim
AS $$
DECLARE
    v_table TEXT;
    v_title TEXT;
    v_ref TEXT;
    v_id UUID;
    v_sim_id UUID;
    v_allowed TEXT[] := ARRAY[
        'project_charters', 'assumption_logs', 'project_management_plans',
        'requirements_management_plans', 'requirements_documentation', 'wbs_dictionary_entries',
        'activity_attributes', 'activity_resource_requirements', 'resource_breakdown_structure',
        'activity_duration_estimates', 'cost_management_plans', 'activity_cost_estimates',
        'cost_baselines', 'resource_management_plans', 'stakeholder_engagement_plans',
        'procurement_management_plans', 'quality_checklists', 'team_performance_assessments',
        'make_or_buy_decisions', 'variance_analysis_reports', 'evm_status_reports',
        'scope_acceptance_forms', 'project_closure_checklists', 'contract_closure_documents'
    ];
    v_account UUID;
    v_target TEXT := lower(trim(COALESCE(p_target, 'both')));
    v_description TEXT;
    v_doc JSONB;
    v_status TEXT;
BEGIN
    IF v_target NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid sync target: %', p_target;
    END IF;
    IF jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) <> 'object' THEN
        RAISE EXCEPTION 'process_template payload must be a JSON object';
    END IF;
    v_table := NULLIF(trim(COALESCE(p_payload->>'document_type', '')), '');
    IF v_table IS NULL OR NOT (v_table = ANY (v_allowed)) THEN
        RAISE EXCEPTION 'process_template payload.document_type is invalid: %', v_table;
    END IF;

    v_title := COALESCE(NULLIF(trim(p_name), ''), NULLIF(trim(p_payload->>'title'), ''), v_table);
    v_ref := 'GTL-' || replace(p_global_template_id::text, '-', '');
    v_description := NULLIF(trim(COALESCE(p_payload->>'description', '')), '');
    v_doc := p_payload->'document_data';
    v_status := COALESCE(NULLIF(trim(p_payload->>'status'), ''), 'active');

    SELECT a.id INTO v_account
    FROM public.accounts a
    WHERE COALESCE(a.is_deleted, FALSE) = FALSE
    ORDER BY a.created_at NULLS LAST, a.id
    LIMIT 1;

    IF v_target IN ('platform', 'both') THEN
        EXECUTE format(
            'SELECT id FROM public.%I WHERE is_master = TRUE AND reference_code = $1 AND COALESCE(is_deleted, FALSE) = FALSE LIMIT 1',
            v_table
        ) INTO v_id USING v_ref;

        IF v_id IS NULL THEN
            EXECUTE format(
                'INSERT INTO public.%I (
                    project_id, account_id, reference_code, title, description, document_data,
                    status, is_master, is_deleted
                 ) VALUES (
                    NULL, $1, $2, $3, $4, COALESCE($5, ''{}''::jsonb),
                    COALESCE(NULLIF(trim($6), ''''), ''active''), TRUE, FALSE
                 ) RETURNING id',
                v_table
            ) INTO v_id
            USING v_account, v_ref, v_title, v_description, v_doc, v_status;
        ELSE
            EXECUTE format(
                'UPDATE public.%I SET
                    title = $2,
                    description = COALESCE($3, description),
                    document_data = COALESCE($4, document_data),
                    status = COALESCE($5, status),
                    updated_at = NOW()
                 WHERE id = $1',
                v_table
            ) USING v_id, v_title, v_description, v_doc, v_status;
        END IF;
    ELSE
        EXECUTE format(
            'SELECT id FROM public.%I WHERE is_master = TRUE AND reference_code = $1 AND COALESCE(is_deleted, FALSE) = FALSE LIMIT 1',
            v_table
        ) INTO v_id USING v_ref;
    END IF;

    IF v_target IN ('simulator', 'both')
       AND EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'sim' AND table_name = v_table
       )
    THEN
        EXECUTE format(
            'SELECT id FROM sim.%I WHERE is_master = TRUE AND reference_code = $1 AND COALESCE(is_deleted, FALSE) = FALSE LIMIT 1',
            v_table
        ) INTO v_sim_id USING v_ref;

        IF v_sim_id IS NULL THEN
            v_sim_id := COALESCE(v_id, gen_random_uuid());
            -- Simulator process tables use practice_project_id (not project_id).
            EXECUTE format(
                'INSERT INTO sim.%I (
                    id, practice_project_id, account_id, reference_code, title, description, document_data,
                    status, is_master, is_deleted
                 ) VALUES (
                    $1, NULL, $2, $3, $4, $5, COALESCE($6, ''{}''::jsonb),
                    COALESCE(NULLIF(trim($7), ''''), ''active''), TRUE, FALSE
                 )',
                v_table
            ) USING
                v_sim_id, v_account, v_ref, v_title, v_description, v_doc, v_status;
        ELSE
            EXECUTE format(
                'UPDATE sim.%I SET
                    title = $2,
                    description = COALESCE($3, description),
                    document_data = COALESCE($4, document_data),
                    status = COALESCE($5, status),
                    updated_at = NOW()
                 WHERE id = $1',
                v_table
            ) USING v_sim_id, v_title, v_description, v_doc, v_status;
        END IF;

        IF v_id IS NULL THEN
            v_id := v_sim_id;
        END IF;
    END IF;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_global_process_template_catalog(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._sync_global_process_template_catalog(UUID, JSONB, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'v192_fix_process_template_sim_catalog_sync.sql applied';
END $$;
