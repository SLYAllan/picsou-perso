# Feature: ISIN to Yahoo Finance Ticker Conversion

> Last updated: 2026-04-04

## Context

Trade Republic returns account holdings with ISIN codes (e.g., `IE00BYVQ9F29`), but Yahoo Finance expects ticker symbols (e.g., `IWDA.AS`). This feature converts ISINs to Yahoo-compatible tickers, enabling price lookups for equities and ETFs synced from Trade Republic.

## How it works

### Key files

- `adapter/OpenFigiIsinConverter.java` — ISIN→ticker conversion via OpenFIGI API
- `service/TradeRepublicSyncService.java` — calls converter during sync (line 284)
- `adapter/YahooFinancePriceProvider.java` — rejects unconvertible ISINs

### Flow

```
TR WebSocket → TrPosition(isin)
    ↓
TradeRepublicSyncService.upsertAccount()
    ↓
openFigiIsinConverter.isinToYahooTicker(isin)
    ↓
OpenFIGI API /v3/search → returns ticker with market suffix
    ↓
Stored as AccountHolding.ticker = "IWDA.AS"
    ↓
PriceService.getPriceEur("IWDA.AS")
    ↓
YahooFinancePriceProvider.getPricesEur() → Yahoo API ✅
```

## Technical choices

| Choice | Why | Rejected alternative |
|--------|-----|----------------------|
| OpenFIGI API | Free, no auth required, returns market-suffixed tickers that Yahoo accepts | ISIN2Ticker.com (commercial), Alpha Vantage (requires key), manual mapping database |
| In-memory caching | Avoids repeated API calls during bulk sync operations | Database caching (adds complexity, slower for temporary holdings), no caching (hits API N times per sync) |
| Graceful degradation (return original ISIN on failure) | Prevents sync failure and data loss if OpenFIGI is unavailable; Yahoo's `supports()` check then filters it | Fail-fast exception (breaks sync entirely) |
| ISIN format regex in `YahooFinancePriceProvider.supports()` | Prevents wasted API calls to Yahoo for codes that will never resolve | Try Yahoo first, catch 404 (wastes bandwidth, slower) |

## Gotchas / Pitfalls

- **ISIN codes are 12-character strings** (`[A-Z]{2}[A-Z0-9]{9}[A-Z0-9]`). The regex in `supports()` line 56-57 detects them — don't change this logic without testing multiple ISINs.
- **OpenFIGI returns multiple results** — we prefer tickers with market suffixes (`.AS`, `.PA`, `.DE`) because Yahoo requires them. A ticker without suffix (plain `IWDA`) might exist but won't work in Yahoo.
- **Caching is in-memory only** — cache is lost on app restart. This is fine because: (a) holdings rarely change during a session, (b) most syncs happen via scheduled job (daily), (c) OpenFIGI queries are fast anyway. See "Future Improvements" for persistent caching.
- **If conversion fails, system doesn't crash** — it returns the original ISIN, then `YahooFinancePriceProvider.supports()` rejects it, and price remains null. This is intentional and safe.

## Tests

- No dedicated unit tests for OpenFigiIsinConverter (WebClient mock setup is complex; validated via integration testing with real ISINs)
- Integration testing: GoalServiceTest + manual testing with Trade Republic sync (verified with IE00B4L5Y983, IE00BYVQ9F29)
- Edge cases covered: null/blank inputs, caching, OpenFIGI API timeout

## Links

- Related feature: [price-service.md](./price-service.md) (price lookups)
- Related feature: [trade-republic.md](./trade-republic.md) (TR sync)
- No ADR needed — this is an adapter for external data transformation, not an architectural decision
