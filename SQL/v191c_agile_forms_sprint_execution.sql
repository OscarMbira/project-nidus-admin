-- =============================================================================
-- v191c: Agile forms — Sprint Execution
-- Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v191
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Agile methodology seed — generic ceremony fields (no vendor guide prose)
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000113'::uuid, 'form_template',
    'Daily Stand-up Notes (Agile)',
    'Agile Sprint Execution — daily stand-up notes.',
    'Sprint Execution', 'agile',
    '{"template_code":"FA-SE-01","name":"Daily Stand-up Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Stand-up Notes","sections":[{"key":"general","title":"General","fields":[{"key":"standup_date","label":"Stand-up date","type":"date","required":false},{"key":"sprint_id","label":"Sprint ID","type":"text","required":false},{"key":"attendees","label":"Attendees","type":"textarea","required":false},{"key":"yesterday","label":"Yesterday","type":"textarea","required":false,"help":"Completed since last stand-up"},{"key":"today","label":"Today","type":"textarea","required":false,"help":"Plan for today toward sprint goal"},{"key":"impediments","label":"Impediments","type":"textarea","required":false},{"key":"help_needed","label":"Help needed","type":"textarea","required":false},{"key":"board_health_notes","label":"Board health notes","type":"textarea","required":false},{"key":"focus_today","label":"Team focus today","type":"textarea","required":false},{"key":"escalations","label":"Escalations","type":"textarea","required":false},{"key":"scribe","label":"Scribe","type":"text","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000031'::uuid, 'form_template',
    'Impediment Record (Agile)',
    'Agile Sprint Execution — impediment record.',
    'Sprint Execution', 'agile',
    '{"template_code":"FA-SE-IMP-01","name":"Impediment Record (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Impediment Record","sections":[{"key":"general","title":"General","fields":[{"key":"impediment_id","label":"Impediment ID","type":"text","required":false,"sample":"IMP-07"},{"key":"raised_date","label":"Raised date","type":"date","required":false},{"key":"description","label":"Description","type":"textarea","required":false},{"key":"impact","label":"Impact","type":"textarea","required":false},{"key":"owner","label":"Owner","type":"text","required":false},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"open","label":"Open"},{"value":"in_progress","label":"In progress"},{"value":"escalated","label":"Escalated"},{"value":"resolved","label":"Resolved"}]},{"key":"target_date","label":"Target resolution date","type":"date","required":false},{"key":"resolution","label":"Resolution","type":"textarea","required":false},{"key":"related_items","label":"Related backlog items","type":"textarea","required":false},{"key":"raised_by","label":"Raised by","type":"text","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000032'::uuid, 'form_template',
    'Task / Sub-task Card (Agile)',
    'Agile Sprint Execution — task or sub-task card.',
    'Sprint Execution', 'agile',
    '{"template_code":"FA-SE-TASK-01","name":"Task / Sub-task Card (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Task / Sub-task Card","sections":[{"key":"general","title":"General","fields":[{"key":"parent_pbi_ref","label":"Parent backlog item","type":"text","required":false},{"key":"task_title","label":"Task title","type":"text","required":false},{"key":"owner","label":"Owner","type":"text","required":false},{"key":"estimate_hours","label":"Estimate (hours)","type":"number","required":false},{"key":"status","label":"Status","type":"select","required":false,"options":[{"value":"todo","label":"To do"},{"value":"doing","label":"Doing"},{"value":"done","label":"Done"},{"value":"blocked","label":"Blocked"}]},{"key":"blockers","label":"Blockers","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false},{"key":"updated_date","label":"Updated date","type":"date","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000033'::uuid, 'form_template',
    'Mid-sprint Forecast Notes (Agile)',
    'Agile Sprint Execution — mid-sprint forecast notes.',
    'Sprint Execution', 'agile',
    '{"template_code":"FA-SE-FCST-01","name":"Mid-sprint Forecast Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Mid-sprint Forecast Notes","sections":[{"key":"general","title":"General","fields":[{"key":"forecast_date","label":"Forecast date","type":"date","required":false},{"key":"sprint_id","label":"Sprint ID","type":"text","required":false},{"key":"forecast_to_goal","label":"Forecast to sprint goal","type":"textarea","required":false},{"key":"scope_change","label":"Scope change","type":"textarea","required":false},{"key":"escalation","label":"Escalation","type":"textarea","required":false},{"key":"confidence","label":"Confidence","type":"select","required":false,"options":[{"value":"high","label":"High"},{"value":"medium","label":"Medium"},{"value":"low","label":"Low"}]},{"key":"author","label":"Author","type":"text","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v191c_agile_forms_sprint_execution.sql applied'; END $$;
