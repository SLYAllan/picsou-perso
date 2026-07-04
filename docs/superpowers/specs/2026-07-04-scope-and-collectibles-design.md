# Design: Personal/Business account scope + TCG collectibles tracking

> Date: 2026-07-04
> Status: approved by owner (fork for personal use on Hetzner)

## Context

This fork of Picsou adds two features for the owner's personal deployment:

- **A. Account scope** — the owner runs a French *auto-entreprise* and wants business
  cash separated from personal wealth: each account is tagged `PERSONAL` or `BUSINESS`,
  and the dashboard/accounts views can be filtered to either or both.
- **B. TCG collection as an investment** — the owner collects Riftbound, Pokémon and
  One Piece cards and wants them valued like any other asset: auto-updated market
  prices, gain/loss vs purchase price, price history, and inclusion in net worth.

Both features follow the project's existing patterns (ports & adapters, Flyway-owned
schema, member scoping, feature docs). No new external accounts or API keys are needed.

## Feature A — Account scope (PERSONAL / BUSINESS)

### Backend

- **Migration `V38__account_scope.sql`**:
  `ALTER TABLE account ADD COLUMN scope VARCHAR(10) NOT NULL DEFAULT 'PERSONAL'
  CHECK (scope IN ('PERSONAL','BUSINESS'))`.
  VARCHAR + CHECK instead of a native Postgres enum: avoids the `@JdbcTypeCode(NAMED_ENUM)`
  boilerplate and H2 test friction for a two-value flag (deliberate deviation from the
  `account_type` pattern).
- **`model/AccountScope.java`** — plain Java enum `PERSONAL, BUSINESS`.
- **`model/Account.java`** — `@Enumerated(STRING) private AccountScope scope` with
  `@Builder.Default = PERSONAL`.
- **DTOs** — add `scope` to `AccountRequest` (optional, defaults to `PERSONAL`) and to
  `AccountResponse` (record field + `from()` + both wither constructors).
- **`AccountService.create/update`** — copy the field.
- **`DashboardService.buildDistribution`** — add `scope` to each distribution item DTO
  so the frontend can filter client-side. No dashboard query param: filtering is
  client-side, mirroring the existing `wealthMode` toggle (ADR
  2026-04-05-component-local-state-for-ui-filters).

### Frontend

- `types/api.ts` — `scope: 'PERSONAL' | 'BUSINESS'` on `Account`, `AccountRequest`,
  and dashboard distribution items.
- `AccountForm.tsx` — a Perso/Pro select (mirrors the existing `type` select), default
  Perso; threaded through `AddAccountModal.handleManualSubmit` and
  `AccountsPage.handleEditSubmit` / `defaultValues`.
- `DashboardPage.tsx` — a Perso/Pro/Tout segmented toggle next to the existing
  `wealthMode` dropdown; filters `distribution`/`liabilities` before computing the
  headline value and `chartAccountIds` (history endpoint already takes account IDs).
- `AccountsPage.tsx` — same toggle above the asset-type filter pills.
- i18n keys in `en.json` + `fr.json` (`accounts.scope.*`).

Non-goals (deliberately skipped): URSSAF/tax logic, revenue thresholds, invoicing.
The owner asked for simple pro/perso separation only.

## Feature B — TCG collectibles

### Price source

[tcgcsv.com](https://tcgcsv.com) republishes TCGplayer catalog + prices daily
(~20:00 UTC), free, no API key:

- `GET /tcgplayer/{categoryId}/groups` — sets per game
- `GET /tcgplayer/{categoryId}/{groupId}/products` — cards per set (name, imageUrl)
- `GET /tcgplayer/{categoryId}/{groupId}/prices` — per product: `marketPrice`,
  low/mid/high, `subTypeName` (Normal/Foil), in **USD**

Supported categories: Pokémon (3), Pokémon Japan (85), One Piece (68),
Riftbound (89). Hardcoded map — adding a game later is one line.

### Data model — reuse, no new tables

A card position is an **`AccountHolding`** row on a member's account of new type
**`COLLECTIBLE`**, with a synthetic ticker encoding everything the price provider
needs:

```
TCG:{categoryId}:{groupId}:{productId}:{N|F}     e.g. TCG:89:24344:693380:N   (≤ 30 chars)
```

- `quantity` = number of copies, `averageBuyIn` = average purchase price (EUR),
  `name` = card name + set.
- **Migration `V38`** also adds nullable `image_url VARCHAR(300)` on `account_holding`
  (card thumbnail, set at add time; null for regular holdings).
- The account of type `COLLECTIBLE` is auto-created per member ("Collection") on first
  card add. `AccountType` gains `COLLECTIBLE` via
  `ALTER TYPE account_type ADD VALUE 'COLLECTIBLE' BEFORE 'OTHER'` (same `V38` pattern
  as V19; PG12+ allows it in a transaction as long as the new value isn't used in the
  same migration — it isn't).
- Daily price history lands in the existing **`price_snapshot`** table keyed by the
  synthetic ticker (VARCHAR(30) fits), so PnL-at-date and history charts work unchanged.

Because valuation flows through the existing holdings path
(`AccountService.liveBalanceEur`, `DashboardService`, `HistoryService`), **net worth,
distribution, history and PnL need zero changes**.

### Backend components

- **`adapter/TcgCsvPriceProvider.java`** — implements `PriceProviderPort`.
  `supports(ticker)` = starts with `TCG:`. `getPricesEur(tickers)`: group tickers by
  `(categoryId, groupId)`, fetch each group's prices file once, pick
  `marketPrice` for the productId + subtype, convert USD→EUR via
  `YahooFinancePriceProvider.getFxRateToEur("USD")` (package-private, same package —
  keeps the port contract "prices already in EUR").
  In-memory per-group cache, 6 h TTL (tcgcsv updates daily; the hourly scheduler
  shouldn't refetch group files every time).
  `getHistoricalPricesEur` returns empty — tcgcsv has no easy per-product history, so
  history accrues from install time via daily snapshots (`PriceBackfillRunner` skips
  empty results; acceptable for a personal fork).
- **`PriceService`** — routing gains one branch: `tcgCsv.supports(ticker)` checked
  before CoinGecko in `getPriceEur`, `refreshPrices`, `backfillHistoricalPrices`.
  Existing hourly `SchedulerService.refreshPrices()` already collects holding tickers →
  collectible prices refresh and snapshot automatically. **No new scheduler.**
- **`controller/CollectibleController.java`** (`/api/collectibles`) +
  **`service/CollectibleService.java`**:
  - `GET /games` — the 4 supported games (id + label)
  - `GET /games/{categoryId}/groups` — sets (proxied from tcgcsv, 24 h in-memory cache)
  - `GET /games/{categoryId}/groups/{groupId}/products?q=` — card search within a set
    (proxied + cached, filtered by name, joined with prices for display)
  - `POST /cards` — add/increment a card position `{categoryId, groupId, productId,
    subType, quantity, purchasePriceEur, name, imageUrl}`; ensures the member's
    `COLLECTIBLE` account exists; merges into the UNIQUE(account_id,ticker) row
    (recomputes weighted `averageBuyIn`)
  - `PUT /cards/{holdingId}` / `DELETE /cards/{holdingId}` — edit quantity/buy-in, remove
  - All member-scoped via `UserContext.currentMemberId()`; standard REST conventions
    (records + Jakarta validation, no try/catch, 201/204).
- Update `backend/docs/API.md`.

### Frontend

- **`pages/collection/CollectionPage.tsx`** + `features/collection/{api.ts,hooks.ts}`,
  route in `routes.tsx`/`lazy-pages.tsx`, nav item in `AppSidebar` (desktop). Mobile
  bottom nav keeps its 4 items (Collection reachable via sidebar sheet) — skipped
  reflowing the 2/2 layout.
- Page layout clones the `HoldingsCard` pattern: summary header (total value, total
  cost, gain/loss ±%), game filter tabs, search input, card rows (thumbnail, name, set,
  qty, value, PnL). Data comes from `usePortfolio()` filtered to `COLLECTIBLE`
  accounts (live prices already wired) + card metadata from the holding.
- **Add-card modal**: game select → set select (`useQuery` on groups) → search input →
  results with price preview → qty/buy-in/subtype form. Imitates `BankWizard` search +
  `EditHoldingModal` form conventions (key-remount + lazy-init).
- **Card detail modal**: clones `HoldingDetailModal` — reuses `NetWorthChart` with
  `usePriceHistory(ticker)` for the price history, stats grid (market price, copies,
  cost basis, PnL). No composition section.
- The `COLLECTIBLE` account gets a scope like any other (Feature A works for it), shows
  up in dashboard distribution with its own color, and `ASSET_FILTER_MAP` on
  AccountsPage gains a "Collection" category (fixes the `TYPE_TO_GROUP` gotcha for the
  new type).
- i18n `collection.*` keys in both locales.

### Error handling

- tcgcsv down → provider returns empty map; `toEur`/holdings keep last `currentPrice`
  (existing behavior for provider failures). Search endpoints surface 502 via
  `GlobalExceptionHandler`.
- FX unavailable → omit prices rather than fabricate (same rule as Yahoo adapter).

### Testing

- `TcgCsvPriceProviderTest` — ticker parsing, group batching, USD→EUR conversion,
  cache TTL (mocked HTTP).
- `CollectibleServiceTest` — account auto-creation, position merge math
  (weighted averageBuyIn), member scoping.
- Frontend: vitest for the collection hooks' PnL math; `bun run build` type-gate.

## Out of scope

- Per-copy card condition/grading (TCGplayer market price is condition-agnostic at
  this granularity) — revisit if graded cards matter.
- Cardmarket (EU) prices — tcgcsv/TCGplayer only.
- Historical price backfill for cards — history starts at install.
- URSSAF/tax features for the auto-entreprise.
