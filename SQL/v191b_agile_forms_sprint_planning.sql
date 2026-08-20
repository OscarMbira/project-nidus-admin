-- =============================================================================
-- v191b: Agile forms — Sprint Planning
-- Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v191
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Agile methodology seed — generic ceremony fields (no vendor guide prose)
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000112'::uuid, 'form_template',
    'Sprint Planning Agenda (Agile)',
    'Agile Sprint Planning — full planning agenda / record.',
    'Sprint Planning', 'agile',
    '{"template_code":"FA-SP-01","name":"Sprint Planning Agenda (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Sprint Planning","sections":[{"key":"general","title":"General","fields":[{"key":"sprint_id","label":"Sprint ID","type":"text","required":false,"sample":"Sprint 24"},{"key":"sprint_start","label":"Sprint start","type":"date","required":false},{"key":"sprint_end","label":"Sprint end","type":"date","required":false},{"key":"sprint_goal","label":"Sprint goal","type":"textarea","required":false,"help":"Single coherent outcome for the sprint"},{"key":"team_capacity","label":"Team capacity","type":"text","required":false,"sample":"42 points / 160 hours"},{"key":"committed_items","label":"Committed items summary","type":"textarea","required":false},{"key":"dependencies","label":"Dependencies","type":"textarea","required":false},{"key":"risks","label":"Risks","type":"textarea","required":false},{"key":"definition_of_done_reminder","label":"Definition of Done reminder","type":"textarea","required":false},{"key":"attendees","label":"Attendees","type":"textarea","required":false},{"key":"decisions","label":"Decisions","type":"textarea","required":false},{"key":"parking_lot","label":"Parking lot","type":"textarea","required":false},{"key":"facilitator","label":"Facilitator","type":"text","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000021'::uuid, 'form_template',
    'Sprint Goal Statement (Agile)',
    'Agile Sprint Planning — sprint goal statement.',
    'Sprint Planning', 'agile',
    '{"template_code":"FA-SP-GOAL-01","name":"Sprint Goal Statement (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Sprint Goal Statement","sections":[{"key":"general","title":"General","fields":[{"key":"sprint_id","label":"Sprint ID","type":"text","required":false},{"key":"goal_statement","label":"Goal statement","type":"textarea","required":false},{"key":"why_now","label":"Why now","type":"textarea","required":false},{"key":"success_measure","label":"Success measure","type":"textarea","required":false},{"key":"constraints","label":"Constraints","type":"textarea","required":false},{"key":"owner","label":"Owner","type":"text","required":false},{"key":"agreed_date","label":"Agreed date","type":"date","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000022'::uuid, 'form_template',
    'Capacity & Availability Plan (Agile)',
    'Agile Sprint Planning — team capacity and availability.',
    'Sprint Planning', 'agile',
    '{"template_code":"FA-SP-CAP-01","name":"Capacity & Availability Plan (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Capacity & Availability Plan","sections":[{"key":"general","title":"General","fields":[{"key":"sprint_id","label":"Sprint ID","type":"text","required":false},{"key":"team_member","label":"Team member","type":"text","required":false},{"key":"availability_percent","label":"Availability %","type":"number","required":false},{"key":"pto_or_leave","label":"PTO / leave","type":"textarea","required":false},{"key":"focus_factor","label":"Focus factor","type":"text","required":false,"sample":"0.8"},{"key":"planned_hours","label":"Planned hours","type":"number","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false},{"key":"updated_date","label":"Updated date","type":"date","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v191b_agile_forms_sprint_planning.sql applied'; END $$;
