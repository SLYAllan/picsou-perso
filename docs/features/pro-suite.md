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
- CSV import lives in `features/pro/csv-import.ts` and handles three shapes,
  ported from pokecalc's import page:
  - Cardmarket "Transaction Summary" (detected on the `Category` + `Amount`
    headers): one `Sales` row plus one `Fees` row per order, joined by
    `Reference`, withdrawals dropped.
  - eBay "Rapport sur les transactions": eleven lines of notes above the real
    header, including a comma-separated `--,--,--` filler row that would fool
    both the header lookup and the separator detection — `stripEbayMetadata`
    drops everything above `Date de création de la transaction`. One row per
    item; payout and adjustment rows carry no title and are skipped, refunded
    orders are dropped whole, and the commission sums four fee columns.
  - anything else: auto-mapped from FR/EN header synonyms, including the
    snake_case headers our own `exportCsv` writes.

  Dates accept ISO, `dd/mm/yyyy`, `dd.mm.yyyy hh:mm:ss` and eBay's
  `30 juil. 2026`; amounts accept `18,60 €` and `1.234,56 €`. Rows without a
  parsable date or with a zero amount are dropped; negative amounts are kept
  (refunds). Re-importing the same statement skips sales already in the register
  on (date, reference, price) — only when the reference is non-empty, since two
  identical cards sold the same day are two real sales.
- Amounts are computed in doubles like the JS original — fine for the volumes,
  don't reuse this path for anything needing exact accounting.
- `PriceService.getFxRateToEur` is a passthrough to Yahoo (15-min cache);
  the endpoint returns `{jpyPerEur: null}` when FX is down and the UI falls
  back to 162.
- Vinted receipts arrive as one PDF per sale (`features/pro/vinted-pdf.ts`), a
  port of pokecalc's `parse-pdf` route + `parseVintedPdf`. pokecalc read the text
  server-side with `pdf-parse`; here pdf.js runs in the browser (lazy import, own
  chunk — same treatment as jsPDF for invoices) since Picsou's backend is Java.
  Line-anchored regexes need real lines, so `pdfToText` regroups pdf.js's loose
  glyph runs by their y coordinate. Same fields as pokecalc: one sale per item,
  priced without the shipping and buyer protection the buyer pays on top, type
  `carte`, packaging 0.35.
- pdf.js's worker goes through Vite's `?worker` rather than `?url`: it ships as a
  `.mjs`, an extension nginx has no MIME type for, so in production it arrived as
  `application/octet-stream` and `nosniff` refused to run it ("Setting up fake
  worker failed"). Keep it bundled — the deployed host's nginx is outside this
  repo, so we can't add the MIME type there.
- The import button takes several files at once, mixing CSV and PDF.

## Tests

- `ProComptaServiceTest` — per-sale math, recap grouping/URSSAF/seuil,
  declaration freezing (shipping in assiette), annual sums, settings merge.
- `ProInvoiceServiceTest` — numbering (empty, continuation after import),
  totals + items JSON round-trip.
- `features/pro/calculations.test.ts` — lot conversion, distributions,
  per-platform margin, best-platform summary.
- `features/pro/csv-import.test.ts` — Cardmarket statement (fee/sale pairing,
  withdrawals dropped), eBay report (notes preamble, payout rows, refunds, fee
  columns), export round-trip with BOM, amount and date formats. The eBay
  fixture keeps the real 38-column layout with buyer names and item titles
  replaced — this repo is public.
- `features/pro/vinted-pdf.test.ts` — real receipt layout with several items,
  address block excluded, fallback on the total, non-Vinted PDF rejected.
  Checked against 42 real receipts: 89 sales, no silent failure. The six other
  Vinted PDFs (shipping slips, Wise statements) yield nothing, as they should.

## Links

- Spec: `docs/superpowers/specs/2026-07-05-pro-suite-design.md`
- Related: [account-scope.md](./account-scope.md), [budget-and-installments.md](./budget-and-installments.md), [price-service.md](./price-service.md)
