-- =============================================================================
-- v189b: Structured forms — Initiating (PID + related)
-- Plan: projectplans/v189_structured_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v189
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Rule 27: "Structured" only — never PRINCE2
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000103'::uuid, 'form_template',
    'Project Initiation Document (Structured)',
    'Structured Initiating — full project initiation document.',
    'Initiating', 'structured',
    '{"template_code":"FS-IP-PID-01","name":"Project Initiation Document (Structured)","process_group":"initiating","is_active":true,"schema":{"title":"Project Initiation Document","sections":[{"key":"general","title":"General","fields":[{"key":"project_definition","label":"Project definition","type":"textarea","required":false},{"key":"business_case_summary","label":"Business case summary","type":"textarea","required":false},{"key":"project_organisation","label":"Project organisation","type":"textarea","required":false},{"key":"quality_management_approach_ref","label":"Quality management approach (reference)","type":"textarea","required":false},{"key":"risk_management_approach_ref","label":"Risk management approach (reference)","type":"textarea","required":false},{"key":"configuration_management_approach_ref","label":"Configuration management approach (reference)","type":"textarea","required":false},{"key":"communication_management_approach_ref","label":"Communication management approach (reference)","type":"textarea","required":false},{"key":"project_plan_summary","label":"Project plan summary","type":"textarea","required":false},{"key":"project_controls","label":"Project controls","type":"textarea","required":false},{"key":"tolerances","label":"Tolerances","type":"textarea","required":false},{"key":"constraints","label":"Constraints","type":"textarea","required":false},{"key":"assumptions","label":"Assumptions","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000031'::uuid, 'form_template',
    'Business Case (Structured)',
    'Structured Initiating — business case.',
    'Initiating', 'structured',
    '{"template_code":"FS-IP-BC-01","name":"Business Case (Structured)","process_group":"initiating","is_active":true,"schema":{"title":"Business Case","sections":[{"key":"general","title":"General","fields":[{"key":"reasons","label":"Reasons","type":"textarea","required":false},{"key":"business_options","label":"Business options","type":"textarea","required":false},{"key":"expected_benefits","label":"Expected benefits","type":"textarea","required":false},{"key":"expected_disbenefits","label":"Expected dis-benefits","type":"textarea","required":false},{"key":"timescale","label":"Timescale","type":"textarea","required":false},{"key":"costs","label":"Costs","type":"money","required":false},{"key":"investment_appraisal","label":"Investment appraisal","type":"textarea","required":false},{"key":"major_risks","label":"Major risks","type":"textarea","required":false},{"key":"recommendation","label":"Recommendation","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000032'::uuid, 'form_template',
    'Benefits Review Plan (Structured)',
    'Structured Initiating — benefits review plan.',
    'Initiating', 'structured',
    '{"template_code":"FS-IP-BRP-01","name":"Benefits Review Plan (Structured)","process_group":"initiating","is_active":true,"schema":{"title":"Benefits Review Plan","sections":[{"key":"general","title":"General","fields":[{"key":"scope_of_review","label":"Scope of review","type":"textarea","required":false},{"key":"benefits_to_be_measured","label":"Benefits to be measured","type":"textarea","required":false},{"key":"measurement_approach","label":"Measurement approach","type":"textarea","required":false},{"key":"resources_required","label":"Resources required","type":"textarea","required":false},{"key":"review_schedule","label":"Review schedule","type":"textarea","required":false},{"key":"roles_and_responsibilities","label":"Roles and responsibilities","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000033'::uuid, 'form_template',
    'Project Product Description (Structured)',
    'Structured Initiating — project product description.',
    'Initiating', 'structured',
    '{"template_code":"FS-IP-PPD-01","name":"Project Product Description (Structured)","process_group":"initiating","is_active":true,"schema":{"title":"Project Product Description","sections":[{"key":"general","title":"General","fields":[{"key":"purpose","label":"Purpose","type":"textarea","required":false},{"key":"composition","label":"Composition","type":"textarea","required":false},{"key":"derivation","label":"Derivation","type":"textarea","required":false},{"key":"format_and_presentation","label":"Format and presentation","type":"textarea","required":false},{"key":"quality_criteria","label":"Quality criteria","type":"textarea","required":false},{"key":"quality_tolerance","label":"Quality tolerance","type":"textarea","required":false},{"key":"quality_method","label":"Quality method","type":"textarea","required":false},{"key":"quality_responsibility","label":"Quality responsibility","type":"text","required":false},{"key":"product_quality_review","label":"Product quality review","type":"textarea","required":false},{"key":"acceptance_criteria","label":"Acceptance criteria","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000034'::uuid, 'form_template',
    'Plan — Project / Stage / Team (Structured)',
    'Structured Initiating — project, stage, or team plan.',
    'Initiating', 'structured',
    '{"template_code":"FS-IP-PLAN-01","name":"Plan — Project / Stage / Team (Structured)","process_group":"initiating","is_active":true,"schema":{"title":"Plan","sections":[{"key":"general","title":"General","fields":[{"key":"plan_type","label":"Plan type","type":"select","required":false,"options":[{"value":"project","label":"Project plan"},{"value":"stage","label":"Stage plan"},{"value":"team","label":"Team plan"}]},{"key":"plan_description","label":"Plan description","type":"textarea","required":false},{"key":"product_breakdown_structure","label":"Product breakdown structure","type":"textarea","required":false},{"key":"product_descriptions","label":"Product descriptions","type":"textarea","required":false},{"key":"product_flow_diagram","label":"Product flow diagram","type":"textarea","required":false},{"key":"schedule","label":"Schedule","type":"textarea","required":false},{"key":"milestones","label":"Milestones","type":"textarea","required":false},{"key":"resources","label":"Resources","type":"textarea","required":false},{"key":"dependencies","label":"Dependencies","type":"textarea","required":false},{"key":"monitoring_and_control","label":"Monitoring and control","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain IN ('form_template', 'process_template');

DO $$ BEGIN RAISE NOTICE 'v189b_structured_forms_initiating.sql applied'; END $$;
