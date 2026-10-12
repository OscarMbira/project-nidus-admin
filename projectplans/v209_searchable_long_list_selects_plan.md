# v209 — Searchable long-list dropdowns (Admin) — pairs with monorepo v1064

## Goal

Admin parity for monorepo **v1064**: shared `SelectField` (≥12 → existing Admin `SearchableSelect`), migrate existing long native `<select>`s, add Admin CLAUDE rule.

## Settled decisions

Same as [E:\project-nidus\projectprd\v1064_searchable_long_list_selects_PRD.md](../../project-nidus/projectprd/v1064_searchable_long_list_selects_PRD.md):

- Threshold ≥12
- `forceSearchable` / `forceNative`
- `allowCustom` off by default
- Single-select only (Admin `MultiSearchableSelect` unchanged)

## Implementation

1. Add `SelectField.jsx` under `packages/ui` (or `AdminSelectField` naming if required by Admin conventions); export from `@nidus-admin/ui`.
2. Reuse existing `SearchableSelect` — do not invent a second search UI.
3. Migrate priority surfaces:
   - Country: TaxRates, PaymentMethodRouting, PaymentFlow, PaymentMonitor
   - Currency: CountryList default currency, ExchangeRateList, InvoiceList create, SubscriptionForm, PaymentTransactions filter
   - Industry category forms (≥12)
   - Tester grant / assignment catalog selects; SessionHistory admin user filter
4. Sync CLAUDE.md rule with monorepo wording (Admin rule number next available).
5. Theme-aware native branch (light + dark).

## Todos

- [x] `SelectField` + export from `@nidus-admin/ui`
- [x] Migrate country/currency long lists (TaxRates, Payment*, Country default currency, ExchangeRate, Invoice, Subscription, PaymentTransactions)
- [x] Admin CLAUDE rule 21
- [x] Review section

## Review

### What shipped
- `packages/ui/src/SelectField.jsx` wrapping Admin `SearchableSelect` with ≥12 threshold + force props.
- Migrated catalog country/currency selects listed in the monorepo v1064 plan census (Admin slice).
- CLAUDE.md rule 21.

### Follow-up
- Industry category / tester grant / session admin user filters when next touched if still native and ≥12.
