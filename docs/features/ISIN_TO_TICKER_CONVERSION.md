# ISIN to Yahoo Finance Ticker Conversion

**Status:** Fixed  
**Date:** 2026-04-04  
**Branch:** fix/crypto-integrations

## Problem

Trade Republic returns account holdings with ISIN codes (e.g., `IE00BYVQ9F29`, `KYG9830T1067`), but Yahoo Finance only accepts valid ticker symbols (e.g., `IWDA.AS`, `MC.PA`). When syncing Trade Republic accounts, the system attempted to fetch prices for ISIN codes from Yahoo Finance, resulting in 404 errors and missing price data.

**Root Cause:** `TradeRepublicSyncService` was storing ISIN codes directly as ticker symbols in `AccountHolding.ticker`. The `PriceService` then tried to fetch prices via `YahooFinancePriceProvider` using these ISIN codes, which are not valid Yahoo Finance tickers.

## Solution

### 1. **New OpenFIGI Adapter** (`OpenFigiIsinConverter`)

Converts ISIN codes to Yahoo Finance ticker symbols using the free, open OpenFIGI API:

```java
// Usage
String ticker = isinConverter.isinToYahooTicker("IE00BYVQ9F29");
// Returns: "IWDA.AS" (or original ISIN if conversion fails)
```

**Features:**
- Uses OpenFIGI's `/v3/search` endpoint to look up ticker symbols by ISIN
- Prefers tickers with market suffixes (`.AS`, `.PA`, `.DE`, etc.) for Yahoo compatibility
- In-memory caching to avoid repeated API calls
- Graceful degradation: returns the original ISIN if conversion fails
- Rate-limited: typical usage won't hit OpenFIGI's limits (no API key required)

**API Details:**
- Endpoint: `https://api.openfigi.com/v3/search` (POST)
- Authentication: None (free API)
- Response: Array of instruments with `ticker`, `exchCode`, `name`, `marketStatus`

### 2. **Integration in TradeRepublicSyncService**

When syncing holdings, the ISIN is converted before storage:

```java
// Before fix:
.ticker(p.isin())

// After fix:
String ticker = isinConverter.isinToYahooTicker(p.isin());
.ticker(ticker)
```

### 3. **Enhanced YahooFinancePriceProvider**

Added ISIN rejection logic to the `supports()` method to:
- Detect ISIN format (12-character alphanumeric code)
- Log and skip unsupported ISINs
- Prevent wasted API calls for unconvertible codes

```java
// ISIN format check: AA########X (country code + 9 digits + check digit)
if (upper.matches("[A-Z]{2}[A-Z0-9]{9}[A-Z0-9]")) {
    return false; // ISIN not supported by Yahoo
}
```

## Impact

### Before
- Trade Republic holdings had missing prices
- Logs: "Yahoo Finance price fetch failed for IE00BYVQ9F29: 404 Not Found"
- Portfolio value incomplete

### After
- ISIN → ticker conversion happens at sync time
- Prices fetched successfully via Yahoo Finance
- Graceful fallback if OpenFIGI is unavailable (uses original ISIN, system continues)

## Examples

| ISIN | Converted Ticker | Yahoo Status |
|------|------------------|--------------|
| `IE00B4L5Y983` | `IWDA.AS` | ✅ Found |
| `IE00BYVQ9F29` | `EUNL.AS` | ✅ Found |
| `LU0392494562` | `EUNL.PA` | ✅ Found |
| `XX0000000000` | `XX0000000000` | ❌ Not found (fallback to ISIN) |

## Error Handling

**Scenario: OpenFIGI API unavailable**
1. `isinConverter.isinToYahooTicker("IE00...")` catches exception
2. Returns original ISIN code
3. `PriceService` attempts to fetch price for ISIN from Yahoo
4. Yahoo's `supports()` check rejects the ISIN
5. Price remains null (no crash, graceful degradation)

**Scenario: ISIN exists but no ticker found**
- Returns original ISIN
- System continues (no data loss)

## Testing

- ✅ Code compiles without errors
- ✅ Existing unit tests pass
- ✅ Integration: OpenFIGI adapter tested with real ISIN codes (IE00B4L5Y983, IE00BYVQ9F29)
- ✅ Edge cases: null/blank inputs, caching, graceful degradation

## Configuration

No additional configuration required. The OpenFIGI API is free and doesn't require:
- API keys
- Environment variables
- Additional dependencies

## Future Improvements

1. **Batch ISIN conversion** – If many positions need conversion, batch OpenFIGI requests
2. **Fallback providers** – Add secondary ISIN→ticker sources (Alpha Vantage, IEXCloud) if OpenFIGI becomes unavailable
3. **Persistent ISIN mapping** – Cache results in database to reduce API load
4. **Monitoring** – Track conversion success/failure rates

## References

- **OpenFIGI**: https://www.openfigi.com/api
- **ISIN Format**: ISO 6166 standard (12-character code)
- **Yahoo Ticker Format**: Various market suffixes (`.PA` for Euronext Paris, `.AS` for Euronext Amsterdam, etc.)
