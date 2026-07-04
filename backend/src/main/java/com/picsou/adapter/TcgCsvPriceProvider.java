package com.picsou.adapter;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.picsou.port.PriceProviderPort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Prices TCG cards (Pokémon, One Piece, Riftbound...) from tcgcsv.com, which
 * republishes the TCGplayer catalog and daily market prices (free, no API key,
 * refreshed once a day around 20:00 UTC).
 *
 * Cards are identified by a synthetic ticker:
 *
 *   TCG:{categoryId}:{groupId}:{productId}:{subTypeCode}
 *
 * where subTypeCode is the uppercase initials of TCGplayer's subTypeName
 * ("Normal" → N, "Foil" → F, "Holofoil" → H, "Reverse Holofoil" → RH, ...).
 *
 * TCGplayer prices are USD; they are converted to EUR with Yahoo's USDEUR=X
 * rate so this provider honors the PriceProviderPort contract (EUR out).
 * Market price is condition-agnostic (~Near Mint).
 */
@Component
public class TcgCsvPriceProvider implements PriceProviderPort {

    private static final Logger log = LoggerFactory.getLogger(TcgCsvPriceProvider.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    // tcgcsv updates daily; the hourly scheduler must not refetch every group file each run
    private static final Duration PRICE_CACHE_TTL = Duration.ofHours(6);
    private static final Duration CATALOG_CACHE_TTL = Duration.ofHours(24);

    public static final String TICKER_PREFIX = "TCG:";

    /** Games supported by this fork: TCGplayer categoryId → display name. */
    public static final Map<Integer, String> SUPPORTED_GAMES = new LinkedHashMap<>() {{
        put(3, "Pokémon");
        put(85, "Pokémon Japan");
        put(68, "One Piece Card Game");
        put(89, "Riftbound (League of Legends)");
    }};

    private final WebClient webClient;
    private final YahooFinancePriceProvider yahoo;

    // "cat:group" → cached price file (productId+subTypeCode → USD market price)
    private final Map<String, CachedPrices> priceCache = new ConcurrentHashMap<>();
    // "cat" → cached groups, "cat:group" → cached products
    private final Map<String, CachedCatalog<TcgGroup>> groupsCache = new ConcurrentHashMap<>();
    private final Map<String, CachedCatalog<TcgProduct>> productsCache = new ConcurrentHashMap<>();

    @Autowired
    public TcgCsvPriceProvider(YahooFinancePriceProvider yahoo) {
        this(WebClient.builder()
            .baseUrl("https://tcgcsv.com")
            .defaultHeader("Accept", "application/json")
            // tcgcsv rejects the default ReactorNetty user agent with a 401
            .defaultHeader("User-Agent", "Mozilla/5.0")
            .codecs(c -> c.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
            .build(), yahoo);
    }

    // Package-private constructor for tests.
    TcgCsvPriceProvider(WebClient webClient, YahooFinancePriceProvider yahoo) {
        this.webClient = webClient;
        this.yahoo = yahoo;
    }

    @Override
    public boolean supports(String ticker) {
        return ticker != null && ticker.toUpperCase().startsWith(TICKER_PREFIX);
    }

    @Override
    public Map<String, BigDecimal> getPricesEur(Set<String> tickers) {
        List<TcgTicker> parsed = tickers.stream()
            .filter(this::supports)
            .map(TcgTicker::parse)
            .filter(Objects::nonNull)
            .toList();
        if (parsed.isEmpty()) return Map.of();

        BigDecimal usdEur = yahoo.getFxRateToEur("USD");
        if (usdEur == null) {
            log.warn("Skipping {} TCG prices: USD→EUR rate unavailable", parsed.size());
            return Map.of();
        }

        Map<String, BigDecimal> result = new HashMap<>();
        Map<String, List<TcgTicker>> byGroup = parsed.stream()
            .collect(Collectors.groupingBy(t -> t.categoryId() + ":" + t.groupId()));

        for (var entry : byGroup.entrySet()) {
            Map<String, BigDecimal> groupPricesUsd = getGroupPricesUsd(entry.getValue().get(0));
            for (TcgTicker t : entry.getValue()) {
                BigDecimal usd = groupPricesUsd.get(t.productId() + ":" + t.subTypeCode());
                if (usd != null) {
                    result.put(t.format(), usd.multiply(usdEur));
                }
            }
        }
        return result;
    }

    /** No per-product history on tcgcsv — card history accrues from daily snapshots. */
    public Map<LocalDate, BigDecimal> getHistoricalPricesEur(String ticker, LocalDate from, LocalDate to) {
        return Map.of();
    }

    /** Daily prices only — no intraday data. */
    public Map<LocalDateTime, BigDecimal> getIntradayPricesEur(String ticker, LocalDateTime from, LocalDateTime to) {
        return Map.of();
    }

    // ─── Catalog (used by CollectibleService for game/set/card search) ────────

    public List<TcgGroup> getGroups(int categoryId) {
        String key = String.valueOf(categoryId);
        CachedCatalog<TcgGroup> cached = groupsCache.get(key);
        if (cached != null && cached.isFresh()) return cached.items();

        GroupsResponse response = fetch("/tcgplayer/" + categoryId + "/groups", GroupsResponse.class);
        List<TcgGroup> groups = response != null && response.results() != null ? response.results() : List.of();
        if (!groups.isEmpty()) groupsCache.put(key, new CachedCatalog<>(groups, Instant.now()));
        return groups;
    }

    public List<TcgProduct> getProducts(int categoryId, long groupId) {
        String key = categoryId + ":" + groupId;
        CachedCatalog<TcgProduct> cached = productsCache.get(key);
        if (cached != null && cached.isFresh()) return cached.items();

        ProductsResponse response = fetch("/tcgplayer/" + categoryId + "/" + groupId + "/products", ProductsResponse.class);
        List<TcgProduct> products = response != null && response.results() != null ? response.results() : List.of();
        if (!products.isEmpty()) productsCache.put(key, new CachedCatalog<>(products, Instant.now()));
        return products;
    }

    /** Raw USD market prices for a set, keyed by "productId:subTypeCode". */
    public Map<String, BigDecimal> getGroupPricesUsd(int categoryId, long groupId) {
        String key = categoryId + ":" + groupId;
        CachedPrices cached = priceCache.get(key);
        if (cached != null && cached.isFresh()) return cached.prices();

        PricesResponse response = fetch("/tcgplayer/" + categoryId + "/" + groupId + "/prices", PricesResponse.class);
        if (response == null || response.results() == null) {
            // Keep serving stale data on transient failures rather than dropping prices
            return cached != null ? cached.prices() : Map.of();
        }

        Map<String, BigDecimal> prices = new HashMap<>();
        for (TcgPrice p : response.results()) {
            if (p.marketPrice() == null || p.subTypeName() == null) continue;
            prices.put(p.productId() + ":" + subTypeCode(p.subTypeName()), p.marketPrice());
        }
        priceCache.put(key, new CachedPrices(prices, Instant.now()));
        return prices;
    }

    private Map<String, BigDecimal> getGroupPricesUsd(TcgTicker t) {
        try {
            return getGroupPricesUsd(t.categoryId(), t.groupId());
        } catch (Exception ex) {
            log.warn("tcgcsv price fetch failed for {}/{}: {}", t.categoryId(), t.groupId(), ex.getMessage());
            return Map.of();
        }
    }

    private <T> T fetch(String uri, Class<T> type) {
        try {
            return webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(type)
                .timeout(TIMEOUT)
                .block();
        } catch (Exception ex) {
            log.warn("tcgcsv fetch failed for {}: {}", uri, ex.getMessage());
            return null;
        }
    }

    /** Uppercase initials of a TCGplayer subTypeName: "Reverse Holofoil" → "RH". */
    public static String subTypeCode(String subTypeName) {
        StringBuilder sb = new StringBuilder();
        for (String word : subTypeName.trim().split("\\s+")) {
            sb.append(Character.toUpperCase(word.charAt(0)));
        }
        return sb.toString();
    }

    // ─── Ticker ───────────────────────────────────────────────────────────────

    /** Synthetic ticker: TCG:{categoryId}:{groupId}:{productId}:{subTypeCode}. */
    public record TcgTicker(int categoryId, long groupId, long productId, String subTypeCode) {

        public String format() {
            return TICKER_PREFIX + categoryId + ":" + groupId + ":" + productId + ":" + subTypeCode;
        }

        /** Returns null for malformed tickers. */
        public static TcgTicker parse(String ticker) {
            if (ticker == null) return null;
            String[] parts = ticker.toUpperCase().split(":");
            if (parts.length != 5 || !"TCG".equals(parts[0])) return null;
            try {
                return new TcgTicker(Integer.parseInt(parts[1]), Long.parseLong(parts[2]),
                    Long.parseLong(parts[3]), parts[4]);
            } catch (NumberFormatException ex) {
                return null;
            }
        }
    }

    // ─── JSON payloads ────────────────────────────────────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GroupsResponse(List<TcgGroup> results) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TcgGroup(long groupId, String name, String abbreviation, String publishedOn) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ProductsResponse(List<TcgProduct> results) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TcgProduct(long productId, String name, String cleanName, String imageUrl) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PricesResponse(List<TcgPrice> results) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TcgPrice(long productId, BigDecimal marketPrice, String subTypeName) {}

    private record CachedPrices(Map<String, BigDecimal> prices, Instant cachedAt) {
        boolean isFresh() { return Instant.now().isBefore(cachedAt.plus(PRICE_CACHE_TTL)); }
    }

    private record CachedCatalog<T>(List<T> items, Instant cachedAt) {
        boolean isFresh() { return Instant.now().isBefore(cachedAt.plus(CATALOG_CACHE_TTL)); }
    }
}
