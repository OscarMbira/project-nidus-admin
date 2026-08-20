# Project Nidus - REVIEW.md

> **Purpose:** This file defines the mandatory review standard for changes to Project Nidus.
> Claude, Cursor, and human reviewers should use it after implementation and before accepting a change.
>
> A review is an evidence-based verification activity, not a request to praise the code.

---

## 1. Review Philosophy

Review for:

- correctness
- completeness
- security
- tenant isolation
- data integrity
- architecture consistency
- business-rule correctness
- regression risk
- usability
- accessibility
- performance
- testability
- maintainability
- auditability
- traceability
- operational safety

Do not assume code is correct because:

- it compiles
- the UI renders
- one happy-path test passes
- the AI generated it
- an existing pattern uses the same approach

---

## 2. Mandatory Reviewer Behaviour

The reviewer MUST:

1. Read the requirement and acceptance criteria.
2. Read relevant sections of `ROADMAP.md`.
3. Inspect the actual changed files.
4. Inspect related code not changed by the implementation.
5. Check database/RLS implications.
6. Check relevant tests.
7. Identify regressions and edge cases.
8. Classify findings by severity.
9. Provide file/location evidence where possible.
10. Separate confirmed defects from suggestions.
11. State what was not verified.
12. Block unsafe changes rather than rationalizing them.

The reviewer MUST NOT:

- invent defects without evidence
- mark security issues as cosmetic
- focus only on formatting
- silently fix high-risk issues during review
- weaken tests to make a change pass
- approve untested high-risk database/security changes

---

## 3. Review Severity Model

### CRITICAL

Could cause:

- cross-tenant data exposure
- unauthorized privilege escalation
- secret leakage
- destructive/corrupt production data changes
- authentication bypass
- material financial/data integrity error
- unrecoverable loss of audit evidence

**Decision:** BLOCK

### HIGH

Could cause:

- broken core workflow
- incorrect project/control data
- major regression
- incorrect authorization
- traceability failure
- major reporting error
- unsafe migration
- severe performance issue

**Decision:** BLOCK unless explicitly accepted by the owner.

### MEDIUM

Could cause:

- edge-case functional failure
- inconsistent UX
- maintainability problem
- missing validation
- insufficient tests
- accessibility issue
- recoverable error-handling weakness

**Decision:** FIX or explicitly accept.

### LOW

Examples:

- naming clarity
- minor refactor
- non-blocking UI polish
- documentation improvement

**Decision:** May follow later.

---

## 4. Overall Review Decision

Use one of:

### PASS

No unresolved Critical or High findings. Required tests and controls are satisfactory.

### PASS WITH CONDITIONS

No unresolved Critical findings. Any remaining findings are explicitly documented, accepted, and have a follow-up action.

### BLOCK

One or more Critical/High issues exist, required validation is missing, or the reviewer cannot establish that the change is safe.

---

## 5. Required Review Output

Every substantial review should use this structure:

### Review Summary

- **Change reviewed:**
- **Requirement / ticket:**
- **Roadmap phase:**
- **Overall decision:** PASS / PASS WITH CONDITIONS / BLOCK
- **Highest severity:**
- **Regression risk:** LOW / MEDIUM / HIGH
- **Database impact:** NONE / LOW / MEDIUM / HIGH
- **Security impact:** NONE / LOW / MEDIUM / HIGH

### Findings

For each finding:

**[SEVERITY] Finding title**

- **Evidence:** file/function/table/policy/test
- **Problem:**
- **Why it matters:**
- **Likely impact:**
- **Recommended fix:**
- **Test required:**

### Validation Performed

- type check:
- lint:
- unit tests:
- integration tests:
- database/RLS tests:
- E2E:
- build:
- manual checks:

### Not Verified

List anything that could not be verified.

### Remaining Risks

List unresolved risks.

### Final Decision

State exactly why the change can or cannot be accepted.

---

## 6. Requirement & Functional Review

Check:

- [ ] implementation matches the actual requirement
- [ ] acceptance criteria are satisfied
- [ ] happy path works
- [ ] negative path works
- [ ] edge cases considered
- [ ] invalid input handled
- [ ] duplicate submissions handled where relevant
- [ ] loading state handled
- [ ] empty state handled
- [ ] error state handled
- [ ] permissions affect behaviour correctly
- [ ] workflow status transitions are valid
- [ ] read-only states are respected
- [ ] archived/closed records behave correctly
- [ ] related dashboards/reports remain consistent

Ask:

> Could a user complete the intended PMIS process from beginning to end without manually repairing data?

---

## 7. PMIS Domain Review

Project Nidus is not generic CRUD software.

Check whether the change preserves project-management meaning.

### 7.1 Lifecycle

- [ ] correct lifecycle/methodology behaviour
- [ ] Predictive/Agile/Hybrid distinctions respected
- [ ] lifecycle state transitions valid
- [ ] closed/approved phases cannot be altered incorrectly

### 7.2 Scope / Products / WBS

- [ ] parent-child relationships valid
- [ ] no orphan hierarchy items
- [ ] acceptance criteria preserved
- [ ] progress rules consistent
- [ ] status roll-up rules are correct
- [ ] deletion does not orphan dependent records

### 7.3 Schedule

- [ ] dependency direction correct
- [ ] milestone behaviour correct
- [ ] date validation correct
- [ ] baseline not silently overwritten
- [ ] actual vs planned dates distinguished
- [ ] recalculation does not corrupt approved data
- [ ] scenario planning remains isolated from approved baseline
- [ ] circular dependencies are prevented/detected
- [ ] invalid date ranges are handled
- [ ] timezone/date-only semantics are deliberate

### 7.4 RAID

- [ ] owner and due date rules valid
- [ ] severity/probability/impact logic valid
- [ ] closure requires appropriate information
- [ ] escalations traceable
- [ ] relationships to actions/decisions/changes preserved
- [ ] overdue/high-priority logic is correct

### 7.5 Change Control

- [ ] requested vs approved change distinguished
- [ ] approval status auditable
- [ ] impact recorded
- [ ] affected scope/schedule/cost links preserved
- [ ] approved baseline changes controlled
- [ ] rejected changes cannot alter approved data

### 7.6 Cost

- [ ] precision/currency correct
- [ ] negative/zero values handled intentionally
- [ ] actual/budget/forecast definitions not mixed
- [ ] totals reconcile
- [ ] rounding rules consistent
- [ ] sensitive financial information is permission-protected

### 7.7 Resources

- [ ] assignment belongs to correct project/resource
- [ ] capacity rules are correct
- [ ] allocation percentages/hours are validated
- [ ] overlapping assignments are handled deliberately
- [ ] confidential resource information is protected

### 7.8 Testing

- [ ] test case belongs to correct project/module
- [ ] execution belongs to correct environment
- [ ] execution history preserved
- [ ] evidence cannot be overwritten incorrectly
- [ ] defect linkage is correct
- [ ] requirement/test traceability maintained
- [ ] role-aware execution enforced
- [ ] test results cannot be falsified through frontend-only controls

### 7.9 Reporting

- [ ] metric definition is explicit
- [ ] aggregation is correct
- [ ] filters are tenant-safe
- [ ] dashboard value reconciles to source data
- [ ] no misleading denominator/date range
- [ ] stale/cached data behaviour is acceptable

---

## 8. Multi-Tenant Security Review - MANDATORY

Every change touching data access must answer all applicable questions.

### Authentication

- [ ] unauthenticated users are rejected where required
- [ ] expired/invalid sessions handled
- [ ] privileged operations do not trust client claims blindly

### Authorization

- [ ] role checked at authoritative layer
- [ ] project membership checked
- [ ] organization membership checked
- [ ] role escalation is impossible through payload manipulation

### RLS

For every affected table:

- [ ] SELECT policy reviewed
- [ ] INSERT policy reviewed
- [ ] UPDATE policy reviewed
- [ ] DELETE policy reviewed
- [ ] `WITH CHECK` rules correct where required
- [ ] joins/subqueries cannot cross tenant boundaries
- [ ] privileged policies are intentionally scoped
- [ ] RLS is enabled
- [ ] policy relies on trustworthy identity/relationship data

### Storage

- [ ] bucket access is appropriate
- [ ] path structure scopes files correctly
- [ ] signed/public URLs used intentionally
- [ ] another tenant cannot guess/access object paths
- [ ] metadata does not expose sensitive information

### Edge Functions / Server Code

- [ ] JWT/session validated
- [ ] organization context validated
- [ ] project access validated
- [ ] service-role usage minimized
- [ ] untrusted input validated
- [ ] secrets never returned to client/logs
- [ ] errors do not expose sensitive internals

### Adversarial Tenant Tests

Attempt where applicable:

- access another organization's record by ID
- update another organization's record
- delete another organization's record
- insert using another `organization_id`
- access another project's storage object
- call privileged endpoint as ordinary user
- manipulate role/tenant IDs in request payload

Any successful cross-tenant access is **CRITICAL**.

---

## 9. Database Review - MANDATORY FOR SCHEMA/DATA CHANGES

### Schema

- [ ] migration exists
- [ ] migration naming/order correct
- [ ] schema placement intentional
- [ ] column types appropriate
- [ ] NULL behaviour intentional
- [ ] defaults safe
- [ ] constraints correct
- [ ] foreign keys correct
- [ ] cascade behaviour intentional
- [ ] indexes support expected access patterns
- [ ] duplicate data prevented where required

### Migration Safety

- [ ] migration is safe against existing data
- [ ] destructive operations identified
- [ ] backfill strategy exists where required
- [ ] large-table locks considered
- [ ] deployment ordering considered
- [ ] rollback/recovery strategy documented
- [ ] application compatibility during migration considered

### Functions / Triggers

- [ ] security definer/invoker choice intentional
- [ ] `search_path` safety considered
- [ ] trigger recursion impossible
- [ ] trigger side effects documented
- [ ] errors do not silently corrupt state
- [ ] tenant context preserved

### Data Integrity

- [ ] referential integrity holds
- [ ] duplicate logical records prevented
- [ ] approved historical records preserved
- [ ] audit records preserved
- [ ] timestamps generated consistently
- [ ] soft-delete/archive rules respected

---

## 10. React / TypeScript Review

### Types

- [ ] no unexplained `any`
- [ ] no unsafe casts used merely to silence errors
- [ ] database types aligned with schema
- [ ] null/undefined states handled
- [ ] discriminated states used where useful

### Components

- [ ] component has a clear responsibility
- [ ] no duplicate existing component
- [ ] props are minimal and typed
- [ ] business rules are not unnecessarily embedded in presentation code
- [ ] large components are split when justified, not mechanically

### Hooks / State

- [ ] hook dependencies correct
- [ ] no stale closures
- [ ] loading/error/data states coherent
- [ ] no unnecessary duplicate source of truth
- [ ] optimistic updates have failure recovery
- [ ] caches invalidated correctly after mutation

### Data Fetching

- [ ] queries request only required data
- [ ] tenant restrictions are authoritative
- [ ] query keys/cache scope include relevant project/organization context
- [ ] race conditions considered
- [ ] cancellation/unmount behaviour safe where relevant

---

## 11. UX & Accessibility Review

Check:

- [ ] controls have understandable labels
- [ ] keyboard interaction works where required
- [ ] focus is managed correctly in dialogs/forms
- [ ] forms show validation near the problem
- [ ] errors are actionable
- [ ] disabled/read-only states are visually and functionally correct
- [ ] loading state avoids duplicate actions
- [ ] destructive actions require deliberate confirmation
- [ ] sufficient semantic HTML used
- [ ] tables are understandable
- [ ] status is not communicated by colour alone
- [ ] responsive layout remains usable
- [ ] long text/data does not break layout

---

## 12. Error Handling Review

Check:

- [ ] errors are not swallowed
- [ ] expected business errors are distinguished from system errors
- [ ] user sees safe actionable feedback
- [ ] logs contain useful context without secrets
- [ ] retry behaviour is bounded
- [ ] failed partial operations do not leave corrupt state
- [ ] network failures handled
- [ ] Supabase errors are mapped appropriately
- [ ] unauthorized/forbidden/not-found states are distinguished where useful

---

## 13. Performance Review

Review when relevant:

- [ ] no obvious N+1 query pattern
- [ ] no uncontrolled full-table fetch
- [ ] large lists paginated/virtualized where needed
- [ ] expensive derived calculations controlled
- [ ] database indexes support high-frequency filters/joins
- [ ] dashboard queries avoid unnecessary repetition
- [ ] React renders are not pathologically repeated
- [ ] expensive effects/memos are justified
- [ ] large file uploads have limits/feedback

Performance optimizations must not weaken security or correctness.

---

## 14. Audit & Traceability Review

Where applicable:

- [ ] material action creates audit evidence
- [ ] actor is trustworthy
- [ ] timestamp is trustworthy
- [ ] old/new values captured when required
- [ ] audit history cannot be casually edited/deleted
- [ ] lifecycle artefact links remain valid
- [ ] requirement-to-deliverable-to-test linkage preserved
- [ ] changes/approvals can be reconstructed historically

Ask:

> Can an auditor or project assurance reviewer reconstruct what changed, who changed it, why, and what was affected?

---

## 15. Testing Review

Do not accept tests merely because they exist.

### Unit Tests

- [ ] meaningful business logic covered
- [ ] boundary conditions covered
- [ ] failure cases covered
- [ ] tests assert outcomes, not implementation trivia

### Integration Tests

- [ ] service/database interactions covered where material
- [ ] authorization behaviour covered
- [ ] state transitions covered
- [ ] failure rollback/recovery covered where applicable

### RLS / SQL Tests

For tenant-owned data, include tests such as:

- [ ] tenant A can access tenant A data
- [ ] tenant A cannot access tenant B data
- [ ] unauthorized insert fails
- [ ] unauthorized update fails
- [ ] unauthorized delete fails
- [ ] privileged role behaves only as intended

### E2E / Playwright

Use for critical journeys such as:

- create/open project
- planning updates
- RAID workflows
- change approval
- testing workflow
- dashboard reconciliation
- role/permission behaviour

### Regression Tests

When fixing a defect:

- [ ] add a test that fails before the fix where feasible
- [ ] prove the fix
- [ ] keep the regression test

---

## 16. Test Evidence Standard

A reviewer should not say "tests pass" without evidence.

Preferred report:

```text
TypeScript: PASS
Lint: PASS
Unit: 184 passed / 0 failed
Integration: 32 passed / 0 failed
RLS: 27 passed / 0 failed
Playwright: 18 passed / 0 failed
Build: PASS
Manual: Project create/edit/archive verified for Admin and PM roles
```

If something was not run:

```text
Playwright: NOT RUN - environment unavailable
Risk: Critical project creation workflow was not E2E validated.
```

Do not convert "not run" into "pass".

---

## 17. Regression Blast-Radius Review

Before approving, identify affected neighbours.

Review:

- direct feature
- shared component
- shared service
- shared type
- database objects
- RLS policies
- dashboards/reports
- notifications
- audit logging
- imports/exports
- integrations
- other methodologies/workflows
- other roles

Ask:

> What else consumes the thing that changed?

A locally correct change with an unreviewed broad blast radius may still require `BLOCK`.

---

## 18. AI-Generated Code Smell Review

Actively search for:

- duplicate components with slightly different names
- placeholder TODOs left in production paths
- fabricated APIs/tables/columns
- unused abstractions
- unnecessary wrappers
- broad `try/catch` that hides errors
- `any` proliferation
- hard-coded IDs
- hard-coded tenant/user values
- fake fallback data
- silent default permissions
- disabled RLS/lint/type checks
- comments claiming safety without tests
- enormous changes unrelated to the requirement
- generated code that bypasses established services

Treat AI output as untrusted until verified.

---

## 19. Destructive Change Gate

If a change includes any of the following:

- DROP
- TRUNCATE
- bulk DELETE
- irreversible UPDATE
- column/table rename
- data-type narrowing
- RLS removal
- permission expansion
- storage policy broadening
- approved baseline rewrite
- audit-history modification

the reviewer must require:

- [ ] explicit purpose
- [ ] affected-row/object estimate where practical
- [ ] backup/recovery strategy
- [ ] migration compatibility analysis
- [ ] test plan
- [ ] human approval

No approval means **BLOCK**.

---

## 20. Security Secret Review

Check repository and changed files for:

- service-role keys
- passwords
- API secrets
- private tokens
- production credentials
- signed URLs with long-lived credentials
- sensitive `.env` content
- secrets included in logs/errors

If an actual secret is committed/exposed:

1. classify as CRITICAL
2. remove from code/history where appropriate
3. rotate/revoke the secret
4. inspect logs/build artefacts
5. add preventative controls

Deleting the visible line alone is not sufficient.

---

## 21. Review Before Fix Protocol

When Claude/Cursor is asked to "review and fix":

1. Review first.
2. List findings.
3. Classify severity.
4. Identify root cause.
5. Propose the fix.
6. Separate safe fixes from high-risk fixes.
7. Apply only authorized/safe fixes.
8. Run validation.
9. Re-review changed areas.
10. Report remaining findings.

Do not use "review and fix" as permission for uncontrolled redesign.

---

## 22. Review Modes

### QUICK REVIEW

For small low-risk UI/code changes.

Must still cover:

- requirement
- regression
- types
- obvious security
- tests

### STANDARD REVIEW

Default for normal features.

Covers all relevant sections of this file.

### DEEP REVIEW

Required for:

- authentication
- authorization
- RLS
- organization/project isolation
- migrations
- audit
- scheduling calculations
- financial calculations
- bulk updates
- testing/diagnostics engine
- integrations
- major refactors

### RELEASE REVIEW

Required before production release.

Includes:

- deep review of high-risk areas
- full automated test suite
- migration review
- security review
- environment/config review
- observability review
- rollback/recovery readiness
- critical user journey E2E
- known-risk acceptance

---

## 23. Release Gate

A production release should be blocked if:

- any unresolved CRITICAL finding exists
- unaccepted HIGH findings exist
- required migrations are unsafe/unreviewed
- RLS/security changes lack tests
- tenant-isolation tests fail
- core build fails
- critical E2E journey fails
- production secrets/config are invalid
- data recovery/rollback is required but undefined

---

## 24. Claude / Cursor Review Prompt

Use this after a coding task:

> Review the completed change against `ROADMAP.md` and `REVIEW.md`.
> Do not assume the implementation is correct.
> Inspect the requirement, changed files, related dependencies, database objects, migrations, RLS, authorization, tests, audit/traceability impact, and regression blast radius.
> Classify findings as CRITICAL/HIGH/MEDIUM/LOW and cite concrete evidence.
> Run or report the relevant validation.
> Use PASS, PASS WITH CONDITIONS, or BLOCK.
> Do not hide failed or unexecuted tests.
> Do not automatically apply high-risk fixes without explicit approval.

---

## 25. Deep Security/RLS Review Prompt

> Perform a DEEP REVIEW focused on Supabase security and multi-tenancy.
> For each affected table, view, function, Edge Function, and storage path:
> verify authentication, organization membership, project membership, SELECT/INSERT/UPDATE/DELETE policies, WITH CHECK behaviour, cross-tenant joins, service-role usage, IDOR risk, and adversarial tenant access.
> Attempt to reason from the perspective of Tenant A trying to read or mutate Tenant B data.
> Treat any cross-tenant access as CRITICAL.
> Recommend automated RLS tests for every finding.

---

## 26. Database Migration Review Prompt

> Review the proposed migration before it is applied.
> Identify schema dependencies, foreign keys, indexes, RLS impact, existing-data compatibility, backfill needs, locks/performance risk, application compatibility, destructive operations, audit impact, and rollback/recovery strategy.
> Classify risks.
> Do not apply destructive or security-sensitive changes until explicitly approved.

---

## 27. Definition of Review Complete

A review is complete only when:

- [ ] requirement understood
- [ ] changed code inspected
- [ ] relevant surrounding code inspected
- [ ] database impact assessed
- [ ] security/RLS assessed
- [ ] tenant isolation assessed
- [ ] regression blast radius assessed
- [ ] relevant tests assessed/run
- [ ] PMIS business meaning checked
- [ ] audit/traceability checked
- [ ] findings classified
- [ ] unverified areas disclosed
- [ ] final decision stated

---

## 28. Final Review Principle

> **The objective of review is not to prove that the change works. The objective is to discover how it can fail before a user, another tenant, a project team, an auditor, or production discovers it.**

Project Nidus should prefer **safe, explainable, traceable, tested change** over fast but uncertain change.
