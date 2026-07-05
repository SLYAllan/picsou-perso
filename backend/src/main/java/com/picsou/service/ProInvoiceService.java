package com.picsou.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.picsou.dto.ProDtos.InvoiceItem;
import com.picsou.dto.ProDtos.InvoiceRequest;
import com.picsou.dto.ProDtos.InvoiceResponse;
import com.picsou.model.FamilyMember;
import com.picsou.model.ProInvoice;
import com.picsou.repository.ProInvoiceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * UwUTCG invoices. The number is assigned server-side ({@code UWUTCG-YYYY-NNNN},
 * NNNN = max existing for the year + 1) so two devices can never mint the same
 * number — the unique constraint backs this up.
 */
@Service
public class ProInvoiceService {

    private static final String NUMBER_PREFIX = "UWUTCG-";

    private final ProInvoiceRepository invoiceRepository;
    private final ObjectMapper objectMapper;

    public ProInvoiceService(ProInvoiceRepository invoiceRepository, ObjectMapper objectMapper) {
        this.invoiceRepository = invoiceRepository;
        this.objectMapper = objectMapper;
    }

    public List<InvoiceResponse> list(Long memberId) {
        return invoiceRepository.findAllByMemberIdOrderByIdDesc(memberId).stream()
            .map(this::toResponse)
            .toList();
    }

    /** Peek the number the next invoice will get (for the live preview). */
    public String nextNumber(Long memberId, int year) {
        String prefix = NUMBER_PREFIX + year + "-";
        int max = invoiceRepository.findAllByMemberIdAndInvoiceNumberStartingWith(memberId, prefix).stream()
            .mapToInt(inv -> parseCounter(inv.getInvoiceNumber(), prefix))
            .max().orElse(0);
        return prefix + String.format("%04d", max + 1);
    }

    @Transactional
    public InvoiceResponse create(FamilyMember member, InvoiceRequest req) {
        BigDecimal subtotal = req.items().stream()
            .map(i -> i.unitPrice().multiply(BigDecimal.valueOf(i.quantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .setScale(2, RoundingMode.HALF_UP);
        BigDecimal shipping = req.shippingCost() == null ? BigDecimal.ZERO : req.shippingCost();

        ProInvoice invoice = ProInvoice.builder()
            .member(member)
            .invoiceNumber(nextNumber(member.getId(), req.invoiceDate().getYear()))
            .invoiceDate(req.invoiceDate())
            .clientName(req.clientName())
            .clientAddress(req.clientAddress() == null ? "" : req.clientAddress())
            .clientEmail(req.clientEmail() == null ? "" : req.clientEmail())
            .items(writeItems(req.items()))
            .shippingCost(shipping)
            .subtotal(subtotal)
            .total(subtotal.add(shipping))
            .notes(req.notes() == null ? "" : req.notes())
            .build();

        return toResponse(invoiceRepository.save(invoice));
    }

    /**
     * One-shot pokecalc import: keeps the original numbers so the counter
     * continues where pokecalc stopped. Existing numbers are skipped
     * (idempotent — safe to re-upload the export file).
     */
    @Transactional
    public int importInvoices(FamilyMember member, List<com.picsou.dto.ProDtos.ImportInvoice> invoices) {
        if (invoices == null) return 0;
        var existing = invoiceRepository.findAllByMemberIdOrderByIdDesc(member.getId()).stream()
            .map(ProInvoice::getInvoiceNumber)
            .collect(java.util.stream.Collectors.toSet());
        int imported = 0;
        for (var inv : invoices) {
            if (existing.contains(inv.invoiceNumber())) continue;
            invoiceRepository.save(ProInvoice.builder()
                .member(member)
                .invoiceNumber(inv.invoiceNumber())
                .invoiceDate(inv.invoiceDate())
                .clientName(inv.clientName() == null ? "" : inv.clientName())
                .clientAddress(inv.clientAddress() == null ? "" : inv.clientAddress())
                .clientEmail(inv.clientEmail() == null ? "" : inv.clientEmail())
                .items(writeItems(inv.items() == null ? List.of() : inv.items()))
                .shippingCost(inv.shippingCost() == null ? BigDecimal.ZERO : inv.shippingCost())
                .subtotal(inv.subtotal() == null ? BigDecimal.ZERO : inv.subtotal())
                .total(inv.total() == null ? BigDecimal.ZERO : inv.total())
                .notes(inv.notes() == null ? "" : inv.notes())
                .build());
            imported++;
        }
        return imported;
    }

    private InvoiceResponse toResponse(ProInvoice inv) {
        return new InvoiceResponse(inv.getId(), inv.getInvoiceNumber(), inv.getInvoiceDate(),
            inv.getClientName(), inv.getClientAddress(), inv.getClientEmail(),
            readItems(inv.getItems()), inv.getShippingCost(), inv.getSubtotal(), inv.getTotal(),
            inv.getNotes(), inv.getCreatedAt());
    }

    private static int parseCounter(String number, String prefix) {
        try {
            return Integer.parseInt(number.substring(prefix.length()));
        } catch (RuntimeException e) {
            return 0;
        }
    }

    private String writeItems(List<InvoiceItem> items) {
        try {
            return objectMapper.writeValueAsString(items);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize invoice items", e);
        }
    }

    private List<InvoiceItem> readItems(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
