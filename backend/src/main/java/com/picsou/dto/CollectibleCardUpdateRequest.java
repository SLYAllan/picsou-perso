package com.picsou.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

/** Edit a card position: copies owned and/or average purchase price. */
public record CollectibleCardUpdateRequest(
    @NotNull @DecimalMin("0.00000001") BigDecimal quantity,
    @DecimalMin("0") BigDecimal averageBuyIn
) {}
