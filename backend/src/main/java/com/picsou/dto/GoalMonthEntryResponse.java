package com.picsou.dto;

import java.math.BigDecimal;

public record GoalMonthEntryResponse(
    String yearMonth,        // "2025-03"
    BigDecimal objective,    // monthly needed (pre-calculated)
    BigDecimal actual,       // derived from balance snapshots, null if no data
    BigDecimal override,     // manual override, null if not set
    BigDecimal effective     // override ?? actual
) {}
