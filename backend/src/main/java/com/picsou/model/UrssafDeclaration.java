package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Monthly URSSAF declaration snapshot: amounts frozen at the moment the member
 * marks the month as declared (assiette = CA encaissé, shipping included).
 */
@Entity
@Table(name = "urssaf_declaration")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UrssafDeclaration extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    @Column(name = "decl_year", nullable = false)
    private int year;

    @Column(name = "decl_month", nullable = false)
    private int month;

    @Column(name = "total_ca", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal totalCa = BigDecimal.ZERO;

    @Column(name = "urssaf_amount", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal urssafAmount = BigDecimal.ZERO;

    @Column(name = "cfp_amount", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal cfpAmount = BigDecimal.ZERO;

    @Column(name = "vfl_amount", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal vflAmount = BigDecimal.ZERO;

    @Column(name = "total_due", nullable = false, precision = 14, scale = 2)
    @Builder.Default
    private BigDecimal totalDue = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean declared;

    @Column(name = "declared_at")
    private Instant declaredAt;
}
