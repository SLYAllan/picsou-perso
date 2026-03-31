package com.picsou.repository;

import com.picsou.model.GoalMonthOverride;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GoalMonthOverrideRepository extends JpaRepository<GoalMonthOverride, Long> {
    List<GoalMonthOverride> findByGoalId(Long goalId);
    Optional<GoalMonthOverride> findByGoalIdAndYearMonth(Long goalId, String yearMonth);
}
