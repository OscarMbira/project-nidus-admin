-- =============================================================================
-- v185b: Seed project_template + methodology samples (idempotent)
-- Plan: projectplans/v188_global_templates_level_first_menu_plan.md
-- Prerequisites: v185_project_template_domain_methodology.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Project Template (PMBOK) — same payload shape as Portfolio/Programme seeds
-- ---------------------------------------------------------------------------
INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES (
    'a1850000-0000-4000-8000-000000000001'::uuid,
    'project_template',
    'Digital Delivery Project',
    'Curated master for digital delivery projects (PMBOK track).',
    'delivery',
    'pmbok',
    $pjseed${
      "template_code": "PJ-DIG-01",
      "project_type": "delivery",
      "governance_model": "project_board",
      "review_frequency": "weekly",
      "description": "Guides digital delivery projects: objectives, governance, risks, metrics, and roles.",
      "objectives": [
        {
          "objective_code": "OBJ-01",
          "objective_name": "Deliver MVP on schedule",
          "objective_description": "Ship a usable MVP within the agreed release window.",
          "objective_type": "outcome",
          "objective_level": "project",
          "measurement_criteria": "MVP acceptance signed",
          "target_value": "Yes by release date",
          "strategic_alignment": "Digital operating model",
          "importance_score": 5,
          "sort_order": 1
        }
      ],
      "governance": [
        {
          "board_name": "Project Board",
          "decision_making_process": "Weekly board; change control for scope > 5 days",
          "selection_criteria": "Value, risk, capacity",
          "prioritisation_rules": "Must-have backlog first",
          "resource_allocation_rules": "Dedicated squad + shared specialists",
          "escalation_process": "PM → Sponsor → Portfolio Manager",
          "compliance_requirements": "Security review before go-live",
          "sort_order": 1
        }
      ],
      "risks": [
        {
          "risk_title": "Scope creep from late stakeholder asks",
          "risk_description": "Uncontrolled change requests delay MVP.",
          "risk_category": "scope",
          "likelihood": "medium",
          "impact": "high",
          "sort_order": 1
        }
      ],
      "metrics": [
        {
          "kpi_name": "Sprint goal attainment",
          "target": "80%",
          "measurement_frequency": "sprint",
          "description": "Share of sprint goals fully met",
          "sort_order": 1
        }
      ],
      "roles": [
        {"role_title": "Project Manager", "role_description": "Owns plan, risks, and reporting", "is_key_role": true, "sort_order": 1},
        {"role_title": "Product Owner", "role_description": "Owns backlog priority and acceptance", "is_key_role": true, "sort_order": 2}
      ]
    }$pjseed$::jsonb,
    'live',
    1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain = 'project_template';

-- ---------------------------------------------------------------------------
-- Structured methodology samples (Portfolio / Programme / Project)
-- ---------------------------------------------------------------------------
INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000011'::uuid,
    'portfolio_template',
    'Structured Portfolio Governance',
    'Sample Structured-methodology portfolio template.',
    'strategic',
    'structured',
    '{"template_code":"PT-STR-01","portfolio_type":"strategic","governance_model":"corporate_board","review_frequency":"quarterly","description":"Structured portfolio governance sample.","objectives":[],"governance":[],"benefit_categories":[],"risks":[],"metrics":[],"roles":[{"role_title":"Portfolio Director","role_description":"Owns portfolio direction","is_key_role":true,"sort_order":1}]}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000012'::uuid,
    'programme_template',
    'Structured Programme Control',
    'Sample Structured-methodology programme template.',
    'transformation',
    'structured',
    '{"template_code":"PG-STR-01","programme_type":"transformation","governance_model":"programme_board","review_frequency":"monthly","description":"Structured programme control sample.","governance":[],"milestones":[],"dependencies":[],"benefits":[],"risks":[],"roles":[{"role_title":"Programme Manager","role_description":"Day-to-day control","is_key_role":true,"sort_order":1}]}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000013'::uuid,
    'project_template',
    'Structured Project Initiation',
    'Sample Structured-methodology project template.',
    'initiation',
    'structured',
    '{"template_code":"PJ-STR-01","project_type":"initiation","governance_model":"project_board","review_frequency":"fortnightly","description":"Structured project initiation sample.","objectives":[],"governance":[],"risks":[],"metrics":[],"roles":[{"role_title":"Project Manager","role_description":"Owns initiation and control","is_key_role":true,"sort_order":1}]}'::jsonb,
    'live', 1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Agile methodology samples (Portfolio / Programme / Project)
-- ---------------------------------------------------------------------------
INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
(
    'a1850000-0000-4000-8000-000000000021'::uuid,
    'portfolio_template',
    'Agile Portfolio Value Streams',
    'Sample Agile-methodology portfolio template.',
    'value_stream',
    'agile',
    '{"template_code":"PT-AGL-01","portfolio_type":"value_stream","governance_model":"lean_portfolio","review_frequency":"quarterly","description":"Agile portfolio value-stream sample.","objectives":[],"governance":[],"benefit_categories":[],"risks":[],"metrics":[],"roles":[{"role_title":"Portfolio Owner","role_description":"Owns value-stream funding","is_key_role":true,"sort_order":1}]}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000022'::uuid,
    'programme_template',
    'Agile Programme Increment',
    'Sample Agile-methodology programme template.',
    'increment',
    'agile',
    '{"template_code":"PG-AGL-01","programme_type":"increment","governance_model":"art_sync","review_frequency":"biweekly","description":"Agile programme increment sample.","governance":[],"milestones":[],"dependencies":[],"benefits":[],"risks":[],"roles":[{"role_title":"Release Train Engineer","role_description":"Facilitates programme cadence","is_key_role":true,"sort_order":1}]}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000023'::uuid,
    'project_template',
    'Agile Delivery Team Template',
    'Sample Agile-methodology project template.',
    'delivery',
    'agile',
    '{"template_code":"PJ-AGL-01","project_type":"delivery","governance_model":"scrum_of_scrums","review_frequency":"sprint","description":"Agile delivery team sample.","objectives":[],"governance":[],"risks":[],"metrics":[],"roles":[{"role_title":"Scrum Master","role_description":"Facilitates team ceremonies","is_key_role":true,"sort_order":1}]}'::jsonb,
    'live', 1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Form templates — 1 sample per Structured stage + Agile ceremony
-- ---------------------------------------------------------------------------
INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
) VALUES
-- Structured stages
(
    'a1850000-0000-4000-8000-000000000101'::uuid, 'form_template',
    'Starting Up Project Brief (Structured)', 'Sample Structured form — Starting Up.',
    'Starting Up', 'structured',
    '{"template_code":"FS-SU-01","name":"Starting Up Project Brief (Structured)","process_group":"starting_up","is_active":true,"schema":{"title":"Starting Up Project Brief","sections":[{"key":"general","title":"General","fields":[{"key":"project_name","label":"Project name","type":"text"},{"key":"outline_business_case","label":"Outline business case","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000102'::uuid, 'form_template',
    'Directing Project Board Agenda (Structured)', 'Sample Structured form — Directing.',
    'Directing', 'structured',
    '{"template_code":"FS-DIR-01","name":"Directing Project Board Agenda (Structured)","process_group":"directing","is_active":true,"schema":{"title":"Project Board Agenda","sections":[{"key":"general","title":"General","fields":[{"key":"meeting_date","label":"Meeting date","type":"date"},{"key":"decisions","label":"Decisions required","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000103'::uuid, 'form_template',
    'Initiating Project Initiation Doc (Structured)', 'Sample Structured form — Initiating a Project.',
    'Initiating', 'structured',
    '{"template_code":"FS-IP-01","name":"Initiating Project Initiation Doc (Structured)","process_group":"initiating","is_active":true,"schema":{"title":"Project Initiation Document","sections":[{"key":"general","title":"General","fields":[{"key":"objectives","label":"Objectives","type":"textarea"},{"key":"scope","label":"Scope","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000104'::uuid, 'form_template',
    'Controlling a Stage Report (Structured)', 'Sample Structured form — Controlling a Stage.',
    'Controlling a Stage', 'structured',
    '{"template_code":"FS-CS-01","name":"Controlling a Stage Report (Structured)","process_group":"controlling_a_stage","is_active":true,"schema":{"title":"Stage Status Report","sections":[{"key":"general","title":"General","fields":[{"key":"stage_name","label":"Stage name","type":"text"},{"key":"status_summary","label":"Status summary","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000105'::uuid, 'form_template',
    'Managing Product Delivery Note (Structured)', 'Sample Structured form — Managing Product Delivery.',
    'Managing Product Delivery', 'structured',
    '{"template_code":"FS-MPD-01","name":"Managing Product Delivery Note (Structured)","process_group":"managing_product_delivery","is_active":true,"schema":{"title":"Work Package Note","sections":[{"key":"general","title":"General","fields":[{"key":"work_package","label":"Work package","type":"text"},{"key":"acceptance_criteria","label":"Acceptance criteria","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000106'::uuid, 'form_template',
    'Managing a Stage Boundary Pack (Structured)', 'Sample Structured form — Managing a Stage Boundary.',
    'Managing a Stage Boundary', 'structured',
    '{"template_code":"FS-SB-01","name":"Managing a Stage Boundary Pack (Structured)","process_group":"managing_a_stage_boundary","is_active":true,"schema":{"title":"End Stage Report","sections":[{"key":"general","title":"General","fields":[{"key":"achievements","label":"Achievements","type":"textarea"},{"key":"next_stage_plan","label":"Next stage plan","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000107'::uuid, 'form_template',
    'Closing a Project Checklist (Structured)', 'Sample Structured form — Closing a Project.',
    'Closing', 'structured',
    '{"template_code":"FS-CP-01","name":"Closing a Project Checklist (Structured)","process_group":"closing","is_active":true,"schema":{"title":"Project Closure Checklist","sections":[{"key":"general","title":"General","fields":[{"key":"handover_complete","label":"Handover complete","type":"checkbox"},{"key":"lessons","label":"Lessons learned","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
-- Agile ceremonies
(
    'a1850000-0000-4000-8000-000000000111'::uuid, 'form_template',
    'Product Backlog Item Card (Agile)', 'Sample Agile form — Backlog.',
    'Backlog', 'agile',
    '{"template_code":"FA-BL-01","name":"Product Backlog Item Card (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Backlog Item","sections":[{"key":"general","title":"General","fields":[{"key":"title","label":"Title","type":"text"},{"key":"acceptance","label":"Acceptance criteria","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000112'::uuid, 'form_template',
    'Sprint Planning Agenda (Agile)', 'Sample Agile form — Sprint Planning.',
    'Sprint Planning', 'agile',
    '{"template_code":"FA-SP-01","name":"Sprint Planning Agenda (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Sprint Planning","sections":[{"key":"general","title":"General","fields":[{"key":"sprint_goal","label":"Sprint goal","type":"textarea"},{"key":"capacity","label":"Team capacity","type":"text"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000113'::uuid, 'form_template',
    'Daily Stand-up Notes (Agile)', 'Sample Agile form — Sprint Execution.',
    'Sprint Execution', 'agile',
    '{"template_code":"FA-SE-01","name":"Daily Stand-up Notes (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Stand-up Notes","sections":[{"key":"general","title":"General","fields":[{"key":"impediments","label":"Impediments","type":"textarea"},{"key":"focus_today","label":"Focus today","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000114'::uuid, 'form_template',
    'Sprint Review & Retro (Agile)', 'Sample Agile form — Review & Retrospective.',
    'Review & Retrospective', 'agile',
    '{"template_code":"FA-RR-01","name":"Sprint Review & Retro (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Review and Retrospective","sections":[{"key":"general","title":"General","fields":[{"key":"demo_notes","label":"Demo notes","type":"textarea"},{"key":"actions","label":"Improvement actions","type":"textarea"}]}]}}'::jsonb,
    'live', 1
),
(
    'a1850000-0000-4000-8000-000000000115'::uuid, 'form_template',
    'Release Checklist (Agile)', 'Sample Agile form — Release.',
    'Release', 'agile',
    '{"template_code":"FA-REL-01","name":"Release Checklist (Agile)","process_group":"agile","is_active":true,"schema":{"title":"Release Checklist","sections":[{"key":"general","title":"General","fields":[{"key":"version","label":"Release version","type":"text"},{"key":"go_no_go","label":"Go / No-go","type":"text"}]}]}}'::jsonb,
    'live', 1
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    updated_at = NOW()
WHERE admin.global_template_library.domain = 'form_template';

DO $$
BEGIN
  RAISE NOTICE 'v185b_project_template_methodology_seed.sql applied';
END $$;
