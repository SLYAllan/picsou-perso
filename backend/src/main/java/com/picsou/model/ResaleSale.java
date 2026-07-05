package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One resale (micro-entreprise bookkeeping): everything needed to derive the
 * net profit of a sale — social charges are computed on the fly from the
 * member's pro settings, never stored.
 */
@Entity
@Table(name = "resale_sale")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResaleSale extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    @Column(name = "sale_date", nullable = false)
    private LocalDate saleDate;

    @Column(nullable = false)
    @Builder.Default
    private String name = "";

    @Column(nullable = false, length = 100)
    @Builder.Default
    private String reference = "";

    @Column(name = "item_type", nullable = false, length = 30)
    @Builder.Default
    private String itemType = "carte";

    @Column(nullable = false, length = 30)
    @Builder.Default
    private String platform = "cardmarket";

    @Column(name = "sale_price", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal salePrice = BigDecimal.ZERO;

    @Column(name = "purchase_price", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal purchasePrice = BigDecimal.ZERO;

    @Column(name = "shipping_cost", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal shippingCost = BigDecimal.ZERO;

    @Column(name = "platform_commission", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal platformCommission = BigDecimal.ZERO;

    @Column(name = "packaging_cost", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal packagingCost = BigDecimal.ZERO;

    @Column(nullable = false, length = 500)
    @Builder.Default
    private String notes = "";
}
