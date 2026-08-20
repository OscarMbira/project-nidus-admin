-- =============================================================================
-- v183: Curated sample content for process_template document_data fields
-- Plan: projectplans/v185_default_content_library_plan.md (Part A option A)
-- Idempotent: jsonb_set into payload.document_data by seed_key
--
-- Single DO block (VALUES inline) so Supabase SQL Editor cannot lose a staging
-- table between statements/connections.
-- =============================================================================

DROP TABLE IF EXISTS admin.tmp_v183_process_sample;

DO $$
DECLARE
    v_row RECORD;
    v_tpl RECORD;
    v_payload JSONB;
    v_data JSONB;
    v_updated INT := 0;
    v_fields INT := 0;
BEGIN
    FOR v_tpl IN
        SELECT id, payload
        FROM admin.global_template_library
        WHERE domain = 'process_template'
          AND record_status <> 'history'
          AND NULLIF(trim(COALESCE(payload->>'seed_key', '')), '') IS NOT NULL
    LOOP
        v_payload := COALESCE(v_tpl.payload, '{}'::jsonb);
        v_data := COALESCE(v_payload->'document_data', '{}'::jsonb);
        IF jsonb_typeof(v_data) <> 'object' THEN
            v_data := '{}'::jsonb;
        END IF;

        FOR v_row IN
            SELECT field_key, sample_text
            FROM (
                VALUES
-- Project Charter
    ('seed_pt_project_charters', 'purpose', 'Authorise the project and communicate objectives, high-level scope, and PM authority.'),
    ('seed_pt_project_charters', 'owner_role', 'Project Sponsor / PMO'),
    ('seed_pt_project_charters', 'review_cadence', 'At initiation gate; re-issue on major scope change'),
    ('seed_pt_project_charters', 'sample_notes', 'Complete all sections before sponsor signature. Link to business case and high-level risks.'),
    ('seed_pt_project_charters', 'objectives', '1. Deliver agreed outcomes by target date. 2. Stay within approved budget envelope. 3. Meet quality acceptance criteria.'),
    ('seed_pt_project_charters', 'success_criteria', 'Sponsor acceptance; benefits realisation plan approved; no open critical risks at handover.'),
    ('seed_pt_project_charters', 'high_level_scope', 'In scope: core deliverables listed in the business case. Out of scope: unrelated BAU changes.'),
    -- Assumption Log
    ('seed_pt_assumption_logs', 'purpose', 'Record assumptions that, if invalid, may affect scope, cost, or schedule.'),
    ('seed_pt_assumption_logs', 'owner_role', 'Project Manager'),
    ('seed_pt_assumption_logs', 'review_cadence', 'Monthly / before each stage gate'),
    ('seed_pt_assumption_logs', 'sample_notes', 'Link each assumption to a risk ID when impact is material. Review owners before gate reviews.'),
    ('seed_pt_assumption_logs', 'assumption_categories', 'Technical, Business, External, Resource'),
    ('seed_pt_assumption_logs', 'escalation_path', 'PM → PMO → Sponsor'),
    -- WBS Dictionary
    ('seed_pt_wbs_dictionary_entries', 'purpose', 'Define WBS elements: description, owner, acceptance criteria, and interfaces.'),
    ('seed_pt_wbs_dictionary_entries', 'owner_role', 'Project Manager / Planning Lead'),
    ('seed_pt_wbs_dictionary_entries', 'review_cadence', 'When WBS changes; stage gate reviews'),
    ('seed_pt_wbs_dictionary_entries', 'sample_notes', 'Keep WBS IDs stable once baselined. Update dictionary with every WBS revision.'),
    ('seed_pt_wbs_dictionary_entries', 'wbs_level_guidance', 'Level 1 = phases; Level 2 = major deliverables; Level 3+ = work packages suitable for estimating.'),
    ('seed_pt_wbs_dictionary_entries', 'acceptance_criteria_hint', 'Measurable, testable statements (what “done” looks like for this element).'),
    -- Activity Cost Estimates
    ('seed_pt_activity_cost_estimates', 'purpose', 'Estimate activity costs including labour, materials, and contingency where applicable.'),
    ('seed_pt_activity_cost_estimates', 'owner_role', 'Cost Engineer / Project Manager'),
    ('seed_pt_activity_cost_estimates', 'review_cadence', 'At estimate baseline and on significant change'),
    ('seed_pt_activity_cost_estimates', 'sample_notes', 'Document estimating technique and currency. Align contingency with risk register.'),
    ('seed_pt_activity_cost_estimates', 'currency', 'USD'),
    ('seed_pt_activity_cost_estimates', 'contingency_guidance', 'Apply contingency by risk exposure (e.g. 5–15% for medium uncertainty); avoid double-counting reserves.'),
    -- Cost Baseline
    ('seed_pt_cost_baselines', 'purpose', 'Time-phased approved budget used as the cost performance baseline.'),
    ('seed_pt_cost_baselines', 'owner_role', 'Project Manager / Finance Partner'),
    ('seed_pt_cost_baselines', 'review_cadence', 'After approved change requests that affect cost'),
    ('seed_pt_cost_baselines', 'sample_notes', 'Baseline excludes management reserve unless organisational policy says otherwise.'),
    ('seed_pt_cost_baselines', 'currency', 'USD'),
    ('seed_pt_cost_baselines', 'baseline_total', '1.25m'),
    ('seed_pt_cost_baselines', 'time_phasing', 'Monthly by phase; align with schedule baseline periods'),
    ('seed_pt_cost_baselines', 'management_reserve', 'Held by sponsor; released via change control only'),
    -- Scope Acceptance
    ('seed_pt_scope_acceptance_forms', 'purpose', 'Formal acceptance of completed deliverables against agreed criteria.'),
    ('seed_pt_scope_acceptance_forms', 'owner_role', 'Business Owner / Project Manager'),
    ('seed_pt_scope_acceptance_forms', 'review_cadence', 'Per deliverable / phase acceptance'),
    ('seed_pt_scope_acceptance_forms', 'sample_notes', 'Attach evidence (test results, demos). Record conditional acceptance with open defects.'),
    ('seed_pt_scope_acceptance_forms', 'acceptance_criteria', 'Criteria must be measurable and traceable to requirements / WBS dictionary.'),
    ('seed_pt_scope_acceptance_forms', 'signoff_roles', 'Business Owner; Quality Lead; Project Manager'),
    -- Project Closure Checklist
    ('seed_pt_project_closure_checklists', 'purpose', 'Ensure administrative, contractual, and knowledge-transfer closure tasks are complete.'),
    ('seed_pt_project_closure_checklists', 'owner_role', 'Project Manager / PMO'),
    ('seed_pt_project_closure_checklists', 'review_cadence', 'At project close'),
    ('seed_pt_project_closure_checklists', 'sample_notes', 'Do not archive until financial and contractual closure are confirmed.'),
    ('seed_pt_project_closure_checklists', 'closure_steps', E'Confirm deliverable acceptance\nRelease resources\nClose contracts / POs\nArchive project records\nLessons learned workshop\nBenefits handover'),
    ('seed_pt_project_closure_checklists', 'archive_location', 'Organisation document repository / Project close folder'),
    -- Project Management Plan
    ('seed_pt_project_management_plans', 'purpose', 'Integrate subsidiary plans and baselines into one controlling document.'),
    ('seed_pt_project_management_plans', 'owner_role', 'Project Manager'),
    ('seed_pt_project_management_plans', 'review_cadence', 'At each stage gate; after approved change requests'),
    ('seed_pt_project_management_plans', 'sample_notes', 'Keep subsidiary plans version-aligned with the master plan.'),
    ('seed_pt_project_management_plans', 'subsidiary_plans', 'Scope, Schedule, Cost, Quality, Resource, Communications, Risk, Procurement, Stakeholder'),
    ('seed_pt_project_management_plans', 'baselines', 'Scope, Schedule, Cost'),
    -- Requirements Management Plan
    ('seed_pt_requirements_management_plans', 'purpose', 'Define how requirements are elicited, documented, traced, and controlled.'),
    ('seed_pt_requirements_management_plans', 'owner_role', 'Business Analyst / Requirements Lead'),
    ('seed_pt_requirements_management_plans', 'review_cadence', 'Per requirements baseline; before scope freeze'),
    ('seed_pt_requirements_management_plans', 'sample_notes', 'Link requirements to WBS and test cases for full traceability.'),
    ('seed_pt_requirements_management_plans', 'elicitation_methods', 'Workshops, interviews, document analysis, prototypes'),
    ('seed_pt_requirements_management_plans', 'traceability_approach', 'Requirement ID → design → build → test → acceptance'),
    -- Requirements Documentation
    ('seed_pt_requirements_documentation', 'purpose', 'Capture agreed requirements with priority and acceptance criteria.'),
    ('seed_pt_requirements_documentation', 'owner_role', 'Business Analyst'),
    ('seed_pt_requirements_documentation', 'review_cadence', 'After each elicitation cycle'),
    ('seed_pt_requirements_documentation', 'sample_notes', 'Use unique requirement IDs. Mark deferred items clearly.'),
    ('seed_pt_requirements_documentation', 'requirement_types', 'Business, Functional, Non-functional, Constraint'),
    ('seed_pt_requirements_documentation', 'priority_scale', 'MoSCoW'),
    -- Activity Attributes
    ('seed_pt_activity_attributes', 'purpose', 'Standard attributes for scheduling and control of activities.'),
    ('seed_pt_activity_attributes', 'owner_role', 'Planning Lead'),
    ('seed_pt_activity_attributes', 'review_cadence', 'When schedule baseline changes'),
    ('seed_pt_activity_attributes', 'sample_notes', 'Keep codes stable once baselined.'),
    ('seed_pt_activity_attributes', 'attribute_list', 'ID, predecessors, successors, resources, constraints, calendar, lag/lead'),
    -- Activity Resource Requirements
    ('seed_pt_activity_resource_requirements', 'purpose', 'Specify people, equipment, and materials needed per activity.'),
    ('seed_pt_activity_resource_requirements', 'owner_role', 'Resource Manager / Project Manager'),
    ('seed_pt_activity_resource_requirements', 'review_cadence', 'Before baseline; on resource conflicts'),
    ('seed_pt_activity_resource_requirements', 'sample_notes', 'Align with RBS and cost estimates.'),
    ('seed_pt_activity_resource_requirements', 'resource_categories', 'Labour, Equipment, Material, Facilities'),
    -- Resource Breakdown Structure
    ('seed_pt_resource_breakdown_structure', 'purpose', 'Hierarchical classification of project resources.'),
    ('seed_pt_resource_breakdown_structure', 'owner_role', 'Resource Manager / PMO'),
    ('seed_pt_resource_breakdown_structure', 'review_cadence', 'Annually or when org structure changes'),
    ('seed_pt_resource_breakdown_structure', 'sample_notes', 'Use consistent codes across projects.'),
    ('seed_pt_resource_breakdown_structure', 'hierarchy_levels', 'Category → Type → Role/Asset → Named resource'),
    -- Activity Duration Estimates
    ('seed_pt_activity_duration_estimates', 'purpose', 'Estimate activity durations with stated technique and units.'),
    ('seed_pt_activity_duration_estimates', 'owner_role', 'Planning Lead'),
    ('seed_pt_activity_duration_estimates', 'review_cadence', 'At estimate and before schedule baseline'),
    ('seed_pt_activity_duration_estimates', 'sample_notes', 'Document assumptions that drive duration.'),
    ('seed_pt_activity_duration_estimates', 'estimating_technique', 'Three-point (PERT) / Analogous'),
    ('seed_pt_activity_duration_estimates', 'unit_of_measure', 'Working days'),
    -- Cost Management Plan
    ('seed_pt_cost_management_plans', 'purpose', 'Define cost planning, estimating, budgeting, and control.'),
    ('seed_pt_cost_management_plans', 'owner_role', 'Project Manager / Cost Engineer'),
    ('seed_pt_cost_management_plans', 'review_cadence', 'At cost baseline and on major change'),
    ('seed_pt_cost_management_plans', 'sample_notes', 'Align currency and precision with finance policy.'),
    ('seed_pt_cost_management_plans', 'cost_precision', 'Nearest thousand (or org standard)'),
    ('seed_pt_cost_management_plans', 'control_thresholds', '±10% variance triggers variance analysis'),
    -- Resource Management Plan
    ('seed_pt_resource_management_plans', 'purpose', 'How the project acquires, develops, and manages the team and physical resources.'),
    ('seed_pt_resource_management_plans', 'owner_role', 'Project Manager / HR Partner'),
    ('seed_pt_resource_management_plans', 'review_cadence', 'Per stage; after major staffing changes'),
    ('seed_pt_resource_management_plans', 'sample_notes', 'Include RACI for key roles.'),
    ('seed_pt_resource_management_plans', 'acquisition_approach', 'Internal assignment first; contractors for specialised skills'),
    ('seed_pt_resource_management_plans', 'team_development', 'Kick-off, pairing, lessons-learned sessions'),
    -- Stakeholder Engagement Plan
    ('seed_pt_stakeholder_engagement_plans', 'purpose', 'Plan engagement strategies by stakeholder influence and interest.'),
    ('seed_pt_stakeholder_engagement_plans', 'owner_role', 'Project Manager / Communications Lead'),
    ('seed_pt_stakeholder_engagement_plans', 'review_cadence', 'Monthly / before major communications'),
    ('seed_pt_stakeholder_engagement_plans', 'sample_notes', 'Update power/interest grid after org changes.'),
    ('seed_pt_stakeholder_engagement_plans', 'engagement_levels', 'Unaware → Resistant → Neutral → Supportive → Leading'),
    ('seed_pt_stakeholder_engagement_plans', 'communication_channels', 'Steering committee, email digest, workshops, 1:1s'),
    -- Procurement Management Plan
    ('seed_pt_procurement_management_plans', 'purpose', 'Define make-or-buy, contract types, and procurement lifecycle.'),
    ('seed_pt_procurement_management_plans', 'owner_role', 'Procurement Lead / Project Manager'),
    ('seed_pt_procurement_management_plans', 'review_cadence', 'Before each major solicitation'),
    ('seed_pt_procurement_management_plans', 'sample_notes', 'Align with organisational procurement policy.'),
    ('seed_pt_procurement_management_plans', 'contract_types', 'Fixed-price preferred; T&M for exploratory work'),
    ('seed_pt_procurement_management_plans', 'make_or_buy_criteria', 'Cost, capability, risk, strategic importance, time-to-need'),
    -- Quality Checklist
    ('seed_pt_quality_checklists', 'purpose', 'Repeatable checks that confirm deliverable quality criteria.'),
    ('seed_pt_quality_checklists', 'owner_role', 'Quality Lead'),
    ('seed_pt_quality_checklists', 'review_cadence', 'Per deliverable type / phase exit'),
    ('seed_pt_quality_checklists', 'sample_notes', 'One checklist per deliverable type where practical.'),
    ('seed_pt_quality_checklists', 'checklist_items', E'Requirements traced\nAcceptance criteria met\nDefects closed or waived\nDocumentation complete'),
    ('seed_pt_quality_checklists', 'pass_fail_rule', 'All mandatory items Pass; conditional items documented'),
    -- Team Performance Assessments
    ('seed_pt_team_performance_assessments', 'purpose', 'Assess team effectiveness and development needs.'),
    ('seed_pt_team_performance_assessments', 'owner_role', 'Project Manager'),
    ('seed_pt_team_performance_assessments', 'review_cadence', 'End of stage / quarterly'),
    ('seed_pt_team_performance_assessments', 'sample_notes', 'Separate individual HR reviews from project team health.'),
    ('seed_pt_team_performance_assessments', 'assessment_dimensions', 'Collaboration, delivery predictability, quality, morale'),
    ('seed_pt_team_performance_assessments', 'rating_scale', '1–5'),
    -- Make or Buy Decisions
    ('seed_pt_make_or_buy_decisions', 'purpose', 'Record the decision and rationale for make vs buy.'),
    ('seed_pt_make_or_buy_decisions', 'owner_role', 'Project Manager / Procurement'),
    ('seed_pt_make_or_buy_decisions', 'review_cadence', 'Before each procurement gate'),
    ('seed_pt_make_or_buy_decisions', 'sample_notes', 'Attach cost model and risk summary.'),
    ('seed_pt_make_or_buy_decisions', 'decision_criteria', 'Total cost of ownership, capability, IP, schedule, risk'),
    ('seed_pt_make_or_buy_decisions', 'recommendation_format', 'Option comparison table + preferred recommendation + conditions'),
    -- Variance Analysis Reports
    ('seed_pt_variance_analysis_reports', 'purpose', 'Explain schedule/cost/scope variances and corrective actions.'),
    ('seed_pt_variance_analysis_reports', 'owner_role', 'Project Manager / PMO Analyst'),
    ('seed_pt_variance_analysis_reports', 'review_cadence', 'Per reporting period when thresholds breached'),
    ('seed_pt_variance_analysis_reports', 'sample_notes', 'Always state root cause and owner of recovery actions.'),
    ('seed_pt_variance_analysis_reports', 'variance_types', 'Schedule, Cost, Scope'),
    ('seed_pt_variance_analysis_reports', 'root_cause_prompt', 'What changed vs plan? Controllable vs external? Impact if unaddressed?'),
    -- EVM Status Reports
    ('seed_pt_evm_status_reports', 'purpose', 'Report earned value metrics and forecast to complete.'),
    ('seed_pt_evm_status_reports', 'owner_role', 'Project Controls / Project Manager'),
    ('seed_pt_evm_status_reports', 'review_cadence', 'Weekly or monthly per PMO cadence'),
    ('seed_pt_evm_status_reports', 'sample_notes', 'Include CPI/SPI trend and EAC narrative.'),
    ('seed_pt_evm_status_reports', 'metrics_included', 'PV, EV, AC, CPI, SPI, EAC, VAC'),
    ('seed_pt_evm_status_reports', 'reporting_period', 'Monthly'),
    -- Contract Closure Documents
    ('seed_pt_contract_closure_documents', 'purpose', 'Confirm contractual obligations met and close the agreement.'),
    ('seed_pt_contract_closure_documents', 'owner_role', 'Procurement / Contract Manager'),
    ('seed_pt_contract_closure_documents', 'review_cadence', 'At contract end / early termination'),
    ('seed_pt_contract_closure_documents', 'sample_notes', 'Retain evidence of acceptance and final payment.'),
    ('seed_pt_contract_closure_documents', 'closure_conditions', 'Deliverables accepted; claims settled; warranties recorded'),
    ('seed_pt_contract_closure_documents', 'final_payment_notes', 'Release retention only after acceptance certificate')
            ) AS s(seed_key, field_key, sample_text)
            WHERE seed_key = v_tpl.payload->>'seed_key'
        LOOP
            IF NULLIF(trim(COALESCE(v_data->>v_row.field_key, '')), '') IS NULL
               OR trim(v_data->>v_row.field_key) ILIKE 'Global seed process master%'
               OR trim(v_data->>v_row.field_key) = trim(COALESCE(v_payload->>'description', ''))
            THEN
                v_data := jsonb_set(v_data, ARRAY[v_row.field_key], to_jsonb(v_row.sample_text), true);
                v_fields := v_fields + 1;
            END IF;
        END LOOP;

        IF v_data IS DISTINCT FROM COALESCE(v_tpl.payload->'document_data', '{}'::jsonb) THEN
            UPDATE admin.global_template_library
            SET payload = jsonb_set(v_payload, '{document_data}', v_data, true),
                updated_at = NOW()
            WHERE id = v_tpl.id;
            v_updated := v_updated + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'v183 process sample seed: % templates updated, % field writes', v_updated, v_fields;
END $$;
