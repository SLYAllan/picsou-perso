# Feature: Account scope (Personal / Business)

> Last updated: 2026-07-04

## Context

This fork's owner runs a French *auto-entreprise* and tracks both personal wealth and
business cash in the same Picsou instance. Every account carries a `scope` —
`PERSONAL` (default) or `BUSINESS` — and the Dashboard and Accounts pages offer a
Perso / Pro / Tout toggle so each perimeter can be viewed in isolation.

Deliberately minimal: no URSSAF/tax logic, no revenue thresholds, no invoicing —
just account tagging and client-side filtering.

## How it works

- **Storage**: `account.scope VARCHAR(10) NOT NULL DEFAULT 'PERSONAL'` with a CHECK
  constraint (`V38__scope_and_collectibles.sql`). Plain VARCHAR + `@Enumerated(STRING)`
  instead of a Postgres native enum — a two-value flag doesn't warrant the
  `NAMED_ENUM` boilerplate.
- **API**: `scope` on `AccountRequest` (optional; null = PERSONAL on create, unchanged
  on update), `AccountResponse`, and each `DistributionItem` in `/api/dashboard`.
  MCP `create_manual_account` / `update_account` accept an optional `scope` param.
- **Filtering is client-side**, mirroring the `wealthMode` pattern
  (ADR 2026-04-05-component-local-state-for-ui-filters):
  - `DashboardPage` filters `distribution`/`liabilities` by scope before computing the
    headline value, chart account IDs, PnL account IDs and the pie. Net worth is
    recomputed from the scoped lists (the backend `totalNetWorth` ignores scope).
  - `AccountsPage` applies the scope filter (`scopedAccounts`) before the asset-type
    filter, the summary card, and both chart datasets.
- **Form**: a Perso/Pro select in `AccountForm`, threaded through
  `AddAccountModal.handleManualSubmit` and the AccountsPage edit path.

## Key files

- `backend/src/main/resources/db/migration/V38__scope_and_collectibles.sql`
- `backend/src/main/java/com/picsou/model/AccountScope.java`, `Account.java`
- `backend/src/main/java/com/picsou/service/DashboardService.java` (`buildDistribution`)
- `frontend/src/pages/dashboard/DashboardPage.tsx` (scope toggle)
- `frontend/src/pages/accounts/AccountsPage.tsx` (scope pills)
- `frontend/src/components/shared/AccountForm.tsx` (scope select)

## Gotchas / Pitfalls

- Synced accounts (bank/broker/crypto) default to PERSONAL; re-tag them as BUSINESS
  by editing the account after the first sync.
- `DashboardResponse.totalNetWorth` is scope-blind — always recompute scoped totals
  from the distribution lists on the frontend, never mix the two.
- Demo-mode mocks must carry `scope` (see `frontend/src/demo/data/`).

## Tests

- `AccountToolsTest`, `GoalServiceTest` updated for the widened records.
- Behavior is filter-only on the frontend; no dedicated test files.
