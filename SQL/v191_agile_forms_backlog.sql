-- =============================================================================
-- v191: Agile forms — Backlog
-- Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v185b
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Agile methodology seed — generic ceremony fields (no vendor guide prose)
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000111'::uuid, 'form_template',
    'Product Backlog Item Card (Agile)',
    'Agile Backlog — full product backlog item / user story card.',
    'Backlog', 'agile',
    '{"template_code":"FA-BL-01","name":"Product Backlog Item Card (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Backlog Item","sections":[{"key":"general","title":"General","fields":[{"key":"item_id","label":"Item ID","type":"text","required":false,"help":"Unique backlog identifier","sample":"PBI-1042"},{"key":"title","label":"Title","type":"text","required":false,"help":"Short outcome-oriented title","sample":"As a user I can reset my password"},{"key":"item_type","label":"Item type","type":"select","required":false,"options":[{"value":"story","label":"Story"},{"value":"bug","label":"Bug"},{"value":"spike","label":"Spike"},{"value":"enabler","label":"Enabler"},{"value":"chore","label":"Chore"}]},{"key":"description","label":"Description","type":"textarea","required":false,"help":"Context and intent for the item"},{"key":"persona_or_value","label":"Persona / business value","type":"textarea","required":false},{"key":"acceptance_criteria","label":"Acceptance criteria","type":"textarea","required":false,"help":"Testable conditions for done","sample":"Given… When… Then…"},{"key":"priority","label":"Priority","type":"select","required":false,"options":[{"value":"must","label":"Must"},{"value":"should","label":"Should"},{"value":"could","label":"Could"},{"value":"wont","label":"Won''t"}]},{"key":"estimate_points","label":"Estimate (points)","type":"number","required":false},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"new","label":"New"},{"value":"refined","label":"Refined"},{"value":"ready","label":"Ready"},{"value":"in_sprint","label":"In sprint"},{"value":"done","label":"Done"},{"value":"blocked","label":"Blocked"}]},{"key":"sprint_assignment","label":"Sprint assignment","type":"text","required":false},{"key":"dependencies","label":"Dependencies","type":"textarea","required":false},{"key":"risks_or_notes","label":"Risks / notes","type":"textarea","required":false},{"key":"owner","label":"Owner","type":"text","required":false,"sample":"Product Owner"},{"key":"definition_of_ready_met","label":"Definition of Ready met","type":"checkbox","required":false,"help":"Tick when item meets team DoR"},{"key":"tags","label":"Tags / themes","type":"text","required":false},{"key":"created_date","label":"Created date","type":"date","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000011'::uuid, 'form_template',
    'Epic / Feature Brief (Agile)',
    'Agile Backlog — epic or feature brief.',
    'Backlog', 'agile',
    '{"template_code":"FA-BL-EPIC-01","name":"Epic / Feature Brief (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Epic / Feature Brief","sections":[{"key":"general","title":"General","fields":[{"key":"epic_id","label":"Epic ID","type":"text","required":false,"sample":"EPIC-12"},{"key":"title","label":"Title","type":"text","required":false},{"key":"desired_outcome","label":"Desired outcome","type":"textarea","required":false},{"key":"success_metrics","label":"Success metrics","type":"textarea","required":false},{"key":"child_themes","label":"Child themes / stories","type":"textarea","required":false},{"key":"mvp_scope","label":"MVP scope","type":"textarea","required":false},{"key":"out_of_scope","label":"Out of scope","type":"textarea","required":false},{"key":"risks","label":"Risks","type":"textarea","required":false},{"key":"owner","label":"Owner","type":"text","required":false},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"draft","label":"Draft"},{"value":"active","label":"Active"},{"value":"done","label":"Done"},{"value":"parked","label":"Parked"}]},{"key":"target_release","label":"Target release","type":"text","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000012'::uuid, 'form_template',
    'Spike / Research Item (Agile)',
    'Agile Backlog — time-boxed research spike.',
    'Backlog', 'agile',
    '{"template_code":"FA-BL-SPIKE-01","name":"Spike / Research Item (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Spike / Research Item","sections":[{"key":"general","title":"General","fields":[{"key":"spike_id","label":"Spike ID","type":"text","required":false},{"key":"title","label":"Title","type":"text","required":false},{"key":"research_question","label":"Research question","type":"textarea","required":false,"help":"What decision will this spike unlock?"},{"key":"time_box","label":"Time-box","type":"text","required":false,"sample":"2 days"},{"key":"findings","label":"Findings","type":"textarea","required":false},{"key":"recommendation","label":"Recommendation","type":"textarea","required":false},{"key":"follow_on_stories","label":"Follow-on stories","type":"textarea","required":false},{"key":"owner","label":"Owner","type":"text","required":false},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"planned","label":"Planned"},{"value":"in_progress","label":"In progress"},{"value":"complete","label":"Complete"}]}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000013'::uuid, 'form_template',
    'Backlog Refinement Notes (Agile)',
    'Agile Backlog — refinement session notes.',
    'Backlog', 'agile',
    '{"template_code":"FA-BL-REF-01","name":"Backlog Refinement Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Backlog Refinement Notes","sections":[{"key":"general","title":"General","fields":[{"key":"session_date","label":"Session date","type":"date","required":false},{"key":"facilitator","label":"Facilitator","type":"text","required":false},{"key":"attendees","label":"Attendees","type":"textarea","required":false},{"key":"items_refined","label":"Items refined","type":"textarea","required":false},{"key":"estimate_changes","label":"Estimate changes","type":"textarea","required":false},{"key":"readiness_decisions","label":"Readiness decisions","type":"textarea","required":false},{"key":"open_questions","label":"Open questions","type":"textarea","required":false},{"key":"next_actions","label":"Next actions","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v191_agile_forms_backlog.sql applied'; END $$;
