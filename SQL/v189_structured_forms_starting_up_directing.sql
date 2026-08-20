-- =============================================================================
-- v189: Structured forms — Starting Up + Directing
-- Plan: projectplans/v189_structured_methodology_template_completeness_plan.md
-- Prerequisites: v185
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Rule 27: "Structured" only — never PRINCE2
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000101'::uuid, 'form_template',
    'Project Mandate (Structured)',
    'Structured Starting Up — project mandate with full section fields.',
    'Starting Up', 'structured',
    '{"template_code":"FS-SU-MANDATE-01","name":"Project Mandate (Structured)","process_group":"starting_up","is_active":true,"schema":{"title":"Project Mandate","sections":[{"key":"general","title":"General","fields":[{"key":"project_title","label":"Project title","type":"text","required":false},{"key":"document_date","label":"Document date","type":"date","required":false},{"key":"author","label":"Author","type":"text","required":false},{"key":"client_or_customer","label":"Client / customer","type":"text","required":false},{"key":"purpose","label":"Purpose","type":"textarea","required":false},{"key":"background","label":"Background","type":"textarea","required":false},{"key":"project_objectives","label":"Project objectives","type":"textarea","required":false},{"key":"project_scope","label":"Project scope","type":"textarea","required":false},{"key":"constraints","label":"Constraints","type":"textarea","required":false},{"key":"assumptions","label":"Assumptions","type":"textarea","required":false},{"key":"outline_business_case","label":"Outline business case","type":"textarea","required":false},{"key":"customer_quality_expectations","label":"Customer quality expectations","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000011'::uuid, 'form_template',
    'Project Brief (Structured)',
    'Structured Starting Up — project brief.',
    'Starting Up', 'structured',
    '{"template_code":"FS-SU-BRIEF-01","name":"Project Brief (Structured)","process_group":"starting_up","is_active":true,"schema":{"title":"Project Brief","sections":[{"key":"general","title":"General","fields":[{"key":"project_definition","label":"Project definition","type":"textarea","required":false},{"key":"project_approach","label":"Project approach","type":"textarea","required":false},{"key":"business_case","label":"Business case","type":"textarea","required":false},{"key":"project_product_description","label":"Project product description","type":"textarea","required":false},{"key":"project_plan","label":"Project plan","type":"textarea","required":false},{"key":"project_management_team_structure","label":"Project management team structure","type":"textarea","required":false},{"key":"references","label":"References to other information","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000012'::uuid, 'form_template',
    'Daily Log (Structured)',
    'Structured Starting Up — daily log.',
    'Starting Up', 'structured',
    '{"template_code":"FS-SU-DLOG-01","name":"Daily Log (Structured)","process_group":"starting_up","is_active":true,"schema":{"title":"Daily Log","sections":[{"key":"general","title":"General","fields":[{"key":"log_date","label":"Log date","type":"date","required":false},{"key":"entry_type","label":"Entry type","type":"select","required":false,"options":[{"value":"event","label":"Event"},{"value":"decision","label":"Decision"},{"value":"issue","label":"Issue"},{"value":"risk","label":"Risk"},{"value":"note","label":"Note"}]},{"key":"description","label":"Description","type":"textarea","required":false},{"key":"raised_by","label":"Raised by","type":"text","required":false},{"key":"follow_up_action","label":"Follow-up action","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000013'::uuid, 'form_template',
    'Lessons Log (Structured)',
    'Structured Starting Up — lessons log.',
    'Starting Up', 'structured',
    '{"template_code":"FS-SU-LLOG-01","name":"Lessons Log (Structured)","process_group":"starting_up","is_active":true,"schema":{"title":"Lessons Log","sections":[{"key":"general","title":"General","fields":[{"key":"lesson_date","label":"Lesson date","type":"date","required":false},{"key":"category","label":"Category","type":"select","required":false,"options":[{"value":"process","label":"Process"},{"value":"product","label":"Product"},{"value":"resource","label":"Resource"},{"value":"stakeholder","label":"Stakeholder"},{"value":"other","label":"Other"}]},{"key":"description","label":"Description of lesson","type":"textarea","required":false},{"key":"effect_on_project","label":"Effect on project","type":"textarea","required":false},{"key":"recommendations","label":"Recommendations","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000102'::uuid, 'form_template',
    'Project Board Agenda (Structured)',
    'Structured Directing — project board agenda.',
    'Directing', 'structured',
    '{"template_code":"FS-DIR-01","name":"Project Board Agenda (Structured)","process_group":"directing","is_active":true,"schema":{"title":"Project Board Agenda","sections":[{"key":"general","title":"General","fields":[{"key":"meeting_date","label":"Meeting date","type":"date","required":false},{"key":"attendees","label":"Attendees","type":"textarea","required":false},{"key":"previous_minutes","label":"Previous minutes","type":"textarea","required":false},{"key":"decisions_required","label":"Decisions required","type":"textarea","required":false},{"key":"progress_report","label":"Progress report","type":"textarea","required":false},{"key":"issues","label":"Issues","type":"textarea","required":false},{"key":"risks","label":"Risks","type":"textarea","required":false},{"key":"any_other_business","label":"Any other business","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000021'::uuid, 'form_template',
    'Highlight Report (Structured)',
    'Structured Directing — highlight report.',
    'Directing', 'structured',
    '{"template_code":"FS-DIR-HL-01","name":"Highlight Report (Structured)","process_group":"directing","is_active":true,"schema":{"title":"Highlight Report","sections":[{"key":"general","title":"General","fields":[{"key":"report_date","label":"Report date","type":"date","required":false},{"key":"period_covered","label":"Period covered","type":"text","required":false},{"key":"summary_status","label":"Summary status","type":"select","required":false,"options":[{"value":"green","label":"Green — on track"},{"value":"amber","label":"Amber — at risk"},{"value":"red","label":"Red — off track"}]},{"key":"achievements_this_period","label":"Achievements this period","type":"textarea","required":false},{"key":"work_planned_next_period","label":"Work planned next period","type":"textarea","required":false},{"key":"products_status","label":"Products status","type":"textarea","required":false},{"key":"issues_summary","label":"Issues summary","type":"textarea","required":false},{"key":"risks_summary","label":"Risks summary","type":"textarea","required":false},{"key":"forecast_completion","label":"Forecast completion","type":"textarea","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v189_structured_forms_starting_up_directing.sql applied'; END $$;
