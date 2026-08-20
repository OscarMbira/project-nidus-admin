-- =============================================================================
-- v165b: Seed Global Template — Project Charter Core Fields (guidance + samples)
-- Idempotent fixed UUID. Domain=fields. Publish via Admin UI when ready.
-- Prerequisites: v160, v165
-- Companion Platform samples: monorepo SQL/v770b (form_template_field_defaults)
-- =============================================================================

-- Fixed template id (hex-only UUID)
-- a1650000-1111-4000-8000-000000000001

WITH seeded AS (
    SELECT
        'a1650000-1111-4000-8000-000000000001'::uuid AS id,
        'fields'::text AS domain,
        'international best practice'::text AS category,
        'Project Charter Core Fields'::text AS name,
        $d$
Canonical initiating fields aligned with Project Charter (F001).
Each field includes guidance (instructions) and a Digital Workplace Platform sample default.
Customise after publish in Platform / Simulator or before publish in this library.
$d$::text AS description,
        $p$[
  {
    "field_code": "purpose",
    "label": "Purpose & Justification",
    "field_type": "long_text",
    "required": true,
    "display_order": 1,
    "guidance_text": "Summarise why this project exists and the business problem or opportunity it addresses. Include the strategic alignment statement and the expected organisational benefit.",
    "default_value": "The organisation will implement a unified Digital Workplace Platform to replace fragmented collaboration tools, reduce shadow IT, and improve hybrid-team productivity. This initiative supports the strategic objective of modernising core ways of working and enabling consistent delivery across business units."
  },
  {
    "field_code": "objectives",
    "label": "Objectives",
    "field_type": "long_text",
    "required": true,
    "display_order": 2,
    "guidance_text": "List measurable project objectives (SMART).",
    "default_value": "1. Deploy the Digital Workplace Platform to 2,500 users by 30 June 2027.\n2. Retire three legacy collaboration tools within 90 days of go-live.\n3. Achieve ≥80% monthly active usage among licensed users within six months of go-live.\n4. Reduce average time-to-find shared information by 25% (baseline survey vs post-implementation)."
  },
  {
    "field_code": "success_criteria",
    "label": "Success Criteria",
    "field_type": "long_text",
    "required": true,
    "display_order": 3,
    "guidance_text": "Define how success will be judged at project close.",
    "default_value": "- Platform accepted by Business Owner and IT Operations against agreed UAT criteria\n- Migration of priority document libraries and teams completed with <2% critical defect reopen rate\n- Benefits realisation plan approved; first benefit checkpoint scheduled within 30 days of close\n- Final cost and schedule within ±10% of approved baseline (or formally change-controlled)"
  },
  {
    "field_code": "sponsor",
    "label": "Sponsor",
    "field_type": "text",
    "required": true,
    "display_order": 4,
    "guidance_text": "Name the executive sponsor and role.",
    "default_value": "Amina Okonkwo — Chief Operating Officer (Executive Sponsor)"
  },
  {
    "field_code": "high_level_requirements",
    "label": "High-Level Requirements",
    "field_type": "long_text",
    "required": false,
    "display_order": 5,
    "guidance_text": "Capture high-level must-have requirements that justify initiating the project. Defer detail to Requirements Documentation (F010).",
    "default_value": "1. Single sign-on via corporate identity provider for all licensed users\n2. Secure file sharing and co-authoring with external partner guest access controls\n3. Mobile access for iOS and Android with offline read for priority content\n4. Retention, audit, and eDiscovery controls aligned to Information Governance policy\n5. Integration with HR directory for joiner/mover/leaver provisioning"
  },
  {
    "field_code": "high_level_risks",
    "label": "High-Level Risks",
    "field_type": "long_text",
    "required": false,
    "display_order": 6,
    "guidance_text": "Identify top initiation risks; detail in the Risk Register (F038).",
    "default_value": "1. Low user adoption if change management is under-resourced — Owner: Change Lead; Response: structured adoption plan and champions network\n2. Data migration quality gaps from legacy tools — Owner: Data Lead; Response: pilot migration and rollback criteria\n3. Vendor roadmap delays for required security controls — Owner: IT Security; Response: contractual milestones and alternate control design\n4. Concurrent major programmes competing for the same SMEs — Owner: PMO; Response: resource calendar and escalation path"
  },
  {
    "field_code": "summary_budget",
    "label": "Summary Budget",
    "field_type": "number",
    "required": false,
    "display_order": 7,
    "guidance_text": "Enter the approved high-level budget envelope (currency as used by the organisation).",
    "default_value": 1850000
  },
  {
    "field_code": "milestone_schedule",
    "label": "Milestone Schedule",
    "field_type": "long_text",
    "required": false,
    "display_order": 8,
    "guidance_text": "List key initiation and early delivery milestones.",
    "default_value": "- Charter approved — 15 Aug 2026\n- Kick-off complete — 01 Sep 2026\n- Requirements baseline authorised — 15 Oct 2026\n- Pilot go-live (250 users) — 01 Feb 2027\n- Organisation-wide go-live — 30 Jun 2027"
  },
  {
    "field_code": "pm_authority_level",
    "label": "Project Manager Authority Level",
    "field_type": "dropdown",
    "required": false,
    "display_order": 9,
    "guidance_text": "Select the authority level granted to the project manager.",
    "default_value": "medium",
    "validation_rules": {
      "options": [
        {"value": "low", "label": "Low"},
        {"value": "medium", "label": "Medium"},
        {"value": "high", "label": "High"}
      ]
    }
  },
  {
    "field_code": "assumptions",
    "label": "Assumptions",
    "field_type": "long_text",
    "required": false,
    "display_order": 10,
    "guidance_text": "Document assumptions that, if proven false, may impact scope, cost, or schedule. Track detail in Assumption Log (F002).",
    "default_value": "1. Corporate identity provider and licensing agreements will be available before build starts\n2. Business units will release subject-matter experts for workshops on the agreed cadence\n3. Existing network capacity is sufficient for expected concurrent collaboration load\n4. No major regulatory change will force redesign of retention controls during delivery"
  },
  {
    "field_code": "constraints",
    "label": "Constraints",
    "field_type": "long_text",
    "required": false,
    "display_order": 11,
    "guidance_text": "List known constraints (budget, dates, regulatory, resource, technology).",
    "default_value": "1. Approved capital envelope must not exceed the authorised business-case amount without Change Control Board approval\n2. Organisation-wide go-live must complete before the legacy licence renewal date (30 Sep 2027)\n3. Solution must remain within the approved technology standards catalogue\n4. Core delivery team capped at 12 FTEs unless portfolio board authorises uplift"
  },
  {
    "field_code": "business_case_summary",
    "label": "Business Case Summary",
    "field_type": "long_text",
    "required": false,
    "display_order": 12,
    "guidance_text": "Provide a short business-case summary: options considered, preferred option, and expected value.",
    "default_value": "Options considered: (A) retain and integrate legacy tools, (B) best-of-breed point solutions, (C) unified Digital Workplace Platform. Preferred option C delivers the highest NPV through licence consolidation, reduced support effort, and productivity gains. Expected value: approx. USD 2.4m benefit over 3 years versus USD 1.85m investment, with payback inside 28 months."
  }
]$p$::jsonb AS payload
)
INSERT INTO admin.global_template_library (
    id, domain, category, name, description, payload,
    record_status, record_version, created_at, updated_at
)
SELECT
    s.id, s.domain, s.category, s.name, s.description, s.payload,
    'live', 1, NOW(), NOW()
FROM seeded s
ON CONFLICT (id) DO UPDATE SET
    domain = EXCLUDED.domain,
    category = EXCLUDED.category,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    payload = EXCLUDED.payload,
    record_status = COALESCE(admin.global_template_library.record_status, 'live'),
    updated_at = NOW();

INSERT INTO admin.global_template_versions (
    template_id, version_number, snapshot, change_description, changed_at
)
SELECT
    'a1650000-1111-4000-8000-000000000001'::uuid,
    1,
    jsonb_build_object(
        'domain', t.domain,
        'name', t.name,
        'description', t.description,
        'category', t.category,
        'payload', t.payload
    ),
    'v165b seed — Project Charter Core Fields (guidance + sample defaults)',
    NOW()
FROM admin.global_template_library t
WHERE t.id = 'a1650000-1111-4000-8000-000000000001'::uuid
ON CONFLICT (template_id, version_number) DO UPDATE SET
    snapshot = EXCLUDED.snapshot,
    change_description = EXCLUDED.change_description,
    changed_at = NOW();

DO $$
BEGIN
  RAISE NOTICE 'v165b_global_template_charter_fields_seed.sql applied (template a1650000-1111-4000-8000-000000000001)';
END $$;
