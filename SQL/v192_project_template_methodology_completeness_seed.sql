-- =============================================================================
-- v192: Project Template completeness — one master per methodology × phase/ceremony
-- Problem: Project Template → Structured (and PMBOK/Agile) only had 1 thin sample.
-- Fix: seed a full set aligned to CATEGORIES_BY_METHODOLOGY in GlobalTemplateLibraryList.
-- Prerequisites: v185 / v185b (project_template domain + methodology)
-- Idempotent: fixed UUIDs; ON CONFLICT DO UPDATE
-- Rule 27: labels use Structured (never PRINCE2); same applies to PMBOK (PMI trademark) —
-- corrected post-hoc by Admin SQL/v199_pmbok_naming_compliance_fix.sql for rows already live
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Align / enrich the three original v185b project samples to taxonomy categories
-- ---------------------------------------------------------------------------
UPDATE admin.global_template_library
SET
  category = 'Executing',
  name = 'Digital Delivery Project (Standards-Based)',
  description = 'Standards-Based Executing-phase project master for digital delivery.',
  updated_at = NOW()
WHERE id = 'a1850000-0000-4000-8000-000000000001'::uuid
  AND domain = 'project_template';

UPDATE admin.global_template_library
SET
  category = 'Initiating',
  name = 'Structured Project Initiation',
  description = 'Structured Initiating-stage project master (objectives, governance, risks, roles).',
  updated_at = NOW()
WHERE id = 'a1850000-0000-4000-8000-000000000013'::uuid
  AND domain = 'project_template';

UPDATE admin.global_template_library
SET
  category = 'Sprint Execution',
  name = 'Agile Delivery Team Template',
  description = 'Agile Sprint Execution project master for delivery teams.',
  updated_at = NOW()
WHERE id = 'a1850000-0000-4000-8000-000000000023'::uuid
  AND domain = 'project_template';

-- ---------------------------------------------------------------------------
-- Helper: upsert a project_template row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin._seed_project_template_v192(
  p_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_category TEXT,
  p_methodology TEXT,
  p_payload JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO admin.global_template_library (
    id, domain, name, description, category, methodology, payload, record_status, record_version
  ) VALUES (
    p_id, 'project_template', p_name, p_description, p_category, p_methodology, p_payload, 'live', 1
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    methodology = EXCLUDED.methodology,
    payload = EXCLUDED.payload,
    record_status = 'live',
    updated_at = NOW()
  WHERE admin.global_template_library.domain = 'project_template';
END;
$$;

DO $$
DECLARE
  v_payload JSONB;
BEGIN
  -- =========================================================================
  -- PMBOK phases (5) — keep Digital Delivery as Executing (id …001 already)
  -- =========================================================================
  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000011'::uuid,
    'Standards-Based Project Charter Gate',
    'Standards-Based Initiating — charter, sponsor alignment, and start-up controls.',
    'Initiating',
    'pmbok',
    jsonb_build_object(
      'template_code', 'PJ-PM-INIT-01',
      'project_type', 'initiation',
      'governance_model', 'project_board',
      'review_frequency', 'fortnightly',
      'description', 'Initiating controls: charter approval, objectives, and early risk scan.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Secure charter approval',
        'objective_description', 'Authorise the project to proceed into planning.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Signed charter', 'target_value', 'Yes',
        'strategic_alignment', 'Portfolio priority', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Sponsor decision on charter',
        'selection_criteria', 'Strategic fit and funding', 'prioritisation_rules', 'Portfolio gate',
        'resource_allocation_rules', 'Seed team only', 'escalation_process', 'PM → Sponsor',
        'compliance_requirements', 'Business case outline', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Unclear sponsor authority', 'risk_description', 'Decisions stall without an empowered sponsor.',
        'risk_category', 'organizational', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Charter cycle time', 'target', '10 working days',
        'measurement_frequency', 'once', 'description', 'Days from request to approved charter', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Sponsor', 'role_description', 'Authorises the project', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Develops the charter pack', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000012'::uuid,
    'Standards-Based Project Management Plan',
    'Standards-Based Planning — baselines, subsidiary plans, and readiness.',
    'Planning',
    'pmbok',
    jsonb_build_object(
      'template_code', 'PJ-PM-PLAN-01',
      'project_type', 'planning',
      'governance_model', 'project_board',
      'review_frequency', 'weekly',
      'description', 'Planning master: scope/schedule/cost baselines and subsidiary plans.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Baselines approved',
        'objective_description', 'Agree scope, schedule, and cost baselines before execute.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Board approval recorded', 'target_value', 'Yes',
        'strategic_alignment', 'Delivery predictability', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Plan approval gate',
        'selection_criteria', 'Feasibility and risk', 'prioritisation_rules', 'Must-have scope first',
        'resource_allocation_rules', 'Capacity-locked plan', 'escalation_process', 'PM → PMO → Sponsor',
        'compliance_requirements', 'Risk and quality plans attached', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Optimistic schedule', 'risk_description', 'Underestimated effort inflates contingency burn.',
        'risk_category', 'schedule', 'likelihood', 'high', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Plan completeness', 'target', '100% subsidiary plans present',
        'measurement_frequency', 'once', 'description', 'Checklist of required planning artefacts', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Owns the integrated plan', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'PMO Analyst', 'role_description', 'Assurance on plan quality', 'is_key_role', false, 'sort_order', 2)
      )
    )
  );

  -- Executing already covered by a185…001 (Digital Delivery)

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000014'::uuid,
    'Standards-Based Performance Control',
    'Standards-Based Monitoring & Controlling — variance, change, and forecasts.',
    'Monitoring & Controlling',
    'pmbok',
    jsonb_build_object(
      'template_code', 'PJ-PM-MC-01',
      'project_type', 'control',
      'governance_model', 'project_board',
      'review_frequency', 'weekly',
      'description', 'Control cycle: performance reporting, change control, and forecasts.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Stay within tolerances',
        'objective_description', 'Detect and escalate variance early.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'No unauthorised tolerance breach', 'target_value', '0 breaches',
        'strategic_alignment', 'Predictable delivery', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Change board for baseline impacts',
        'selection_criteria', 'Impact vs benefit', 'prioritisation_rules', 'Protect critical path',
        'resource_allocation_rules', 'Replan within remaining capacity', 'escalation_process', 'PM → Board',
        'compliance_requirements', 'Change log complete', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Silent scope creep', 'risk_description', 'Informal asks bypass change control.',
        'risk_category', 'scope', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'SPI / CPI', 'target', '≥ 0.95',
        'measurement_frequency', 'weekly', 'description', 'Schedule and cost performance indexes', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Owns control cycle', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Change Controller', 'role_description', 'Administers change requests', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000015'::uuid,
    'Standards-Based Project Closure',
    'Standards-Based Closing — handover, lessons, and administrative close.',
    'Closing',
    'pmbok',
    jsonb_build_object(
      'template_code', 'PJ-PM-CLOSE-01',
      'project_type', 'closure',
      'governance_model', 'project_board',
      'review_frequency', 'once',
      'description', 'Closure master: acceptance, handover, lessons, and archive.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Formal acceptance',
        'objective_description', 'Obtain signed product acceptance and release resources.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Acceptance certificate', 'target_value', 'Yes',
        'strategic_alignment', 'Benefits realisation start', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Closure approval',
        'selection_criteria', 'Acceptance criteria met', 'prioritisation_rules', 'Complete before new starts',
        'resource_allocation_rules', 'Release team on closure', 'escalation_process', 'PM → Sponsor',
        'compliance_requirements', 'Lessons logged; contracts closed', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Incomplete handover', 'risk_description', 'Operations lack runbooks or access.',
        'risk_category', 'operational', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Closure checklist %', 'target', '100%',
        'measurement_frequency', 'once', 'description', 'Administrative close completeness', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Drives closure pack', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Operations Owner', 'role_description', 'Accepts handover', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  -- =========================================================================
  -- Structured stages (7) — keep Initiating as a185…013; add the other six
  -- =========================================================================
  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000021'::uuid,
    'Structured Starting Up Project',
    'Structured Starting Up — mandate, brief outline, and appointment of PM.',
    'Starting Up',
    'structured',
    jsonb_build_object(
      'template_code', 'PJ-STR-SU-01',
      'project_type', 'starting_up',
      'governance_model', 'project_board',
      'review_frequency', 'fortnightly',
      'description', 'Starting Up master: mandate clarity, outline brief, and PM appointment.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Confirm project worth starting',
        'objective_description', 'Validate mandate and appoint the Project Manager.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Mandate accepted; PM appointed', 'target_value', 'Yes',
        'strategic_alignment', 'Portfolio intake', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Executive', 'decision_making_process', 'Authorise Starting Up work',
        'selection_criteria', 'Business need', 'prioritisation_rules', 'Strategic fit first',
        'resource_allocation_rules', 'Minimal start-up team', 'escalation_process', 'PM → Executive',
        'compliance_requirements', 'Mandate on file', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Vague business need', 'risk_description', 'Mandate lacks measurable outcomes.',
        'risk_category', 'business', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Start-up duration', 'target', '≤ 15 working days',
        'measurement_frequency', 'once', 'description', 'Mandate to approved Project Brief outline', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Executive', 'role_description', 'Owns business justification', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Produces start-up pack', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000022'::uuid,
    'Structured Directing Project',
    'Structured Directing — board decisions, exception handling, and stage authorisation.',
    'Directing',
    'structured',
    jsonb_build_object(
      'template_code', 'PJ-STR-DIR-01',
      'project_type', 'directing',
      'governance_model', 'project_board',
      'review_frequency', 'monthly',
      'description', 'Directing master: board agenda, exception path, and stage authorisations.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Timely board decisions',
        'objective_description', 'Keep direction decisions within agreed turnaround.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Decision SLA met', 'target_value', '≥ 90%',
        'strategic_alignment', 'Governance effectiveness', 'importance_score', 4, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Board meetings + ad-hoc exceptions',
        'selection_criteria', 'Impact on tolerances', 'prioritisation_rules', 'Protect business case',
        'resource_allocation_rules', 'Board-approved stage budgets', 'escalation_process', 'PM → Board → Corporate',
        'compliance_requirements', 'Highlight and exception reports', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Board availability', 'risk_description', 'Deferred decisions stall stages.',
        'risk_category', 'organizational', 'likelihood', 'medium', 'impact', 'medium', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Open board actions', 'target', '< 5 aged > 14 days',
        'measurement_frequency', 'monthly', 'description', 'Aging of board action items', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Executive', 'role_description', 'Chairs the board', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Senior User', 'role_description', 'Represents user interests', 'is_key_role', true, 'sort_order', 2),
        jsonb_build_object('role_title', 'Senior Supplier', 'role_description', 'Represents delivery interests', 'is_key_role', true, 'sort_order', 3)
      )
    )
  );

  -- Enrich existing Initiating sample payload (a185…013)
  UPDATE admin.global_template_library
  SET payload = jsonb_build_object(
      'template_code', 'PJ-STR-INIT-01',
      'project_type', 'initiation',
      'governance_model', 'project_board',
      'review_frequency', 'fortnightly',
      'description', 'Initiating master: PID baselines, strategies referenced, and stage plan for stage 1.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'PID approved',
        'objective_description', 'Secure board approval to deliver Stage 1.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'PID and Stage Plan authorised', 'target_value', 'Yes',
        'strategic_alignment', 'Controlled start', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Initiation gate',
        'selection_criteria', 'Business case viability', 'prioritisation_rules', 'Must-have scope',
        'resource_allocation_rules', 'Stage 1 capacity reserved', 'escalation_process', 'PM → Board',
        'compliance_requirements', 'Strategies and risk register present', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Incomplete strategies', 'risk_description', 'Risk/quality/comms strategies missing at initiation.',
        'risk_category', 'quality', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Initiation pack completeness', 'target', '100%',
        'measurement_frequency', 'once', 'description', 'Required initiation artefacts present', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Owns initiation and control', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'PMO Admin', 'role_description', 'PMO administrator — operational access', 'is_key_role', true, 'sort_order', 2)
      )
    ),
    updated_at = NOW()
  WHERE id = 'a1850000-0000-4000-8000-000000000013'::uuid
    AND domain = 'project_template';

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000024'::uuid,
    'Structured Controlling a Stage',
    'Structured Controlling a Stage — work packages, issues, and stage status.',
    'Controlling a Stage',
    'structured',
    jsonb_build_object(
      'template_code', 'PJ-STR-CS-01',
      'project_type', 'controlling',
      'governance_model', 'project_board',
      'review_frequency', 'weekly',
      'description', 'Stage control master: work package tracking, issue/risk review, highlight reporting.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Stage within tolerance',
        'objective_description', 'Deliver stage products within time, cost, and scope tolerances.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'No unmanaged exception', 'target_value', 'Yes',
        'strategic_alignment', 'Controlled delivery', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Exception path when tolerances threatened',
        'selection_criteria', 'Impact on stage plan', 'prioritisation_rules', 'Protect stage products',
        'resource_allocation_rules', 'Team managers own work packages', 'escalation_process', 'Team Manager → PM → Board',
        'compliance_requirements', 'Issue and risk registers current', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Work package drift', 'risk_description', 'Acceptance criteria unclear mid-stage.',
        'risk_category', 'quality', 'likelihood', 'medium', 'impact', 'medium', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Open issues > 14 days', 'target', '0 critical',
        'measurement_frequency', 'weekly', 'description', 'Aging of critical issues', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Controls the stage', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Team Manager', 'role_description', 'Delivers work packages', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000025'::uuid,
    'Structured Managing Product Delivery',
    'Structured Managing Product Delivery — work package accept/reject and quality.',
    'Managing Product Delivery',
    'structured',
    jsonb_build_object(
      'template_code', 'PJ-STR-MPD-01',
      'project_type', 'delivery',
      'governance_model', 'project_board',
      'review_frequency', 'weekly',
      'description', 'Product delivery master: work package execution and quality checks.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Accepted products',
        'objective_description', 'Deliver products that meet quality criteria first time.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'First-time acceptance rate', 'target_value', '≥ 90%',
        'strategic_alignment', 'Quality delivery', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'PM authorises work packages',
        'selection_criteria', 'Ready work packages only', 'prioritisation_rules', 'Critical path products first',
        'resource_allocation_rules', 'Supplier capacity confirmed', 'escalation_process', 'Team Manager → PM',
        'compliance_requirements', 'Quality register updated', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Supplier delay', 'risk_description', 'External supplier misses checkpoint.',
        'risk_category', 'external', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Checkpoint on-time %', 'target', '≥ 95%',
        'measurement_frequency', 'weekly', 'description', 'Work package checkpoint punctuality', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Team Manager', 'role_description', 'Owns product delivery', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Authorises and accepts packages', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000026'::uuid,
    'Structured Managing a Stage Boundary',
    'Structured Stage Boundary — end stage report and next stage plan.',
    'Managing a Stage Boundary',
    'structured',
    jsonb_build_object(
      'template_code', 'PJ-STR-SB-01',
      'project_type', 'stage_boundary',
      'governance_model', 'project_board',
      'review_frequency', 'per stage',
      'description', 'Stage boundary master: review achievements and authorise the next stage.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Next stage authorised',
        'objective_description', 'Board decides continue / stop with an updated plan.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Stage boundary decision recorded', 'target_value', 'Yes',
        'strategic_alignment', 'Continued business justification', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'End-stage review meeting',
        'selection_criteria', 'Business case still viable', 'prioritisation_rules', 'Benefits vs remaining cost',
        'resource_allocation_rules', 'Next-stage budget reserved', 'escalation_process', 'PM → Board → Corporate',
        'compliance_requirements', 'End Stage Report + Next Stage Plan', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Business case erosion', 'risk_description', 'Benefits no longer justify remaining investment.',
        'risk_category', 'business', 'likelihood', 'low', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Stage products accepted', 'target', '100% planned',
        'measurement_frequency', 'per stage', 'description', 'Planned vs accepted stage products', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Prepares boundary pack', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Executive', 'role_description', 'Authorises next stage', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000027'::uuid,
    'Structured Closing a Project',
    'Structured Closing — end project report, lessons, and handover.',
    'Closing',
    'structured',
    jsonb_build_object(
      'template_code', 'PJ-STR-CL-01',
      'project_type', 'closure',
      'governance_model', 'project_board',
      'review_frequency', 'once',
      'description', 'Closing master: acceptance, lessons, benefits handover, and archive.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Project closed cleanly',
        'objective_description', 'Hand over products and close contracts/resources.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'End Project Report approved', 'target_value', 'Yes',
        'strategic_alignment', 'Benefits ownership transferred', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Project Board', 'decision_making_process', 'Closure authorisation',
        'selection_criteria', 'Acceptance complete', 'prioritisation_rules', 'Close before new starts',
        'resource_allocation_rules', 'Release project team', 'escalation_process', 'PM → Executive',
        'compliance_requirements', 'Lessons Report filed', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Benefits orphaned', 'risk_description', 'No operational owner for benefits tracking.',
        'risk_category', 'business', 'likelihood', 'medium', 'impact', 'medium', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Closure checklist %', 'target', '100%',
        'measurement_frequency', 'once', 'description', 'Administrative and contractual close', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Project Manager', 'role_description', 'Owns closure pack', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Executive', 'role_description', 'Confirms closure', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  -- =========================================================================
  -- Agile ceremonies (5) — keep Sprint Execution as a185…023; add the other four
  -- =========================================================================
  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000031'::uuid,
    'Agile Backlog-Driven Project',
    'Agile Backlog — product vision, ordered backlog, and refinement cadence.',
    'Backlog',
    'agile',
    jsonb_build_object(
      'template_code', 'PJ-AGL-BL-01',
      'project_type', 'backlog',
      'governance_model', 'product_ownership',
      'review_frequency', 'sprint',
      'description', 'Backlog master: vision, prioritisation, and refinement rules.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Ready backlog',
        'objective_description', 'Maintain a refined, ordered backlog covering near-term sprints.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', '2 sprints of ready items', 'target_value', 'Yes',
        'strategic_alignment', 'Value flow', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Product Ownership', 'decision_making_process', 'PO prioritises; team pulls ready work',
        'selection_criteria', 'Value and risk', 'prioritisation_rules', 'WSJF / MoSCoW',
        'resource_allocation_rules', 'Stable team capacity', 'escalation_process', 'SM → PO → Sponsor',
        'compliance_requirements', 'Definition of Ready applied', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Unrefined backlog', 'risk_description', 'Sprint planning blocked by unclear items.',
        'risk_category', 'scope', 'likelihood', 'medium', 'impact', 'medium', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Ready items count', 'target', '≥ 2 sprints',
        'measurement_frequency', 'sprint', 'description', 'Items meeting Definition of Ready', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Product Owner', 'role_description', 'Owns backlog order and value', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Scrum Master', 'role_description', 'Facilitates refinement', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000032'::uuid,
    'Agile Sprint Planning Project',
    'Agile Sprint Planning — goal, capacity, and committed forecast.',
    'Sprint Planning',
    'agile',
    jsonb_build_object(
      'template_code', 'PJ-AGL-SP-01',
      'project_type', 'sprint_planning',
      'governance_model', 'scrum_team',
      'review_frequency', 'sprint',
      'description', 'Sprint Planning master: sprint goal, capacity, and commitment.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Clear sprint goal',
        'objective_description', 'Agree a single sprint goal the team can forecast.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Goal published in sprint board', 'target_value', 'Yes',
        'strategic_alignment', 'Increment focus', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Scrum Team', 'decision_making_process', 'Collaborative planning; team owns forecast',
        'selection_criteria', 'Ready items only', 'prioritisation_rules', 'Goal-first selection',
        'resource_allocation_rules', 'Capacity-based pull', 'escalation_process', 'SM → PO',
        'compliance_requirements', 'Capacity plan recorded', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Over-commitment', 'risk_description', 'Forecast exceeds realistic capacity.',
        'risk_category', 'resource', 'likelihood', 'medium', 'impact', 'medium', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Capacity utilised in plan', 'target', '70–90%',
        'measurement_frequency', 'sprint', 'description', 'Planned points vs capacity', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Product Owner', 'role_description', 'Clarifies goal and priorities', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Scrum Master', 'role_description', 'Facilitates planning', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  UPDATE admin.global_template_library
  SET payload = jsonb_build_object(
      'template_code', 'PJ-AGL-SE-01',
      'project_type', 'sprint_execution',
      'governance_model', 'scrum_of_scrums',
      'review_frequency', 'sprint',
      'description', 'Sprint Execution master: daily progress, impediments, and forecast updates.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Meet sprint goal',
        'objective_description', 'Deliver the forecasted increment toward the sprint goal.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Sprint goal met', 'target_value', 'Yes',
        'strategic_alignment', 'Predictable increments', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Scrum Team', 'decision_making_process', 'Daily inspect-and-adapt',
        'selection_criteria', 'Impediment urgency', 'prioritisation_rules', 'Protect sprint goal',
        'resource_allocation_rules', 'Cross-functional swarming', 'escalation_process', 'SM → leadership',
        'compliance_requirements', 'Board and burndown current', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Unresolved impediments', 'risk_description', 'Blocked work ages beyond one day.',
        'risk_category', 'operational', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Impediment age (days)', 'target', '≤ 1',
        'measurement_frequency', 'daily', 'description', 'Max age of open impediments', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Scrum Master', 'role_description', 'Facilitates team ceremonies', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Product Owner', 'role_description', 'Clarifies acceptance during sprint', 'is_key_role', true, 'sort_order', 2)
      )
    ),
    updated_at = NOW()
  WHERE id = 'a1850000-0000-4000-8000-000000000023'::uuid
    AND domain = 'project_template';

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000034'::uuid,
    'Agile Review & Retrospective Project',
    'Agile Review & Retro — demo feedback and improvement actions.',
    'Review & Retrospective',
    'agile',
    jsonb_build_object(
      'template_code', 'PJ-AGL-RR-01',
      'project_type', 'review_retro',
      'governance_model', 'scrum_team',
      'review_frequency', 'sprint',
      'description', 'Review and Retrospective master: stakeholder feedback and team improvements.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Inspect and adapt',
        'objective_description', 'Capture feedback and commit to measurable improvements.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', '≥ 1 improvement action owned', 'target_value', 'Yes',
        'strategic_alignment', 'Continuous improvement', 'importance_score', 4, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Scrum Team + Stakeholders', 'decision_making_process', 'Review then Retro',
        'selection_criteria', 'Increment demonstrable', 'prioritisation_rules', 'Highest-value feedback first',
        'resource_allocation_rules', 'Time-box ceremonies', 'escalation_process', 'SM → leadership',
        'compliance_requirements', 'Actions tracked to done', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Actions not followed up', 'risk_description', 'Retro items expire without owners.',
        'risk_category', 'operational', 'likelihood', 'medium', 'impact', 'medium', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Retro actions closed', 'target', '≥ 80% next sprint',
        'measurement_frequency', 'sprint', 'description', 'Closure rate of improvement actions', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Scrum Master', 'role_description', 'Facilitates review and retro', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Product Owner', 'role_description', 'Hosts stakeholder review', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

  PERFORM admin._seed_project_template_v192(
    'a1920000-0000-4000-8000-000000000035'::uuid,
    'Agile Release Project',
    'Agile Release — go/no-go, deploy checklist, and release notes.',
    'Release',
    'agile',
    jsonb_build_object(
      'template_code', 'PJ-AGL-REL-01',
      'project_type', 'release',
      'governance_model', 'release_train',
      'review_frequency', 'per release',
      'description', 'Release master: readiness, go/no-go, deploy, and communication.',
      'objectives', jsonb_build_array(jsonb_build_object(
        'objective_code', 'OBJ-01', 'objective_name', 'Safe release',
        'objective_description', 'Ship an increment that meets Definition of Done and release criteria.',
        'objective_type', 'outcome', 'objective_level', 'project',
        'measurement_criteria', 'Go decision recorded', 'target_value', 'Yes',
        'strategic_alignment', 'Value in production', 'importance_score', 5, 'sort_order', 1
      )),
      'governance', jsonb_build_array(jsonb_build_object(
        'board_name', 'Release authority', 'decision_making_process', 'Go / No-go with checklist',
        'selection_criteria', 'DoD + regression green', 'prioritisation_rules', 'Stability over speed',
        'resource_allocation_rules', 'On-call coverage confirmed', 'escalation_process', 'Release Manager → Sponsor',
        'compliance_requirements', 'Release notes published', 'sort_order', 1
      )),
      'risks', jsonb_build_array(jsonb_build_object(
        'risk_title', 'Incomplete DoD', 'risk_description', 'Release candidate misses non-functional checks.',
        'risk_category', 'quality', 'likelihood', 'medium', 'impact', 'high', 'sort_order', 1
      )),
      'metrics', jsonb_build_array(jsonb_build_object(
        'kpi_name', 'Release success rate', 'target', '≥ 95% without rollback',
        'measurement_frequency', 'per release', 'description', 'Production releases without rollback', 'sort_order', 1
      )),
      'roles', jsonb_build_array(
        jsonb_build_object('role_title', 'Release Manager', 'role_description', 'Owns go/no-go and deploy', 'is_key_role', true, 'sort_order', 1),
        jsonb_build_object('role_title', 'Product Owner', 'role_description', 'Confirms release scope', 'is_key_role', true, 'sort_order', 2)
      )
    )
  );

END $$;

DROP FUNCTION IF EXISTS admin._seed_project_template_v192(UUID, TEXT, TEXT, TEXT, TEXT, JSONB);

DO $$
DECLARE
  v_pmbok INT;
  v_str INT;
  v_agl INT;
BEGIN
  SELECT COUNT(*) INTO v_pmbok FROM admin.global_template_library
  WHERE domain = 'project_template' AND methodology = 'pmbok' AND record_status <> 'history';
  SELECT COUNT(*) INTO v_str FROM admin.global_template_library
  WHERE domain = 'project_template' AND methodology = 'structured' AND record_status <> 'history';
  SELECT COUNT(*) INTO v_agl FROM admin.global_template_library
  WHERE domain = 'project_template' AND methodology = 'agile' AND record_status <> 'history';
  RAISE NOTICE 'v192 project_template completeness: pmbok=%, structured=%, agile=%', v_pmbok, v_str, v_agl;
END $$;
