-- =============================================================================
-- v189c: Structured process docs — Management Strategies
-- Plan: projectplans/v189_structured_methodology_template_completeness_plan.md
-- Prerequisites: v185 / v188
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- Rule 27: "Structured" only — never PRINCE2
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1890000-0000-4000-8000-000000000041'::uuid, 'process_template',
    'Quality Management Strategy (Structured)',
    'Structured Initiating — quality management strategy (process guidance).',
    'Initiating', 'structured',
    '{"seed_key":"seed_pt_str_quality_strategy","document_type":"project_management_plans","title":"Quality Management Strategy (Structured)","description":"Structured Initiating — quality management strategy (process guidance).","status":"active","document_data":{"purpose":"Define how quality will be managed on the project.","owner_role":"Project Manager / Quality Assurance","review_cadence":"Each stage boundary","sample_notes":"Keep aligned with corporate quality standards.","introduction":"Introduction — scope and objectives of quality management for the project.","quality_management_system":"Quality management system — standards, methods, and tools to be applied.","quality_planning":"Quality planning — how quality requirements are identified and planned.","quality_control":"Quality control — inspection, testing, and review activities.","quality_assurance":"Quality assurance — independent checks and audit approach.","project_quality_records":"Project quality records — what records are kept and where.","reporting":"Reporting — how quality performance is reported and escalated."}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000042'::uuid, 'process_template',
    'Risk Management Strategy (Structured)',
    'Structured Initiating — risk management strategy (process guidance).',
    'Initiating', 'structured',
    '{"seed_key":"seed_pt_str_risk_strategy","document_type":"project_management_plans","title":"Risk Management Strategy (Structured)","description":"Structured Initiating — risk management strategy (process guidance).","status":"active","document_data":{"purpose":"Define how risk will be identified, assessed, and controlled.","owner_role":"Project Manager / Risk Owner","review_cadence":"Fortnightly risk review","sample_notes":"Escalate risks that threaten stage or project tolerances.","introduction":"Introduction — purpose and scope of risk management.","risk_management_procedure":"Risk management procedure — overall approach and workflow.","risk_identification":"Risk identification — techniques and triggers.","risk_assessment":"Risk assessment — evaluation criteria and scoring method.","risk_response_planning":"Risk response planning — response types and selection criteria.","risk_monitoring_and_control":"Risk monitoring and control — review frequency and ownership.","tools_and_techniques":"Tools and techniques — registers, workshops, checklists used.","risk_categories":"Risk categories — taxonomy used on this project.","probability_impact_scales":"Probability and impact scales — definitions for each level.","proximity":"Proximity — how timing / nearness of risk is assessed.","risk_budget":"Risk budget — contingency and risk allowance approach.","roles_and_responsibilities":"Roles and responsibilities — who identifies, owns, and escalates risks.","risk_register_approach":"Risk register — format, maintenance, and version control.","reporting":"Reporting — risk reporting cadence and escalation thresholds."}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000043'::uuid, 'process_template',
    'Configuration Management Strategy (Structured)',
    'Structured Initiating — configuration management strategy (process guidance).',
    'Initiating', 'structured',
    '{"seed_key":"seed_pt_str_config_strategy","document_type":"project_management_plans","title":"Configuration Management Strategy (Structured)","description":"Structured Initiating — configuration management strategy (process guidance).","status":"active","document_data":{"purpose":"Define how configuration items are identified, controlled, and audited.","owner_role":"Configuration Librarian / Project Manager","review_cadence":"Each stage boundary / release","sample_notes":"Baselines require formal approval before change.","introduction":"Introduction — purpose and scope of configuration management.","configuration_management_procedure":"Configuration management procedure — overall workflow.","configuration_identification":"Configuration identification — naming, baselines, and versioning.","configuration_change_control":"Configuration change control — authorisation and approval levels.","configuration_status_accounting":"Configuration status accounting — status tracking approach.","configuration_audits":"Configuration audits — verification and compliance checks.","tools_and_techniques":"Tools and techniques — CM tools, repositories, and libraries.","issue_and_change_control":"Issue and change control — linkage to issue register and change requests.","roles_and_responsibilities":"Roles and responsibilities — CM roles and accountabilities."}}'::jsonb,
    'live', 1
),
(
    'a1890000-0000-4000-8000-000000000044'::uuid, 'process_template',
    'Communication Management Strategy (Structured)',
    'Structured Initiating — communication management strategy (process guidance).',
    'Initiating', 'structured',
    '{"seed_key":"seed_pt_str_comms_strategy","document_type":"project_management_plans","title":"Communication Management Strategy (Structured)","description":"Structured Initiating — communication management strategy (process guidance).","status":"active","document_data":{"purpose":"Define how project information is planned, distributed, and reported.","owner_role":"Project Manager / Communications Lead","review_cadence":"Monthly / each stage boundary","sample_notes":"Align channels with stakeholder information needs.","introduction":"Introduction — purpose and scope of communication management.","communication_procedure":"Communication procedure — overall approach to project communications.","communication_planning":"Communication planning — analysis of information needs.","information_distribution":"Information distribution — channels, formats, and timing.","performance_reporting":"Performance reporting — status, highlight, and exception reporting.","stakeholder_engagement":"Stakeholder engagement — engagement approach and responsibilities.","communication_channels":"Communication channels — meetings, portals, email, reports.","roles_and_responsibilities":"Roles and responsibilities — who communicates what to whom."}}'::jsonb,
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

DO $$ BEGIN RAISE NOTICE 'v189c_structured_process_docs_strategies.sql applied'; END $$;
