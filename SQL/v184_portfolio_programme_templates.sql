-- =============================================================================
-- v184: Portfolio + Programme template domains (GTL) + curated seed templates
-- Plan: projectplans/v187_portfolio_programme_templates_plan.md
-- Companion monorepo: SQL/v783_portfolio_programme_template_domains.sql (apply first)
-- =============================================================================

ALTER TABLE admin.global_template_library
  DROP CONSTRAINT IF EXISTS chk_gtl_domain;

ALTER TABLE admin.global_template_library
  ADD CONSTRAINT chk_gtl_domain CHECK (
    domain IN (
      'fields', 'form_template', 'industry_plan', 'opa', 'process_template',
      'legacy_document', 'structured_list',
      'portfolio_template', 'programme_template'
    )
  );

COMMENT ON COLUMN admin.global_template_library.payload IS
  'fields: JSON array. Other domains: JSON object including portfolio_template / programme_template.';

CREATE OR REPLACE FUNCTION admin.create_global_template(
    p_domain TEXT,
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '[]'::jsonb,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_id UUID;
    v_payload JSONB;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.edit required';
    END IF;
    IF NULLIF(trim(COALESCE(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'name is required';
    END IF;
    IF p_domain IS NULL OR p_domain NOT IN (
        'fields', 'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template'
    ) THEN
        RAISE EXCEPTION 'Unsupported domain: %', p_domain;
    END IF;

    IF p_domain = 'fields' THEN
        v_payload := COALESCE(p_payload, '[]'::jsonb);
        IF jsonb_typeof(v_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
    ELSIF p_domain = 'industry_plan' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'industry_plan payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'industry_code', '')), '') IS NULL THEN
            RAISE EXCEPTION 'industry_plan payload.industry_code is required';
        END IF;
    ELSIF p_domain = 'legacy_document' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'legacy_document payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'storage_path', '')), '') IS NULL THEN
            RAISE EXCEPTION 'legacy_document payload.storage_path is required';
        END IF;
    ELSIF p_domain = 'structured_list' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'structured_list payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'list_type', '')), '') IS NULL THEN
            RAISE EXCEPTION 'structured_list payload.list_type is required';
        END IF;
    
    ELSIF p_domain IN ('portfolio_template', 'programme_template') THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION '% payload must be a JSON object', p_domain;
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'template_code', '')), '') IS NULL THEN
            RAISE EXCEPTION '% payload.template_code is required', p_domain;
        END IF;
    ELSIF p_domain = 'form_template' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'form_template payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'template_code', '')), '') IS NULL THEN
            RAISE EXCEPTION 'form_template payload.template_code is required';
        END IF;
    ELSIF p_domain = 'opa' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'opa payload must be a JSON object';
        END IF;
    ELSIF p_domain = 'process_template' THEN
        v_payload := COALESCE(p_payload, '{}'::jsonb);
        IF jsonb_typeof(v_payload) <> 'object' THEN
            RAISE EXCEPTION 'process_template payload must be a JSON object';
        END IF;
        IF NULLIF(trim(COALESCE(v_payload->>'document_type', '')), '') IS NULL THEN
            RAISE EXCEPTION 'process_template payload.document_type is required';
        END IF;
    ELSE
        v_payload := COALESCE(p_payload, '{}'::jsonb);
    END IF;

    INSERT INTO admin.global_template_library (
        domain, name, description, category, payload,
        record_status, record_version, created_by, updated_by
    ) VALUES (
        p_domain,
        trim(p_name),
        NULLIF(trim(COALESCE(p_description, '')), ''),
        NULLIF(trim(COALESCE(p_category, '')), ''),
        v_payload,
        'live',
        1,
        v_admin,
        v_admin
    )
    RETURNING id INTO v_id;

    UPDATE admin.global_template_library
    SET root_record_id = v_id
    WHERE id = v_id AND root_record_id IS NULL;

    INSERT INTO admin.global_template_versions (
        template_id, version_number, snapshot, change_description, changed_by
    ) VALUES (
        v_id, 1,
        jsonb_build_object(
            'domain', p_domain,
            'name', trim(p_name),
            'description', p_description,
            'category', p_category,
            'payload', v_payload
        ),
        'Created',
        v_admin
    );

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.create', 'global_template_library', v_id,
        jsonb_build_object('name', trim(p_name), 'domain', p_domain)
    );

    RETURN v_id;
END;
$$;


CREATE OR REPLACE FUNCTION admin.update_global_template(
    p_template_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT NULL,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_row admin.global_template_library%ROWTYPE;
    v_next_ver INTEGER;
    v_payload JSONB;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.edit') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.edit required';
    END IF;

    SELECT * INTO v_row FROM admin.global_template_library WHERE id = p_template_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found';
    END IF;
    IF v_row.record_status = 'unauthorised' THEN
        RAISE EXCEPTION 'Record is locked pending approval';
    END IF;
    IF v_row.record_status = 'archived' THEN
        RAISE EXCEPTION 'Archived templates cannot be edited';
    END IF;
    IF v_row.domain NOT IN (
        'fields', 'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template'
    ) THEN
        RAISE EXCEPTION 'Unsupported domain for update: %', v_row.domain;
    END IF;

    IF p_payload IS NOT NULL THEN
        IF v_row.domain = 'fields' AND jsonb_typeof(p_payload) <> 'array' THEN
            RAISE EXCEPTION 'fields payload must be a JSON array';
        END IF;
        IF v_row.domain IN (
            'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template'
        ) AND jsonb_typeof(p_payload) <> 'object' THEN
            RAISE EXCEPTION '% payload must be a JSON object', v_row.domain;
        END IF;
        v_payload := p_payload;
    ELSE
        v_payload := v_row.payload;
    END IF;

    v_next_ver := COALESCE(v_row.record_version, 1) + 1;

    UPDATE admin.global_template_library SET
        name = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), name),
        description = CASE WHEN p_description IS NULL THEN description
                           ELSE NULLIF(trim(p_description), '') END,
        category = CASE WHEN p_category IS NULL THEN category
                        ELSE NULLIF(trim(p_category), '') END,
        payload = v_payload,
        record_version = v_next_ver,
        updated_by = v_admin,
        updated_at = NOW()
    WHERE id = p_template_id;

    INSERT INTO admin.global_template_versions (
        template_id, version_number, snapshot, change_description, changed_by
    ) VALUES (
        p_template_id, v_next_ver,
        jsonb_build_object(
            'domain', v_row.domain,
            'name', COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), v_row.name),
            'description', COALESCE(p_description, v_row.description),
            'category', COALESCE(p_category, v_row.category),
            'payload', v_payload
        ),
        'Updated',
        v_admin
    );

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.update', 'global_template_library', p_template_id,
        jsonb_build_object('version', v_next_ver)
    );

    RETURN p_template_id;
END;
$$;


CREATE OR REPLACE FUNCTION admin.publish_global_template(
    p_template_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_target TEXT DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
    v_admin UUID;
    v_row admin.global_template_library%ROWTYPE;
    v_sync JSONB;
    v_target TEXT := lower(trim(COALESCE(p_target, 'both')));
    v_ver INTEGER;
BEGIN
    v_admin := COALESCE(p_admin_user_id, admin.current_admin_user_id());
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'Admin user is required';
    END IF;
    IF NOT admin.check_admin_permission(v_admin, 'content.global_templates.publish') THEN
        RAISE EXCEPTION 'Permission denied: content.global_templates.publish required';
    END IF;
    IF NULLIF(trim(COALESCE(p_notes, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Publish notes are required';
    END IF;
    IF v_target NOT IN ('platform', 'simulator', 'both') THEN
        RAISE EXCEPTION 'Invalid publish target: % (use platform, simulator, or both)', p_target;
    END IF;

    SELECT * INTO v_row
    FROM admin.global_template_library
    WHERE id = p_template_id
      AND record_status <> 'history';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Global template not found: %', p_template_id;
    END IF;
    IF v_row.record_status <> 'live' THEN
        RAISE EXCEPTION 'Only live templates can be published (status=%)', v_row.record_status;
    END IF;
    IF v_row.domain NOT IN (
        'fields', 'industry_plan', 'legacy_document', 'structured_list',
            'form_template', 'opa', 'process_template',
            'portfolio_template', 'programme_template'
    ) THEN
        RAISE EXCEPTION 'Publish not supported for domain %', v_row.domain;
    END IF;

    v_ver := GREATEST(COALESCE(v_row.record_version, 1), 1);

    v_sync := public.sync_global_template_node(
        v_row.id,
        v_row.domain,
        v_row.name,
        v_row.description,
        v_row.category,
        v_ver,
        v_row.payload,
        v_target
    );

    UPDATE admin.global_template_library
    SET
        platform_synced_at = CASE
            WHEN v_target IN ('platform', 'both') THEN NOW()
            ELSE platform_synced_at
        END,
        platform_synced_version = CASE
            WHEN v_target IN ('platform', 'both') THEN v_ver
            ELSE platform_synced_version
        END,
        sim_synced_at = CASE
            WHEN v_target IN ('simulator', 'both') THEN NOW()
            ELSE sim_synced_at
        END,
        sim_synced_version = CASE
            WHEN v_target IN ('simulator', 'both') THEN v_ver
            ELSE sim_synced_version
        END,
        -- Legacy columns: fully synced only when both targets match current version
        synced_at = CASE
            WHEN (
                (CASE WHEN v_target IN ('platform', 'both') THEN NOW() ELSE platform_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN NOW() ELSE sim_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('platform', 'both') THEN v_ver ELSE platform_synced_version END) >= v_ver
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN v_ver ELSE sim_synced_version END) >= v_ver
            ) THEN NOW()
            ELSE synced_at
        END,
        synced_version = CASE
            WHEN (
                (CASE WHEN v_target IN ('platform', 'both') THEN NOW() ELSE platform_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN NOW() ELSE sim_synced_at END) IS NOT NULL
                AND (CASE WHEN v_target IN ('platform', 'both') THEN v_ver ELSE platform_synced_version END) >= v_ver
                AND (CASE WHEN v_target IN ('simulator', 'both') THEN v_ver ELSE sim_synced_version END) >= v_ver
            ) THEN v_ver
            ELSE synced_version
        END,
        updated_at = NOW(),
        updated_by = v_admin
    WHERE id = p_template_id;

    PERFORM admin.log_admin_action(
        v_admin, 'global_template.publish', 'global_template_library', p_template_id,
        jsonb_build_object('notes', trim(p_notes), 'target', v_target, 'sync', v_sync)
    );

    RETURN jsonb_build_object(
        'template_id', p_template_id,
        'domain', v_row.domain,
        'target', v_target,
        'sync', v_sync
    );
END;
$$;

-- Drop 3-arg overload if it remains alongside the new 4-arg (Postgres keeps both)

GRANT EXECUTE ON FUNCTION admin.publish_global_template(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed: Technology Transformation Portfolio + Regulatory Compliance Programme
-- Fixed UUIDs for idempotent upserts (re-run safe)
-- ---------------------------------------------------------------------------

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, payload, record_status, record_version
) VALUES (
    'a1840000-0000-4000-8000-000000000001'::uuid,
    'portfolio_template',
    'Technology Transformation Portfolio',
    'Curated master for digital / technology transformation portfolios.',
    'strategic',
    $ptseed${
      "template_code": "PT-TECH-01",
      "portfolio_type": "strategic",
      "governance_model": "steering_committee",
      "review_frequency": "monthly",
      "description": "Guides technology transformation portfolios: objectives, investment governance, and benefit tracking.",
      "objectives": [
        {
          "objective_code": "OBJ-01",
          "objective_name": "Modernise core platforms",
          "objective_description": "Replace fragmented tooling with a coherent digital workplace.",
          "objective_type": "outcome",
          "objective_level": "strategic",
          "measurement_criteria": "% of users on target platform",
          "target_value": "90% within 18 months",
          "strategic_alignment": "Digital operating model",
          "importance_score": 5,
          "sort_order": 1
        }
      ],
      "governance": [
        {
          "board_name": "Technology Portfolio Board",
          "decision_making_process": "Monthly board; stage-gate approvals for >$250k initiatives",
          "selection_criteria": "Strategic fit, NPV, risk, capacity",
          "prioritisation_rules": "Weighted scoring (strategy 40%, value 30%, risk 20%, readiness 10%)",
          "resource_allocation_rules": "Pooled digital delivery capacity; reserved 15% contingency",
          "escalation_process": "PM → Portfolio Manager → Board → Sponsor",
          "compliance_requirements": "Security review; data protection DPIA where personal data involved",
          "sort_order": 1
        }
      ],
      "benefit_categories": [
        {"category": "financial", "notes": "Cost avoidance from licence consolidation", "sort_order": 1},
        {"category": "operational", "notes": "Cycle-time reduction for collaboration workflows", "sort_order": 2},
        {"category": "technology", "notes": "Technical debt reduction", "sort_order": 3}
      ],
      "risks": [
        {
          "risk_title": "Low adoption of new platforms",
          "risk_description": "Users retain shadow IT if change support is thin.",
          "risk_category": "organisational",
          "likelihood": "medium",
          "impact": "high",
          "sort_order": 1
        }
      ],
      "metrics": [
        {
          "kpi_name": "Active platform users",
          "target": "2500",
          "measurement_frequency": "monthly",
          "description": "Unique monthly active users on the target platform",
          "sort_order": 1
        }
      ],
      "roles": [
        {"role_title": "Portfolio Manager", "role_description": "Owns prioritisation and benefits outlook", "is_key_role": true, "sort_order": 1},
        {"role_title": "Architecture Lead", "role_description": "Guards target architecture standards", "is_key_role": true, "sort_order": 2}
      ]
    }$ptseed$::jsonb,
    'live',
    1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain = 'portfolio_template';

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, payload, record_status, record_version
) VALUES (
    'a1840000-0000-4000-8000-000000000002'::uuid,
    'programme_template',
    'Regulatory Compliance Programme',
    'Curated master for regulatory / compliance change programmes.',
    'compliance',
    $pgseed${
      "template_code": "PG-REG-01",
      "programme_type": "compliance",
      "governance_model": "board",
      "review_frequency": "fortnightly",
      "description": "Structures compliance programmes: governance TOR, milestones, dependencies, and benefits.",
      "governance": [
        {
          "structure": "Programme board + workstream leads + compliance office",
          "terms_of_reference": "Approve scope, risk appetite, and go-live readiness; meet fortnightly",
          "governance_documents": "Programme brief\nCompliance plan\nRisk register\nBenefits profile",
          "sort_order": 1
        }
      ],
      "milestones": [
        {
          "milestone_name": "Regulatory gap assessment complete",
          "milestone_description": "Baseline gaps agreed with Compliance Office",
          "start_offset_days": 30,
          "sort_order": 1
        },
        {
          "milestone_name": "Control design approved",
          "milestone_description": "Target controls signed off",
          "start_offset_days": 90,
          "sort_order": 2
        }
      ],
      "dependencies": [
        {
          "dependency_description": "Policy updates from Legal before control rollout",
          "dependency_type": "finish_to_start",
          "linked_reference": "Legal policy workstream",
          "sort_order": 1
        }
      ],
      "benefits": [
        {
          "benefit_name": "Reduced regulatory findings",
          "category": "compliance",
          "target_value": "Zero critical findings in next audit cycle",
          "description": "Evidence-backed control effectiveness",
          "sort_order": 1
        }
      ],
      "risks": [
        {
          "risk_title": "Interpretation of regulation changes mid-programme",
          "risk_description": "Guidance updates may force rework of controls.",
          "risk_category": "external",
          "likelihood": "medium",
          "impact": "high",
          "sort_order": 1
        }
      ],
      "roles": [
        {"role_title": "Programme Manager", "role_description": "Day-to-day delivery and reporting", "is_key_role": true, "sort_order": 1},
        {"role_title": "Compliance Lead", "role_description": "Interprets obligations and signs off controls", "is_key_role": true, "sort_order": 2}
      ]
    }$pgseed$::jsonb,
    'live',
    1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain = 'programme_template';

DO $$
BEGIN
  RAISE NOTICE 'v184_portfolio_programme_templates.sql applied (domains + seed)';
END $$;


