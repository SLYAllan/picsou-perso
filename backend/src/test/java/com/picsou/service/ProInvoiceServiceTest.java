package com.picsou.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.picsou.dto.ProDtos.InvoiceItem;
import com.picsou.dto.ProDtos.InvoiceRequest;
import com.picsou.dto.ProDtos.InvoiceResponse;
import com.picsou.model.FamilyMember;
import com.picsou.model.ProInvoice;
import com.picsou.repository.ProInvoiceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProInvoiceServiceTest {

    @Mock ProInvoiceRepository invoiceRepository;

    private ProInvoiceService newService() {
        return new ProInvoiceService(invoiceRepository, new ObjectMapper());
    }

    private final FamilyMember owner = ownerMember();

    private static FamilyMember ownerMember() {
        FamilyMember m = FamilyMember.builder().displayName("Allan").build();
        m.setId(1L);
        return m;
    }

    private ProInvoice existing(String number) {
        return ProInvoice.builder().member(owner).invoiceNumber(number)
            .invoiceDate(LocalDate.of(2026, 7, 1)).build();
    }

    @Test
    void nextNumber_startsAt0001_whenNoInvoices() {
        when(invoiceRepository.findAllByMemberIdAndInvoiceNumberStartingWith(1L, "UWUTCG-2026-"))
            .thenReturn(List.of());

        assertThat(newService().nextNumber(1L, 2026)).isEqualTo("UWUTCG-2026-0001");
    }

    @Test
    void nextNumber_continuesAfterImportedPokecalcCounter() {
        when(invoiceRepository.findAllByMemberIdAndInvoiceNumberStartingWith(1L, "UWUTCG-2026-"))
            .thenReturn(List.of(existing("UWUTCG-2026-0023"), existing("UWUTCG-2026-0007")));

        assertThat(newService().nextNumber(1L, 2026)).isEqualTo("UWUTCG-2026-0024");
    }

    @Test
    void create_assignsNumber_computesTotals_andRoundTripsItems() {
        when(invoiceRepository.findAllByMemberIdAndInvoiceNumberStartingWith(1L, "UWUTCG-2026-"))
            .thenReturn(List.of(existing("UWUTCG-2026-0023")));
        when(invoiceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        InvoiceRequest req = new InvoiceRequest(
            LocalDate.of(2026, 7, 5), "Amandine", "3 rue des sheds", "a@b.fr",
            List.of(new InvoiceItem("Carte Pokémon", 2, new BigDecimal("4.00")),
                    new InvoiceItem("Sleeves", 1, new BigDecimal("12.00"))),
            new BigDecimal("3.78"), "");

        InvoiceResponse resp = newService().create(owner, req);

        assertThat(resp.invoiceNumber()).isEqualTo("UWUTCG-2026-0024");
        assertThat(resp.subtotal()).isEqualByComparingTo("20.00");
        assertThat(resp.total()).isEqualByComparingTo("23.78");
        assertThat(resp.items()).hasSize(2);
        assertThat(resp.items().getFirst().description()).isEqualTo("Carte Pokémon");
        assertThat(resp.items().getFirst().quantity()).isEqualTo(2);
    }
}
