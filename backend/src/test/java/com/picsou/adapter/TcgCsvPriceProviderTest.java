package com.picsou.adapter;

import com.picsou.adapter.TcgCsvPriceProvider.TcgTicker;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class TcgCsvPriceProviderTest {

    private static final String RIFTBOUND_PRICES = """
            {"success":true,"results":[
              {"productId":693380,"marketPrice":124.42,"subTypeName":"Normal"},
              {"productId":693380,"marketPrice":250.00,"subTypeName":"Foil"},
              {"productId":693381,"marketPrice":2.50,"subTypeName":"Normal"},
              {"productId":693382,"marketPrice":null,"subTypeName":"Normal"}]}""";

    private static final String POKEMON_PRICES = """
            {"success":true,"results":[
              {"productId":42001,"marketPrice":10.00,"subTypeName":"Reverse Holofoil"},
              {"productId":42001,"marketPrice":5.00,"subTypeName":"Normal"}]}""";

    private static final String FX_USD_EUR = """
            {"chart":{"result":[{"meta":{"regularMarketPrice":0.90,"currency":"EUR"}}]}}""";

    private TcgCsvPriceProvider providerWith(Function<String, String> routeToJson, AtomicInteger tcgCalls) {
        ExchangeFunction tcgExchange = request -> {
            String url = request.url().toString();
            if (tcgCalls != null && url.contains("tcgplayer")) tcgCalls.incrementAndGet();
            String body = routeToJson.apply(url);
            if (body == null) {
                return Mono.just(ClientResponse.create(HttpStatus.NOT_FOUND)
                    .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .body("{\"error\":\"not found\"}").build());
            }
            return Mono.just(ClientResponse.create(HttpStatus.OK)
                .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .body(body).build());
        };
        ExchangeFunction yahooExchange = request -> Mono.just(ClientResponse.create(HttpStatus.OK)
            .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
            .body(FX_USD_EUR).build());

        YahooFinancePriceProvider yahoo =
            new YahooFinancePriceProvider(WebClient.builder().exchangeFunction(yahooExchange).build());
        return new TcgCsvPriceProvider(WebClient.builder().exchangeFunction(tcgExchange).build(), yahoo);
    }

    @Test
    void ticker_roundTrips() {
        TcgTicker t = new TcgTicker(89, 24344, 693380, "N");
        assertThat(t.format()).isEqualTo("TCG:89:24344:693380:N");
        assertThat(TcgTicker.parse("TCG:89:24344:693380:N")).isEqualTo(t);
        assertThat(t.format().length()).isLessThanOrEqualTo(30);
    }

    @Test
    void ticker_parse_rejectsMalformed() {
        assertThat(TcgTicker.parse(null)).isNull();
        assertThat(TcgTicker.parse("BTC")).isNull();
        assertThat(TcgTicker.parse("TCG:89:24344:693380")).isNull();
        assertThat(TcgTicker.parse("TCG:x:24344:693380:N")).isNull();
    }

    @Test
    void supports_onlyTcgPrefix() {
        var provider = providerWith(url -> null, null);
        assertThat(provider.supports("TCG:89:24344:693380:N")).isTrue();
        assertThat(provider.supports("tcg:89:24344:693380:n")).isTrue();
        assertThat(provider.supports("AAPL")).isFalse();
        assertThat(provider.supports(null)).isFalse();
    }

    @Test
    void subTypeCode_usesInitials() {
        assertThat(TcgCsvPriceProvider.subTypeCode("Normal")).isEqualTo("N");
        assertThat(TcgCsvPriceProvider.subTypeCode("Foil")).isEqualTo("F");
        assertThat(TcgCsvPriceProvider.subTypeCode("Reverse Holofoil")).isEqualTo("RH");
        assertThat(TcgCsvPriceProvider.subTypeCode("1st Edition Holofoil")).isEqualTo("1EH");
    }

    @Test
    void getPricesEur_convertsUsdToEur_andMatchesSubType() {
        var provider = providerWith(url -> {
            if (url.contains("/tcgplayer/89/24344/prices")) return RIFTBOUND_PRICES;
            return null;
        }, null);

        Map<String, BigDecimal> result = provider.getPricesEur(
            Set.of("TCG:89:24344:693380:N", "TCG:89:24344:693380:F"));

        // 124.42 USD × 0.90 and 250.00 USD × 0.90
        assertThat(result.get("TCG:89:24344:693380:N").doubleValue()).isCloseTo(111.978, within(0.001));
        assertThat(result.get("TCG:89:24344:693380:F").doubleValue()).isCloseTo(225.0, within(0.001));
    }

    @Test
    void getPricesEur_omitsUnknownProductsAndNullPrices() {
        var provider = providerWith(url -> {
            if (url.contains("/tcgplayer/89/24344/prices")) return RIFTBOUND_PRICES;
            return null;
        }, null);

        Map<String, BigDecimal> result = provider.getPricesEur(
            Set.of("TCG:89:24344:999999:N", "TCG:89:24344:693382:N"));

        assertThat(result).isEmpty();
    }

    @Test
    void getPricesEur_fetchesEachGroupOnce_andCaches() {
        AtomicInteger calls = new AtomicInteger();
        var provider = providerWith(url -> {
            if (url.contains("/tcgplayer/89/24344/prices")) return RIFTBOUND_PRICES;
            if (url.contains("/tcgplayer/3/604/prices")) return POKEMON_PRICES;
            return null;
        }, calls);

        provider.getPricesEur(Set.of(
            "TCG:89:24344:693380:N", "TCG:89:24344:693381:N", "TCG:3:604:42001:RH"));
        assertThat(calls.get()).isEqualTo(2); // one fetch per group, not per ticker

        Map<String, BigDecimal> again = provider.getPricesEur(Set.of("TCG:3:604:42001:RH"));
        assertThat(calls.get()).isEqualTo(2); // served from the 6h cache
        assertThat(again.get("TCG:3:604:42001:RH").doubleValue()).isCloseTo(9.0, within(0.001));
    }

    @Test
    void getPricesEur_survivesGroupFetchFailure() {
        var provider = providerWith(url -> {
            if (url.contains("/tcgplayer/89/24344/prices")) return RIFTBOUND_PRICES;
            return null; // pokemon group 404s
        }, null);

        Map<String, BigDecimal> result = provider.getPricesEur(
            Set.of("TCG:89:24344:693381:N", "TCG:3:604:42001:RH"));

        assertThat(result).containsOnlyKeys("TCG:89:24344:693381:N");
    }

    @Test
    void historicalAndIntraday_areEmpty() {
        var provider = providerWith(url -> null, null);
        assertThat(provider.getHistoricalPricesEur("TCG:89:24344:693380:N", null, null)).isEmpty();
        assertThat(provider.getIntradayPricesEur("TCG:89:24344:693380:N", null, null)).isEmpty();
    }
}
