-- =============================================================================
-- v191: Fix portfolio/programme/project global sync domain_ref_id (409 Conflict)
-- Mirror of monorepo SQL/v795_fix_level_template_sync_domain_ref.sql — apply either once.
--
-- Symptom: admin.publish_global_template → HTTP 409
--   duplicate key value violates unique constraint "uq_pm_template_nodes_current_scope"
--
-- Cause: v774 uniqueness is per (account, tier, domain, scope, domain_ref_id).
--   v783/v785 set domain_ref_id NULL for portfolio/programme/project templates, so
--   only the first current node per domain/account can exist; further publishes
--   collide on the coalesced zero-UUID domain_ref slot.
--
-- Fix: use source global_template_id as domain_ref_id for those level domains
--   (same pattern as catalog-backed domains that pass a per-document ref).
--   Heal any existing NULL domain_ref rows for those domains.
--
-- Prerequisites: monorepo v785 (sync signature with p_methodology + project_template)
-- Plan: projectplans/v191_fix_level_template_sync_domain_ref_plan.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Heal existing NULL domain_ref_id on system-synced level nodes
-- ---------------------------------------------------------------------------
UPDATE public.pm_template_nodes
SET
    domain_ref_id = source_global_template_id,
    updated_at = NOW()
WHERE domain IN ('portfolio_template', 'programme_template', 'project_template')
  AND is_system_synced = TRUE
  AND source_global_template_id IS NOT NULL
  AND domain_ref_id IS NULL;

UPDATE sim.pm_template_nodes
SET
    domain_ref_id = source_global_template_id,
    updated_at = NOW()
WHERE domain IN ('portfolio_template', 'programme_template', 'project_template')
  AND is_system_synced = TRUE
  AND source_global_template_id IS NOT NULL
  AND domain_ref_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Outer sync RPC — level domains use global_template_id as domain_ref
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_global_template_node(
    p_global_template_id UUID,
    p_domain TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_version INTEGER DEFAULT 1,
    p_payload JSONB DEFAULT NULL,
    p_methodology TEXT DEFAULT NULL,
    p_target TEXT DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, sim
AS $$
DECLARE
    v_account RECORD;
    v_public_node UUID;
    v_sim_node UUID;
    v_accounts INTEGER := 0;
    v_first_node UUID;
    v_payload JSONB;
    v_template_id UUID := NULL;
    v_target TEXT := lower(trim(COALESCE(p_target, 'both')));
    v_industry_code TEXT;
    v_methodology TEXT;
BEGIN
    IF v_target NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid sync target: % (use platform, simulator, or both)', p_target;
    END IF;
    IF p_global_template_id IS NULL THEN
        RAISE EXCEPTION 'global_template_id is required';
    END IF;
    IF p_domain IS NULL OR p_domain NOT IN (
        'fields', 'form_template', 'industry_plan', 'opa', 'process_template',
        'legacy_document', 'structured_list',
        'portfolio_template', 'programme_template', 'project_template'
    ) THEN
        RAISE EXCEPTION 'Invalid domain: %', p_domain;
    END IF;
    IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'name is required';
    END IF;

    v_methodology := NULLIF(lower(trim(COALESCE(p_methodology, ''))), '');
    IF v_methodology IS NOT NULL AND v_methodology NOT IN ('pmbok', 'structured', 'agile') THEN
        RAISE EXCEPTION 'Invalid methodology: %', p_methodology;
    END IF;

    IF p_domain = 'industry_plan' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'industry_plan payload must be a JSON object';
        END IF;
        v_industry_code := NULLIF(trim(COALESCE(v_payload->>'industry_code', '')), '');
        IF v_industry_code IS NULL THEN
            RAISE EXCEPTION 'industry_plan payload.industry_code is required';
        END IF;
        IF v_target IN ('platform', 'both') THEN
            v_template_id := public._sync_global_industry_template_catalog(
                v_payload, trim(p_name), p_description
            );
        ELSE
            SELECT id INTO v_template_id
            FROM public.pmo_industry_templates
            WHERE industry_code = v_industry_code
              AND COALESCE(is_deleted, FALSE) = FALSE
            LIMIT 1;
        END IF;
    ELSIF p_domain = 'legacy_document' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF v_target IN ('platform', 'both') THEN
            v_template_id := public._sync_global_legacy_document_catalog(
                p_global_template_id, v_payload, trim(p_name), p_description
            );
        ELSE
            SELECT id INTO v_template_id
            FROM public.pmo_legacy_document_templates
            WHERE global_template_id = p_global_template_id
            LIMIT 1;
        END IF;
    ELSIF p_domain = 'structured_list' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF v_target IN ('platform', 'both') THEN
            v_template_id := public._sync_global_structured_list_catalog(
                p_global_template_id, v_payload, trim(p_name)
            );
        ELSE
            SELECT id INTO v_template_id
            FROM public.pmo_legacy_structured_lists
            WHERE global_template_id = p_global_template_id
            LIMIT 1;
        END IF;
    ELSIF p_domain = 'form_template' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        v_template_id := public._sync_global_form_template_catalog(
            p_global_template_id, v_payload, trim(p_name), v_target
        );
    ELSIF p_domain = 'opa' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        v_template_id := public._sync_global_opa_catalog(
            p_global_template_id, v_payload, trim(p_name), v_target
        );
    ELSIF p_domain = 'process_template' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        v_template_id := public._sync_global_process_template_catalog(
            p_global_template_id, v_payload, trim(p_name), v_target
        );
    ELSIF p_domain IN ('portfolio_template', 'programme_template', 'project_template') THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION '% payload must be a JSON object', p_domain;
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'template_code', '')), '') IS NULL THEN
            RAISE EXCEPTION '% payload.template_code is required', p_domain;
        END IF;
        -- Per-document slot under uq_pm_template_nodes_current_scope (v774).
        -- No separate catalog table — use the Admin global template id.
        v_template_id := p_global_template_id;
    ELSE
        v_payload := COALESCE(p_payload, '[]'::jsonb);
    END IF;

    FOR v_account IN
        SELECT a.id
        FROM public.accounts a
        WHERE COALESCE(a.is_deleted, FALSE) = FALSE
    LOOP
        IF v_target IN ('platform', 'both') THEN
            v_public_node := public._sync_global_template_node_for_account(
                'public', v_account.id, p_global_template_id, p_domain,
                trim(p_name), p_description, p_category, p_version,
                v_payload, v_template_id, v_methodology
            );
            IF v_first_node IS NULL THEN
                v_first_node := v_public_node;
            END IF;
        END IF;
        IF v_target IN ('simulator', 'both') THEN
            v_sim_node := public._sync_global_template_node_for_account(
                'sim', v_account.id, p_global_template_id, p_domain,
                trim(p_name), p_description, p_category, p_version,
                v_payload, v_template_id, v_methodology
            );
            IF v_first_node IS NULL THEN
                v_first_node := v_sim_node;
            END IF;
        END IF;
        v_accounts := v_accounts + 1;
    END LOOP;

    IF v_target IN ('platform', 'both')
       AND p_domain = 'form_template'
       AND v_template_id IS NOT NULL
       AND v_first_node IS NOT NULL
    THEN
        UPDATE public.form_templates
        SET pm_template_node_id = COALESCE(pm_template_node_id, v_first_node),
            updated_at = NOW()
        WHERE id = v_template_id;
    END IF;
    IF v_target IN ('platform', 'both')
       AND p_domain = 'opa'
       AND v_template_id IS NOT NULL
       AND v_first_node IS NOT NULL
    THEN
        BEGIN
            UPDATE public.organisational_process_assets
            SET pm_template_node_id = COALESCE(pm_template_node_id, v_first_node),
                updated_at = NOW()
            WHERE id = v_template_id;
        EXCEPTION WHEN undefined_column THEN
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'global_template_id', p_global_template_id,
        'accounts_synced', v_accounts,
        'sample_node_id', v_first_node,
        'domain', p_domain,
        'methodology', v_methodology,
        'version', GREATEST(COALESCE(p_version, 1), 1),
        'catalog_ref_id', v_template_id,
        'target', v_target
    );
END;
$$;

CREATE OR REPLACE FUNCTION sim.sync_global_template_node(
    p_global_template_id UUID,
    p_domain TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_version INTEGER DEFAULT 1,
    p_payload JSONB DEFAULT NULL,
    p_methodology TEXT DEFAULT NULL,
    p_target TEXT DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, sim
AS $$
    SELECT public.sync_global_template_node(
        p_global_template_id, p_domain, p_name, p_description,
        p_category, p_version, p_payload, p_methodology, p_target
    );
$$;

REVOKE ALL ON FUNCTION public.sync_global_template_node(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION sim.sync_global_template_node(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_global_template_node(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sim.sync_global_template_node(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'v191_fix_level_template_sync_domain_ref.sql (mirror of monorepo v795) applied';
END $$;
