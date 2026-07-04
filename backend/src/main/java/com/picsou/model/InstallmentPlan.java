package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Split payment (PayPal 4x & co): {@code installments} equal parts starting at
 * {@code startDate}, one every {@code intervalDays}. The schedule is computed on
 * the fly; an installment is considered paid once its date is in the past.
 */
@Entity
@Table(name = "installment_plan")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InstallmentPlan extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    @Column(nullable = false, length = 100)
    private String label;

    @Column(name = "total_amount", nullable = false, precision = 20, scale = 8)
    private BigDecimal totalAmount;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    @Builder.Default
    private int installments = 4;

    @Column(name = "interval_days", nullable = false)
    @Builder.Default
    private int intervalDays = 30;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private AccountScope scope = AccountScope.PERSONAL;
}
