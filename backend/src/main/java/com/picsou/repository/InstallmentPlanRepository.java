package com.picsou.repository;

import com.picsou.model.InstallmentPlan;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InstallmentPlanRepository extends JpaRepository<InstallmentPlan, Long> {
    List<InstallmentPlan> findAllByMemberIdOrderByStartDateDesc(Long memberId);
    Optional<InstallmentPlan> findByIdAndMemberId(Long id, Long memberId);
}
