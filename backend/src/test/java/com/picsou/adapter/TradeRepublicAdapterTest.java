package com.picsou.adapter;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TradeRepublicAdapterTest {

    private final TradeRepublicAdapter adapter =
        new TradeRepublicAdapter(new ObjectMapper(), "http://tr-auth:8001");

    private static String fakeJwt(String claimsJson) {
        String header = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
        String payload = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(claimsJson.getBytes(StandardCharsets.UTF_8));
        return header + "." + payload + ".sig";
    }

    @Test
    void extractsDefaultPortfolio() {
        String jwt = fakeJwt("""
            {"act":{"acc":{"owner":{"default":{"sec":["0272893201"],"cash":["0272893211"]}}}}}""");

        assertThat(adapter.extractSecAccountNumbers(jwt)).containsExactly("0272893201");
    }

    @Test
    void extractsAllPortfolios_notJustDefault() {
        // TR's multi-portfolio feature: each portfolio gets its own sec account,
        // grouped under sibling keys next to "default".
        String jwt = fakeJwt("""
            {"act":{"acc":{"owner":{
              "default":{"sec":["0272893201"],"cash":["0272893211"]},
              "portfolio2":{"sec":["0272893202"]}
            }}}}""");

        assertThat(adapter.extractSecAccountNumbers(jwt))
            .containsExactlyInAnyOrder("0272893201", "0272893202");
    }

    @Test
    void dedupesAndSurvivesMalformedTokens() {
        String jwt = fakeJwt("""
            {"act":{"acc":{"owner":{
              "default":{"sec":["0272893201"]},
              "dup":{"sec":["0272893201"]}
            }}}}""");
        assertThat(adapter.extractSecAccountNumbers(jwt)).containsExactly("0272893201");

        assertThat(adapter.extractSecAccountNumbers("not-a-jwt")).isEmpty();
        assertThat(adapter.extractSecAccountNumbers(fakeJwt("{\"act\":{}}"))).isEmpty();
    }
}
