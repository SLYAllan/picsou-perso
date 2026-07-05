package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

/**
 * Saved Japan-lot resale simulation. {@code data} is the full simulation JSON
 * (items, fees, distribution mode…) — all math happens client-side; the
 * backend only persists it so simulations follow the member across devices.
 */
@Entity
@Table(name = "resale_simulation")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResaleSimulation extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    @Column(name = "sim_type", nullable = false, length = 20)
    private String simType;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String data;
}
