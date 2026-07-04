# Feature: Budget tracking + installment plans (4x)

> Last updated: 2026-07-05

## Context

Monthly income/expense tracking per category on top of already-synced transactions,
split Perso/Pro, plus manual tracking of split payments (PayPal 4x style) whose
remaining due counts as a liability in net worth. Deliberately simple: no envelope
budgeting, no per-category caps.

## How it works

### Budget

- Reuses the pre-existing `transaction.category` text column (untouched by syncs).
- `budget_category` (V39): member-scoped names per scope, French defaults seeded on
  first read (Courses, Restaurants... / Matériel, URSSAF & impôts...), full CRUD.
  Rename cascades onto transactions and rules; delete clears to uncategorized.
- `budget_rule` (V39): keyword (uppercase, contains-match on description) →
  category. Created via "apply to similar" when categorizing; **applied lazily on
  every budget read** (`BudgetService.applyRules`, idempotent, uncategorized rows
  only) — the sync pipeline is untouched.
- Budget transactions = scope-matching accounts' transactions minus investment rows
  (`ticker != null`). Income = amount > 0.
- API `/api/budget`: `GET /summary?month=YYYY-MM&scope=`, `GET /transactions`,
  `PUT /transactions/{id}/category`, `/categories` CRUD.

### Installments (PayPal 4x)

- `installment_plan` (V39): label, total, start date, n installments (default 4),
  interval days (default 30), scope. Schedule computed on the fly (equal parts,
  rounding difference on the last one); an installment is *paid* once its date ≤
  today — no manual ticking.
- Remaining due mirrors into an auto-maintained **LOAN account « Paiements 4x »**
  per (member, scope), `external_account_id = installments_{scope}` — liabilities,
  dashboard and history come for free (same reuse pattern as the collectibles
  account). Refreshed on plan CRUD and daily at 07:55 by `SchedulerService`.
- API `/api/installments`: list (schedule + remaining + nextDueDate), POST, PUT, DELETE.

### Frontend

`pages/budget/BudgetPage.tsx` (route `/budget`, nav ChartPie): month navigation,
Perso/Pro/Tout toggle, income/expenses/net cards, per-category bars, uncategorized
quick-assign (select → also creates a keyword rule), installments card with
add/delete modals. Slices in `features/budget/{api.ts,hooks.ts}`; installment
mutations invalidate `['accounts']`/`['dashboard']`.

## Gotchas / Pitfalls

- Rules match by **contains** on the uppercased description — a too-short keyword
  ("CB") would swallow everything; the default keyword is the full description.
- Categorizing with "apply to similar" backfills *uncategorized* rows only; it never
  overwrites manual assignments.
- Deleting the auto « Paiements 4x » account while plans remain: it is recreated at
  the next plan change or scheduler tick.
- The summary is computed in-memory over one month of rows — fine for personal
  volumes. `// ponytail: move to SQL aggregation if months exceed ~10k rows`.

## Tests

- `BudgetServiceTest` — aggregation, scope filtering, investment exclusion,
  rule creation/backfill, apply-rules idempotence.
- `InstallmentServiceTest` — schedule/rounding math, paid detection, remaining,
  auto LOAN account create/update per scope.

## Links

- Spec: `docs/superpowers/specs/2026-07-04-budget-and-installments-design.md`
- Related: [account-scope.md](./account-scope.md), [manual-transactions.md](./manual-transactions.md)
