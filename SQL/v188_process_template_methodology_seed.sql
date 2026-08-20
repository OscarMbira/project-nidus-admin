-- =============================================================================
-- v188: Process Template seeds — Agile ceremonies + Structured stages
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md (follow-up)
-- Why: Process Template → Agile / Structured category filters were empty
--       (v176 seeds are PMBOK phases only; v185c backfill tags those as pmbok).
-- Prerequisites: v185 (methodology column + project_template domain)
-- Idempotent: fixed UUIDs, ON CONFLICT DO UPDATE
-- document_type values must remain in sync RPC allow-list (v777/v783).
-- =============================================================================

INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
-- ---------------------------------------------------------------------------
-- Agile · Sprint Execution (3) — currently empty in Library filter
-- ---------------------------------------------------------------------------
(
    'a1880000-0000-4000-8000-000000000001'::uuid,
    'process_template',
    'Daily Stand-up Notes (Agile)',
    'Master for capturing daily stand-up outcomes during sprint execution.',
    'Sprint Execution',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_standup_notes",
      "document_type": "team_performance_assessments",
      "title": "Daily Stand-up Notes (Agile)",
      "description": "Master for capturing daily stand-up outcomes during sprint execution.",
      "status": "active",
      "document_data": {
        "purpose": "Record yesterday / today / impediments for the sprint team.",
        "owner_role": "Scrum Master",
        "review_cadence": "Daily during sprint",
        "sample_notes": "Keep entries short; escalate blockers same day."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000002'::uuid,
    'process_template',
    'Sprint Board Health Check (Agile)',
    'Master for mid-sprint board and WIP health checks.',
    'Sprint Execution',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_board_health",
      "document_type": "team_performance_assessments",
      "title": "Sprint Board Health Check (Agile)",
      "description": "Master for mid-sprint board and WIP health checks.",
      "status": "active",
      "document_data": {
        "purpose": "Confirm WIP limits, blocked items, and forecast to sprint goal.",
        "owner_role": "Scrum Master / Product Owner",
        "review_cadence": "Twice per sprint",
        "sample_notes": "Flag any card blocked > 1 day."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000003'::uuid,
    'process_template',
    'Impediment Log (Agile)',
    'Master impediment register used during sprint execution.',
    'Sprint Execution',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_impediment_log",
      "document_type": "variance_analysis_reports",
      "title": "Impediment Log (Agile)",
      "description": "Master impediment register used during sprint execution.",
      "status": "active",
      "document_data": {
        "purpose": "Track impediments, owners, and resolution dates.",
        "owner_role": "Scrum Master",
        "review_cadence": "Daily stand-up",
        "sample_notes": "Close impediments with evidence of removal."
      }
    }$p$::jsonb,
    'live', 1
),
-- ---------------------------------------------------------------------------
-- Agile · Backlog (2)
-- ---------------------------------------------------------------------------
(
    'a1880000-0000-4000-8000-000000000011'::uuid,
    'process_template',
    'Product Backlog Refinement Notes (Agile)',
    'Master for backlog refinement sessions.',
    'Backlog',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_backlog_refinement",
      "document_type": "requirements_documentation",
      "title": "Product Backlog Refinement Notes (Agile)",
      "description": "Master for backlog refinement sessions.",
      "status": "active",
      "document_data": {
        "purpose": "Capture refined stories, estimates, and readiness decisions.",
        "owner_role": "Product Owner",
        "review_cadence": "Weekly refinement",
        "sample_notes": "Only ready items carry a clear Definition of Ready."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000012'::uuid,
    'process_template',
    'Backlog Priority Rationale (Agile)',
    'Master for recording why backlog items are ordered as they are.',
    'Backlog',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_backlog_priority",
      "document_type": "requirements_management_plans",
      "title": "Backlog Priority Rationale (Agile)",
      "description": "Master for recording why backlog items are ordered as they are.",
      "status": "active",
      "document_data": {
        "purpose": "Document value, risk, and dependency drivers for ordering.",
        "owner_role": "Product Owner",
        "review_cadence": "Each PI / release planning",
        "sample_notes": "Link each top item to an outcome metric."
      }
    }$p$::jsonb,
    'live', 1
),
-- ---------------------------------------------------------------------------
-- Agile · Sprint Planning (2)
-- ---------------------------------------------------------------------------
(
    'a1880000-0000-4000-8000-000000000021'::uuid,
    'process_template',
    'Sprint Planning Agenda (Agile)',
    'Master agenda and outputs for sprint planning.',
    'Sprint Planning',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_sprint_planning",
      "document_type": "project_management_plans",
      "title": "Sprint Planning Agenda (Agile)",
      "description": "Master agenda and outputs for sprint planning.",
      "status": "active",
      "document_data": {
        "purpose": "Agree sprint goal, capacity, and selected backlog items.",
        "owner_role": "Scrum Master",
        "review_cadence": "Start of each sprint",
        "sample_notes": "Record committed items and stretch goals separately."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000022'::uuid,
    'process_template',
    'Sprint Goal Charter (Agile)',
    'Master one-page sprint goal agreement.',
    'Sprint Planning',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_sprint_goal",
      "document_type": "project_charters",
      "title": "Sprint Goal Charter (Agile)",
      "description": "Master one-page sprint goal agreement.",
      "status": "active",
      "document_data": {
        "purpose": "State the sprint goal and success signal for the team.",
        "owner_role": "Product Owner",
        "review_cadence": "Start of each sprint",
        "sample_notes": "Goal must be valuable and achievable within capacity."
      }
    }$p$::jsonb,
    'live', 1
),
-- ---------------------------------------------------------------------------
-- Agile · Review & Retrospective (2)
-- ---------------------------------------------------------------------------
(
    'a1880000-0000-4000-8000-000000000031'::uuid,
    'process_template',
    'Sprint Review Record (Agile)',
    'Master for sprint review demo notes and stakeholder feedback.',
    'Review & Retrospective',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_sprint_review",
      "document_type": "scope_acceptance_forms",
      "title": "Sprint Review Record (Agile)",
      "description": "Master for sprint review demo notes and stakeholder feedback.",
      "status": "active",
      "document_data": {
        "purpose": "Capture demo outcomes and product backlog implications.",
        "owner_role": "Product Owner",
        "review_cadence": "End of each sprint",
        "sample_notes": "Record accept / defer decisions per increment."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000032'::uuid,
    'process_template',
    'Sprint Retrospective Actions (Agile)',
    'Master for retrospective insights and improvement actions.',
    'Review & Retrospective',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_retro_actions",
      "document_type": "team_performance_assessments",
      "title": "Sprint Retrospective Actions (Agile)",
      "description": "Master for retrospective insights and improvement actions.",
      "status": "active",
      "document_data": {
        "purpose": "Record what went well, to improve, and owned actions.",
        "owner_role": "Scrum Master",
        "review_cadence": "End of each sprint",
        "sample_notes": "Limit to 1–3 actions; review next retro."
      }
    }$p$::jsonb,
    'live', 1
),
-- ---------------------------------------------------------------------------
-- Agile · Release (2) — brings Agile total to 11
-- ---------------------------------------------------------------------------
(
    'a1880000-0000-4000-8000-000000000041'::uuid,
    'process_template',
    'Release Readiness Checklist (Agile)',
    'Master go / no-go checklist before a production release.',
    'Release',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_release_readiness",
      "document_type": "project_closure_checklists",
      "title": "Release Readiness Checklist (Agile)",
      "description": "Master go / no-go checklist before a production release.",
      "status": "active",
      "document_data": {
        "purpose": "Confirm quality, ops, and communication gates for release.",
        "owner_role": "Release Manager",
        "review_cadence": "Each release",
        "sample_notes": "Require signed go-live from Product Owner and Ops."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000042'::uuid,
    'process_template',
    'Release Notes Pack (Agile)',
    'Master structure for customer-facing release notes.',
    'Release',
    'agile',
    $p${
      "seed_key": "seed_pt_agile_release_notes",
      "document_type": "contract_closure_documents",
      "title": "Release Notes Pack (Agile)",
      "description": "Master structure for customer-facing release notes.",
      "status": "active",
      "document_data": {
        "purpose": "Summarise features, fixes, and known issues for the release.",
        "owner_role": "Product Owner",
        "review_cadence": "Each release",
        "sample_notes": "Keep language non-technical for end users."
      }
    }$p$::jsonb,
    'live', 1
),
-- ---------------------------------------------------------------------------
-- Structured stages (7) — fill Structured methodology chips
-- ---------------------------------------------------------------------------
(
    'a1880000-0000-4000-8000-000000000101'::uuid,
    'process_template',
    'Project Brief Outline (Structured)',
    'Structured Starting Up — outline brief / mandate capture.',
    'Starting Up',
    'structured',
    $p${
      "seed_key": "seed_pt_str_starting_up_brief",
      "document_type": "project_charters",
      "title": "Project Brief Outline (Structured)",
      "description": "Structured Starting Up — outline brief / mandate capture.",
      "status": "active",
      "document_data": {
        "purpose": "Capture outline business case and project definition for Starting Up.",
        "owner_role": "Executive / Project Manager",
        "review_cadence": "Before initiation authority",
        "sample_notes": "Keep brief concise; expand in Initiating."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000102'::uuid,
    'process_template',
    'Project Board Agenda (Structured)',
    'Structured Directing — board agenda and decisions log.',
    'Directing',
    'structured',
    $p${
      "seed_key": "seed_pt_str_directing_agenda",
      "document_type": "make_or_buy_decisions",
      "title": "Project Board Agenda (Structured)",
      "description": "Structured Directing — board agenda and decisions log.",
      "status": "active",
      "document_data": {
        "purpose": "Structure Project Board meetings and record decisions.",
        "owner_role": "Executive",
        "review_cadence": "Each board meeting",
        "sample_notes": "List decisions required and supporting papers."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000103'::uuid,
    'process_template',
    'Initiation Document Pack (Structured)',
    'Structured Initiating — PID / initiation documentation pack.',
    'Initiating',
    'structured',
    $p${
      "seed_key": "seed_pt_str_initiating_pid",
      "document_type": "project_management_plans",
      "title": "Initiation Document Pack (Structured)",
      "description": "Structured Initiating — PID / initiation documentation pack.",
      "status": "active",
      "document_data": {
        "purpose": "Assemble the initiation document set for authority to deliver.",
        "owner_role": "Project Manager",
        "review_cadence": "End of Initiating",
        "sample_notes": "Include approach, controls, and tolerances."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000104'::uuid,
    'process_template',
    'Stage Status Report (Structured)',
    'Structured Controlling a Stage — status and exception reporting.',
    'Controlling a Stage',
    'structured',
    $p${
      "seed_key": "seed_pt_str_controlling_stage",
      "document_type": "evm_status_reports",
      "title": "Stage Status Report (Structured)",
      "description": "Structured Controlling a Stage — status and exception reporting.",
      "status": "active",
      "document_data": {
        "purpose": "Report stage progress against plan and tolerances.",
        "owner_role": "Project Manager",
        "review_cadence": "Fortnightly / stage checkpoint",
        "sample_notes": "Escalate early if forecast exceeds tolerance."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000105'::uuid,
    'process_template',
    'Work Package Agreement (Structured)',
    'Structured Managing Product Delivery — work package brief.',
    'Managing Product Delivery',
    'structured',
    $p${
      "seed_key": "seed_pt_str_product_delivery",
      "document_type": "activity_attributes",
      "title": "Work Package Agreement (Structured)",
      "description": "Structured Managing Product Delivery — work package brief.",
      "status": "active",
      "document_data": {
        "purpose": "Agree work package scope, constraints, and acceptance criteria.",
        "owner_role": "Team Manager",
        "review_cadence": "Per work package",
        "sample_notes": "Include interfaces and quality methods."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000106'::uuid,
    'process_template',
    'End Stage Report (Structured)',
    'Structured Managing a Stage Boundary — end stage / next stage plan.',
    'Managing a Stage Boundary',
    'structured',
    $p${
      "seed_key": "seed_pt_str_stage_boundary",
      "document_type": "scope_acceptance_forms",
      "title": "End Stage Report (Structured)",
      "description": "Structured Managing a Stage Boundary — end stage / next stage plan.",
      "status": "active",
      "document_data": {
        "purpose": "Summarise stage achievements and propose the next stage plan.",
        "owner_role": "Project Manager",
        "review_cadence": "Each stage boundary",
        "sample_notes": "Board approves next stage before work continues."
      }
    }$p$::jsonb,
    'live', 1
),
(
    'a1880000-0000-4000-8000-000000000107'::uuid,
    'process_template',
    'Project Closure Report (Structured)',
    'Structured Closing — closure report and handover checklist.',
    'Closing',
    'structured',
    $p${
      "seed_key": "seed_pt_str_closing_report",
      "document_type": "project_closure_checklists",
      "title": "Project Closure Report (Structured)",
      "description": "Structured Closing — closure report and handover checklist.",
      "status": "active",
      "document_data": {
        "purpose": "Confirm products handed over and benefits ownership transferred.",
        "owner_role": "Project Manager",
        "review_cadence": "Project close",
        "sample_notes": "Include lessons learned and follow-on actions."
      }
    }$p$::jsonb,
    'live', 1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain = 'process_template';

DO $$
DECLARE
  v_agile INT;
  v_structured INT;
  v_sprint_exec INT;
BEGIN
  SELECT COUNT(*) INTO v_agile
  FROM admin.global_template_library
  WHERE domain = 'process_template' AND record_status <> 'history' AND methodology = 'agile';

  SELECT COUNT(*) INTO v_structured
  FROM admin.global_template_library
  WHERE domain = 'process_template' AND record_status <> 'history' AND methodology = 'structured';

  SELECT COUNT(*) INTO v_sprint_exec
  FROM admin.global_template_library
  WHERE domain = 'process_template' AND record_status <> 'history'
    AND methodology = 'agile' AND category = 'Sprint Execution';

  RAISE NOTICE 'v188 process methodology seeds: agile=%, structured=%, sprint_execution=%',
    v_agile, v_structured, v_sprint_exec;
END $$;
