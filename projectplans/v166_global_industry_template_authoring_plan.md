# v166 — Global Industry Template Authoring (Admin)

**Status:** COMPLETE  
**Repo:** `E:\project-nidus-admin`  
**Companion monorepo:** `E:\project-nidus` — `SQL/v773_global_industry_template_sync.sql` + plan `projectplan/v772_industry_template_springboard_content_plan.md` (Phase 2)

## Goal

Allow Nidus staff to author and publish Global Templates with `domain = 'industry_plan'`, so publish sync materialises a shared `public.pmo_industry_templates` catalog row (+ children) and per-account `pm_template_nodes` via the monorepo RPC.

## Deliverables

| Item | File |
|------|------|
| Payload CHECK allows array **or** object | `SQL/v166_global_industry_template_domain.sql` |
| create/update RPCs allow `fields` + `industry_plan` | same |
| `admin.publish_global_template` allows both domains | same |
| Form: domain select + industry_plan JSON editor | `modules/content/src/pages/GlobalTemplateLibraryForm.jsx` |
| Detail: industry_plan payload summary | `modules/content/src/pages/GlobalTemplateLibraryDetail.jsx` |
| Utils + test | `packages/shared/src/globalTemplateUtils.js`, `__tests__` |
| Guide update | `modules/content/docs/Global_Template_Library_Guide.md` |

## Apply order

1. **Monorepo first:** `SQL/v773_global_industry_template_sync.sql`
2. **Then Admin:** `SQL/v166_global_industry_template_domain.sql`

## Out of scope

- Multi-step wizard mirroring Platform `IndustryTemplateForm` (JSON textarea is Phase 2 MVP)
- Simulator-only catalog tables (`pmo_industry_templates` remains public-shared)

## Review

- Phase 2 Admin complete: domain constraint + RPCs + form/detail/docs/utils.
- Fields-domain publish path unchanged; industry_plan sends a JSON object payload to monorepo sync.
