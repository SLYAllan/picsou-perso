package com.picsou.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** DTOs for the pro suite: resale bookkeeping, URSSAF recap, invoices, simulator. */
public final class ProDtos {

    private ProDtos() {}

    // --- Sales ---

    public record SaleRequest(
        @NotNull LocalDate saleDate,
        @Size(max = 255) String name,
        @Size(max = 100) String reference,
        @Size(max = 30) String itemType,
        @Size(max = 30) String platform,
        @NotNull @DecimalMin("0") BigDecimal salePrice,
        @DecimalMin("0") BigDecimal purchasePrice,
        @DecimalMin("0") BigDecimal shippingCost,
        @DecimalMin("0") BigDecimal platformCommission,
        @DecimalMin("0") BigDecimal packagingCost,
        @Size(max = 500) String notes
    ) {}

    public record SaleResponse(
        Long id,
        LocalDate saleDate,
        String name,
        String reference,
        String itemType,
        String platform,
        BigDecimal salePrice,
        BigDecimal purchasePrice,
        BigDecimal shippingCost,
        BigDecimal platformCommission,
        BigDecimal packagingCost,
        String notes,
        // Derived (pokecalc enrichSale): charges = salePrice × urssaf%, net = sale − all costs
        BigDecimal chargesSociales,
        BigDecimal totalCouts,
        BigDecimal beneficeNet,
        BigDecimal margeNette
    ) {}

    public record BulkSalesRequest(@NotEmpty @Valid List<SaleRequest> sales) {}

    // --- Recap / annual ---

    public record CategoryStats(
        int count,
        BigDecimal ca,
        BigDecimal purchase,
        BigDecimal commission,
        BigDecimal packaging,
        BigDecimal shipping,
        BigDecimal totalCosts,
        BigDecimal benefice,
        BigDecimal marge
    ) {}

    public record UrssafBlock(
        BigDecimal ca,
        BigDecimal cotisationsSociales,
        BigDecimal cfp,
        BigDecimal versementLiberatoire,
        BigDecimal totalDue
    ) {}

    public record DeclarationStatus(boolean declared, Instant declaredAt) {}

    public record SeuilBlock(
        BigDecimal annuel,
        BigDecimal caCumule,
        BigDecimal restant,
        BigDecimal pourcentageUtilise
    ) {}

    public record RecapResponse(
        int month,
        int year,
        Map<String, CategoryStats> byType,
        CategoryStats totals,
        UrssafBlock urssaf,
        DeclarationStatus declaration,
        SeuilBlock seuil
    ) {}

    public record MonthlyPoint(int month, BigDecimal ca, BigDecimal benefice, int count) {}

    public record PlatformStats(
        String platform,
        int count,
        BigDecimal ca,
        BigDecimal totalCommission,
        BigDecimal avgCommissionPct,
        BigDecimal beneficeNet,
        BigDecimal margeNette
    ) {}

    public record AnnualResponse(
        int year,
        List<MonthlyPoint> monthly,
        BigDecimal totalCa,
        BigDecimal totalBenefice,
        int totalCount,
        BigDecimal urssafPaid,
        SeuilBlock seuil,
        List<PlatformStats> byPlatform
    ) {}

    public record DeclareRequest(
        @Min(2020) @Max(2100) int year,
        @Min(1) @Max(12) int month
    ) {}

    public record DeclarationResponse(
        int year,
        int month,
        BigDecimal totalCa,
        BigDecimal urssafAmount,
        BigDecimal cfpAmount,
        BigDecimal vflAmount,
        BigDecimal totalDue,
        boolean declared,
        Instant declaredAt
    ) {}

    // --- Invoices ---

    public record InvoiceItem(
        @Size(max = 300) String description,
        @Min(1) int quantity,
        @DecimalMin("0") BigDecimal unitPrice
    ) {}

    public record InvoiceRequest(
        @NotNull LocalDate invoiceDate,
        @NotBlank @Size(max = 200) String clientName,
        @Size(max = 500) String clientAddress,
        @Size(max = 200) String clientEmail,
        @NotEmpty @Valid List<InvoiceItem> items,
        @DecimalMin("0") BigDecimal shippingCost,
        @Size(max = 500) String notes
    ) {}

    public record InvoiceResponse(
        Long id,
        String invoiceNumber,
        LocalDate invoiceDate,
        String clientName,
        String clientAddress,
        String clientEmail,
        List<InvoiceItem> items,
        BigDecimal shippingCost,
        BigDecimal subtotal,
        BigDecimal total,
        String notes,
        Instant createdAt
    ) {}

    // --- One-shot pokecalc import (data stays out of git — public repo, client PII) ---

    public record ImportInvoice(
        @NotBlank @Size(max = 30) String invoiceNumber,
        @NotNull LocalDate invoiceDate,
        @Size(max = 200) String clientName,
        @Size(max = 500) String clientAddress,
        @Size(max = 200) String clientEmail,
        List<InvoiceItem> items,
        BigDecimal shippingCost,
        BigDecimal subtotal,
        BigDecimal total,
        @Size(max = 500) String notes
    ) {}

    public record ImportDeclaration(
        @Min(2020) @Max(2100) int year,
        @Min(1) @Max(12) int month,
        BigDecimal totalCa,
        BigDecimal urssafAmount,
        BigDecimal cfpAmount,
        BigDecimal vflAmount,
        BigDecimal totalDue,
        boolean declared,
        Instant declaredAt
    ) {}

    public record ImportRequest(
        @Valid List<SaleRequest> sales,
        @Valid List<ImportInvoice> invoices,
        @Valid List<ImportDeclaration> declarations
    ) {}

    public record ImportResult(int salesImported, int invoicesImported, int declarationsImported) {}

    // --- Simulations ---

    public record SimulationRequest(
        @NotBlank @Pattern(regexp = "cards|accessories") String simType,
        @NotBlank @Size(max = 100) String name,
        @NotBlank String data
    ) {}

    public record SimulationResponse(
        Long id,
        String simType,
        String name,
        String data,
        Instant createdAt,
        Instant updatedAt
    ) {}

    // --- FX ---

    public record JpyRateResponse(BigDecimal jpyPerEur) {}
}
