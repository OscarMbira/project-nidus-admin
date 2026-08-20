-- =============================================================================
-- v191d: Agile forms — Review, Retro & Release
-- Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v191
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Agile methodology seed — generic ceremony fields (no vendor guide prose)
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000114'::uuid, 'form_template',
    'Sprint Review Notes (Agile)',
    'Agile Review — sprint review / demo notes (split from combined review+retro stub).',
    'Review & Retrospective', 'agile',
    '{"template_code":"FA-RR-01","name":"Sprint Review Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Sprint Review Notes","sections":[{"key":"general","title":"General","fields":[{"key":"sprint_id","label":"Sprint ID","type":"text","required":false},{"key":"review_date","label":"Review date","type":"date","required":false},{"key":"demo_items","label":"Demo items","type":"textarea","required":false},{"key":"stakeholder_feedback","label":"Stakeholder feedback","type":"textarea","required":false},{"key":"acceptance_outcomes","label":"Acceptance outcomes","type":"textarea","required":false},{"key":"backlog_impact","label":"Backlog impact","type":"textarea","required":false},{"key":"attendees","label":"Attendees","type":"textarea","required":false},{"key":"decisions","label":"Decisions","type":"textarea","required":false},{"key":"follow_up_stories","label":"Follow-up stories","type":"textarea","required":false},{"key":"facilitator","label":"Facilitator","type":"text","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000041'::uuid, 'form_template',
    'Sprint Retrospective Notes (Agile)',
    'Agile Retrospective — improvement actions and experiments.',
    'Review & Retrospective', 'agile',
    '{"template_code":"FA-RR-RETRO-01","name":"Sprint Retrospective Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Sprint Retrospective Notes","sections":[{"key":"general","title":"General","fields":[{"key":"sprint_id","label":"Sprint ID","type":"text","required":false},{"key":"retro_date","label":"Retrospective date","type":"date","required":false},{"key":"went_well","label":"What went well","type":"textarea","required":false},{"key":"to_improve","label":"What to improve","type":"textarea","required":false},{"key":"experiments","label":"Experiments to try","type":"textarea","required":false},{"key":"action_owners","label":"Action owners / dates","type":"textarea","required":false},{"key":"follow_up","label":"Follow-up from last retro","type":"textarea","required":false},{"key":"attendees","label":"Attendees","type":"textarea","required":false},{"key":"facilitator","label":"Facilitator","type":"text","required":false},{"key":"parking_lot","label":"Parking lot","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000042'::uuid, 'form_template',
    'Demo Feedback Log (Agile)',
    'Agile Review — stakeholder demo feedback log.',
    'Review & Retrospective', 'agile',
    '{"template_code":"FA-RR-DEMO-01","name":"Demo Feedback Log (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Demo Feedback Log","sections":[{"key":"general","title":"General","fields":[{"key":"demo_date","label":"Demo date","type":"date","required":false},{"key":"item_reference","label":"Item reference","type":"text","required":false},{"key":"feedback","label":"Feedback","type":"textarea","required":false},{"key":"priority","label":"Priority","type":"select","required":false,"options":[{"value":"high","label":"High"},{"value":"medium","label":"Medium"},{"value":"low","label":"Low"}]},{"key":"follow_up_story","label":"Follow-up story","type":"textarea","required":false},{"key":"raised_by","label":"Raised by","type":"text","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000115'::uuid, 'form_template',
    'Release Checklist (Agile)',
    'Agile Release — full release checklist.',
    'Release', 'agile',
    '{"template_code":"FA-REL-01","name":"Release Checklist (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Release Checklist","sections":[{"key":"general","title":"General","fields":[{"key":"release_version","label":"Release version","type":"text","required":false,"sample":"2.4.0"},{"key":"release_date","label":"Release date","type":"date","required":false},{"key":"scope_summary","label":"Scope summary","type":"textarea","required":false},{"key":"environments","label":"Environments","type":"textarea","required":false,"help":"e.g. staging → production"},{"key":"test_sign_off","label":"Test sign-off","type":"textarea","required":false},{"key":"security_ops_checks","label":"Security / ops checks","type":"textarea","required":false},{"key":"communications_plan","label":"Communications","type":"textarea","required":false},{"key":"go_no_go","label":"Go / No-go","type":"select","required":false,"options":[{"value":"go","label":"Go"},{"value":"no_go","label":"No-go"},{"value":"conditional","label":"Conditional"}]},{"key":"rollback_owner","label":"Rollback owner","type":"text","required":false},{"key":"approvers","label":"Approvers","type":"textarea","required":false},{"key":"known_issues","label":"Known issues","type":"textarea","required":false},{"key":"post_release_verification","label":"Post-release verification","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000051'::uuid, 'form_template',
    'Release Notes (Agile)',
    'Agile Release — release notes.',
    'Release', 'agile',
    '{"template_code":"FA-REL-NOTES-01","name":"Release Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Release Notes","sections":[{"key":"general","title":"General","fields":[{"key":"release_version","label":"Release version","type":"text","required":false},{"key":"release_date","label":"Release date","type":"date","required":false},{"key":"highlights","label":"Highlights","type":"textarea","required":false},{"key":"breaking_changes","label":"Breaking changes","type":"textarea","required":false},{"key":"known_issues","label":"Known issues","type":"textarea","required":false},{"key":"upgrade_steps","label":"Upgrade steps","type":"textarea","required":false},{"key":"contributors","label":"Contributors","type":"textarea","required":false},{"key":"links","label":"Links / references","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000052'::uuid, 'form_template',
    'Go / No-Go Decision Record (Agile)',
    'Agile Release — go / no-go decision record.',
    'Release', 'agile',
    '{"template_code":"FA-REL-GNG-01","name":"Go / No-Go Decision Record (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Go / No-Go Decision Record","sections":[{"key":"general","title":"General","fields":[{"key":"release_version","label":"Release version","type":"text","required":false},{"key":"decision_date","label":"Decision date","type":"date","required":false},{"key":"decision","label":"Decision","type":"select","required":false,"options":[{"value":"go","label":"Go"},{"value":"no_go","label":"No-go"},{"value":"defer","label":"Defer"}]},{"key":"criteria_met","label":"Criteria met","type":"textarea","required":false},{"key":"risks_accepted","label":"Risks accepted","type":"textarea","required":false},{"key":"approvers","label":"Approvers","type":"textarea","required":false},{"key":"conditions","label":"Conditions (if any)","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000053'::uuid, 'form_template',
    'Deployment / Rollback Plan (Agile)',
    'Agile Release — deployment and rollback plan.',
    'Release', 'agile',
    '{"template_code":"FA-REL-DEP-01","name":"Deployment / Rollback Plan (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Deployment / Rollback Plan","sections":[{"key":"general","title":"General","fields":[{"key":"release_version","label":"Release version","type":"text","required":false},{"key":"deployment_steps","label":"Deployment steps","type":"textarea","required":false},{"key":"step_owners","label":"Step owners","type":"textarea","required":false},{"key":"rollback_trigger","label":"Rollback trigger","type":"textarea","required":false},{"key":"rollback_steps","label":"Rollback steps","type":"textarea","required":false},{"key":"verification","label":"Verification","type":"textarea","required":false},{"key":"communication_points","label":"Communication points","type":"textarea","required":false},{"key":"notes","label":"Notes","type":"textarea","required":false}]}]}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v191d_agile_forms_review_retro_release.sql applied'; END $$;
