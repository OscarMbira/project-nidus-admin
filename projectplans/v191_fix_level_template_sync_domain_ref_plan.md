# v191 — Mirror monorepo v795: level-template sync domain_ref (409 fix)

**Canonical SQL:** `project-nidus/SQL/v795_fix_level_template_sync_domain_ref.sql`  
**Admin copy:** `SQL/v191_fix_level_template_sync_domain_ref.sql` (same body — apply either once)

## Why an Admin copy?
Operator already applied Admin `v190` via SQL Editor. This mirror lets the same workflow fix the monorepo sync RPC that `admin.publish_global_template` calls.

## Apply (pick one)
1. Supabase SQL Editor → paste `SQL/v191_fix_level_template_sync_domain_ref.sql` **or** monorepo `v795`
2. Do **not** apply both (idempotent REPLACE, but unnecessary)

## After apply
Retry **Publish to Platform** / **Publish to Simulator** on Global Template Library.
