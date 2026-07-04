package com.picsou.dto;

import java.math.BigDecimal;
import java.util.Map;

/** Catalog DTOs proxied from tcgcsv.com for the add-card wizard. */
public final class CollectibleCatalogResponses {

    private CollectibleCatalogResponses() {}

    public record GameResponse(int categoryId, String name) {}

    public record GroupResponse(long groupId, String name, String abbreviation, String publishedOn) {}

    /** pricesUsd is keyed by subTypeCode (N, F, H, RH...) — raw TCGplayer market prices in USD. */
    public record ProductResponse(long productId, String name, String imageUrl, Map<String, BigDecimal> pricesUsd) {}
}
