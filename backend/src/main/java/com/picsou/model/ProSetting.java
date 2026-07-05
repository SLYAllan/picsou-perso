package com.picsou.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

/**
 * Member-scoped key/value store for the pro suite: URSSAF rates, annual
 * threshold, default packaging cost, and the simulator settings JSON blob.
 * Missing keys fall back to defaults in {@code ProComptaService}.
 */
@Entity
@Table(name = "pro_setting")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProSetting extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private FamilyMember member;

    @Column(name = "setting_key", nullable = false, length = 50)
    private String settingKey;

    @Column(name = "setting_value", nullable = false, columnDefinition = "TEXT")
    private String settingValue;
}
