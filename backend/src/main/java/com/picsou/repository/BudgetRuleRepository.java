package com.picsou.repository;

import com.picsou.model.BudgetRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BudgetRuleRepository extends JpaRepository<BudgetRule, Long> {
    List<BudgetRule> findAllByMemberId(Long memberId);
    Optional<BudgetRule> findByMemberIdAndKeyword(Long memberId, String keyword);
    void deleteByMemberIdAndCategoryName(Long memberId, String categoryName);
}
