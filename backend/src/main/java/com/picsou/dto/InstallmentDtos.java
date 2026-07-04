package com.picsou.dto;

import com.picsou.model.AccountScope;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** DTOs for installment plans (PayPal 4x style split payments). */
public final class InstallmentDtos {

    private InstallmentDtos() {}

    public record InstallmentPlanRequest(
        @NotBlank @Size(max = 100) String label,
        @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal totalAmount,
        @NotNull LocalDate startDate,
        @Min(2) @Max(24) Integer installments,    // null → 4
        @Min(1) @Max(92) Integer intervalDays,    // null → 30
        AccountScope scope                        // null → PERSONAL
    ) {}

    public record InstallmentItem(LocalDate date, BigDecimal amount, boolean paid) {}

    public record InstallmentPlanResponse(
        Long id,
        String label,
        BigDecimal totalAmount,
        LocalDate startDate,
        int installments,
        int intervalDays,
        AccountScope scope,
        List<InstallmentItem> schedule,
        int paidCount,
        BigDecimal remaining,
        LocalDate nextDueDate                     // null when fully paid
    ) {}
}
