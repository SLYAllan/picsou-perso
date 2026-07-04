package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

/** Auto-categorization: transactions whose description contains {@code keyword} get {@code categoryName}. */
@Entity
@Table(name = "budget_rule")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BudgetRule extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    /** Stored uppercase; matched as case-insensitive "contains" on the description. */
    @Column(nullable = false, length = 100)
    private String keyword;

    @Column(name = "category_name", nullable = false, length = 50)
    private String categoryName;
}
