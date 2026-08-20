-- =============================================================================
-- v178: Offline guidance (help) + sample examples on Global form_template payloads
-- Plan: projectplans/v178_form_template_export_offline_guidance_plan.md
-- Idempotent: sets help/sample on F001 from curated copy; fills missing help elsewhere
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_schema JSONB;
    v_sections JSONB := '[]'::jsonb;
    v_sec JSONB;
    v_fields JSONB;
    v_new_fields JSONB;
    v_field JSONB;
    v_key TEXT;
    v_help TEXT;
    v_sample TEXT;
    v_label TEXT;
    v_f001_updated INT := 0;
    v_generic_updated INT := 0;
    -- Curated F001 guidance (aligned with monorepo v770b) + short examples
    f001_help JSONB := '{
      "purpose": "Summarise why this project exists and the business problem or opportunity it addresses. Include the strategic alignment statement and the expected organisational benefit.",
      "objectives": "List measurable project objectives (SMART).",
      "success_criteria": "Define how success will be judged at project close.",
      "sponsor": "Name the executive sponsor and their role.",
      "high_level_requirements": "Capture high-level must-have requirements that justify initiating the project. Defer detail to Requirements Documentation (F010).",
      "high_level_risks": "Identify top initiation risks; detail in the Risk Register (F038).",
      "summary_budget": "Enter the approved high-level budget envelope (currency as used by the organisation).",
      "milestone_schedule": "List key initiation and early delivery milestones.",
      "pm_authority_level": "Select the authority level granted to the project manager.",
      "assumptions": "Document assumptions that, if proven false, may impact scope, cost, or schedule. Track detail in Assumption Log (F002).",
      "constraints": "List known constraints (budget, dates, regulatory, resource, technology).",
      "business_case_summary": "Provide a short business-case summary: options considered, preferred option, and expected value.",
      "key_stakeholders": "List key stakeholders who must endorse or be informed of the charter (name, role, organisation).",
      "approval_signatures": "Record approver name, role, decision (approve/reject), and date for charter authorisation.",
      "project_summary": "One-paragraph overview of what will be delivered and for whom.",
      "assigned_pm": "Name the assigned project manager (and organisation if relevant).",
      "charter_date": "Date this charter version is authorised or issued."
    }'::jsonb;
    f001_sample JSONB := '{
      "purpose": "Implement a unified Digital Workplace Platform to replace fragmented collaboration tools and improve hybrid-team productivity.",
      "objectives": "1. Deploy to 2,500 users by 30 Jun 2027. 2. Retire three legacy tools within 90 days of go-live.",
      "success_criteria": "UAT accepted; migration defect reopen <2%; cost/schedule within ±10% of baseline.",
      "sponsor": "Amina Okonkwo — Chief Operating Officer (Executive Sponsor)",
      "high_level_requirements": "SSO via corporate IdP; secure external guest sharing; mobile iOS/Android with offline read.",
      "high_level_risks": "Low adoption if change management is under-resourced — Owner: Change Lead.",
      "summary_budget": "1850000",
      "milestone_schedule": "Charter approved — 15 Aug 2026; Kick-off — 01 Sep 2026; Org-wide go-live — 30 Jun 2027",
      "pm_authority_level": "medium",
      "assumptions": "Corporate IdP and licensing available before build starts.",
      "constraints": "Go-live before legacy licence renewal (30 Sep 2027).",
      "business_case_summary": "Preferred option: unified platform. Approx. USD 2.4m benefit / USD 1.85m investment over 3 years.",
      "key_stakeholders": "COO (sponsor); CIO; Business Owner — Shared Services; IT Operations Lead",
      "approval_signatures": "Sponsor: ________  Date: ________  |  PMO: ________  Date: ________",
      "project_summary": "Cross-functional programme to standardise collaboration tooling for all employees.",
      "assigned_pm": "Jordan Lee — PMO",
      "charter_date": "2026-08-15"
    }'::jsonb;
BEGIN
    -- -------------------------------------------------------------------------
    -- F001: set help + sample on matching field keys
    -- -------------------------------------------------------------------------
    FOR r IN
        SELECT id, payload
        FROM admin.global_template_library
        WHERE domain = 'form_template'
          AND record_status <> 'history'
          AND payload->>'template_code' = 'F001'
    LOOP
        v_schema := COALESCE(r.payload->'schema', '{}'::jsonb);
        v_sections := '[]'::jsonb;

        FOR v_sec IN SELECT * FROM jsonb_array_elements(COALESCE(v_schema->'sections', '[]'::jsonb))
        LOOP
            v_new_fields := '[]'::jsonb;
            FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'fields', '[]'::jsonb))
            LOOP
                v_key := v_field->>'key';
                v_help := NULLIF(trim(COALESCE(f001_help->>v_key, v_field->>'help', '')), '');
                v_sample := NULLIF(trim(COALESCE(f001_sample->>v_key, v_field->>'sample', '')), '');
                IF v_help IS NOT NULL THEN
                    v_field := jsonb_set(v_field, '{help}', to_jsonb(v_help), true);
                END IF;
                IF v_sample IS NOT NULL THEN
                    v_field := jsonb_set(v_field, '{sample}', to_jsonb(v_sample), true);
                END IF;
                v_new_fields := v_new_fields || jsonb_build_array(v_field);
            END LOOP;
            v_sec := jsonb_set(v_sec, '{fields}', v_new_fields, true);
            v_sections := v_sections || jsonb_build_array(v_sec);
        END LOOP;

        v_schema := jsonb_set(COALESCE(v_schema, '{}'::jsonb), '{sections}', v_sections, true);

        UPDATE admin.global_template_library
        SET payload = jsonb_set(payload, '{schema}', v_schema, true),
            updated_at = NOW()
        WHERE id = r.id;

        v_f001_updated := v_f001_updated + 1;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- Other form_templates: generic help where missing (do not overwrite existing)
    -- -------------------------------------------------------------------------
    FOR r IN
        SELECT id, payload
        FROM admin.global_template_library
        WHERE domain = 'form_template'
          AND record_status <> 'history'
          AND COALESCE(payload->>'template_code', '') <> 'F001'
    LOOP
        v_schema := COALESCE(r.payload->'schema', '{}'::jsonb);
        v_sections := '[]'::jsonb;
        v_fields := NULL; -- reuse flag via help presence check

        FOR v_sec IN SELECT * FROM jsonb_array_elements(COALESCE(v_schema->'sections', '[]'::jsonb))
        LOOP
            v_new_fields := '[]'::jsonb;
            FOR v_field IN SELECT * FROM jsonb_array_elements(COALESCE(v_sec->'fields', '[]'::jsonb))
            LOOP
                v_help := NULLIF(trim(COALESCE(v_field->>'help', v_field->>'guidance', '')), '');
                IF v_help IS NULL THEN
                    v_label := COALESCE(NULLIF(trim(v_field->>'label'), ''), NULLIF(trim(v_field->>'key'), ''), 'this field');
                    v_help := format(
                        'Briefly complete "%s". Be specific and factual so the form can be understood offline without system context.',
                        v_label
                    );
                    v_field := jsonb_set(v_field, '{help}', to_jsonb(v_help), true);
                    v_generic_updated := v_generic_updated + 1;
                END IF;
                v_new_fields := v_new_fields || jsonb_build_array(v_field);
            END LOOP;
            v_sec := jsonb_set(v_sec, '{fields}', v_new_fields, true);
            v_sections := v_sections || jsonb_build_array(v_sec);
        END LOOP;

        v_schema := jsonb_set(COALESCE(v_schema, '{}'::jsonb), '{sections}', v_sections, true);

        UPDATE admin.global_template_library
        SET payload = jsonb_set(payload, '{schema}', v_schema, true),
            updated_at = NOW()
        WHERE id = r.id;
    END LOOP;

    RAISE NOTICE 'v178 offline guidance seed: F001 templates updated=%, generic help fields added=%',
        v_f001_updated, v_generic_updated;
END $$;
