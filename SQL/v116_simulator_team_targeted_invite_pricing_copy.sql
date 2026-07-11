-- ============================================================================
-- v116: Simulator Team tier — mention targeted role invites specifically
-- (v736 Plan Phase F.2, project-nidus repo — built after v115 shipped)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v115 (simulator_team_collaborative_pricing_copy — Team's
--                 "Collaborative PMO practice sessions" headline copy)
-- Idempotent: UPDATE matched by (plan_type, billing_cycle, catalog_scope),
-- same business-key pattern established in v109 after the v107 id-match bug.
-- Safe to re-run.
--
-- WHY THIS IS A NEW FILE, NOT AN EDIT TO v115
-- v115 already ran. Same convention as v109/v115 themselves: numbered SQL
-- files aren't mutated after they've been applied — corrections/additions
-- are new files that supersede specific fields.
--
-- WHAT CHANGED, AND WHY (cross-repo context: project-nidus's
-- projectplan/v736_Simulator_Team_And_Collaborative_Mode_Plan.md, Phase F.2,
-- built after v115 shipped)
-- v115's copy said "Collaborative PMO practice sessions" generically. Since
-- then, targeted role invites were built (v748_sim_collaborative_targeted_
-- invites.sql in project-nidus): a session creator can now reserve a
-- specific role for a specific teammate (not just leave every role open to
-- whoever reaches the link first). That's a concrete, sellable capability —
-- "invite your Programme Manager to that role specifically" is a clearer
-- pitch than "collaborative sessions exist" — so the catalog copy should
-- name it rather than leave it implied.
-- ============================================================================

UPDATE public.subscription_plans
SET features = '[
    "Collaborative PMO practice sessions (Portfolio, Programme, and Project Manager together)",
    "Invite specific teammates to a role, or leave it open for your team to self-select",
    "Everything in Professional, per seat",
    "Bulk seat licensing for your PM/PgM/PfM team",
    "Centralized progress reporting across learners",
    "Dedicated onboarding session",
    "Priority support"
]'::jsonb,
    updated_at = NOW()
WHERE plan_type = 'team'
  AND billing_cycle = 'monthly'
  AND catalog_scope = 'simulator';

UPDATE public.subscription_plans
SET features = '[
    "Collaborative PMO practice sessions (Portfolio, Programme, and Project Manager together)",
    "Invite specific teammates to a role, or leave it open for your team to self-select",
    "Everything in Professional, per seat",
    "Bulk seat licensing for your PM/PgM/PfM team",
    "Centralized progress reporting across learners",
    "Dedicated onboarding session",
    "Priority support",
    "Save 17% vs monthly"
]'::jsonb,
    updated_at = NOW()
WHERE plan_type = 'team'
  AND billing_cycle = 'yearly'
  AND catalog_scope = 'simulator';

DO $$ BEGIN RAISE NOTICE 'v116_simulator_team_targeted_invite_pricing_copy.sql completed'; END $$;
