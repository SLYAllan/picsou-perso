package com.picsou.repository;

import com.picsou.model.ResaleSale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ResaleSaleRepository extends JpaRepository<ResaleSale, Long> {
    List<ResaleSale> findAllByMemberIdOrderBySaleDateDescIdDesc(Long memberId);
    List<ResaleSale> findAllByMemberIdAndSaleDateBetween(Long memberId, LocalDate from, LocalDate to);
    Optional<ResaleSale> findByIdAndMemberId(Long id, Long memberId);
}
