package com.picsou.repository;

import com.picsou.model.AccountScope;
import com.picsou.model.BudgetCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BudgetCategoryRepository extends JpaRepository<BudgetCategory, Long> {
    List<BudgetCategory> findAllByMemberIdOrderByScopeAscNameAsc(Long memberId);
    Optional<BudgetCategory> findByIdAndMemberId(Long id, Long memberId);
    Optional<BudgetCategory> findByMemberIdAndScopeAndName(Long memberId, AccountScope scope, String name);
    long countByMemberId(Long memberId);
}
