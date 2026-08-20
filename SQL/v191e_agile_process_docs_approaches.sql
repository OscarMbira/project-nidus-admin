-- =============================================================================
-- v191e: Agile process docs — approaches + v188 enrichments
-- Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v188 / v191
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Agile methodology seed — generic ceremony fields (no vendor guide prose)
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1910000-0000-4000-8000-000000000061'::uuid, 'process_template',
    'Definition of Done (Agile)',
    'Agile Release — definition of done (process guidance).',
    'Release', 'agile',
    '{"seed_key":"seed_pt_agile_dod","document_type":"scope_acceptance_forms","title":"Definition of Done (Agile)","description":"Agile Release — definition of done (process guidance).","status":"active","document_data":{"purpose":"Define the shared quality bar for calling work done.","owner_role":"Team / Quality Lead","review_cadence":"Each retrospective; update when quality gaps appear","sample_notes":"Keep DoD short enough to verify every item.","introduction":"Introduction — why a shared Definition of Done exists for this team.","coding_standards":"Coding standards — style, reviews, and static checks required.","testing":"Testing — unit, integration, and exploratory expectations.","documentation":"Documentation — release notes, help text, and runbooks when needed.","non_functional":"Non-functional — performance, accessibility, and security checks.","peer_review":"Peer review — who must approve and what evidence is required.","environment":"Environment — which environments must pass before done.","acceptance":"Acceptance — Product Owner or stakeholder confirmation rules.","exceptions":"Exceptions — how temporary waivers are recorded and closed."}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000062'::uuid, 'process_template',
    'Definition of Ready (Agile)',
    'Agile Backlog — definition of ready (process guidance).',
    'Backlog', 'agile',
    '{"seed_key":"seed_pt_agile_dor","document_type":"requirements_management_plans","title":"Definition of Ready (Agile)","description":"Agile Backlog — definition of ready (process guidance).","status":"active","document_data":{"purpose":"Define entry criteria so items are ready for sprint planning.","owner_role":"Product Owner / Team","review_cadence":"Each backlog refinement","sample_notes":"Reject items that fail DoR rather than forcing them into a sprint.","introduction":"Introduction — purpose of Definition of Ready for this backlog.","clarity":"Clarity — title, description, and value are understood by the team.","acceptance_criteria":"Acceptance criteria — testable conditions exist before planning.","dependencies":"Dependencies — known dependencies identified or removed.","sizing":"Sizing — item is estimated or time-boxed appropriately.","priority":"Priority — relative priority is set by the Product Owner.","design_assets":"Design / assets — required mockups or data are available.","risks":"Risks — known risks noted with mitigation or spike if needed.","checklist":"Checklist — team DoR checklist items are complete."}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000063'::uuid, 'process_template',
    'Backlog Management Approach (Agile)',
    'Agile Backlog — backlog management approach.',
    'Backlog', 'agile',
    '{"seed_key":"seed_pt_agile_backlog_approach","document_type":"requirements_documentation","title":"Backlog Management Approach (Agile)","description":"Agile Backlog — backlog management approach.","status":"active","document_data":{"purpose":"Describe how the product backlog is ordered, refined, and owned.","owner_role":"Product Owner","review_cadence":"Quarterly or when product strategy changes","sample_notes":"Keep one ordered backlog; avoid shadow lists.","introduction":"Introduction — scope of backlog management for this product.","ownership":"Ownership — who prioritises and who may add items.","ordering":"Ordering — factors used to sequence work (value, risk, cost of delay).","refinement_cadence":"Refinement cadence — how often and how long sessions run.","item_types":"Item types — stories, bugs, spikes, enablers and when to use each.","estimation":"Estimation — relative sizing approach and who participates.","readiness":"Readiness — how Definition of Ready is applied before planning.","transparency":"Transparency — where the backlog lives and who can view it.","escalation":"Escalation — how conflicting priorities are resolved."}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000064'::uuid, 'process_template',
    'Sprint Cadence Guide (Agile)',
    'Agile Sprint Planning — sprint cadence guide.',
    'Sprint Planning', 'agile',
    '{"seed_key":"seed_pt_agile_cadence","document_type":"project_management_plans","title":"Sprint Cadence Guide (Agile)","description":"Agile Sprint Planning — sprint cadence guide.","status":"active","document_data":{"purpose":"Describe the recurring sprint events, time-boxes, and roles.","owner_role":"Scrum Master / Team","review_cadence":"Each retrospective","sample_notes":"Protect time-boxes; adjust length only by team agreement.","introduction":"Introduction — sprint length and calendar for this team.","planning":"Planning — purpose, time-box, and required attendees.","daily_sync":"Daily sync — purpose, time-box, and focus on the sprint goal.","review":"Review — demo expectations and stakeholder invitations.","retrospective":"Retrospective — format options and action follow-up.","roles":"Roles — Product Owner, Scrum Master, and team responsibilities at each event.","artefacts":"Artefacts — which forms/logs are updated after each event.","interruptions":"Interruptions — how mid-sprint requests are handled."}}'::jsonb,
    'live', 1
),
(
    'a1910000-0000-4000-8000-000000000065'::uuid, 'process_template',
    'Release / Deployment Approach (Agile)',
    'Agile Release — release and deployment approach.',
    'Release', 'agile',
    '{"seed_key":"seed_pt_agile_release_approach","document_type":"project_closure_checklists","title":"Release / Deployment Approach (Agile)","description":"Agile Release — release and deployment approach.","status":"active","document_data":{"purpose":"Describe how increments are released, gated, and rolled back if needed.","owner_role":"Release Manager / Team","review_cadence":"Each major release; update after incidents","sample_notes":"Align gates with Definition of Done and ops checklists.","introduction":"Introduction — release philosophy (continuous vs scheduled).","environments":"Environments — promotion path from build to production.","quality_gates":"Quality gates — tests, security, and approvals required.","communications":"Communications — who is notified and when.","rollback_policy":"Rollback policy — triggers, owners, and verification.","hotfixes":"Hotfixes — accelerated path for production defects.","evidence":"Evidence — what is stored for audit and learning.","ownership":"Ownership — RACI for go/no-go and deployment steps."}}'::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000001'::uuid, 'process_template',
    'Daily Stand-up Notes (Agile)',
    'Master for capturing daily stand-up outcomes during sprint execution.',
    'Sprint Execution', 'agile',
    '{"seed_key":"seed_pt_agile_standup_notes","document_type":"team_performance_assessments","title":"Daily Stand-up Notes (Agile)","description":"Master for capturing daily stand-up outcomes during sprint execution.","status":"active","document_data":{"purpose":"Record yesterday / today / impediments for the sprint team.","owner_role":"Scrum Master","review_cadence":"Daily during sprint","sample_notes":"Keep entries short; escalate blockers same day.","introduction":"Daily sync notes supporting the sprint goal.","yesterday":"What was completed since the last sync.","today":"What will be worked on toward the sprint goal.","impediments":"Blockers raised and owners assigned.","board_health":"WIP, blocked cards, and forecast notes.","escalations":"Items needing help outside the team."}}'::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000003'::uuid, 'process_template',
    'Impediment Log (Agile)',
    'Master impediment register used during sprint execution.',
    'Sprint Execution', 'agile',
    '{"seed_key":"seed_pt_agile_impediment_log","document_type":"variance_analysis_reports","title":"Impediment Log (Agile)","description":"Master impediment register used during sprint execution.","status":"active","document_data":{"purpose":"Track impediments, owners, and resolution dates.","owner_role":"Scrum Master","review_cadence":"Daily stand-up","sample_notes":"Close impediments with evidence of removal.","introduction":"Living log of blockers affecting sprint delivery.","identification":"How impediments are raised and classified.","ownership":"Who owns removal and escalation paths.","tracking":"Status values and target dates.","resolution":"Evidence required before closing.","reporting":"How impediments are summarised to stakeholders."}}'::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000011'::uuid, 'process_template',
    'Product Backlog Refinement Notes (Agile)',
    'Master for backlog refinement sessions.',
    'Backlog', 'agile',
    '{"seed_key":"seed_pt_agile_backlog_refinement","document_type":"requirements_documentation","title":"Product Backlog Refinement Notes (Agile)","description":"Master for backlog refinement sessions.","status":"active","document_data":{"purpose":"Capture refined stories, estimates, and readiness decisions.","owner_role":"Product Owner / Team","review_cadence":"Each refinement session","sample_notes":"Exit with clear ready / not-ready decisions.","introduction":"Session notes for backlog refinement.","preparation":"What Product Owner prepares before the session.","activities":"Splitting, clarifying, and estimating activities.","readiness":"How Definition of Ready is applied.","outputs":"Updated items, estimates, and open questions.","follow_up":"Actions after the session."}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v191e_agile_process_docs_approaches.sql applied'; END $$;
