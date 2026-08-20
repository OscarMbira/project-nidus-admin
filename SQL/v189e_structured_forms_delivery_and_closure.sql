-- =============================================================================
-- v189e: Structured forms — Delivery + Stage Boundary + Closing
-- Plan: projectplans/v189_structured_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v189
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Rule 27: "Structured" only — never PRINCE2
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1890000-0000-4000-8000-000000000061'::uuid, 'form_template',
    'Checkpoint Report (Structured)',
    'Structured Managing Product Delivery — checkpoint report.',
    'Managing Product Delivery', 'structured',
    '{"template_code":"FS-MPD-CHK-01","name":"Checkpoint Report (Structured)","process_group":"managing_product_delivery","is_active":true,"schema":{"title":"Checkpoint Report","sections":[{"key":"general","title":"General","fields":[{"key":"checkpoint_date","label":"Checkpoint date","type":"date","required":false},{"key":"work_package_reference","label":"Work package reference","type":"text","required":false},{"key":"products_completed","label":"Products completed","type":"textarea","required":false},{"key":"products_planned","label":"Products planned","type":"textarea","required":false},{"key":"quality_activities","label":"Quality activities","type":"textarea","required":false},{"key":"follow_on_actions","label":"Follow-on actions","type":"textarea","required":false},{"key":"checkpoint_status","label":"Checkpoint status","type":"select","required":false,"options":[{"value":"on_track","label":"On track"},{"value":"at_risk","label":"At risk"},{"value":"blocked","label":"Blocked"}]}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000062'::uuid, 'form_template',
    'Product Description (Structured)',
    'Structured Managing Product Delivery — product description.',
    'Managing Product Delivery', 'structured',
    '{"template_code":"FS-MPD-PD-01","name":"Product Description (Structured)","process_group":"managing_product_delivery","is_active":true,"schema":{"title":"Product Description","sections":[{"key":"general","title":"General","fields":[{"key":"product_identifier","label":"Product identifier","type":"text","required":false},{"key":"product_title","label":"Product title","type":"text","required":false},{"key":"purpose","label":"Purpose","type":"textarea","required":false},{"key":"composition","label":"Composition","type":"textarea","required":false},{"key":"derivation","label":"Derivation","type":"textarea","required":false},{"key":"format_and_presentation","label":"Format and presentation","type":"textarea","required":false},{"key":"quality_criteria","label":"Quality criteria","type":"textarea","required":false},{"key":"quality_tolerance","label":"Quality tolerance","type":"textarea","required":false},{"key":"quality_method","label":"Quality method","type":"textarea","required":false},{"key":"quality_responsibility","label":"Quality responsibility","type":"text","required":false},{"key":"product_quality_review","label":"Product quality review","type":"textarea","required":false},{"key":"acceptance_criteria","label":"Acceptance criteria","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000105'::uuid, 'form_template',
    'Work Package (Structured)',
    'Structured Managing Product Delivery — work package.',
    'Managing Product Delivery', 'structured',
    '{"template_code":"FS-MPD-WP-01","name":"Work Package (Structured)","process_group":"managing_product_delivery","is_active":true,"schema":{"title":"Work Package","sections":[{"key":"general","title":"General","fields":[{"key":"work_package_identifier","label":"Work package identifier","type":"text","required":false},{"key":"work_package_title","label":"Work package title","type":"text","required":false},{"key":"work_package_description","label":"Work package description","type":"textarea","required":false},{"key":"products_to_be_delivered","label":"Products to be delivered","type":"textarea","required":false},{"key":"product_descriptions_reference","label":"Product descriptions (reference)","type":"textarea","required":false},{"key":"techniques_and_procedures","label":"Techniques and procedures","type":"textarea","required":false},{"key":"required_approach","label":"Required approach","type":"textarea","required":false},{"key":"change_authority","label":"Change authority","type":"text","required":false},{"key":"constraints","label":"Constraints","type":"textarea","required":false},{"key":"agreement_date","label":"Agreement date","type":"date","required":false},{"key":"start_date","label":"Start date","type":"date","required":false},{"key":"end_date","label":"End date","type":"date","required":false},{"key":"acceptance_criteria","label":"Acceptance criteria","type":"textarea","required":false},{"key":"quality_requirements","label":"Quality requirements","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000106'::uuid, 'form_template',
    'End Stage Report (Structured)',
    'Structured Managing a Stage Boundary — end stage report.',
    'Managing a Stage Boundary', 'structured',
    '{"template_code":"FS-SB-ESR-01","name":"End Stage Report (Structured)","process_group":"managing_a_stage_boundary","is_active":true,"schema":{"title":"End Stage Report","sections":[{"key":"general","title":"General","fields":[{"key":"stage_name","label":"Stage name","type":"text","required":false},{"key":"period_covered","label":"Period covered","type":"text","required":false},{"key":"achievements","label":"Achievements","type":"textarea","required":false},{"key":"products_completed","label":"Products completed","type":"textarea","required":false},{"key":"products_not_completed","label":"Products not completed","type":"textarea","required":false},{"key":"quality_activities_summary","label":"Quality activities summary","type":"textarea","required":false},{"key":"follow_on_actions","label":"Follow-on actions","type":"textarea","required":false},{"key":"lessons_identified","label":"Lessons identified","type":"textarea","required":false},{"key":"next_stage_overview","label":"Next stage overview","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000071'::uuid, 'form_template',
    'Lessons Report (Structured)',
    'Structured Managing a Stage Boundary — lessons report.',
    'Managing a Stage Boundary', 'structured',
    '{"template_code":"FS-SB-LR-01","name":"Lessons Report (Structured)","process_group":"managing_a_stage_boundary","is_active":true,"schema":{"title":"Lessons Report","sections":[{"key":"general","title":"General","fields":[{"key":"report_date","label":"Report date","type":"date","required":false},{"key":"stage_or_project","label":"Stage / project","type":"text","required":false},{"key":"lessons_summary","label":"Lessons summary","type":"textarea","required":false},{"key":"recommendations","label":"Recommendations","type":"textarea","required":false},{"key":"follow_up_actions","label":"Follow-up actions","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000107'::uuid, 'form_template',
    'End Project Report (Structured)',
    'Structured Closing — end project report.',
    'Closing', 'structured',
    '{"template_code":"FS-CP-EPR-01","name":"End Project Report (Structured)","process_group":"closing","is_active":true,"schema":{"title":"End Project Report","sections":[{"key":"general","title":"General","fields":[{"key":"project_overview","label":"Project overview","type":"textarea","required":false},{"key":"performance_against_business_case","label":"Performance against business case","type":"textarea","required":false},{"key":"performance_against_objectives","label":"Performance against objectives","type":"textarea","required":false},{"key":"review_of_products","label":"Review of products","type":"textarea","required":false},{"key":"lessons_summary","label":"Lessons summary","type":"textarea","required":false},{"key":"follow_on_recommendations","label":"Follow-on recommendations","type":"textarea","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v189e_structured_forms_delivery_and_closure.sql applied'; END $$;
