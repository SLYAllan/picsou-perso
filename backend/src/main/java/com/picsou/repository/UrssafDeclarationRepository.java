package com.picsou.repository;

import com.picsou.model.UrssafDeclaration;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UrssafDeclarationRepository extends JpaRepository<UrssafDeclaration, Long> {
    Optional<UrssafDeclaration> findByMemberIdAndYearAndMonth(Long memberId, int year, int month);
    List<UrssafDeclaration> findAllByMemberIdAndYearOrderByMonth(Long memberId, int year);
}
