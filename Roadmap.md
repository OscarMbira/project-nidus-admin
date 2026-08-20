# Project Nidus - ROADMAP.md

> **Purpose:** This file is the primary execution roadmap and development-control document for Project Nidus.
> Claude, Cursor, and any other AI coding agent must read this file before planning or making changes.
> Update this file when a milestone, architectural decision, dependency, risk, or delivery status materially changes.

---

## 1. Product Vision

**Project Nidus** is an enterprise-grade Project Management Information System (PMIS) designed to support:

- Predictive / Waterfall project delivery
- Agile delivery
- Hybrid delivery
- Product-based planning
- Enterprise scheduling
- Visual collaboration
- AI-assisted project planning and analysis
- Risk, issue, assumption, dependency, decision, action, change, cost, quality, resource, testing, and governance management
- Executive dashboards and decision support
- Scenario planning and schedule-quality diagnostics
- End-to-end project traceability
- Evidence-based project assurance

The platform must be **governable, auditable, secure, configurable, scalable, maintainable, and suitable for complex enterprise programmes**.

---

## 2. Source-of-Truth Hierarchy

When requirements conflict, use this priority order:

1. Explicit current user instruction
2. Approved functional specification / acceptance criteria
3. Approved architecture / Architecture Decision Record (ADR)
4. `ROADMAP.md`
5. `REVIEW.md`
6. Existing database contracts and migrations
7. Existing tested application behaviour
8. Existing code patterns
9. AI assumptions

### Rule

**Never silently resolve a material conflict.**

Document:

- the conflict
- affected files/modules
- affected database objects, if any
- recommended resolution
- impact of the recommendation
- assumptions made

---

## 3. Technology Baseline

### Frontend

- React
- TypeScript
- Tailwind CSS

### Backend / Platform

- Supabase PostgreSQL
- Supabase Auth
- Row Level Security (RLS)
- Supabase Storage
- Supabase Edge Functions

### Testing

- Vitest
- React Testing Library
- Playwright
- PostgreSQL / pgTAP or equivalent SQL-level tests

### Architecture Principles

- Multi-tenant by design
- Organization isolation
- Role-based access control
- Least privilege
- Explicit RLS policies
- Migration-driven schema changes
- Strong auditability
- Reusable and configurable modules
- Service/API boundaries instead of uncontrolled UI-to-database coupling
- Traceability across lifecycle artefacts
- Human approval for high-impact AI-generated changes
- Small, reviewable implementation increments
- No hidden destructive behaviour

---

## 4. Non-Negotiable Engineering Rules

Claude/Cursor MUST follow these rules.

### 4.1 No Blind Coding

Before modifying code:

1. Identify the requirement.
2. Locate the affected feature/module.
3. Inspect related database objects.
4. Inspect related hooks/services/types.
5. Inspect existing tests.
6. Identify upstream/downstream dependencies.
7. Define acceptance criteria.
8. State the implementation approach.
9. Only then implement.

Do not create duplicate:

- components
- pages
- hooks
- services
- utilities
- database tables
- views
- functions
- policies
- types
- workflows

before searching for an existing equivalent.

---

### 4.2 No Uncontrolled Database Changes

Never:

- create production tables manually outside migrations
- rename/drop tables or columns without dependency analysis
- weaken RLS to make a feature work
- expose tenant data through generic unsafe queries
- use service-role credentials in browser code
- create public database objects without an explicit reason
- perform destructive migration steps without a recovery strategy
- bypass foreign keys merely to make inserts succeed
- silently delete or rewrite historical data

Every schema change must identify:

- migration file
- affected schemas/tables/views/functions/triggers
- RLS impact
- indexes
- foreign keys
- data migration/backfill requirement
- backward compatibility impact
- rollback/recovery approach
- test impact

---

### 4.3 Multi-Tenancy Is Mandatory

All tenant-owned records must be correctly scoped to the relevant organization and, where applicable, project.

Every data-access change must answer:

- How is `organization_id` determined?
- How is `project_id` validated?
- Can another organization access this record?
- Is authorization enforced server-side/database-side?
- Does RLS protect SELECT/INSERT/UPDATE/DELETE?
- Are joins tenant-safe?
- Could an IDOR-style request expose another tenant's data?
- Are storage objects tenant-isolated?
- Are Edge Functions verifying identity and tenant context?

Never rely only on frontend filtering for tenant isolation.

---

### 4.4 Auditability Is a Core Feature

Important business actions should be traceable.

Where relevant capture:

- who performed the action
- organization/project
- record/entity
- action
- previous value
- new value
- timestamp
- approval status
- source/action type
- supporting evidence/reference

Audit functionality must not be treated as optional UI decoration.

---

### 4.5 Human Approval for High-Risk Fixes

AI may diagnose and propose fixes.

AI must **not automatically apply high-impact changes** involving:

- destructive migrations
- production data repair
- authentication
- authorization
- RLS
- tenant isolation
- financial calculations
- approved baselines
- audit history
- bulk data operations
- irreversible actions
- security-sensitive secrets/configuration

For these changes, first produce:

1. finding
2. root cause
3. affected scope
4. proposed fix
5. risk
6. test plan
7. rollback/recovery plan

Then obtain human approval where the working environment supports approval.

---

## 5. Core Domain Model

The following entities represent the architectural direction and should be preserved unless deliberately redesigned.

### Identity and Tenant

- users
- organizations
- organization memberships
- roles
- permissions

### Project Core

- projects
- project members
- project phases / lifecycle stages
- project governance
- project metadata

### Product / Deliverable Structure

- products
- deliverables
- Product Breakdown Structure (PBS)
- Work Breakdown Structure (WBS)
- work packages
- milestones
- acceptance criteria

### Planning & Scheduling

Target capabilities include:

- WBS
- dependencies
- milestones
- Gantt
- Kanban
- calendars
- baselines
- resources
- critical scheduling information
- scenario planning
- schedule diagnostics

### Governance & Control

Target capabilities include:

- risks
- issues
- assumptions
- dependencies
- decisions
- changes
- approvals
- actions
- lessons learned
- quality controls
- costs/budgets
- resources
- reporting
- audit trail

### Requirements & Traceability

The platform should support lifecycle traceability such as:

`Requirement -> Product/Deliverable -> WBS/Work -> Design -> Build -> Test -> Defect -> Acceptance -> Change`

Traceability must be queryable and reportable, not merely implied through text fields.

---

## 6. PMIS Functional Coverage

Project Nidus should progressively cover the full project lifecycle.

### Initiating

- Business case / project justification
- Project charter
- Stakeholder identification
- High-level scope
- Initial risk
- Governance setup
- Project classification
- Methodology selection

### Planning

- Scope management
- Requirements
- PBS / deliverables
- WBS
- Schedule
- Dependencies
- Milestones
- Resources
- Budget / cost
- Risk
- Quality
- Communications
- Procurement
- Stakeholder engagement
- Change approach
- Testing strategy
- Implementation / cutover planning where applicable

### Executing

- Work management
- Assignments
- Collaboration
- Status updates
- Deliverable production
- Quality activities
- Procurement/vendor activity
- Stakeholder communications
- Team management

### Monitoring & Controlling

- Schedule performance
- Cost performance
- RAID
- Change control
- Quality
- Scope control
- Baselines
- Dependencies
- Actions
- Decisions
- Test progress
- Dashboards
- Forecasts
- Executive reporting

### Closing

- Formal acceptance
- Closure checklist
- Handover
- Lessons learned
- Benefits transition
- Archive
- Outstanding actions
- Closure report

### Agile / Hybrid

- Product backlog
- Epics/features/stories
- Sprint/iteration planning
- Kanban
- Velocity/throughput where relevant
- Retrospectives
- Release planning
- Hybrid linkage to governance, risks, milestones, budget, and reporting

---

## 7. Testing & Diagnostics Centre

Testing is a first-class PMIS module, not only a developer concern.

### Target Functional Components

- test modules
- test cases
- test suites
- environments
- test runs
- test results
- evidence
- defects
- audit logs
- traceability links
- diagnostics
- safe test orchestration
- generated fix recommendations/prompts

### Required Capabilities

- Predictive and Agile workflow support
- Positive and negative test cases
- Role-aware test execution
- Test evidence capture
- Defect linkage
- Requirement-to-test traceability
- Execution history
- Pass/fail/blocked status
- Environment identification
- Diagnostic classification
- Human approval before high-impact fixes

### Safety Rules

Never:

- execute arbitrary user-supplied code
- expose secrets
- run destructive tests against production
- allow test automation to bypass tenant isolation
- overwrite evidence/history
- auto-fix security-sensitive failures without review

---

## 8. Delivery Strategy

Development should be incremental.

Every implementation slice should be:

- small enough to review
- vertically useful
- testable
- traceable to a requirement
- compatible with existing architecture
- protected by appropriate authorization
- accompanied by relevant tests
- documented when it introduces a new pattern

Avoid large uncontrolled refactors mixed with feature delivery.

---

## 9. Roadmap Status Model

Use only:

- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `IN REVIEW`
- `DONE`
- `DEFERRED`

---

## 10. Roadmap Phases

### Phase 0 - Architecture & Repository Control

**Status:** IN PROGRESS

Objectives:

- establish source-of-truth documents
- control AI-assisted coding behaviour
- document architecture boundaries
- reduce duplicate patterns
- standardize migrations
- standardize RLS
- standardize testing expectations
- standardize error handling
- identify technical debt and schema sprawl
- establish review gates

Exit criteria:

- [ ] ROADMAP.md adopted
- [ ] REVIEW.md adopted
- [ ] architecture boundaries documented
- [ ] database migration rules documented
- [ ] RLS baseline reviewed
- [ ] repository structure reviewed
- [ ] duplicate/obsolete code strategy defined
- [ ] environment configuration documented
- [ ] CI test expectations defined

---

### Phase 1 - Identity, Organizations & Authorization

**Status:** IN PROGRESS

Scope:

- authentication
- user profile
- organizations
- organization membership
- roles
- permissions
- project membership
- tenant isolation
- RLS

Exit criteria:

- [ ] no cross-tenant reads
- [ ] no cross-tenant writes
- [ ] role permissions defined
- [ ] RLS tests exist
- [ ] privileged operations are server-side
- [ ] auth failure states handled
- [ ] audit events captured where required

---

### Phase 2 - Project Core & Lifecycle

**Status:** IN PROGRESS

Scope:

- project master
- methodology
- lifecycle/phases
- project status
- project team
- project metadata
- project governance
- lifecycle templates

Exit criteria:

- [ ] project CRUD is tenant-safe
- [ ] lifecycle configuration works
- [ ] Predictive/Agile/Hybrid classification supported
- [ ] permissions tested
- [ ] audit history available
- [ ] validation rules implemented

---

### Phase 3 - Planning Engine

**Status:** IN PROGRESS

Scope:

- Product Breakdown Structure
- WBS
- milestones
- dependencies
- schedule
- calendar
- baselines
- resources
- planning assumptions
- Gantt/Kanban/calendar views
- scenario planning
- schedule-quality diagnostics

Exit criteria:

- [ ] planning model has a clear canonical data source
- [ ] dependency logic validated
- [ ] baseline behaviour defined
- [ ] date calculation edge cases tested
- [ ] views show consistent data
- [ ] scenario changes do not corrupt approved baseline
- [ ] schedule diagnostics are explainable

---

### Phase 4 - Governance, RAID & Change Control

**Status:** NOT STARTED

Scope:

- risks
- assumptions
- issues
- dependencies
- decisions
- actions
- changes
- approvals
- escalation
- governance forums

Exit criteria:

- [ ] workflows defined
- [ ] owner/accountability model defined
- [ ] due dates/status rules defined
- [ ] approval history immutable where required
- [ ] change links to affected scope/schedule/cost
- [ ] dashboards surface overdue/high-priority items

---

### Phase 5 - Cost, Resource & Performance Management

**Status:** NOT STARTED

Scope:

- budgets
- actuals
- forecasts
- resource demand
- assignments
- capacity
- variance
- performance indicators

Exit criteria:

- [ ] currency/precision rules defined
- [ ] financial calculations tested
- [ ] baseline vs current forecast distinguished
- [ ] permissions protect sensitive financial data
- [ ] resource allocation conflicts detectable

---

### Phase 6 - Testing & Diagnostics Centre

**Status:** IN PROGRESS

Scope:

- testing repository
- suites
- environments
- runs/results
- evidence
- defects
- traceability
- diagnostic classification
- safe automation integration
- AI-generated fix recommendations

Exit criteria:

- [ ] test repository works end-to-end
- [ ] evidence upload secured
- [ ] defect linkage implemented
- [ ] requirement/test traceability implemented
- [ ] role-aware test execution enforced
- [ ] production-destructive testing blocked
- [ ] secrets masked
- [ ] review-before-fix workflow implemented

---

### Phase 7 - Dashboards, Reporting & Executive Decision Support

**Status:** NOT STARTED

Scope:

- project dashboards
- portfolio dashboards
- executive summaries
- milestone health
- RAID
- schedule/cost
- test status
- change impact
- trend reporting
- exports

Exit criteria:

- [ ] metrics have documented definitions
- [ ] dashboards use authoritative data
- [ ] metrics reconcile with source records
- [ ] filters preserve tenant isolation
- [ ] reports are exportable where required
- [ ] no misleading derived metrics

---

### Phase 8 - Integrations & Notifications

**Status:** IN PROGRESS

Scope may include:

- email integration
- notifications
- external APIs
- imports/exports
- webhooks
- enterprise integration points

Exit criteria:

- [ ] secrets remain server-side
- [ ] retry/idempotency strategy exists
- [ ] failures observable
- [ ] user permissions respected
- [ ] inbound data validated
- [ ] external side effects auditable

---

### Phase 9 - Enterprise Hardening

**Status:** NOT STARTED

Scope:

- security review
- performance
- accessibility
- resilience
- observability
- backup/recovery validation
- data retention
- auditability
- deployment controls
- operational documentation

Exit criteria:

- [ ] critical security findings resolved
- [ ] performance baseline established
- [ ] accessibility review completed
- [ ] error telemetry sufficient
- [ ] recovery procedures validated
- [ ] release process documented
- [ ] production readiness review passed

---

## 11. Current Priority Order

Unless the user explicitly reprioritizes, prefer:

1. Security / tenant isolation / RLS defects
2. Data integrity defects
3. Broken core workflows
4. Regression defects
5. Architecture debt that blocks safe delivery
6. In-progress PMIS modules
7. Usability/accessibility issues
8. Performance improvements
9. New enhancements
10. Cosmetic refinements

---

## 12. AI Coding Workflow

For every non-trivial task, Claude/Cursor should use this sequence.

### Step A - Understand

Return:

- objective
- acceptance criteria
- affected modules
- likely database impact
- risks
- assumptions

### Step B - Inspect

Search before editing:

- related components
- routes/pages
- hooks
- services
- types
- database schema
- migrations
- RLS policies
- Edge Functions
- storage policies
- tests
- shared utilities

### Step C - Plan

Produce a concise implementation plan.

Prefer:

- smallest safe change
- reuse over duplication
- migration over ad-hoc schema edits
- explicit types
- explicit errors
- tests alongside implementation

### Step D - Implement

During implementation:

- preserve existing behaviour unless change is intentional
- do not suppress type errors
- do not disable lint rules just to pass
- do not use `any` as an unexplained escape hatch
- do not swallow exceptions
- do not weaken auth/RLS
- do not hard-code environment-specific secrets
- do not mix unrelated refactors
- do not silently alter approved business rules

### Step E - Validate

Run or identify relevant:

- TypeScript checks
- lint
- unit tests
- integration tests
- SQL/RLS tests
- Playwright/E2E tests
- build
- targeted manual verification

### Step F - Review

Apply `REVIEW.md`.

### Step G - Report

Provide:

- files changed
- database changes
- tests added/updated
- tests executed
- result
- unresolved risks
- follow-up work
- whether ROADMAP.md requires an update

---

## 13. Definition of Ready

A task is ready for implementation when reasonably known:

- problem statement
- expected behaviour
- target users/roles
- acceptance criteria
- affected module
- data requirements
- authorization expectations
- dependencies
- error/empty/loading states
- test expectation

If information is incomplete, AI should make conservative assumptions and clearly label them rather than inventing business rules.

---

## 14. Definition of Done

A task is not DONE merely because the UI appears to work.

DONE requires, where applicable:

- [ ] requirement satisfied
- [ ] acceptance criteria met
- [ ] TypeScript valid
- [ ] relevant tests pass
- [ ] data model correct
- [ ] RLS/security checked
- [ ] tenant isolation checked
- [ ] validation implemented
- [ ] error state implemented
- [ ] empty/loading states implemented
- [ ] auditability considered
- [ ] traceability considered
- [ ] accessibility considered
- [ ] no obvious regression
- [ ] no duplicate implementation introduced
- [ ] documentation updated
- [ ] ROADMAP status updated when material
- [ ] REVIEW.md gate passed

---

## 15. Technical Debt Register

| ID | Area | Problem | Severity | Impact | Proposed Action | Status |
|---|---|---|---|---|---|---|
| TD-001 | Database | Schema/table sprawl and insufficient logical separation | High | Maintainability, security, migrations | Consolidate architecture and move objects into intentional schemas where appropriate | OPEN |
| TD-002 | Security | RLS consistency requires continuous verification | Critical | Cross-tenant exposure risk | Establish standard policy patterns and automated RLS tests | OPEN |
| TD-003 | Architecture | Risk of duplicated AI-generated components/services | High | Divergent behaviour and maintenance cost | Mandatory repository search/reuse before creation | OPEN |
| TD-004 | Testing | Regression risk as PMIS module count grows | High | Broken workflows | Strengthen unit/integration/E2E coverage by domain | OPEN |
| TD-005 | Traceability | Lifecycle artefact links may become inconsistent across modules | High | Governance/reporting integrity | Define canonical traceability model | OPEN |

Add new debt items; do not silently delete historical items. Mark resolved items `CLOSED`.

---

## 16. Decision Log

| Date | ID | Decision | Reason | Impact |
|---|---|---|---|---|
| YYYY-MM-DD | ADR-001 | Example: All tenant-owned records require database-enforced isolation | Prevent cross-organization leakage | Data model, RLS, tests |

For detailed decisions, create an ADR and reference it here.

---

## 17. Engineering Risk Register

| ID | Risk | Impact | Control |
|---|---|---|---|
| ENG-R01 | Cross-tenant data exposure | Critical | RLS + authorization tests |
| ENG-R02 | AI-generated duplicate architecture | High | Inspect-before-create rule |
| ENG-R03 | Destructive schema migration | Critical | migration review + recovery plan |
| ENG-R04 | Regression across interconnected PMIS modules | High | automated tests + targeted E2E |
| ENG-R05 | Inconsistent business rules | High | central services/domain rules + tests |
| ENG-R06 | Audit gaps | High | explicit audit requirements |
| ENG-R07 | Secret leakage | Critical | server-only secrets + masking |
| ENG-R08 | Incorrect executive metrics | High | documented metric definitions + reconciliation |
| ENG-R09 | Traceability breakage | High | referential integrity + lifecycle tests |
| ENG-R10 | AI applies risky fix without approval | High | review-before-fix gate |

---

## 18. Roadmap Update Protocol

After completing a significant task:

1. Update relevant phase status if appropriate.
2. Tick only genuinely completed exit criteria.
3. Add new technical debt discovered.
4. Add new engineering risks discovered.
5. Record material decisions.
6. Do not rewrite historical decisions merely to make the roadmap look cleaner.
7. Do not mark a phase DONE while critical exit criteria remain open.

---

## 19. Cursor / Claude Session Starter

Use this prompt at the beginning of a substantial coding session:

> Read `ROADMAP.md` and `REVIEW.md` before making changes.
> Identify the relevant roadmap phase, affected architecture, database/RLS implications, existing implementation, and tests.
> Do not create duplicate patterns.
> Do not weaken security or tenant isolation.
> Make the smallest safe change that satisfies the acceptance criteria.
> After implementation, run the applicable review gates from `REVIEW.md` and report evidence, remaining risks, and whether `ROADMAP.md` needs updating.

---

## 20. Guiding Principle

> **Project Nidus must optimize for trusted project information, governed delivery, traceability, and safe change - not merely rapid feature generation.**

A feature that works but compromises security, tenant isolation, auditability, data integrity, traceability, maintainability, or testability is not complete.
