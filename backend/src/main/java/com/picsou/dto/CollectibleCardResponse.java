package com.picsou.dto;

import java.math.BigDecimal;
import java.time.Instant;

/** A card position with live valuation, mirroring HoldingResponse semantics. */
public record CollectibleCardResponse(
    Long holdingId,
    String ticker,
    int categoryId,
    String gameName,
    String name,
    String imageUrl,
    BigDecimal quantity,
    BigDecimal averageBuyIn,
    BigDecimal currentPriceEur,   // null if price unknown
    BigDecimal currentValueEur,   // null if price unknown
    BigDecimal costBasisEur,
    BigDecimal pnlEur,            // null if price unknown
    BigDecimal pnlPercent,        // null if price unknown or cost basis 0
    Instant createdAt
) {}
