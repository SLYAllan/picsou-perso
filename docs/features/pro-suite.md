# Feature: Pro suite (micro-entreprise bookkeeping, UwUTCG invoices, Japan simulator)

> Last updated: 2026-07-05

## Context

Port of the standalone `pokecalc` Next.js app (UwUTCG dashboard) into Picsou so
everything lives in one place. Three modules under a single `/pro` page (tabs):
sales register with URSSAF recap, branded invoice generator, and a Japan-lot
resale profitability simulator. The historical pokecalc data (90 sales,
21 invoices, 2 declarations) is imported once via `POST /api/pro/import`
(« Import pokecalc » button on the Sales tab) — it is deliberately NOT shipped
in the V40 migration: the repo is public and the invoices contain client PII.

## How it works

### Data (V40, all member-scoped)

`resale_sale` (one row per resale), `pro_invoice` (line items as JSON text),
`urssaf_declaration` (frozen amounts per declared month, UNIQUE member/year/month),
`pro_setting` (key/value: rates + simulator settings JSON), `resale_simulation`
(full simulation JSON blob). Columns `decl_year`/`decl_month` — `YEAR`/`MONTH`
are reserved words in H2 2.x (test profile).

V40 is schema-only. The historical data travels as `pokecalc-export.json`
(generated on Allan's machine from pokecalc's SQLite, kept out of git) and is
uploaded through `POST /api/pro/import`. The import is idempotent: sales dedup
on (date, reference, price), invoices on number, declarations on (year, month).

### Bookkeeping (`ProComptaService`)

Straight port of pokecalc's `lib/compta.ts` + API routes, computed in doubles
and rounded to 2 decimals like the original:

- per sale: `charges = salePrice × urssaf%`, `net = sale − (purchase +
  commission + packaging + shipping + charges)`;
- recap month: stats grouped by `item_type`, URSSAF block **on sale price
  only**, cumulated year-to-date CA vs the 188 700 € threshold;
- declaration (`POST /declarations`): assiette = **sale + shipping** (pokecalc
  kept this inconsistency between the recap view and the declared amount —
  preserved on purpose so his numbers don't change);
- rates come from `pro_setting` with pokecalc defaults (12.3 / 0.1 / 1.0).

### Invoices (`ProInvoiceService`)

Numbering is server-side: `UWUTCG-{year}-{NNNN}`, max existing + 1 per member
and year (unique constraint as backstop). Imported invoices keep their original
numbers (history ends at `UWUTCG-2026-0023`, so the next one is 0024) — no
localStorage counter anymore. The PDF itself is generated client-side (`features/pro/invoice-pdf.ts`,
lazy jsPDF + embedded Poppins + `public/uwutcg-logo.png`), identical rendering
to pokecalc. Seller block is a constant in that file.

### Simulator (`features/pro/calculations.ts`)

Pure client-side port of pokecalc's math: lot JPY → EUR via live FX
(`GET /api/pro/fx/jpy`, `PriceService.getFxRateToEur("JPY")` inverted; manual
override in the field), cost distribution manual (¥ purchase prices) or
proportional to resale value, per-platform net margin
(commission% + fixed fee + URSSAF + VFL on the sale price). Simulations are
persisted server-side (JSON blob) so they follow the member across devices —
pokecalc kept them in localStorage. Platform/tax settings live in
`pro_setting['simulator']` as JSON.

### API

`/api/pro`: `sales` CRUD + `sales/bulk` (CSV import), `recap`, `annual`,
`declarations` (GET/POST), `settings` (GET/PUT), `invoices` (GET/POST +
`next-number`), `simulations` CRUD, `import` (one-shot pokecalc), `fx/jpy`.

## Gotchas / Pitfalls

- The recap URSSAF block and the declared amounts use different assiettes
  (see above) — faithful to pokecalc, don't "fix" silently.
- CSV import auto-maps headers (FR/EN synonyms in `SalesTab.tsx`); rows without
  a parsable date + positive sale price are silently skipped.
- Amounts are computed in doubles like the JS original — fine for the volumes,
  don't reuse this path for anything needing exact accounting.
- `PriceService.getFxRateToEur` is a passthrough to Yahoo (15-min cache);
  the endpoint returns `{jpyPerEur: null}` when FX is down and the UI falls
  back to 162.
- pokecalc's PDF statement import (`parse-pdf`) was NOT ported (CSV only).

## Tests

- `ProComptaServiceTest` — per-sale math, recap grouping/URSSAF/seuil,
  declaration freezing (shipping in assiette), annual sums, settings merge.
- `ProInvoiceServiceTest` — numbering (empty, continuation after import),
  totals + items JSON round-trip.
- `features/pro/calculations.test.ts` — lot conversion, distributions,
  per-platform margin, best-platform summary.

## Links

- Spec: `docs/superpowers/specs/2026-07-05-pro-suite-design.md`
- Related: [account-scope.md](./account-scope.md), [budget-and-installments.md](./budget-and-installments.md), [price-service.md](./price-service.md)
