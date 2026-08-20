# Portfolio & Programme Templates (Admin v187)

## Purpose

Author **Portfolio** and **Programme** masters in Global Template Library so Platform/Simulator can later inherit them at portfolio/programme tiers (see monorepo `v783_pm_hierarchy_creation_time_inheritance_plan.md`).

## Domains

| Domain | Sidebar | Payload keys (main) |
|--------|---------|---------------------|
| `portfolio_template` | Global Templates → Portfolio Templates | overview, objectives, governance, benefit_categories, risks, metrics, roles |
| `programme_template` | Global Templates → Programme Templates | overview, governance, milestones, dependencies, benefits, risks, roles |

Risks / Roles / Milestones reuse the Industry Plan grid editors.

## Apply order

1. Monorepo: `SQL/v783_portfolio_programme_template_domains.sql` (CHECK + sync whitelist)
2. Admin: `SQL/v184_portfolio_programme_templates.sql` (GTL CHECK + RPCs + seed)

## Seed

- Technology Transformation Portfolio (`PT-TECH-01`) — id `a1840000-0000-4000-8000-000000000001`
- Regulatory Compliance Programme (`PG-REG-01`) — id `a1840000-0000-4000-8000-000000000002`

From a filtered list, **New template** opens with that domain preselected.

Publish from the template detail page to sync into `pm_template_nodes` (still lands at PMO tier until v783 creation-time inheritance wires portfolio/programme tiers).
