package com.picsou.adapter;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Converts ISIN codes to Yahoo Finance ticker symbols using the free OpenFIGI API.
 *
 * Trade Republic returns ISIN codes (e.g. IE00BYVQ9F29) but Yahoo Finance expects
 * ticker symbols (e.g. IWDA.AS, MC.PA). This adapter fills that gap.
 *
 * OpenFIGI API: https://www.openfigi.com/api
 * No authentication required. Rate limit: reasonable for typical usage.
 */
@Component
public class OpenFigiIsinConverter {

    private static final Logger log = LoggerFactory.getLogger(OpenFigiIsinConverter.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final WebClient webClient;
    // Simple cache: ISIN -> ticker (or null if conversion failed)
    private final Map<String, String> tickerCache = new ConcurrentHashMap<>();

    public OpenFigiIsinConverter() {
        this.webClient = WebClient.builder()
            .baseUrl("https://api.openfigi.com")
            .defaultHeader("Accept", "application/json")
            .build();
    }

    /**
     * Converts an ISIN to a Yahoo Finance ticker symbol.
     *
     * Returns the original ISIN if conversion fails — this allows the code
     * to gracefully degrade (caller can handle the unconverted ISIN).
     *
     * @param isin The ISIN code (e.g. "IE00BYVQ9F29")
     * @return Yahoo ticker if found (e.g. "IWDA.AS"), otherwise the original ISIN
     */
    public String isinToYahooTicker(String isin) {
        if (isin == null || isin.isBlank()) {
            return isin;
        }

        // Check cache first
        if (tickerCache.containsKey(isin)) {
            String cached = tickerCache.get(isin);
            if (cached != null) {
                log.debug("ISIN {} resolved from cache -> {}", isin, cached);
            }
            return cached != null ? cached : isin;
        }

        try {
            String ticker = fetchTickerFromOpenFigi(isin);
            if (ticker != null && !ticker.isBlank()) {
                tickerCache.put(isin, ticker);
                log.info("ISIN {} resolved via OpenFIGI -> {}", isin, ticker);
                return ticker;
            } else {
                // Cache the failure so we don't retry
                tickerCache.put(isin, null);
                log.warn("OpenFIGI returned no ticker for ISIN {}, will use ISIN as-is", isin);
                return isin;
            }
        } catch (Exception ex) {
            // Cache the failure
            tickerCache.put(isin, null);
            log.warn("Failed to convert ISIN {} via OpenFIGI: {}, will use ISIN as-is",
                     isin, ex.getMessage());
            return isin;
        }
    }

    private String fetchTickerFromOpenFigi(String isin) {
        OpenFigiRequest request = new OpenFigiRequest(
            List.of(new OpenFigiQuery(isin)) // OpenFIGI assumes ID_ISIN by default
        );

        try {
            // OpenFIGI returns an array of results directly
            OpenFigiResults results = webClient.post()
                .uri("/v3/search")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(OpenFigiResults.class)
                .timeout(TIMEOUT)
                .block();

            if (results == null || results.data() == null || results.data().isEmpty()) {
                return null;
            }

            // Find the first valid ticker with a proper market suffix (e.g., .PA, .AS, .DE)
            return results.data().stream()
                .filter(r -> r.ticker() != null && !r.ticker().isBlank())
                // Prefer tickers with a market suffix (e.g., IWDA.AS) - more compatible with Yahoo
                .sorted((a, b) -> {
                    boolean aHasSuffix = a.ticker().contains(".");
                    boolean bHasSuffix = b.ticker().contains(".");
                    if (aHasSuffix && !bHasSuffix) return -1;
                    if (!aHasSuffix && bHasSuffix) return 1;
                    return 0;
                })
                .map(OpenFigiResult::ticker)
                .findFirst()
                .orElse(null);
        } catch (Exception ex) {
            log.warn("OpenFIGI API request failed for ISIN {}: {}", isin, ex.getMessage());
            return null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record OpenFigiRequest(List<OpenFigiQuery> idType) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record OpenFigiQuery(String idValue) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record OpenFigiResults(List<OpenFigiResult> data) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record OpenFigiResult(
        String ticker,
        String exchCode,
        String name,
        String marketStatus
    ) {}
}
