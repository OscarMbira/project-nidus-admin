-- =============================================================================
-- v189d: Structured forms — Controlling a Stage
-- Plan: projectplans/v189_structured_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v189
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Rule 27: "Structured" only — never PRINCE2
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000104'::uuid, 'form_template',
    'Configuration Item Record (Structured)',
    'Structured Controlling a Stage — configuration item record.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-CIR-01","name":"Configuration Item Record (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Configuration Item Record","sections":[{"key":"general","title":"General","fields":[{"key":"item_identifier","label":"Item identifier","type":"text","required":false},{"key":"item_title","label":"Item title","type":"text","required":false},{"key":"item_type","label":"Item type","type":"select","required":false,"options":[{"value":"product","label":"Product"},{"value":"document","label":"Document"},{"value":"baseline","label":"Baseline"},{"value":"component","label":"Component"},{"value":"other","label":"Other"}]},{"key":"version","label":"Version","type":"text","required":false},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"draft","label":"Draft"},{"value":"under_review","label":"Under review"},{"value":"approved","label":"Approved"},{"value":"superseded","label":"Superseded"},{"value":"archived","label":"Archived"}]},{"key":"location","label":"Location","type":"text","required":false},{"key":"owner","label":"Owner","type":"text","required":false},{"key":"date_created","label":"Date created","type":"date","required":false},{"key":"date_modified","label":"Date modified","type":"date","required":false},{"key":"source","label":"Source","type":"text","required":false},{"key":"related_products","label":"Related products","type":"textarea","required":false},{"key":"related_issues","label":"Related issues","type":"textarea","required":false},{"key":"related_change_requests","label":"Related change requests","type":"textarea","required":false},{"key":"description","label":"Description","type":"textarea","required":false},{"key":"specification_reference","label":"Specification reference","type":"text","required":false},{"key":"quality_records","label":"Quality records","type":"textarea","required":false},{"key":"verification_status","label":"Verification status","type":"select","required":false,"options":[{"value":"not_started","label":"Not started"},{"value":"in_progress","label":"In progress"},{"value":"verified","label":"Verified"},{"value":"failed","label":"Failed"}]},{"key":"release_status","label":"Release status","type":"select","required":false,"options":[{"value":"not_released","label":"Not released"},{"value":"released","label":"Released"},{"value":"withdrawn","label":"Withdrawn"}]},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000051'::uuid, 'form_template',
    'Issue Register (Structured)',
    'Structured Controlling a Stage — issue register.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-ISSREG-01","name":"Issue Register (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Issue Register","sections":[{"key":"general","title":"General","fields":[{"key":"issue_identifier","label":"Issue identifier","type":"text","required":false},{"key":"issue_date","label":"Issue date","type":"date","required":false},{"key":"raised_by","label":"Raised by","type":"text","required":false},{"key":"issue_type","label":"Issue type","type":"select","required":false,"options":[{"value":"request_for_change","label":"Request for change"},{"value":"off_specification","label":"Off-specification"},{"value":"problem_concern","label":"Problem / concern"},{"value":"external_event","label":"External event"}]},{"key":"priority","label":"Priority","type":"select","required":false,"options":[{"value":"high","label":"High"},{"value":"medium","label":"Medium"},{"value":"low","label":"Low"}]},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"open","label":"Open"},{"value":"in_progress","label":"In progress"},{"value":"resolved","label":"Resolved"},{"value":"closed","label":"Closed"}]},{"key":"description","label":"Description","type":"textarea","required":false},{"key":"impact","label":"Impact","type":"textarea","required":false},{"key":"action_owner","label":"Action owner","type":"text","required":false},{"key":"date_resolved","label":"Date resolved","type":"date","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000052'::uuid, 'form_template',
    'Issue Report (Structured)',
    'Structured Controlling a Stage — issue report.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-ISSREP-01","name":"Issue Report (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Issue Report","sections":[{"key":"general","title":"General","fields":[{"key":"issue_identifier","label":"Issue identifier","type":"text","required":false},{"key":"issue_date","label":"Issue date","type":"date","required":false},{"key":"raised_by","label":"Raised by","type":"text","required":false},{"key":"issue_type","label":"Issue type","type":"select","required":false,"options":[{"value":"request_for_change","label":"Request for change"},{"value":"off_specification","label":"Off-specification"},{"value":"problem_concern","label":"Problem / concern"},{"value":"external_event","label":"External event"}]},{"key":"priority","label":"Priority","type":"select","required":false,"options":[{"value":"high","label":"High"},{"value":"medium","label":"Medium"},{"value":"low","label":"Low"}]},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"open","label":"Open"},{"value":"under_review","label":"Under review"},{"value":"decision_pending","label":"Decision pending"},{"value":"closed","label":"Closed"}]},{"key":"description","label":"Description","type":"textarea","required":false},{"key":"impact_assessment","label":"Impact assessment","type":"textarea","required":false},{"key":"recommendation","label":"Recommendation","type":"textarea","required":false},{"key":"decision_required","label":"Decision required","type":"textarea","required":false},{"key":"options_considered","label":"Options considered","type":"textarea","required":false},{"key":"decision","label":"Decision","type":"textarea","required":false},{"key":"action_owner","label":"Action owner","type":"text","required":false},{"key":"follow_up_date","label":"Follow-up date","type":"date","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000053'::uuid, 'form_template',
    'Product Status Account (Structured)',
    'Structured Controlling a Stage — product status account.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-PSA-01","name":"Product Status Account (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Product Status Account","sections":[{"key":"general","title":"General","fields":[{"key":"product_name","label":"Product name","type":"text","required":false},{"key":"product_status","label":"Product status","type":"select","required":false,"options":[{"value":"not_started","label":"Not started"},{"value":"in_progress","label":"In progress"},{"value":"completed","label":"Completed"},{"value":"approved","label":"Approved"},{"value":"handed_over","label":"Handed over"}]},{"key":"status_commentary","label":"Status commentary","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000054'::uuid, 'form_template',
    'Quality Register (Structured)',
    'Structured Controlling a Stage — quality register.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-QREG-01","name":"Quality Register (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Quality Register","sections":[{"key":"general","title":"General","fields":[{"key":"quality_identifier","label":"Quality identifier","type":"text","required":false},{"key":"product_name","label":"Product name","type":"text","required":false},{"key":"quality_method","label":"Quality method","type":"text","required":false},{"key":"planned_date","label":"Planned date","type":"date","required":false},{"key":"actual_date","label":"Actual date","type":"date","required":false},{"key":"quality_responsible","label":"Quality responsible","type":"text","required":false},{"key":"quality_result","label":"Quality result","type":"select","required":false,"options":[{"value":"pass","label":"Pass"},{"value":"pass_with_concessions","label":"Pass with concessions"},{"value":"fail","label":"Fail"},{"value":"not_applicable","label":"Not applicable"}]},{"key":"quality_records_location","label":"Quality records location","type":"text","required":false},{"key":"follow_up_required","label":"Follow-up required","type":"checkbox","required":false},{"key":"follow_up_action","label":"Follow-up action","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000055'::uuid, 'form_template',
    'Risk Register (Structured)',
    'Structured Controlling a Stage — risk register.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-RREG-01","name":"Risk Register (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Risk Register","sections":[{"key":"general","title":"General","fields":[{"key":"risk_identifier","label":"Risk identifier","type":"text","required":false},{"key":"date_identified","label":"Date identified","type":"date","required":false},{"key":"risk_category","label":"Risk category","type":"select","required":false,"options":[{"value":"business","label":"Business"},{"value":"technical","label":"Technical"},{"value":"resource","label":"Resource"},{"value":"schedule","label":"Schedule"},{"value":"cost","label":"Cost"},{"value":"external","label":"External"}]},{"key":"risk_description","label":"Risk description","type":"textarea","required":false},{"key":"risk_status","label":"Risk status","type":"select","required":false,"options":[{"value":"open","label":"Open"},{"value":"mitigating","label":"Mitigating"},{"value":"closed","label":"Closed"}]},{"key":"risk_owner","label":"Risk owner","type":"text","required":false},{"key":"risk_response","label":"Risk response","type":"textarea","required":false},{"key":"probability_pre","label":"Probability (pre-response)","type":"select","required":false,"options":[{"value":"1","label":"1 — Very low"},{"value":"2","label":"2 — Low"},{"value":"3","label":"3 — Medium"},{"value":"4","label":"4 — High"},{"value":"5","label":"5 — Very high"}]},{"key":"impact_pre","label":"Impact (pre-response)","type":"select","required":false,"options":[{"value":"1","label":"1 — Very low"},{"value":"2","label":"2 — Low"},{"value":"3","label":"3 — Medium"},{"value":"4","label":"4 — High"},{"value":"5","label":"5 — Very high"}]},{"key":"expected_value_pre","label":"Expected value (pre-response)","type":"number","required":false},{"key":"probability_post","label":"Probability (post-response)","type":"select","required":false,"options":[{"value":"1","label":"1 — Very low"},{"value":"2","label":"2 — Low"},{"value":"3","label":"3 — Medium"},{"value":"4","label":"4 — High"},{"value":"5","label":"5 — Very high"}]},{"key":"impact_post","label":"Impact (post-response)","type":"select","required":false,"options":[{"value":"1","label":"1 — Very low"},{"value":"2","label":"2 — Low"},{"value":"3","label":"3 — Medium"},{"value":"4","label":"4 — High"},{"value":"5","label":"5 — Very high"}]},{"key":"expected_value_post","label":"Expected value (post-response)","type":"number","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000056'::uuid, 'form_template',
    'Exception Report (Structured)',
    'Structured Controlling a Stage — exception report.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-EXC-01","name":"Exception Report (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Exception Report","sections":[{"key":"general","title":"General","fields":[{"key":"exception_date","label":"Exception date","type":"date","required":false},{"key":"stage_or_project","label":"Stage / project","type":"text","required":false},{"key":"description_of_exception","label":"Description of exception","type":"textarea","required":false},{"key":"cause","label":"Cause","type":"textarea","required":false},{"key":"impact","label":"Impact","type":"textarea","required":false},{"key":"recommended_options","label":"Recommended options","type":"textarea","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v189d_structured_forms_controlling_stage.sql applied'; END $$;
