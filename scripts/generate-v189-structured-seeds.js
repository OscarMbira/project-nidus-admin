/**
 * Generates v189–v189e Structured methodology completeness seed SQL.
 * Run: node scripts/generate-v189-structured-seeds.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'SQL')

const f = (key, label, type, options) => {
  const o = { key, label, type, required: false }
  if (options) o.options = options
  return o
}
const sel = (key, label, opts) => f(key, label, 'select', opts.map(([v, l]) => ({ value: v, label: l })))

function formPayload(code, name, processGroup, title, fields) {
  return {
    template_code: code,
    name,
    process_group: processGroup,
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
    '${category}', 'structured',
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
    '${category}', 'structured',
    '${esc(payload)}'::jsonb,
    'live', 1
)`
}

function header(ver, title, prereq) {
  return `-- =============================================================================
-- ${ver}: ${title}
-- Plan: projectplans/v189_structured_methodology_template_completeness_plan.md
-- Prerequisites: ${prereq}
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Rule 27: "Structured" only — never PRINCE2
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

// —— Field catalogs ——
const mandate = [
  f('project_title', 'Project title', 'text'), f('document_date', 'Document date', 'date'),
  f('author', 'Author', 'text'), f('client_or_customer', 'Client / customer', 'text'),
  f('purpose', 'Purpose', 'textarea'), f('background', 'Background', 'textarea'),
  f('project_objectives', 'Project objectives', 'textarea'), f('project_scope', 'Project scope', 'textarea'),
  f('constraints', 'Constraints', 'textarea'), f('assumptions', 'Assumptions', 'textarea'),
  f('outline_business_case', 'Outline business case', 'textarea'),
  f('customer_quality_expectations', 'Customer quality expectations', 'textarea'),
]
const brief = [
  f('project_definition', 'Project definition', 'textarea'), f('project_approach', 'Project approach', 'textarea'),
  f('business_case', 'Business case', 'textarea'), f('project_product_description', 'Project product description', 'textarea'),
  f('project_plan', 'Project plan', 'textarea'), f('project_management_team_structure', 'Project management team structure', 'textarea'),
  f('references', 'References to other information', 'textarea'),
]
const dlog = [
  f('log_date', 'Log date', 'date'),
  sel('entry_type', 'Entry type', [['event', 'Event'], ['decision', 'Decision'], ['issue', 'Issue'], ['risk', 'Risk'], ['note', 'Note']]),
  f('description', 'Description', 'textarea'), f('raised_by', 'Raised by', 'text'), f('follow_up_action', 'Follow-up action', 'textarea'),
]
const llog = [
  f('lesson_date', 'Lesson date', 'date'),
  sel('category', 'Category', [['process', 'Process'], ['product', 'Product'], ['resource', 'Resource'], ['stakeholder', 'Stakeholder'], ['other', 'Other']]),
  f('description', 'Description of lesson', 'textarea'), f('effect_on_project', 'Effect on project', 'textarea'), f('recommendations', 'Recommendations', 'textarea'),
]
const agenda = [
  f('meeting_date', 'Meeting date', 'date'), f('attendees', 'Attendees', 'textarea'), f('previous_minutes', 'Previous minutes', 'textarea'),
  f('decisions_required', 'Decisions required', 'textarea'), f('progress_report', 'Progress report', 'textarea'),
  f('issues', 'Issues', 'textarea'), f('risks', 'Risks', 'textarea'), f('any_other_business', 'Any other business', 'textarea'),
]
const highlight = [
  f('report_date', 'Report date', 'date'), f('period_covered', 'Period covered', 'text'),
  sel('summary_status', 'Summary status', [['green', 'Green — on track'], ['amber', 'Amber — at risk'], ['red', 'Red — off track']]),
  f('achievements_this_period', 'Achievements this period', 'textarea'), f('work_planned_next_period', 'Work planned next period', 'textarea'),
  f('products_status', 'Products status', 'textarea'), f('issues_summary', 'Issues summary', 'textarea'),
  f('risks_summary', 'Risks summary', 'textarea'), f('forecast_completion', 'Forecast completion', 'textarea'),
]

const pid = [
  f('project_definition', 'Project definition', 'textarea'), f('business_case_summary', 'Business case summary', 'textarea'),
  f('project_organisation', 'Project organisation', 'textarea'), f('quality_management_approach_ref', 'Quality management approach (reference)', 'textarea'),
  f('risk_management_approach_ref', 'Risk management approach (reference)', 'textarea'), f('configuration_management_approach_ref', 'Configuration management approach (reference)', 'textarea'),
  f('communication_management_approach_ref', 'Communication management approach (reference)', 'textarea'), f('project_plan_summary', 'Project plan summary', 'textarea'),
  f('project_controls', 'Project controls', 'textarea'), f('tolerances', 'Tolerances', 'textarea'),
  f('constraints', 'Constraints', 'textarea'), f('assumptions', 'Assumptions', 'textarea'),
]
const bc = [
  f('reasons', 'Reasons', 'textarea'), f('business_options', 'Business options', 'textarea'), f('expected_benefits', 'Expected benefits', 'textarea'),
  f('expected_disbenefits', 'Expected dis-benefits', 'textarea'), f('timescale', 'Timescale', 'textarea'), f('costs', 'Costs', 'money'),
  f('investment_appraisal', 'Investment appraisal', 'textarea'), f('major_risks', 'Major risks', 'textarea'), f('recommendation', 'Recommendation', 'textarea'),
]
const brp = [
  f('scope_of_review', 'Scope of review', 'textarea'), f('benefits_to_be_measured', 'Benefits to be measured', 'textarea'),
  f('measurement_approach', 'Measurement approach', 'textarea'), f('resources_required', 'Resources required', 'textarea'),
  f('review_schedule', 'Review schedule', 'textarea'), f('roles_and_responsibilities', 'Roles and responsibilities', 'textarea'),
]
const ppd = [
  f('purpose', 'Purpose', 'textarea'), f('composition', 'Composition', 'textarea'), f('derivation', 'Derivation', 'textarea'),
  f('format_and_presentation', 'Format and presentation', 'textarea'), f('quality_criteria', 'Quality criteria', 'textarea'),
  f('quality_tolerance', 'Quality tolerance', 'textarea'), f('quality_method', 'Quality method', 'textarea'),
  f('quality_responsibility', 'Quality responsibility', 'text'), f('product_quality_review', 'Product quality review', 'textarea'),
  f('acceptance_criteria', 'Acceptance criteria', 'textarea'),
]
const plan = [
  sel('plan_type', 'Plan type', [['project', 'Project plan'], ['stage', 'Stage plan'], ['team', 'Team plan']]),
  f('plan_description', 'Plan description', 'textarea'), f('product_breakdown_structure', 'Product breakdown structure', 'textarea'),
  f('product_descriptions', 'Product descriptions', 'textarea'), f('product_flow_diagram', 'Product flow diagram', 'textarea'),
  f('schedule', 'Schedule', 'textarea'), f('milestones', 'Milestones', 'textarea'), f('resources', 'Resources', 'textarea'),
  f('dependencies', 'Dependencies', 'textarea'), f('monitoring_and_control', 'Monitoring and control', 'textarea'),
]

const scale5 = [['1', '1 — Very low'], ['2', '2 — Low'], ['3', '3 — Medium'], ['4', '4 — High'], ['5', '5 — Very high']]
const cir = [
  f('item_identifier', 'Item identifier', 'text'), f('item_title', 'Item title', 'text'),
  sel('item_type', 'Item type', [['product', 'Product'], ['document', 'Document'], ['baseline', 'Baseline'], ['component', 'Component'], ['other', 'Other']]),
  f('version', 'Version', 'text'),
  sel('status', 'Status', [['draft', 'Draft'], ['under_review', 'Under review'], ['approved', 'Approved'], ['superseded', 'Superseded'], ['archived', 'Archived']]),
  f('location', 'Location', 'text'), f('owner', 'Owner', 'text'), f('date_created', 'Date created', 'date'), f('date_modified', 'Date modified', 'date'),
  f('source', 'Source', 'text'), f('related_products', 'Related products', 'textarea'), f('related_issues', 'Related issues', 'textarea'),
  f('related_change_requests', 'Related change requests', 'textarea'), f('description', 'Description', 'textarea'),
  f('specification_reference', 'Specification reference', 'text'), f('quality_records', 'Quality records', 'textarea'),
  sel('verification_status', 'Verification status', [['not_started', 'Not started'], ['in_progress', 'In progress'], ['verified', 'Verified'], ['failed', 'Failed']]),
  sel('release_status', 'Release status', [['not_released', 'Not released'], ['released', 'Released'], ['withdrawn', 'Withdrawn']]),
  f('notes', 'Notes', 'textarea'),
]
const issueReg = [
  f('issue_identifier', 'Issue identifier', 'text'), f('issue_date', 'Issue date', 'date'), f('raised_by', 'Raised by', 'text'),
  sel('issue_type', 'Issue type', [['request_for_change', 'Request for change'], ['off_specification', 'Off-specification'], ['problem_concern', 'Problem / concern'], ['external_event', 'External event']]),
  sel('priority', 'Priority', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]),
  sel('status', 'Status', [['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed']]),
  f('description', 'Description', 'textarea'), f('impact', 'Impact', 'textarea'), f('action_owner', 'Action owner', 'text'), f('date_resolved', 'Date resolved', 'date'),
]
const issueRep = [
  f('issue_identifier', 'Issue identifier', 'text'), f('issue_date', 'Issue date', 'date'), f('raised_by', 'Raised by', 'text'),
  sel('issue_type', 'Issue type', [['request_for_change', 'Request for change'], ['off_specification', 'Off-specification'], ['problem_concern', 'Problem / concern'], ['external_event', 'External event']]),
  sel('priority', 'Priority', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]),
  sel('status', 'Status', [['open', 'Open'], ['under_review', 'Under review'], ['decision_pending', 'Decision pending'], ['closed', 'Closed']]),
  f('description', 'Description', 'textarea'), f('impact_assessment', 'Impact assessment', 'textarea'), f('recommendation', 'Recommendation', 'textarea'),
  f('decision_required', 'Decision required', 'textarea'), f('options_considered', 'Options considered', 'textarea'), f('decision', 'Decision', 'textarea'),
  f('action_owner', 'Action owner', 'text'), f('follow_up_date', 'Follow-up date', 'date'),
]
const psa = [
  f('product_name', 'Product name', 'text'),
  sel('product_status', 'Product status', [['not_started', 'Not started'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['approved', 'Approved'], ['handed_over', 'Handed over']]),
  f('status_commentary', 'Status commentary', 'textarea'),
]
const qreg = [
  f('quality_identifier', 'Quality identifier', 'text'), f('product_name', 'Product name', 'text'), f('quality_method', 'Quality method', 'text'),
  f('planned_date', 'Planned date', 'date'), f('actual_date', 'Actual date', 'date'), f('quality_responsible', 'Quality responsible', 'text'),
  sel('quality_result', 'Quality result', [['pass', 'Pass'], ['pass_with_concessions', 'Pass with concessions'], ['fail', 'Fail'], ['not_applicable', 'Not applicable']]),
  f('quality_records_location', 'Quality records location', 'text'), f('follow_up_required', 'Follow-up required', 'checkbox'),
  f('follow_up_action', 'Follow-up action', 'textarea'), f('notes', 'Notes', 'textarea'),
]
const rreg = [
  f('risk_identifier', 'Risk identifier', 'text'), f('date_identified', 'Date identified', 'date'),
  sel('risk_category', 'Risk category', [['business', 'Business'], ['technical', 'Technical'], ['resource', 'Resource'], ['schedule', 'Schedule'], ['cost', 'Cost'], ['external', 'External']]),
  f('risk_description', 'Risk description', 'textarea'),
  sel('risk_status', 'Risk status', [['open', 'Open'], ['mitigating', 'Mitigating'], ['closed', 'Closed']]),
  f('risk_owner', 'Risk owner', 'text'), f('risk_response', 'Risk response', 'textarea'),
  sel('probability_pre', 'Probability (pre-response)', scale5), sel('impact_pre', 'Impact (pre-response)', scale5),
  f('expected_value_pre', 'Expected value (pre-response)', 'number'),
  sel('probability_post', 'Probability (post-response)', scale5), sel('impact_post', 'Impact (post-response)', scale5),
  f('expected_value_post', 'Expected value (post-response)', 'number'),
]
const exc = [
  f('exception_date', 'Exception date', 'date'), f('stage_or_project', 'Stage / project', 'text'),
  f('description_of_exception', 'Description of exception', 'textarea'), f('cause', 'Cause', 'textarea'),
  f('impact', 'Impact', 'textarea'), f('recommended_options', 'Recommended options', 'textarea'),
]

const chk = [
  f('checkpoint_date', 'Checkpoint date', 'date'), f('work_package_reference', 'Work package reference', 'text'),
  f('products_completed', 'Products completed', 'textarea'), f('products_planned', 'Products planned', 'textarea'),
  f('quality_activities', 'Quality activities', 'textarea'), f('follow_on_actions', 'Follow-on actions', 'textarea'),
  sel('checkpoint_status', 'Checkpoint status', [['on_track', 'On track'], ['at_risk', 'At risk'], ['blocked', 'Blocked']]),
]
const pd = [
  f('product_identifier', 'Product identifier', 'text'), f('product_title', 'Product title', 'text'),
  f('purpose', 'Purpose', 'textarea'), f('composition', 'Composition', 'textarea'), f('derivation', 'Derivation', 'textarea'),
  f('format_and_presentation', 'Format and presentation', 'textarea'), f('quality_criteria', 'Quality criteria', 'textarea'),
  f('quality_tolerance', 'Quality tolerance', 'textarea'), f('quality_method', 'Quality method', 'textarea'),
  f('quality_responsibility', 'Quality responsibility', 'text'), f('product_quality_review', 'Product quality review', 'textarea'),
  f('acceptance_criteria', 'Acceptance criteria', 'textarea'),
]
const wp = [
  f('work_package_identifier', 'Work package identifier', 'text'), f('work_package_title', 'Work package title', 'text'),
  f('work_package_description', 'Work package description', 'textarea'), f('products_to_be_delivered', 'Products to be delivered', 'textarea'),
  f('product_descriptions_reference', 'Product descriptions (reference)', 'textarea'), f('techniques_and_procedures', 'Techniques and procedures', 'textarea'),
  f('required_approach', 'Required approach', 'textarea'), f('change_authority', 'Change authority', 'text'),
  f('constraints', 'Constraints', 'textarea'), f('agreement_date', 'Agreement date', 'date'),
  f('start_date', 'Start date', 'date'), f('end_date', 'End date', 'date'),
  f('acceptance_criteria', 'Acceptance criteria', 'textarea'), f('quality_requirements', 'Quality requirements', 'textarea'),
]
const esr = [
  f('stage_name', 'Stage name', 'text'), f('period_covered', 'Period covered', 'text'), f('achievements', 'Achievements', 'textarea'),
  f('products_completed', 'Products completed', 'textarea'), f('products_not_completed', 'Products not completed', 'textarea'),
  f('quality_activities_summary', 'Quality activities summary', 'textarea'), f('follow_on_actions', 'Follow-on actions', 'textarea'),
  f('lessons_identified', 'Lessons identified', 'textarea'), f('next_stage_overview', 'Next stage overview', 'textarea'),
]
const lr = [
  f('report_date', 'Report date', 'date'), f('stage_or_project', 'Stage / project', 'text'),
  f('lessons_summary', 'Lessons summary', 'textarea'), f('recommendations', 'Recommendations', 'textarea'),
  f('follow_up_actions', 'Follow-up actions', 'textarea'),
]
const epr = [
  f('project_overview', 'Project overview', 'textarea'), f('performance_against_business_case', 'Performance against business case', 'textarea'),
  f('performance_against_objectives', 'Performance against objectives', 'textarea'), f('review_of_products', 'Review of products', 'textarea'),
  f('lessons_summary', 'Lessons summary', 'textarea'), f('follow_on_recommendations', 'Follow-on recommendations', 'textarea'),
]

const qualityStrategy = {
  purpose: 'Define how quality will be managed on the project.',
  owner_role: 'Project Manager / Quality Assurance',
  review_cadence: 'Each stage boundary',
  sample_notes: 'Keep aligned with corporate quality standards.',
  introduction: 'Introduction — scope and objectives of quality management for the project.',
  quality_management_system: 'Quality management system — standards, methods, and tools to be applied.',
  quality_planning: 'Quality planning — how quality requirements are identified and planned.',
  quality_control: 'Quality control — inspection, testing, and review activities.',
  quality_assurance: 'Quality assurance — independent checks and audit approach.',
  project_quality_records: 'Project quality records — what records are kept and where.',
  reporting: 'Reporting — how quality performance is reported and escalated.',
}
const riskStrategy = {
  purpose: 'Define how risk will be identified, assessed, and controlled.',
  owner_role: 'Project Manager / Risk Owner',
  review_cadence: 'Fortnightly risk review',
  sample_notes: 'Escalate risks that threaten stage or project tolerances.',
  introduction: 'Introduction — purpose and scope of risk management.',
  risk_management_procedure: 'Risk management procedure — overall approach and workflow.',
  risk_identification: 'Risk identification — techniques and triggers.',
  risk_assessment: 'Risk assessment — evaluation criteria and scoring method.',
  risk_response_planning: 'Risk response planning — response types and selection criteria.',
  risk_monitoring_and_control: 'Risk monitoring and control — review frequency and ownership.',
  tools_and_techniques: 'Tools and techniques — registers, workshops, checklists used.',
  risk_categories: 'Risk categories — taxonomy used on this project.',
  probability_impact_scales: 'Probability and impact scales — definitions for each level.',
  proximity: 'Proximity — how timing / nearness of risk is assessed.',
  risk_budget: 'Risk budget — contingency and risk allowance approach.',
  roles_and_responsibilities: 'Roles and responsibilities — who identifies, owns, and escalates risks.',
  risk_register_approach: 'Risk register — format, maintenance, and version control.',
  reporting: 'Reporting — risk reporting cadence and escalation thresholds.',
}
const configStrategy = {
  purpose: 'Define how configuration items are identified, controlled, and audited.',
  owner_role: 'Configuration Librarian / Project Manager',
  review_cadence: 'Each stage boundary / release',
  sample_notes: 'Baselines require formal approval before change.',
  introduction: 'Introduction — purpose and scope of configuration management.',
  configuration_management_procedure: 'Configuration management procedure — overall workflow.',
  configuration_identification: 'Configuration identification — naming, baselines, and versioning.',
  configuration_change_control: 'Configuration change control — authorisation and approval levels.',
  configuration_status_accounting: 'Configuration status accounting — status tracking approach.',
  configuration_audits: 'Configuration audits — verification and compliance checks.',
  tools_and_techniques: 'Tools and techniques — CM tools, repositories, and libraries.',
  issue_and_change_control: 'Issue and change control — linkage to issue register and change requests.',
  roles_and_responsibilities: 'Roles and responsibilities — CM roles and accountabilities.',
}
const commsStrategy = {
  purpose: 'Define how project information is planned, distributed, and reported.',
  owner_role: 'Project Manager / Communications Lead',
  review_cadence: 'Monthly / each stage boundary',
  sample_notes: 'Align channels with stakeholder information needs.',
  introduction: 'Introduction — purpose and scope of communication management.',
  communication_procedure: 'Communication procedure — overall approach to project communications.',
  communication_planning: 'Communication planning — analysis of information needs.',
  information_distribution: 'Information distribution — channels, formats, and timing.',
  performance_reporting: 'Performance reporting — status, highlight, and exception reporting.',
  stakeholder_engagement: 'Stakeholder engagement — engagement approach and responsibilities.',
  communication_channels: 'Communication channels — meetings, portals, email, reports.',
  roles_and_responsibilities: 'Roles and responsibilities — who communicates what to whom.',
}

// Write files
const files = {
  'v189_structured_forms_starting_up_directing.sql': header('v189', 'Structured forms — Starting Up + Directing', 'v185') + [
    formRow('a1850000-0000-4000-8000-000000000101', 'Project Mandate (Structured)', 'Structured Starting Up — project mandate with full section fields.', 'Starting Up', formPayload('FS-SU-MANDATE-01', 'Project Mandate (Structured)', 'starting_up', 'Project Mandate', mandate)),
    formRow('a1890000-0000-4000-8000-000000000011', 'Project Brief (Structured)', 'Structured Starting Up — project brief.', 'Starting Up', formPayload('FS-SU-BRIEF-01', 'Project Brief (Structured)', 'starting_up', 'Project Brief', brief)),
    formRow('a1890000-0000-4000-8000-000000000012', 'Daily Log (Structured)', 'Structured Starting Up — daily log.', 'Starting Up', formPayload('FS-SU-DLOG-01', 'Daily Log (Structured)', 'starting_up', 'Daily Log', dlog)),
    formRow('a1890000-0000-4000-8000-000000000013', 'Lessons Log (Structured)', 'Structured Starting Up — lessons log.', 'Starting Up', formPayload('FS-SU-LLOG-01', 'Lessons Log (Structured)', 'starting_up', 'Lessons Log', llog)),
    formRow('a1850000-0000-4000-8000-000000000102', 'Project Board Agenda (Structured)', 'Structured Directing — project board agenda.', 'Directing', formPayload('FS-DIR-01', 'Project Board Agenda (Structured)', 'directing', 'Project Board Agenda', agenda)),
    formRow('a1890000-0000-4000-8000-000000000021', 'Highlight Report (Structured)', 'Structured Directing — highlight report.', 'Directing', formPayload('FS-DIR-HL-01', 'Highlight Report (Structured)', 'directing', 'Highlight Report', highlight)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v189_structured_forms_starting_up_directing.sql applied'; END $$;\n`,

  'v189b_structured_forms_initiating.sql': header('v189b', 'Structured forms — Initiating (PID + related)', 'v185 / v189') + [
    formRow('a1850000-0000-4000-8000-000000000103', 'Project Initiation Document (Structured)', 'Structured Initiating — full project initiation document.', 'Initiating', formPayload('FS-IP-PID-01', 'Project Initiation Document (Structured)', 'initiating', 'Project Initiation Document', pid)),
    formRow('a1890000-0000-4000-8000-000000000031', 'Business Case (Structured)', 'Structured Initiating — business case.', 'Initiating', formPayload('FS-IP-BC-01', 'Business Case (Structured)', 'initiating', 'Business Case', bc)),
    formRow('a1890000-0000-4000-8000-000000000032', 'Benefits Review Plan (Structured)', 'Structured Initiating — benefits review plan.', 'Initiating', formPayload('FS-IP-BRP-01', 'Benefits Review Plan (Structured)', 'initiating', 'Benefits Review Plan', brp)),
    formRow('a1890000-0000-4000-8000-000000000033', 'Project Product Description (Structured)', 'Structured Initiating — project product description.', 'Initiating', formPayload('FS-IP-PPD-01', 'Project Product Description (Structured)', 'initiating', 'Project Product Description', ppd)),
    formRow('a1890000-0000-4000-8000-000000000034', 'Plan — Project / Stage / Team (Structured)', 'Structured Initiating — project, stage, or team plan.', 'Initiating', formPayload('FS-IP-PLAN-01', 'Plan — Project / Stage / Team (Structured)', 'initiating', 'Plan', plan)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v189b_structured_forms_initiating.sql applied'; END $$;\n`,

  'v189c_structured_process_docs_strategies.sql': header('v189c', 'Structured process docs — Management Strategies', 'v185 / v188') + [
    processRow('a1890000-0000-4000-8000-000000000041', 'Quality Management Strategy (Structured)', 'Structured Initiating — quality management strategy (process guidance).', 'Initiating', 'seed_pt_str_quality_strategy', 'project_management_plans', qualityStrategy),
    processRow('a1890000-0000-4000-8000-000000000042', 'Risk Management Strategy (Structured)', 'Structured Initiating — risk management strategy (process guidance).', 'Initiating', 'seed_pt_str_risk_strategy', 'project_management_plans', riskStrategy),
    processRow('a1890000-0000-4000-8000-000000000043', 'Configuration Management Strategy (Structured)', 'Structured Initiating — configuration management strategy (process guidance).', 'Initiating', 'seed_pt_str_config_strategy', 'project_management_plans', configStrategy),
    processRow('a1890000-0000-4000-8000-000000000044', 'Communication Management Strategy (Structured)', 'Structured Initiating — communication management strategy (process guidance).', 'Initiating', 'seed_pt_str_comms_strategy', 'project_management_plans', commsStrategy),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v189c_structured_process_docs_strategies.sql applied'; END $$;\n`,

  'v189d_structured_forms_controlling_stage.sql': header('v189d', 'Structured forms — Controlling a Stage', 'v185 / v189') + [
    formRow('a1850000-0000-4000-8000-000000000104', 'Configuration Item Record (Structured)', 'Structured Controlling a Stage — configuration item record.', 'Controlling a Stage', formPayload('FS-CS-CIR-01', 'Configuration Item Record (Structured)', 'controlling_a_stage', 'Configuration Item Record', cir)),
    formRow('a1890000-0000-4000-8000-000000000051', 'Issue Register (Structured)', 'Structured Controlling a Stage — issue register.', 'Controlling a Stage', formPayload('FS-CS-ISSREG-01', 'Issue Register (Structured)', 'controlling_a_stage', 'Issue Register', issueReg)),
    formRow('a1890000-0000-4000-8000-000000000052', 'Issue Report (Structured)', 'Structured Controlling a Stage — issue report.', 'Controlling a Stage', formPayload('FS-CS-ISSREP-01', 'Issue Report (Structured)', 'controlling_a_stage', 'Issue Report', issueRep)),
    formRow('a1890000-0000-4000-8000-000000000053', 'Product Status Account (Structured)', 'Structured Controlling a Stage — product status account.', 'Controlling a Stage', formPayload('FS-CS-PSA-01', 'Product Status Account (Structured)', 'controlling_a_stage', 'Product Status Account', psa)),
    formRow('a1890000-0000-4000-8000-000000000054', 'Quality Register (Structured)', 'Structured Controlling a Stage — quality register.', 'Controlling a Stage', formPayload('FS-CS-QREG-01', 'Quality Register (Structured)', 'controlling_a_stage', 'Quality Register', qreg)),
    formRow('a1890000-0000-4000-8000-000000000055', 'Risk Register (Structured)', 'Structured Controlling a Stage — risk register.', 'Controlling a Stage', formPayload('FS-CS-RREG-01', 'Risk Register (Structured)', 'controlling_a_stage', 'Risk Register', rreg)),
    formRow('a1890000-0000-4000-8000-000000000056', 'Exception Report (Structured)', 'Structured Controlling a Stage — exception report.', 'Controlling a Stage', formPayload('FS-CS-EXC-01', 'Exception Report (Structured)', 'controlling_a_stage', 'Exception Report', exc)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v189d_structured_forms_controlling_stage.sql applied'; END $$;\n`,

  'v189e_structured_forms_delivery_and_closure.sql': header('v189e', 'Structured forms — Delivery + Stage Boundary + Closing', 'v185 / v189') + [
    formRow('a1890000-0000-4000-8000-000000000061', 'Checkpoint Report (Structured)', 'Structured Managing Product Delivery — checkpoint report.', 'Managing Product Delivery', formPayload('FS-MPD-CHK-01', 'Checkpoint Report (Structured)', 'managing_product_delivery', 'Checkpoint Report', chk)),
    formRow('a1890000-0000-4000-8000-000000000062', 'Product Description (Structured)', 'Structured Managing Product Delivery — product description.', 'Managing Product Delivery', formPayload('FS-MPD-PD-01', 'Product Description (Structured)', 'managing_product_delivery', 'Product Description', pd)),
    formRow('a1850000-0000-4000-8000-000000000105', 'Work Package (Structured)', 'Structured Managing Product Delivery — work package.', 'Managing Product Delivery', formPayload('FS-MPD-WP-01', 'Work Package (Structured)', 'managing_product_delivery', 'Work Package', wp)),
    formRow('a1850000-0000-4000-8000-000000000106', 'End Stage Report (Structured)', 'Structured Managing a Stage Boundary — end stage report.', 'Managing a Stage Boundary', formPayload('FS-SB-ESR-01', 'End Stage Report (Structured)', 'managing_a_stage_boundary', 'End Stage Report', esr)),
    formRow('a1890000-0000-4000-8000-000000000071', 'Lessons Report (Structured)', 'Structured Managing a Stage Boundary — lessons report.', 'Managing a Stage Boundary', formPayload('FS-SB-LR-01', 'Lessons Report (Structured)', 'managing_a_stage_boundary', 'Lessons Report', lr)),
    formRow('a1850000-0000-4000-8000-000000000107', 'End Project Report (Structured)', 'Structured Closing — end project report.', 'Closing', formPayload('FS-CP-EPR-01', 'End Project Report (Structured)', 'closing', 'End Project Report', epr)),
  ].join(',\n') + footer + `\nDO $$ BEGIN RAISE NOTICE 'v189e_structured_forms_delivery_and_closure.sql applied'; END $$;\n`,
}

for (const [name, body] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), body)
  console.log('Wrote', name, `(${body.length} bytes)`)
}
console.log('Done — 5 SQL files')
