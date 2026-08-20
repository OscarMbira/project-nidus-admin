/**
 * Generates v191–v191e Agile methodology completeness seed SQL.
 * Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
 * Run: node scripts/generate-v191-agile-seeds.js
 *
 * Defaults (approved by implement-to-100%):
 * - Full catalog (~18 forms + 5 process approaches + a few v188 enrichments)
 * - DoD → Release, DoR → Backlog
 * - Review / Retro split
 * - Level (portfolio/programme/project) templates out of scope
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'SQL')

const f = (key, label, type, extra = {}) => {
  const o = { key, label, type, required: false }
  if (extra.options) o.options = extra.options
  if (extra.help) o.help = extra.help
  if (extra.sample) o.sample = extra.sample
  return o
}
const sel = (key, label, opts, extra = {}) =>
  f(key, label, 'select', { ...extra, options: opts.map(([v, l]) => ({ value: v, label: l })) })

function formPayload(code, name, title, fields) {
  return {
    template_code: code,
    name,
    process_group: 'agile',
    is_active: true,
    schema: { title, sections: [{ key: 'general', title: 'General', fields }] },
  }
}

const esc = (obj) => JSON.stringify(obj).replace(/'/g, "''")

function formRow(id, name, desc, category, payload) {
  return `(
    '${id}'::uuid, 'form_template',
    '${name.replace(/'/g, "''")}',
    '${desc.replace(/'/g, "''")}',
    '${category}', 'agile',
    '${esc(payload)}'::jsonb,
    'live', 1
)`
}

function processRow(id, name, desc, category, seedKey, docType, documentData) {
  const payload = {
    seed_key: seedKey,
    document_type: docType,
    title: name,
    description: desc,
    status: 'active',
    document_data: documentData,
  }
  return `(
    '${id}'::uuid, 'process_template',
    '${name.replace(/'/g, "''")}',
    '${desc.replace(/'/g, "''")}',
    '${category}', 'agile',
    '${esc(payload)}'::jsonb,
    'live', 1
)`
}

function header(ver, title, prereq) {
  return `-- =============================================================================
-- ${ver}: ${title}
-- Plan: projectplans/v191_agile_methodology_template_completeness_plan.md
-- Prerequisites: ${prereq}
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Agile methodology seed — generic ceremony fields (no vendor guide prose)
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
`
}

const footer = `
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain IN ('form_template', 'process_template');
`

// —— Forms: Backlog ——
const pbi = [
  f('item_id', 'Item ID', 'text', { help: 'Unique backlog identifier', sample: 'PBI-1042' }),
  f('title', 'Title', 'text', { help: 'Short outcome-oriented title', sample: 'As a user I can reset my password' }),
  sel('item_type', 'Item type', [['story', 'Story'], ['bug', 'Bug'], ['spike', 'Spike'], ['enabler', 'Enabler'], ['chore', 'Chore']]),
  f('description', 'Description', 'textarea', { help: 'Context and intent for the item' }),
  f('persona_or_value', 'Persona / business value', 'textarea'),
  f('acceptance_criteria', 'Acceptance criteria', 'textarea', { help: 'Testable conditions for done', sample: 'Given… When… Then…' }),
  sel('priority', 'Priority', [['must', 'Must'], ['should', 'Should'], ['could', 'Could'], ['wont', "Won't"]]),
  f('estimate_points', 'Estimate (points)', 'number'),
  sel('status', 'Status', [['new', 'New'], ['refined', 'Refined'], ['ready', 'Ready'], ['in_sprint', 'In sprint'], ['done', 'Done'], ['blocked', 'Blocked']]),
  f('sprint_assignment', 'Sprint assignment', 'text'),
  f('dependencies', 'Dependencies', 'textarea'),
  f('risks_or_notes', 'Risks / notes', 'textarea'),
  f('owner', 'Owner', 'text', { sample: 'Product Owner' }),
  f('definition_of_ready_met', 'Definition of Ready met', 'checkbox', { help: 'Tick when item meets team DoR' }),
  f('tags', 'Tags / themes', 'text'),
  f('created_date', 'Created date', 'date'),
]

const epic = [
  f('epic_id', 'Epic ID', 'text', { sample: 'EPIC-12' }),
  f('title', 'Title', 'text'),
  f('desired_outcome', 'Desired outcome', 'textarea'),
  f('success_metrics', 'Success metrics', 'textarea'),
  f('child_themes', 'Child themes / stories', 'textarea'),
  f('mvp_scope', 'MVP scope', 'textarea'),
  f('out_of_scope', 'Out of scope', 'textarea'),
  f('risks', 'Risks', 'textarea'),
  f('owner', 'Owner', 'text'),
  sel('status', 'Status', [['draft', 'Draft'], ['active', 'Active'], ['done', 'Done'], ['parked', 'Parked']]),
  f('target_release', 'Target release', 'text'),
]

const spike = [
  f('spike_id', 'Spike ID', 'text'),
  f('title', 'Title', 'text'),
  f('research_question', 'Research question', 'textarea', { help: 'What decision will this spike unlock?' }),
  f('time_box', 'Time-box', 'text', { sample: '2 days' }),
  f('findings', 'Findings', 'textarea'),
  f('recommendation', 'Recommendation', 'textarea'),
  f('follow_on_stories', 'Follow-on stories', 'textarea'),
  f('owner', 'Owner', 'text'),
  sel('status', 'Status', [['planned', 'Planned'], ['in_progress', 'In progress'], ['complete', 'Complete']]),
]

const refinement = [
  f('session_date', 'Session date', 'date'),
  f('facilitator', 'Facilitator', 'text'),
  f('attendees', 'Attendees', 'textarea'),
  f('items_refined', 'Items refined', 'textarea'),
  f('estimate_changes', 'Estimate changes', 'textarea'),
  f('readiness_decisions', 'Readiness decisions', 'textarea'),
  f('open_questions', 'Open questions', 'textarea'),
  f('next_actions', 'Next actions', 'textarea'),
  f('notes', 'Notes', 'textarea'),
]

// —— Forms: Sprint Planning ——
const planning = [
  f('sprint_id', 'Sprint ID', 'text', { sample: 'Sprint 24' }),
  f('sprint_start', 'Sprint start', 'date'),
  f('sprint_end', 'Sprint end', 'date'),
  f('sprint_goal', 'Sprint goal', 'textarea', { help: 'Single coherent outcome for the sprint' }),
  f('team_capacity', 'Team capacity', 'text', { sample: '42 points / 160 hours' }),
  f('committed_items', 'Committed items summary', 'textarea'),
  f('dependencies', 'Dependencies', 'textarea'),
  f('risks', 'Risks', 'textarea'),
  f('definition_of_done_reminder', 'Definition of Done reminder', 'textarea'),
  f('attendees', 'Attendees', 'textarea'),
  f('decisions', 'Decisions', 'textarea'),
  f('parking_lot', 'Parking lot', 'textarea'),
  f('facilitator', 'Facilitator', 'text'),
]

const sprintGoal = [
  f('sprint_id', 'Sprint ID', 'text'),
  f('goal_statement', 'Goal statement', 'textarea'),
  f('why_now', 'Why now', 'textarea'),
  f('success_measure', 'Success measure', 'textarea'),
  f('constraints', 'Constraints', 'textarea'),
  f('owner', 'Owner', 'text'),
  f('agreed_date', 'Agreed date', 'date'),
]

const capacity = [
  f('sprint_id', 'Sprint ID', 'text'),
  f('team_member', 'Team member', 'text'),
  f('availability_percent', 'Availability %', 'number'),
  f('pto_or_leave', 'PTO / leave', 'textarea'),
  f('focus_factor', 'Focus factor', 'text', { sample: '0.8' }),
  f('planned_hours', 'Planned hours', 'number'),
  f('notes', 'Notes', 'textarea'),
  f('updated_date', 'Updated date', 'date'),
]

// —— Forms: Sprint Execution ——
const standup = [
  f('standup_date', 'Stand-up date', 'date'),
  f('sprint_id', 'Sprint ID', 'text'),
  f('attendees', 'Attendees', 'textarea'),
  f('yesterday', 'Yesterday', 'textarea', { help: 'Completed since last stand-up' }),
  f('today', 'Today', 'textarea', { help: 'Plan for today toward sprint goal' }),
  f('impediments', 'Impediments', 'textarea'),
  f('help_needed', 'Help needed', 'textarea'),
  f('board_health_notes', 'Board health notes', 'textarea'),
  f('focus_today', 'Team focus today', 'textarea'),
  f('escalations', 'Escalations', 'textarea'),
  f('scribe', 'Scribe', 'text'),
]

const impediment = [
  f('impediment_id', 'Impediment ID', 'text', { sample: 'IMP-07' }),
  f('raised_date', 'Raised date', 'date'),
  f('description', 'Description', 'textarea'),
  f('impact', 'Impact', 'textarea'),
  f('owner', 'Owner', 'text'),
  sel('status', 'Status', [['open', 'Open'], ['in_progress', 'In progress'], ['escalated', 'Escalated'], ['resolved', 'Resolved']]),
  f('target_date', 'Target resolution date', 'date'),
  f('resolution', 'Resolution', 'textarea'),
  f('related_items', 'Related backlog items', 'textarea'),
  f('raised_by', 'Raised by', 'text'),
  f('notes', 'Notes', 'textarea'),
]

const taskCard = [
  f('parent_pbi_ref', 'Parent backlog item', 'text'),
  f('task_title', 'Task title', 'text'),
  f('owner', 'Owner', 'text'),
  f('estimate_hours', 'Estimate (hours)', 'number'),
  sel('status', 'Status', [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done'], ['blocked', 'Blocked']]),
  f('blockers', 'Blockers', 'textarea'),
  f('notes', 'Notes', 'textarea'),
  f('updated_date', 'Updated date', 'date'),
]

const forecast = [
  f('forecast_date', 'Forecast date', 'date'),
  f('sprint_id', 'Sprint ID', 'text'),
  f('forecast_to_goal', 'Forecast to sprint goal', 'textarea'),
  f('scope_change', 'Scope change', 'textarea'),
  f('escalation', 'Escalation', 'textarea'),
  sel('confidence', 'Confidence', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]),
  f('author', 'Author', 'text'),
]

// —— Forms: Review & Retro + Release ——
const review = [
  f('sprint_id', 'Sprint ID', 'text'),
  f('review_date', 'Review date', 'date'),
  f('demo_items', 'Demo items', 'textarea'),
  f('stakeholder_feedback', 'Stakeholder feedback', 'textarea'),
  f('acceptance_outcomes', 'Acceptance outcomes', 'textarea'),
  f('backlog_impact', 'Backlog impact', 'textarea'),
  f('attendees', 'Attendees', 'textarea'),
  f('decisions', 'Decisions', 'textarea'),
  f('follow_up_stories', 'Follow-up stories', 'textarea'),
  f('facilitator', 'Facilitator', 'text'),
  f('notes', 'Notes', 'textarea'),
]

const retro = [
  f('sprint_id', 'Sprint ID', 'text'),
  f('retro_date', 'Retrospective date', 'date'),
  f('went_well', 'What went well', 'textarea'),
  f('to_improve', 'What to improve', 'textarea'),
  f('experiments', 'Experiments to try', 'textarea'),
  f('action_owners', 'Action owners / dates', 'textarea'),
  f('follow_up', 'Follow-up from last retro', 'textarea'),
  f('attendees', 'Attendees', 'textarea'),
  f('facilitator', 'Facilitator', 'text'),
  f('parking_lot', 'Parking lot', 'textarea'),
  f('notes', 'Notes', 'textarea'),
]

const demoFeedback = [
  f('demo_date', 'Demo date', 'date'),
  f('item_reference', 'Item reference', 'text'),
  f('feedback', 'Feedback', 'textarea'),
  sel('priority', 'Priority', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]),
  f('follow_up_story', 'Follow-up story', 'textarea'),
  f('raised_by', 'Raised by', 'text'),
  f('notes', 'Notes', 'textarea'),
]

const releaseChecklist = [
  f('release_version', 'Release version', 'text', { sample: '2.4.0' }),
  f('release_date', 'Release date', 'date'),
  f('scope_summary', 'Scope summary', 'textarea'),
  f('environments', 'Environments', 'textarea', { help: 'e.g. staging → production' }),
  f('test_sign_off', 'Test sign-off', 'textarea'),
  f('security_ops_checks', 'Security / ops checks', 'textarea'),
  f('communications_plan', 'Communications', 'textarea'),
  sel('go_no_go', 'Go / No-go', [['go', 'Go'], ['no_go', 'No-go'], ['conditional', 'Conditional']]),
  f('rollback_owner', 'Rollback owner', 'text'),
  f('approvers', 'Approvers', 'textarea'),
  f('known_issues', 'Known issues', 'textarea'),
  f('post_release_verification', 'Post-release verification', 'textarea'),
  f('notes', 'Notes', 'textarea'),
]

const releaseNotes = [
  f('release_version', 'Release version', 'text'),
  f('release_date', 'Release date', 'date'),
  f('highlights', 'Highlights', 'textarea'),
  f('breaking_changes', 'Breaking changes', 'textarea'),
  f('known_issues', 'Known issues', 'textarea'),
  f('upgrade_steps', 'Upgrade steps', 'textarea'),
  f('contributors', 'Contributors', 'textarea'),
  f('links', 'Links / references', 'textarea'),
]

const goNoGo = [
  f('release_version', 'Release version', 'text'),
  f('decision_date', 'Decision date', 'date'),
  sel('decision', 'Decision', [['go', 'Go'], ['no_go', 'No-go'], ['defer', 'Defer']]),
  f('criteria_met', 'Criteria met', 'textarea'),
  f('risks_accepted', 'Risks accepted', 'textarea'),
  f('approvers', 'Approvers', 'textarea'),
  f('conditions', 'Conditions (if any)', 'textarea'),
  f('notes', 'Notes', 'textarea'),
]

const deployRollback = [
  f('release_version', 'Release version', 'text'),
  f('deployment_steps', 'Deployment steps', 'textarea'),
  f('step_owners', 'Step owners', 'textarea'),
  f('rollback_trigger', 'Rollback trigger', 'textarea'),
  f('rollback_steps', 'Rollback steps', 'textarea'),
  f('verification', 'Verification', 'textarea'),
  f('communication_points', 'Communication points', 'textarea'),
  f('notes', 'Notes', 'textarea'),
]

// —— Process approaches ——
const dod = {
  purpose: 'Define the shared quality bar for calling work done.',
  owner_role: 'Team / Quality Lead',
  review_cadence: 'Each retrospective; update when quality gaps appear',
  sample_notes: 'Keep DoD short enough to verify every item.',
  introduction: 'Introduction — why a shared Definition of Done exists for this team.',
  coding_standards: 'Coding standards — style, reviews, and static checks required.',
  testing: 'Testing — unit, integration, and exploratory expectations.',
  documentation: 'Documentation — release notes, help text, and runbooks when needed.',
  non_functional: 'Non-functional — performance, accessibility, and security checks.',
  peer_review: 'Peer review — who must approve and what evidence is required.',
  environment: 'Environment — which environments must pass before done.',
  acceptance: 'Acceptance — Product Owner or stakeholder confirmation rules.',
  exceptions: 'Exceptions — how temporary waivers are recorded and closed.',
}

const dor = {
  purpose: 'Define entry criteria so items are ready for sprint planning.',
  owner_role: 'Product Owner / Team',
  review_cadence: 'Each backlog refinement',
  sample_notes: 'Reject items that fail DoR rather than forcing them into a sprint.',
  introduction: 'Introduction — purpose of Definition of Ready for this backlog.',
  clarity: 'Clarity — title, description, and value are understood by the team.',
  acceptance_criteria: 'Acceptance criteria — testable conditions exist before planning.',
  dependencies: 'Dependencies — known dependencies identified or removed.',
  sizing: 'Sizing — item is estimated or time-boxed appropriately.',
  priority: 'Priority — relative priority is set by the Product Owner.',
  design_assets: 'Design / assets — required mockups or data are available.',
  risks: 'Risks — known risks noted with mitigation or spike if needed.',
  checklist: 'Checklist — team DoR checklist items are complete.',
}

const backlogApproach = {
  purpose: 'Describe how the product backlog is ordered, refined, and owned.',
  owner_role: 'Product Owner',
  review_cadence: 'Quarterly or when product strategy changes',
  sample_notes: 'Keep one ordered backlog; avoid shadow lists.',
  introduction: 'Introduction — scope of backlog management for this product.',
  ownership: 'Ownership — who prioritises and who may add items.',
  ordering: 'Ordering — factors used to sequence work (value, risk, cost of delay).',
  refinement_cadence: 'Refinement cadence — how often and how long sessions run.',
  item_types: 'Item types — stories, bugs, spikes, enablers and when to use each.',
  estimation: 'Estimation — relative sizing approach and who participates.',
  readiness: 'Readiness — how Definition of Ready is applied before planning.',
  transparency: 'Transparency — where the backlog lives and who can view it.',
  escalation: 'Escalation — how conflicting priorities are resolved.',
}

const cadence = {
  purpose: 'Describe the recurring sprint events, time-boxes, and roles.',
  owner_role: 'Scrum Master / Team',
  review_cadence: 'Each retrospective',
  sample_notes: 'Protect time-boxes; adjust length only by team agreement.',
  introduction: 'Introduction — sprint length and calendar for this team.',
  planning: 'Planning — purpose, time-box, and required attendees.',
  daily_sync: 'Daily sync — purpose, time-box, and focus on the sprint goal.',
  review: 'Review — demo expectations and stakeholder invitations.',
  retrospective: 'Retrospective — format options and action follow-up.',
  roles: 'Roles — Product Owner, Scrum Master, and team responsibilities at each event.',
  artefacts: 'Artefacts — which forms/logs are updated after each event.',
  interruptions: 'Interruptions — how mid-sprint requests are handled.',
}

const releaseApproach = {
  purpose: 'Describe how increments are released, gated, and rolled back if needed.',
  owner_role: 'Release Manager / Team',
  review_cadence: 'Each major release; update after incidents',
  sample_notes: 'Align gates with Definition of Done and ops checklists.',
  introduction: 'Introduction — release philosophy (continuous vs scheduled).',
  environments: 'Environments — promotion path from build to production.',
  quality_gates: 'Quality gates — tests, security, and approvals required.',
  communications: 'Communications — who is notified and when.',
  rollback_policy: 'Rollback policy — triggers, owners, and verification.',
  hotfixes: 'Hotfixes — accelerated path for production defects.',
  evidence: 'Evidence — what is stored for audit and learning.',
  ownership: 'Ownership — RACI for go/no-go and deployment steps.',
}

// Enrich existing v188 Agile process rows (richer document_data, same ids)
const standupProcess = {
  purpose: 'Record yesterday / today / impediments for the sprint team.',
  owner_role: 'Scrum Master',
  review_cadence: 'Daily during sprint',
  sample_notes: 'Keep entries short; escalate blockers same day.',
  introduction: 'Daily sync notes supporting the sprint goal.',
  yesterday: 'What was completed since the last sync.',
  today: 'What will be worked on toward the sprint goal.',
  impediments: 'Blockers raised and owners assigned.',
  board_health: 'WIP, blocked cards, and forecast notes.',
  escalations: 'Items needing help outside the team.',
}

const impedimentProcess = {
  purpose: 'Track impediments, owners, and resolution dates.',
  owner_role: 'Scrum Master',
  review_cadence: 'Daily stand-up',
  sample_notes: 'Close impediments with evidence of removal.',
  introduction: 'Living log of blockers affecting sprint delivery.',
  identification: 'How impediments are raised and classified.',
  ownership: 'Who owns removal and escalation paths.',
  tracking: 'Status values and target dates.',
  resolution: 'Evidence required before closing.',
  reporting: 'How impediments are summarised to stakeholders.',
}

const refinementProcess = {
  purpose: 'Capture refined stories, estimates, and readiness decisions.',
  owner_role: 'Product Owner / Team',
  review_cadence: 'Each refinement session',
  sample_notes: 'Exit with clear ready / not-ready decisions.',
  introduction: 'Session notes for backlog refinement.',
  preparation: 'What Product Owner prepares before the session.',
  activities: 'Splitting, clarifying, and estimating activities.',
  readiness: 'How Definition of Ready is applied.',
  outputs: 'Updated items, estimates, and open questions.',
  follow_up: 'Actions after the session.',
}

const files = {
  'v191_agile_forms_backlog.sql': header('v191', 'Agile forms — Backlog', 'v185 / v185b') + [
    formRow('a1850000-0000-4000-8000-000000000111', 'Product Backlog Item Card (Agile)', 'Agile Backlog — full product backlog item / user story card.', 'Backlog', formPayload('FA-BL-01', 'Product Backlog Item Card (Agile)', 'Backlog Item', pbi)),
    formRow('a1910000-0000-4000-8000-000000000011', 'Epic / Feature Brief (Agile)', 'Agile Backlog — epic or feature brief.', 'Backlog', formPayload('FA-BL-EPIC-01', 'Epic / Feature Brief (Agile)', 'Epic / Feature Brief', epic)),
    formRow('a1910000-0000-4000-8000-000000000012', 'Spike / Research Item (Agile)', 'Agile Backlog — time-boxed research spike.', 'Backlog', formPayload('FA-BL-SPIKE-01', 'Spike / Research Item (Agile)', 'Spike / Research Item', spike)),
    formRow('a1910000-0000-4000-8000-000000000013', 'Backlog Refinement Notes (Agile)', 'Agile Backlog — refinement session notes.', 'Backlog', formPayload('FA-BL-REF-01', 'Backlog Refinement Notes (Agile)', 'Backlog Refinement Notes', refinement)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v191_agile_forms_backlog.sql applied'; END $$;\n`,

  'v191b_agile_forms_sprint_planning.sql': header('v191b', 'Agile forms — Sprint Planning', 'v185 / v191') + [
    formRow('a1850000-0000-4000-8000-000000000112', 'Sprint Planning Agenda (Agile)', 'Agile Sprint Planning — full planning agenda / record.', 'Sprint Planning', formPayload('FA-SP-01', 'Sprint Planning Agenda (Agile)', 'Sprint Planning', planning)),
    formRow('a1910000-0000-4000-8000-000000000021', 'Sprint Goal Statement (Agile)', 'Agile Sprint Planning — sprint goal statement.', 'Sprint Planning', formPayload('FA-SP-GOAL-01', 'Sprint Goal Statement (Agile)', 'Sprint Goal Statement', sprintGoal)),
    formRow('a1910000-0000-4000-8000-000000000022', 'Capacity & Availability Plan (Agile)', 'Agile Sprint Planning — team capacity and availability.', 'Sprint Planning', formPayload('FA-SP-CAP-01', 'Capacity & Availability Plan (Agile)', 'Capacity & Availability Plan', capacity)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v191b_agile_forms_sprint_planning.sql applied'; END $$;\n`,

  'v191c_agile_forms_sprint_execution.sql': header('v191c', 'Agile forms — Sprint Execution', 'v185 / v191') + [
    formRow('a1850000-0000-4000-8000-000000000113', 'Daily Stand-up Notes (Agile)', 'Agile Sprint Execution — daily stand-up notes.', 'Sprint Execution', formPayload('FA-SE-01', 'Daily Stand-up Notes (Agile)', 'Stand-up Notes', standup)),
    formRow('a1910000-0000-4000-8000-000000000031', 'Impediment Record (Agile)', 'Agile Sprint Execution — impediment record.', 'Sprint Execution', formPayload('FA-SE-IMP-01', 'Impediment Record (Agile)', 'Impediment Record', impediment)),
    formRow('a1910000-0000-4000-8000-000000000032', 'Task / Sub-task Card (Agile)', 'Agile Sprint Execution — task or sub-task card.', 'Sprint Execution', formPayload('FA-SE-TASK-01', 'Task / Sub-task Card (Agile)', 'Task / Sub-task Card', taskCard)),
    formRow('a1910000-0000-4000-8000-000000000033', 'Mid-sprint Forecast Notes (Agile)', 'Agile Sprint Execution — mid-sprint forecast notes.', 'Sprint Execution', formPayload('FA-SE-FCST-01', 'Mid-sprint Forecast Notes (Agile)', 'Mid-sprint Forecast Notes', forecast)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v191c_agile_forms_sprint_execution.sql applied'; END $$;\n`,

  'v191d_agile_forms_review_retro_release.sql': header('v191d', 'Agile forms — Review, Retro & Release', 'v185 / v191') + [
    formRow('a1850000-0000-4000-8000-000000000114', 'Sprint Review Notes (Agile)', 'Agile Review — sprint review / demo notes (split from combined review+retro stub).', 'Review & Retrospective', formPayload('FA-RR-01', 'Sprint Review Notes (Agile)', 'Sprint Review Notes', review)),
    formRow('a1910000-0000-4000-8000-000000000041', 'Sprint Retrospective Notes (Agile)', 'Agile Retrospective — improvement actions and experiments.', 'Review & Retrospective', formPayload('FA-RR-RETRO-01', 'Sprint Retrospective Notes (Agile)', 'Sprint Retrospective Notes', retro)),
    formRow('a1910000-0000-4000-8000-000000000042', 'Demo Feedback Log (Agile)', 'Agile Review — stakeholder demo feedback log.', 'Review & Retrospective', formPayload('FA-RR-DEMO-01', 'Demo Feedback Log (Agile)', 'Demo Feedback Log', demoFeedback)),
    formRow('a1850000-0000-4000-8000-000000000115', 'Release Checklist (Agile)', 'Agile Release — full release checklist.', 'Release', formPayload('FA-REL-01', 'Release Checklist (Agile)', 'Release Checklist', releaseChecklist)),
    formRow('a1910000-0000-4000-8000-000000000051', 'Release Notes (Agile)', 'Agile Release — release notes.', 'Release', formPayload('FA-REL-NOTES-01', 'Release Notes (Agile)', 'Release Notes', releaseNotes)),
    formRow('a1910000-0000-4000-8000-000000000052', 'Go / No-Go Decision Record (Agile)', 'Agile Release — go / no-go decision record.', 'Release', formPayload('FA-REL-GNG-01', 'Go / No-Go Decision Record (Agile)', 'Go / No-Go Decision Record', goNoGo)),
    formRow('a1910000-0000-4000-8000-000000000053', 'Deployment / Rollback Plan (Agile)', 'Agile Release — deployment and rollback plan.', 'Release', formPayload('FA-REL-DEP-01', 'Deployment / Rollback Plan (Agile)', 'Deployment / Rollback Plan', deployRollback)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v191d_agile_forms_review_retro_release.sql applied'; END $$;\n`,

  'v191e_agile_process_docs_approaches.sql': header('v191e', 'Agile process docs — approaches + v188 enrichments', 'v185 / v188 / v191') + [
    processRow('a1910000-0000-4000-8000-000000000061', 'Definition of Done (Agile)', 'Agile Release — definition of done (process guidance).', 'Release', 'seed_pt_agile_dod', 'scope_acceptance_forms', dod),
    processRow('a1910000-0000-4000-8000-000000000062', 'Definition of Ready (Agile)', 'Agile Backlog — definition of ready (process guidance).', 'Backlog', 'seed_pt_agile_dor', 'requirements_management_plans', dor),
    processRow('a1910000-0000-4000-8000-000000000063', 'Backlog Management Approach (Agile)', 'Agile Backlog — backlog management approach.', 'Backlog', 'seed_pt_agile_backlog_approach', 'requirements_documentation', backlogApproach),
    processRow('a1910000-0000-4000-8000-000000000064', 'Sprint Cadence Guide (Agile)', 'Agile Sprint Planning — sprint cadence guide.', 'Sprint Planning', 'seed_pt_agile_cadence', 'project_management_plans', cadence),
    processRow('a1910000-0000-4000-8000-000000000065', 'Release / Deployment Approach (Agile)', 'Agile Release — release and deployment approach.', 'Release', 'seed_pt_agile_release_approach', 'project_closure_checklists', releaseApproach),
    // Enrich matching v188 thin process masters
    processRow('a1880000-0000-4000-8000-000000000001', 'Daily Stand-up Notes (Agile)', 'Master for capturing daily stand-up outcomes during sprint execution.', 'Sprint Execution', 'seed_pt_agile_standup_notes', 'team_performance_assessments', standupProcess),
    processRow('a1880000-0000-4000-8000-000000000003', 'Impediment Log (Agile)', 'Master impediment register used during sprint execution.', 'Sprint Execution', 'seed_pt_agile_impediment_log', 'variance_analysis_reports', impedimentProcess),
    processRow('a1880000-0000-4000-8000-000000000011', 'Product Backlog Refinement Notes (Agile)', 'Master for backlog refinement sessions.', 'Backlog', 'seed_pt_agile_backlog_refinement', 'requirements_documentation', refinementProcess),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v191e_agile_process_docs_approaches.sql applied'; END $$;\n`,
}

for (const [name, body] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), body)
  console.log('Wrote', name, `(${body.length} bytes)`)
}
console.log('Done — 5 SQL seed files')
