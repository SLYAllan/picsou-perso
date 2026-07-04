# Account Scope + TCG Collectibles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every account PERSONAL/BUSINESS with dashboard filtering, and track TCG cards (Pokémon, Pokémon Japan, One Piece, Riftbound) as holdings valued daily from tcgcsv.com, included in net worth.

**Architecture:** Feature A is one column threaded through Account → DTOs → forms → a client-side dashboard toggle (mirrors `wealthMode`). Feature B reuses the whole holdings valuation pipeline: cards are `AccountHolding` rows on an auto-created `COLLECTIBLE` account, priced by a new `TcgCsvPriceProvider` behind `PriceProviderPort` with synthetic tickers `TCG:{cat}:{group}:{product}:{N|F}`.

**Tech Stack:** Java 21 / Spring Boot 3.4, Flyway V38, React 19 / TS / TanStack Query / Recharts, tcgcsv.com (free, no key), Yahoo `USDEUR=X` for FX.

## Global Constraints

- Flyway owns schema; `ddl-auto: validate`. Next migration file: `V38__scope_and_collectibles.sql`.
- Money: `NUMERIC(20,8)` / `BigDecimal`. Timestamps: `TIMESTAMPTZ` / `Instant`.
- Every repo query member-scoped; controllers resolve `UserContext.currentMemberId()`.
- Controllers: records + Jakarta validation, no try/catch, `@ResponseStatus(CREATED)` on POST, 204 on DELETE. Update `backend/docs/API.md`.
- Frontend: API calls in `features/*/api.ts`, hooks in `features/*/hooks.ts`, semantic Tailwind tokens only (never `text-gray-*`), lucide icons, key-remount + lazy-init for modals, both `en.json`/`fr.json`.
- Tests green: `mvn test` (H2), `bun run build`, `bun run lint`, `bunx vitest run`.
- Conventional commits on branch `feature/scope-and-collectibles`.

---

### Task 1: Migration V38 + AccountScope + COLLECTIBLE type (backend model layer)

**Files:**
- Create: `backend/src/main/resources/db/migration/V38__scope_and_collectibles.sql`
- Create: `backend/src/main/java/com/picsou/model/AccountScope.java`
- Modify: `backend/src/main/java/com/picsou/model/Account.java` (add `scope`)
- Modify: `backend/src/main/java/com/picsou/model/AccountType.java` (add `COLLECTIBLE`)
- Modify: `backend/src/main/java/com/picsou/model/AccountHolding.java` (add `imageUrl`)

**Interfaces:**
- Produces: `AccountScope { PERSONAL, BUSINESS }`, `Account.getScope()/setScope()`, `AccountType.COLLECTIBLE`, `AccountHolding.getImageUrl()/setImageUrl()`.

- [ ] **Step 1: Write the migration**

```sql
-- V38: PERSONAL/BUSINESS account scope + TCG collectibles support

ALTER TYPE account_type ADD VALUE IF NOT EXISTS 'COLLECTIBLE' BEFORE 'OTHER';

ALTER TABLE account
    ADD COLUMN scope VARCHAR(10) NOT NULL DEFAULT 'PERSONAL'
        CONSTRAINT ck_account_scope CHECK (scope IN ('PERSONAL', 'BUSINESS'));

ALTER TABLE account_holding
    ADD COLUMN image_url VARCHAR(300);
```

Note: `ALTER TYPE ... ADD VALUE` in a transactional migration is safe on PG ≥ 12 as long as the value is not used later in the same migration (same pattern as V19). H2 tests: check how `account_type` enum is handled in test config (`application-test.yml` / H2 compatibility mode) and mirror it; the `scope` column is plain VARCHAR so no H2 friction.

- [ ] **Step 2: Java enum + entity fields**

`AccountScope.java`:
```java
package com.picsou.model;

public enum AccountScope {
    PERSONAL,
    BUSINESS
}
```

`Account.java` — after the `type` field:
```java
@Enumerated(EnumType.STRING)
@Column(nullable = false, length = 10)
@Builder.Default
private AccountScope scope = AccountScope.PERSONAL;
```

`AccountType.java` — add `COLLECTIBLE` before `OTHER` (match DB order).

`AccountHolding.java`:
```java
@Column(name = "image_url", length = 300)
private String imageUrl;
```

- [ ] **Step 3: Run backend tests** — `cd backend && mvn test`. Expected: green (entities match H2 schema generated from migrations or validate mode; fix test config if the new enum value breaks H2).

- [ ] **Step 4: Commit** — `feat(model): account scope, COLLECTIBLE type, holding image_url (V38)`

### Task 2: Scope through DTOs, AccountService, dashboard distribution

**Files:**
- Modify: `backend/src/main/java/com/picsou/dto/AccountRequest.java`
- Modify: `backend/src/main/java/com/picsou/dto/AccountResponse.java`
- Modify: `backend/src/main/java/com/picsou/service/AccountService.java` (create/update copy `scope`, null → PERSONAL)
- Modify: `backend/src/main/java/com/picsou/dto/DashboardResponse.java` (`DistributionItem` + `scope`)
- Modify: `backend/src/main/java/com/picsou/service/DashboardService.java` (`buildDistribution` fills it)
- Test: extend existing `AccountServiceTest`

**Interfaces:**
- Consumes: `AccountScope` (Task 1).
- Produces: `AccountRequest.scope()` (nullable `AccountScope`), `AccountResponse.scope()` (non-null), `DistributionItem.scope()` (String, e.g. `"PERSONAL"`).

- [ ] **Step 1: Failing test** — in `AccountServiceTest`: create with `scope=BUSINESS` → entity has BUSINESS; create with `scope=null` → PERSONAL.
- [ ] **Step 2: Add `AccountScope scope` to `AccountRequest`** (no annotation, nullable). Add `AccountScope scope` to `AccountResponse` record + `from()` + both withers (they re-list all fields). In `AccountService.create`: `.scope(req.scope() != null ? req.scope() : AccountScope.PERSONAL)`; in `update`: `if (req.scope() != null) account.setScope(req.scope());`.
- [ ] **Step 3: `DistributionItem`** gains `String scope`; `buildDistribution` passes `account.getScope().name()`.
- [ ] **Step 4: `mvn test`** green. **Step 5: Commit** — `feat(accounts): expose PERSONAL/BUSINESS scope in API`

### Task 3: TcgCsvPriceProvider + PriceService routing + scheduler snapshot

**Files:**
- Create: `backend/src/main/java/com/picsou/adapter/TcgCsvPriceProvider.java`
- Modify: `backend/src/main/java/com/picsou/service/PriceService.java` (route `TCG:` tickers in `getPriceEur`, `refreshPrices`, `backfillHistoricalPrices`, `getIntradayPricesEur`)
- Modify: `backend/src/main/java/com/picsou/service/SchedulerService.java` (hourly refresh also covers TCG holding tickers)
- Test: `backend/src/test/java/com/picsou/adapter/TcgCsvPriceProviderTest.java`

**Interfaces:**
- Produces: `TcgCsvPriceProvider implements PriceProviderPort` — `supports(t)` = `t.startsWith("TCG:")`; `getPricesEur(Set<String>)` returns EUR; `getHistoricalPricesEur/getIntradayPricesEur` return empty maps. Ticker format **`TCG:{categoryId}:{groupId}:{productId}:{N|F}`** (uppercase, ≤ 30 chars). Static helper `public record TcgTicker(int categoryId, long groupId, long productId, boolean foil)` with `parse(String)`/`format(...)`.
- Consumes: `YahooFinancePriceProvider.getFxRateToEur("USD")` (package-private, same `adapter` package).

- [ ] **Step 1: Failing tests** — ticker parse/format round-trip; `getPricesEur` groups tickers by (cat,group), one HTTP call per group (mock `RestClient`/`HttpClient` the same way `YahooFinancePriceProviderTest` mocks), picks `marketPrice` matching productId + subType (`Normal`/`Foil`), multiplies by mocked FX 0.9; unknown product → omitted from map; group fetch failure → other groups still returned.
- [ ] **Step 2: Implement provider.** Fetch `https://tcgcsv.com/tcgplayer/{cat}/{group}/prices`, JSON `results[]` with `productId, marketPrice, subTypeName`. Per-group in-memory cache `ConcurrentHashMap<String, CachedGroup>` TTL 6 h (tcgcsv updates daily). `// ponytail: subTypeName matched as 'Foil' contains-check; extend map if a game adds finishes`. FX: call `yahoo.getFxRateToEur("USD")`; if empty → return empty map (never fabricate).
- [ ] **Step 3: PriceService routing** — inject `TcgCsvPriceProvider tcg`; in each of the 4 routing sites check `tcg.supports(upper)` first. In `refreshPrices` add a third partition `tcgTickers` handled by `tcg.getPricesEur` (snapshots then persist automatically via the existing loop).
- [ ] **Step 4: SchedulerService.refreshPrices()** — after the member loop:
```java
Set<String> tcgTickers = holdingRepository.findDistinctTickers().stream()
    .filter(t -> t.startsWith("TCG:"))
    .collect(Collectors.toSet());
if (!tcgTickers.isEmpty()) priceService.refreshPrices(tcgTickers);
```
(inject `AccountHoldingRepository`; prices are member-independent — one global call. This is what persists the daily `price_snapshot` history for cards.)
- [ ] **Step 5: `mvn test`** green. **Step 6: Commit** — `feat(prices): tcgcsv.com provider for TCG card prices (USD→EUR)`

### Task 4: Collectibles API (search + CRUD)

**Files:**
- Create: `backend/src/main/java/com/picsou/service/CollectibleService.java`
- Create: `backend/src/main/java/com/picsou/controller/CollectibleController.java`
- Create: `backend/src/main/java/com/picsou/dto/CollectibleCardRequest.java`, `CollectibleGameResponse.java`, `CollectibleGroupResponse.java`, `CollectibleProductResponse.java`
- Modify: `backend/src/main/java/com/picsou/adapter/TcgCsvPriceProvider.java` (add catalog fetchers `getGroups(cat)`, `getProducts(cat, group)` with 24 h cache — same adapter owns all tcgcsv HTTP)
- Modify: `backend/docs/API.md`
- Test: `backend/src/test/java/com/picsou/service/CollectibleServiceTest.java`

**Interfaces:**
- Produces REST under `/api/collectibles`:
  - `GET /games` → `[{categoryId, name}]` — hardcoded: 3 Pokémon, 85 Pokémon Japan, 68 One Piece, 89 Riftbound
  - `GET /games/{categoryId}/groups` → `[{groupId, name, abbreviation, publishedOn}]`
  - `GET /games/{categoryId}/groups/{groupId}/products?q=` → `[{productId, name, imageUrl, marketPriceUsd, marketPriceUsdFoil}]` (name-contains filter, case/diacritic-insensitive)
  - `POST /cards` body `CollectibleCardRequest{@NotNull categoryId, @NotNull groupId, @NotNull productId, @NotNull @Pattern("N|F") subType, @NotNull @Min(1) quantity, @DecimalMin("0") purchasePriceEur, @NotBlank name, imageUrl}` → 201 `AccountHolding`-shaped response
  - `PUT /cards/{holdingId}` body `{quantity, averageBuyIn}` → 200; `DELETE /cards/{holdingId}` → 204
- `CollectibleService.addCard(memberId/member, req)`: find-or-create member's `COLLECTIBLE` account (name "Collection", `isManual=true`, color `#f59e0b`, currency EUR, scope PERSONAL); ticker = `TcgTicker.format(...)`; merge into UNIQUE(account_id,ticker) row with weighted average: `newAvg = (oldQty*oldAvg + addQty*price) / (oldQty+addQty)` (null old avg → treat as 0 qty contribution).

- [ ] **Step 1: Failing service tests** — auto-creates account once (second add reuses it); merge math (2 @10 + 1 @16 → qty 3, avg 12); member scoping (edit/delete a holding whose account belongs to another member → `NotFound`).
- [ ] **Step 2: Implement service + controller** (controller thin, resolves `userContext.currentMemberId()`; rate limiting not needed — internal catalog proxy).
- [ ] **Step 3: `mvn test`** green. **Step 4: Update `backend/docs/API.md`**. **Step 5: Commit** — `feat(collectibles): card catalog search + collection CRUD`

### Task 5: Frontend scope (types, form, dashboard + accounts toggle)

**Files:**
- Modify: `frontend/src/types/api.ts` (`scope: 'PERSONAL' | 'BUSINESS'` on `Account`, `AccountRequest`, distribution item)
- Modify: `frontend/src/components/shared/AccountForm.tsx` (Zod + select, mirror the `type` select)
- Modify: `frontend/src/components/shared/AddAccountModal.tsx` (`handleManualSubmit` passes `scope`)
- Modify: `frontend/src/pages/accounts/AccountsPage.tsx` (edit submit + defaults + toggle)
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx` (Perso/Pro/Tout segmented toggle filtering `distribution`/`liabilities` → headline + `chartAccountIds`, exactly like `wealthMode`)
- Modify: `frontend/src/i18n/locales/en.json`, `fr.json`

**Interfaces:**
- Consumes: `AccountResponse.scope`, `DistributionItem.scope` (Task 2).
- Produces: i18n keys `accounts.scope.label`, `accounts.scope.PERSONAL` ("Personal"/"Perso"), `accounts.scope.BUSINESS` ("Business"/"Pro"), `accounts.scope.ALL` ("All"/"Tout").

- [ ] **Step 1:** types + form field (default `'PERSONAL'`) + both submit paths + edit defaults.
- [ ] **Step 2:** Dashboard toggle: `useState<'ALL'|'PERSONAL'|'BUSINESS'>('ALL')`, three-button segmented control (shadcn `Tabs` or button group like `AccountsPage` filter pills), `useMemo` filter `d.scope === scopeFilter` when not ALL. AccountsPage: same filter applied to `accounts` before the asset-type filter.
- [ ] **Step 3:** `bun run build && bun run lint` green. **Step 4: Commit** — `feat(frontend): perso/pro scope on accounts and dashboard filter`

### Task 6: Frontend Collection page

**Files:**
- Create: `frontend/src/features/collection/api.ts`, `hooks.ts`
- Create: `frontend/src/pages/collection/CollectionPage.tsx`
- Create: `frontend/src/components/shared/AddCardModal.tsx`, `CardDetailModal.tsx`
- Modify: `frontend/src/app/lazy-pages.tsx`, `frontend/src/app/routes.tsx` (route `collection`)
- Modify: `frontend/src/components/layout/AppSidebar.tsx` (`NAV_ITEMS` + lucide `WalletCards` icon)
- Modify: `frontend/src/pages/accounts/AccountsPage.tsx` (`ASSET_FILTER_MAP`: add COLLECTIBLE to a new or existing category so the type doesn't vanish from the ALL chart)
- Modify: `frontend/src/i18n/locales/en.json`, `fr.json` (`collection.*`, `nav.collection`, `accountTypes.COLLECTIBLE`)
- Test: `frontend/src/features/collection/hooks.test.ts` (PnL math)

**Interfaces:**
- Consumes: `/api/collectibles/*` (Task 4), `usePortfolio()` from `features/accounts/hooks.ts` (already prices holdings live), `usePriceHistory(ticker, months, range)` (existing `/prices/{ticker}/history`), `NetWorthChart`.
- Produces: hooks `useGames()`, `useGroups(categoryId)`, `useCardSearch(categoryId, groupId, q)`, `useAddCard()`, `useUpdateCard()`, `useDeleteCard()` (mutations invalidate `['accounts']`, `['dashboard']`, `['portfolio']`).

- [ ] **Step 1:** api.ts + hooks (+ vitest for value/costBasis/pnl derivation from a `PortfolioLine`).
- [ ] **Step 2:** `CollectionPage` clones `HoldingsCard` layout: summary header (total value/cost/PnL ±%), game filter tabs, search input, rows with `image_url` thumbnail (fallback icon), qty, value, PnL; row click → `CardDetailModal`; header button → `AddCardModal`. Filter portfolio lines to accounts of type `COLLECTIBLE`. Empty state via `EmptyState`.
- [ ] **Step 3:** `AddCardModal` (key-remount + lazy-init): game select → set select → debounced name search → result rows show name/set/image/market price (EUR-converted display can show USD price directly labeled as $) → pick → qty (`NumericInput`), buy-in EUR, subtype toggle Normal/Foil → submit `useAddCard`.
- [ ] **Step 4:** `CardDetailModal` clones `HoldingDetailModal` minus composition: reuses `NetWorthChart` with `usePriceHistory(line.ticker)`; stats grid (market price, copies, cost basis, PnL, subtype); edit qty/buy-in + delete (`ConfirmDialog`).
- [ ] **Step 5:** route + sidebar + i18n; mobile bottom nav untouched (skipped: 2/2 grid reflow — Collection reachable via sidebar).
- [ ] **Step 6:** `bun run build && bun run lint && bunx vitest run` green. **Step 7: Commit** — `feat(frontend): TCG collection page with live card prices`

### Task 7: Docs + final verification

**Files:**
- Create: `docs/features/account-scope.md`, `docs/features/tcg-collectibles.md` (template `docs/templates/FEATURE.md`)
- Modify: `docs/INDEX.md`, `docs/conventions/database.md` (V38 row in the migration table)

- [ ] **Step 1:** feature docs (context, how it works, key files, gotchas: ticker format, tcgcsv daily cadence, no historical backfill, condition-agnostic pricing).
- [ ] **Step 2:** full gate: `mvn test`, `bun run build`, `bun run lint`, `bunx vitest run`.
- [ ] **Step 3:** Commit — `docs: feature notes for account scope and TCG collectibles`

## Self-review

- Spec coverage: A (migration T1, API T2, UI T5) ✓; B (provider T3, API T4, UI T6, net-worth inclusion free via holdings path) ✓; docs T7 ✓.
- No placeholders; interfaces named consistently (`TcgTicker`, `scope`, `/api/collectibles`).
- Types consistent: `AccountScope` enum backend, `'PERSONAL' | 'BUSINESS'` union frontend; ticker `TCG:{cat}:{group}:{product}:{N|F}` everywhere.
