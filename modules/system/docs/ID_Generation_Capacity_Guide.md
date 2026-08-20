# ID Generation: Capacity & Uniqueness Guide

Human-readable display IDs are assigned per table via **ID Generation Rules** (`System → ID Rules`). This guide explains how uniqueness is guaranteed, how to size a format for expected volume, and what to do when capacity runs low.

## How uniqueness is guaranteed

Uniqueness is enforced by the **database**, not application logic alone:

1. **`admin.generated_ids`** has unique indexes on `(target_table, record_id)` and `(target_table, display_id)`.
2. **`admin.generate_display_id()`** inserts inside a `BEGIN … EXCEPTION WHEN unique_violation` block:
   - A collision on **`display_id`** (two different records rolling the same random code) triggers a **retry** with a new code (up to 20 attempts by default).
   - A collision on **`record_id`** (two concurrent callers generating for the *same* record) returns the winner's existing row — safe for multiple tabs or parallel requests.
3. All writes go through **SECURITY DEFINER** RPCs; clients cannot insert into `generated_ids` directly.

Regression coverage lives in `e2e/tests/admin/id-generation-concurrency.spec.js`, which exercises same-record deduplication, cross-record collision retries, and keyspace exhaustion — a data-layer guarantee tested via direct RPC calls rather than UI flows.

## Sizing a format for expected volume

Each rule's random code segment has a finite **keyspace** — the count of distinct codes the format can produce:

| Setting | Effect on keyspace |
|--------|---------------------|
| More **letters** / **digits** | Multiplicative increase (largest lever) |
| **Mixed** letter case | Doubles letter positions vs uppercase-only |
| **Excluded characters** | Shrinks the alphabet per position |
| **Segment type** | `numeric` (digits only), `alpha` (letters only), or `alphanumeric` (interleaved) |

The rule form shows **Capacity: ~N unique IDs** using the same formula as the database (`admin._id_gen_keyspace_size`). When a target table is selected, the form compares keyspace to the table's **current row count** and generated ID count.

**Save is blocked** only in the pathological case where keyspace is **smaller than the table's current row count** — that configuration would exhaust immediately. Smaller keyspaces for low-volume tables remain allowed with inline warnings.

### Rule of thumb

- Estimate peak rows for the table (including history if IDs are never reused).
- Target keyspace **≥ 10×** expected rows for comfortable headroom (birthday-paradox collisions rise well before 100% fill).
- Prefer adding **digits** for large catalogs; use **excluded characters** sparingly (e.g. `O0I1L`) only when readability matters.

## Usage column on ID Rules list

The **Usage** column reads `admin.v_id_generation_rule_usage` for each active rule:

- **`usage_pct`** — generated IDs ÷ keyspace × 100
- **High** badge at **≥ 70%** — plan to widen the format before production failures
- **Saturated** at **≥ 100%** — new ID generation may fail

Proactively edit the rule: increase `num_letters` / `num_digits`, reduce `excluded_chars`, or switch `letter_case` to `mixed`.

## Bulk configure unconfigured tables

After seed migrations (v144 / v146) or when new database tables appear, many rows on **System → ID Rules** may show **Unconfigured**.

Use **Configure all unconfigured (N)** on the ID Rules list to create default rules in one step instead of opening each table's form manually. The bulk action:

- Targets every eligible table from `get_available_tables` without an **active** rule
- Respects the current tab when not on **All** (Admin / Platform / Simulator only)
- Applies the same defaults as platform seeds: **5 letters + 4 digits**, alpha-numeric, `O0I1L` excluded, unique abbreviation via `_id_gen_default_abbreviation`
- Skips tables that already have an active rule; continues on individual failures (e.g. keyspace too small for current row count)

**SQL (manual):** `pnpm run admin:migrate-id-generation-bulk-seed` installs the RPC. **v148 does not insert rules** — run `pnpm run admin:seed-id-generation-bulk-run` (v149) or use the UI button to execute it.

## Backfill display IDs for zero-usage rules

After bulk rule creation, **Usage** may show **0%** for every table even when rows already exist — rules were created but `admin.generated_ids` was never populated.

Run:

```bash
# 1) Install RPCs — paste SQL/v154_id_generation_display_id_backfill_seed.sql in Supabase SQL Editor
#    OR, if local Postgres is configured: pnpm run admin:migrate-id-generation-display-id-backfill

# 2) Backfill (uses service role — no database password needed)
pnpm run admin:seed-id-generation-display-id-backfill
```

Check connectivity:

```bash
pnpm run admin:db-doctor
```

This applies **v154**, which:

- Targets every **active** rule with **zero** generated IDs (`admin.v_id_generation_rule_usage`)
- Creates **up to 10 display IDs per table** by default (enough for Usage & capacity preview without timing out)
- Processes **25 tables per batch** via a Node runner (avoids Supabase SQL editor timeouts)
- Skips missing or empty tables (`skipped_missing` / `skipped_empty`)
- Is **idempotent** — safe to re-run; existing display IDs are unchanged

**Environment overrides** (optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `ID_GEN_BACKFILL_LIMIT` | `10` | Max display IDs created per table per run |
| `ID_GEN_BACKFILL_BATCH` | `25` | Tables processed per batch |
| `ID_GEN_BACKFILL_TIMEOUT_MS` | `120000` | Statement timeout per batch |

**SQL (single batch in editor):** `SELECT admin.backfill_zero_usage_display_ids_batch(10, 25, NULL, TRUE);` — repeat with the returned `last_target_table` as the third argument while `has_more` is true.

## When generation fails: `ID_KEYSPACE_EXHAUSTED`

If all retry attempts collide, `generate_display_id` raises:

```text
ID_KEYSPACE_EXHAUSTED: Unable to generate unique display ID for …
```

The admin UI surfaces a specific message (via `formatDisplayIdError`) instead of a generic failure toast.

**Remediation:**

1. Open **System → ID Rules** and edit the rule for the affected table.
2. Widen the format (more letters/digits, fewer exclusions, or mixed case).
3. Save — blocked saves indicate keyspace still below row count; widen further.
4. Retry record creation; existing generated IDs are unchanged.

## Abbreviation reuse across inactive rules

Only **active** rules are constrained for unique `(target_table)` and `(table_abbreviation)`. Reactivating or reusing an abbreviation on a different table over time can produce visually identical codes (e.g. `ACC-1234`) in exports that omit table context. Include `target_table` or full qualified names in support exports when disambiguation matters.

## View actions from Generated IDs

**System → Generated IDs** includes an **Actions** column with **View** (detail page) or **Open in list** (list-only admin screen) when a route is registered in `packages/shared/src/generatedIdRecordRoutes.js`.

### Adding a Generated ID view route

1. Confirm the target table has an admin detail/read page (or a list page that supports `?search=`).
2. Add an entry to `DETAIL_ROUTES` or `LIST_FALLBACK_ROUTES` in `generatedIdRecordRoutes.js`, keyed by the normalized table name (`schema.table` via `normalizeTargetTable()`).
3. Use `display_id` in the query when available; detail pages resolve UUID or display ID via `useDisplayId`.
4. For list fallbacks, ensure the list page reads `?search=` on load (`useInitialUrlSearch` or `readSearchFromUrl` on `useAdminListPage`) and matches display IDs in its filter.
5. Open **Generated IDs**, filter to the table, and click **View** / **Open in list** to verify navigation.

**Initial detail mappings:** `public.users`, `public.accounts`, `public.platform_subscriptions` (auto-detects platform vs simulator), `sim.scenarios`, `admin.admin_users`, `admin.support_tickets`, `admin.id_generation_rules`.

**List fallbacks:** `sim.certificates`, `sim.learning_paths`, `sim.npcs`, `sim.leaderboard_entries`, `public.projects`.

Unmapped tables show **View unavailable** with a tooltip until a route is registered or a dedicated detail page is built.

## Related SQL

- `SQL/v19_id_generation.sql` — core rules and generation
- `SQL/v30_id_generation_segment_type.sql` — numeric / alpha / alphanumeric segments
- `SQL/v138_id_generation_capacity_safeguards.sql` — keyspace math, usage view, retry ceiling, save guard
- `SQL/v148_id_generation_bulk_seed_rules.sql` — bulk create rules for unconfigured tables
