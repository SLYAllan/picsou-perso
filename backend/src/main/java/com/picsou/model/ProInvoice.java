package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * UwUTCG invoice. {@code items} holds the line items as a JSON array
 * (description/quantity/unitPrice) — the PDF itself is generated client-side.
 * Numbering ({@code UWUTCG-YYYY-NNNN}) is assigned server-side on create.
 */
@Entity
@Table(name = "pro_invoice")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProInvoice extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    @Column(name = "invoice_number", nullable = false, length = 30)
    private String invoiceNumber;

    @Column(name = "invoice_date", nullable = false)
    private LocalDate invoiceDate;

    @Column(name = "client_name", nullable = false, length = 200)
    @Builder.Default
    private String clientName = "";

    @Column(name = "client_address", nullable = false, length = 500)
    @Builder.Default
    private String clientAddress = "";

    @Column(name = "client_email", nullable = false, length = 200)
    @Builder.Default
    private String clientEmail = "";

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String items = "[]";

    @Column(name = "shipping_cost", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal shippingCost = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal total = BigDecimal.ZERO;

    @Column(nullable = false, length = 500)
    @Builder.Default
    private String notes = "";
}
