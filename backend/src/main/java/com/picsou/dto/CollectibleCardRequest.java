package com.picsou.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

/** Add (or increment) a TCG card position in the member's collection. */
public record CollectibleCardRequest(
    @Min(1) int categoryId,
    @Min(1) long groupId,
    @Min(1) long productId,
    @NotBlank @Pattern(regexp = "^[A-Z0-9]{1,5}$", message = "subTypeCode must be uppercase initials, e.g. N, F, RH") String subTypeCode,
    @NotNull @Min(1) Integer quantity,
    @NotNull @DecimalMin("0") BigDecimal purchasePriceEur,
    @NotBlank @Size(max = 100) String name,
    @Size(max = 300) String imageUrl
) {}
