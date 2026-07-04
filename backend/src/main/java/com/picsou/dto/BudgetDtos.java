package com.picsou.dto;

import com.picsou.model.AccountScope;
import com.picsou.model.BudgetCategory;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.util.List;

/** DTOs for the budget module (category tracking on synced transactions). */
public final class BudgetDtos {

    private BudgetDtos() {}

    public record CategoryRequest(
        @NotBlank @Size(max = 50) String name,
        @NotNull AccountScope scope,
        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Color must be a valid hex color") String color
    ) {}

    public record CategoryResponse(Long id, String name, AccountScope scope, String color) {
        public static CategoryResponse from(BudgetCategory c) {
            return new CategoryResponse(c.getId(), c.getName(), c.getScope(), c.getColor());
        }
    }

    /** amount is signed: expenses negative, income positive. */
    public record CategorySummary(String name, String color, BigDecimal amount, int count) {}

    public record BudgetSummaryResponse(
        String month,
        AccountScope scope,
        BigDecimal totalIncome,
        BigDecimal totalExpenses,   // negative
        List<CategorySummary> expensesByCategory,
        List<CategorySummary> incomeByCategory,
        BigDecimal uncategorizedExpenses,
        int uncategorizedCount
    ) {}

    public record CategorizeRequest(
        @Size(max = 50) String category,          // null/blank → clear back to uncategorized
        boolean applyToSimilar,
        @Size(max = 100) String keyword           // defaults to the transaction description
    ) {}
}
