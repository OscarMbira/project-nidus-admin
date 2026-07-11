-- ============================================================================
-- v115: Simulator Team tier — surface Collaborative PMO practice as the
-- headline differentiator (v736 Plan Phase I.1, project-nidus repo)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v111 (simulator_individual_team_tier_split — Team tier exists)
-- Idempotent: UPDATE matched by (plan_type, billing_cycle, catalog_scope),
-- same business-key pattern established in v109/v110 after the v107 id-match
-- bug. Safe to re-run.
--
-- WHY THIS IS A NEW FILE, NOT AN EDIT TO v111
-- v111 already ran. Per this repo's own established convention (see v109's
-- header), numbered SQL files aren't mutated after they've been applied —
-- corrections/updates are new files that supersede specific fields.
--
-- WHAT CHANGED, AND WHY (cross-repo context: project-nidus's
-- projectplan/v736_Simulator_Team_And_Collaborative_Mode_Plan.md, Phases
-- A-H, built the actual Collaborative Team feature this pricing copy now
-- describes)
-- Team's `features` copy previously said generic "Bulk seat licensing for
-- your PM/PgM/PfM team." Collaborative sessions (3 real people playing
-- Portfolio/Programme/Project Manager together in one scenario) now exist
-- and are gated specifically on holding a Team seat (v736 Phase H —
-- sim.user_has_active_team_seat()), not just "any paid plan." That makes it
-- the actual headline differentiator between Professional (individual,
-- solo-vs-AI) and Team, so the catalog copy should say so plainly instead
-- of only "bulk licensing."
-- ============================================================================

UPDATE public.subscription_plans
SET features = '[
    "Collaborative PMO practice sessions (Portfolio, Programme, and Project Manager together)",
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

DO $$ BEGIN RAISE NOTICE 'v115_simulator_team_collaborative_pricing_copy.sql completed'; END $$;
