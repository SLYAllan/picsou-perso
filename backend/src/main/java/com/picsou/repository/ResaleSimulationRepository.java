package com.picsou.repository;

import com.picsou.model.ResaleSimulation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ResaleSimulationRepository extends JpaRepository<ResaleSimulation, Long> {
    List<ResaleSimulation> findAllByMemberIdOrderByUpdatedAtDesc(Long memberId);
    Optional<ResaleSimulation> findByIdAndMemberId(Long id, Long memberId);
}
