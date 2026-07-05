package com.picsou.repository;

import com.picsou.model.ProInvoice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProInvoiceRepository extends JpaRepository<ProInvoice, Long> {
    List<ProInvoice> findAllByMemberIdOrderByIdDesc(Long memberId);
    List<ProInvoice> findAllByMemberIdAndInvoiceNumberStartingWith(Long memberId, String prefix);
}
