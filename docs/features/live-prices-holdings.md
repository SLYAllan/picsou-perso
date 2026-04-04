# Feature: Live Prices in Holdings

> Last updated: 2026-04-04

## Context

Holdings (PEA, Compte-Titres, Crypto) display prices that are only updated during a full sync. When a user navigates to an account detail page, the displayed prices may be stale — sometimes hours old. The backend already exposes `GET /api/prices?tickers=...` via `PriceController` which refreshes the cache and returns live EUR prices. This feature integrates those live prices into the holdings table on page navigation.

## How it works

The frontend fetches holdings and live prices in parallel, then merges them client-side.

### Data flow

```
User navigates to account detail
        |
        v
useHoldingsWithLivePrices(id)
        |
        +-- GET /api/accounts/{id}/holdings  (DB prices, may be stale)
        |
        +-- GET /api/prices?tickers=BTC,ETH,IWDA.AS  (live prices from providers)
        |
        v
Merge: override currentPrice with live price
Recalculate: currentValueEur, pnlEur, pnlPercent
        |
        v
HoldingsTable renders with live prices
```

If the prices API fails (network error, provider down), the hook falls back to the DB prices gracefully.

### Key files

- `frontend/src/features/accounts/api.ts` — `prices(tickers)` API function
- `frontend/src/features/accounts/hooks.ts` — `useHoldingsWithLivePrices(id)` hook
- `frontend/src/pages/accounts/AccountDetailPage.tsx` — uses the new hook

## Technical choices

| Choice | Why | Rejected alternative |
|--------|-----|----------------------|
| Two separate API calls (holdings + prices) | Clean separation of concerns; prices API is reusable; backend unchanged | Backend-side price refresh in `getHoldings()` (slower page load, couples concerns) |
| Client-side merge | No backend change needed; works with existing `HoldingResponse` shape | New dedicated endpoint returning enriched holdings (more backend work) |
| Graceful degradation on price failure | Better UX than showing errors for non-critical price data | Throwing error / blocking page render |

## Gotchas / Pitfalls

- **Prices are not persisted**: Live prices are only used for display. The DB `current_price` in `account_holding` is not updated — that still happens during sync.
- **`useAccountHoldings` still exists**: The old hook is kept for the `usePortfolio` hook which fetches holdings for all accounts (portfolio view). Switching it to live prices would trigger many price API calls at once.
- **No polling**: Prices refresh only on navigation (TanStack Query stale time of 2 min). There is no auto-refresh or polling interval.
- **Yahoo Finance is unofficial**: See [price-service.md](./price-service.md) gotchas. If Yahoo is down, stock/ETF prices fall back to stale DB values.

## Tests

- Manual: navigate to a PEA/CT/Crypto account, verify `/api/prices` call in network tab and live prices in table
- Manual: navigate to a checking/savings account, verify no `/api/prices` call

## Links

- Related feature: [Price Service](./price-service.md)
- Related ADR: [Ports and adapters](../decisions/2026-01-01-ports-and-adapters.md)
