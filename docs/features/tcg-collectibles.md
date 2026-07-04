# Feature: TCG collectibles tracking

> Last updated: 2026-07-04

## Context

The owner collects Riftbound, Pokémon and One Piece cards and wants them valued like
any other asset: auto-updated market prices, gain/loss vs purchase price, price
history, and inclusion in net worth. Prices come from [tcgcsv.com](https://tcgcsv.com),
which republishes the TCGplayer catalog and market prices daily (~20:00 UTC), free and
without an API key.

## How it works

### Data model — reuse, no new tables

A card position is an `AccountHolding` row on a per-member account of type
`COLLECTIBLE` (auto-created as "Collection" on first add), identified by a synthetic
ticker that encodes everything the price provider needs:

```
TCG:{categoryId}:{groupId}:{productId}:{subTypeCode}     e.g. TCG:89:24344:693380:N
```

`subTypeCode` is the uppercase initials of TCGplayer's `subTypeName` (Normal → N,
Foil → F, Holofoil → H, Reverse Holofoil → RH...). `quantity` = copies,
`averageBuyIn` = weighted average purchase price (EUR), `image_url` (new nullable
column on `account_holding`, V38) = card thumbnail.

Because valuation flows through the existing holdings path
(`AccountService.liveBalanceEur`, `DashboardService`, `HistoryService`), net worth,
distribution, history and PnL required **zero changes**.

### Pricing pipeline

- `adapter/TcgCsvPriceProvider` implements `PriceProviderPort` (`supports` =
  `TCG:` prefix). `getPricesEur` groups tickers by (category, group), fetches each
  set's price file once (6 h in-memory cache), picks `marketPrice` for the
  productId + subtype, and converts USD→EUR via
  `YahooFinancePriceProvider.getFxRateToEur("USD")` (package-private, same package) —
  the port contract stays "EUR out". FX unavailable → empty map, never a fabricated
  rate.
- `PriceService` routes `TCG:` tickers to this provider first in all four routing
  sites (`getPriceEur`, `refreshPrices`, `backfillHistoricalPrices`,
  `getIntradayPricesEur`).
- `SchedulerService.refreshPrices()` (hourly) additionally refreshes all distinct
  `TCG:` holding tickers globally — this is what persists their daily
  `price_snapshot` rows, since cards have **no historical backfill source**
  (`getHistoricalPricesEur` returns empty; history accrues from install time).

### API (`/api/collectibles`)

Catalog proxy (games hardcoded: Pokémon 3, Pokémon Japan 85, One Piece 68,
Riftbound 89; groups/products cached 24 h) + member-scoped card CRUD. Adding an
already-owned card merges quantities and recomputes the weighted average buy-in.
See `backend/docs/API.md` §9b.

### Frontend

- `pages/collection/CollectionPage.tsx` — summary (value / invested / PnL), game tabs,
  search, card rows with thumbnails. Route `/collection`, sidebar item (WalletCards).
- `AddCardModal` — game → set → client-side name search over the set's products →
  finish + quantity + purchase price.
- `CardDetailModal` — price history via `usePriceHistory(ticker)` + `NetWorthChart`,
  stats grid, edit quantity/buy-in, delete.
- `features/collection/{api.ts,hooks.ts}` — query keys under `['collection', ...]`;
  mutations invalidate `['collection','cards']`, `['accounts']`, `['dashboard']`.

## Key files

- `backend/src/main/java/com/picsou/adapter/TcgCsvPriceProvider.java`
- `backend/src/main/java/com/picsou/service/CollectibleService.java`
- `backend/src/main/java/com/picsou/controller/CollectibleController.java`
- `backend/src/main/resources/db/migration/V38__scope_and_collectibles.sql`
- `frontend/src/pages/collection/CollectionPage.tsx`
- `frontend/src/components/shared/AddCardModal.tsx`, `CardDetailModal.tsx`

## Technical choices

| Choice | Why | Rejected alternative |
|--------|-----|----------------------|
| Cards as `AccountHolding` on a `COLLECTIBLE` account | Net worth/history/PnL work unchanged; mirrors CRYPTO/PEA | Dedicated collectible entity + parallel summation everywhere |
| tcgcsv.com | Free, no key, daily TCGplayer market prices, covers all 3 games | TCGplayer API (closed to new devs), Cardmarket (no public API), scraping |
| Synthetic ticker encodes cat/group/product/subtype | Provider can batch-fetch by set with zero extra state | Mapping table ticker → product |
| Client-side card search over a set's products | One cached fetch per set; no per-keystroke backend calls | Server-side `q` filtering per keystroke |
| No historical backfill | tcgcsv has no per-product history; snapshots accrue daily | Scraping archive dumps (heavy, YAGNI) |

## Gotchas / Pitfalls

- **Market price is condition-agnostic** (~Near Mint). Played/graded cards need a
  manual mental discount — per-copy condition tracking was deliberately skipped.
- **Prices are daily**: intraday view is empty for cards; the 24H range shows nothing.
- **Card price history starts at install** — the PnL-at-date math forward-fills from
  the first snapshot, so early history is flat.
- **`price_snapshot.ticker` is VARCHAR(30)**: the ticker format fits (≤ ~24 chars for
  realistic ids) but a future game with huge ids could overflow — lengthen the column
  if tcgcsv ever exceeds it.
- **Deleting a card** deletes the holding but keeps its `price_snapshot` rows
  (harmless orphans, reused if the card is re-added).
- tcgcsv down → provider returns empty; holdings keep their last known
  `currentPrice`; search endpoints surface errors via `GlobalExceptionHandler`.

## Tests

- `TcgCsvPriceProviderTest` — ticker round-trip, subtype codes, USD→EUR conversion,
  per-group batching + 6 h cache, group-failure isolation.
- `CollectibleServiceTest` — account auto-creation, weighted-average merge math,
  member scoping, unsupported game rejection.
- `frontend/src/features/collection/api.test.ts` — collection summary math.

## Links

- Related: [price-service.md](./price-service.md), [account-scope.md](./account-scope.md)
- API: [backend/docs/API.md](../../backend/docs/API.md) §9b
