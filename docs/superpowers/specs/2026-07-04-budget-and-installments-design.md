# Design: Budget tracking (perso/pro) + installment plans (PayPal 4x)

> Date: 2026-07-04 · Status: approved by owner (follow-up to scope/collectibles)

## A. Budget — category tracking on synced transactions

Monthly income/expense view per category, split Perso/Pro, built on the existing
`transaction` table (bank sync + manual). **No envelopes/forecasting** (owner chose
simple tracking). Reuses `transaction.category` (existing VARCHAR(100), currently
unused by syncs) — no migration on that table.

- **`budget_category`** (V39): member-scoped list, `name` + `scope`
  (PERSONAL/BUSINESS) + `color`. Seeded with French defaults per scope on first
  read; full CRUD. Rename cascades to transactions; delete clears them to
  uncategorized.
- **`budget_rule`** (V39): member-scoped `keyword` → `category_name`. Created when
  the user categorizes a transaction with "apply to similar". Rules are applied
  lazily whenever budget data is read (idempotent, only touches uncategorized rows)
  — no sync-pipeline changes.
- **Budget transactions** = transactions of the member's scope-matching accounts,
  excluding investment rows (`ticker != null`). Income = amount > 0.
- API `/api/budget`: `GET /summary?month=YYYY-MM&scope=`,
  `GET /transactions?month=&scope=&uncategorized=`,
  `PUT /transactions/{id}/category` `{category, applyToSimilar, keyword}`,
  categories CRUD under `/categories`.
- UI: new **Budget** page — month navigation, Perso/Pro toggle (same pattern as
  dashboard), income/expense/net summary, per-category breakdown with bars,
  uncategorized list with quick assign (+ "appliquer aux similaires"), category
  management modal.

## B. Installment plans (paiement en 4x PayPal & co)

Manual entry (no API exposes 4x schedules): `installment_plan` (V39) —
`label, total_amount, start_date, installments (default 4), interval_days
(default 30), scope`. Schedule computed on the fly (same philosophy as ADR
2026-04-26 loan amortization): equal parts at start_date + k·interval_days; an
installment is *paid* when its date ≤ today.

- **Net worth**: remaining due = auto-maintained LOAN account « Paiements 4x »
  per (member, scope) — balance = Σ remaining across plans, updated on plan CRUD
  and by a daily scheduler tick (existing LOAN plumbing gives liabilities,
  dashboard and history for free; fully settled → balance 0).
- API `/api/installments`: list (with schedule/remaining/paidCount), POST, PUT,
  DELETE.
- UI: card on the Budget page — active plans (progress k/4, next due date,
  remaining), add/edit/delete modal.

## Out of scope
Envelope budgeting, transfer detection between own accounts, auto-detection of 4x
from PayPal transaction labels (revisit later), per-category monthly caps.
