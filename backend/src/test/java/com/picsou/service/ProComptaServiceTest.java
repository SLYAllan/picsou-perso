package com.picsou.service;

import com.picsou.dto.ProDtos.*;
import com.picsou.model.FamilyMember;
import com.picsou.model.ProSetting;
import com.picsou.model.ResaleSale;
import com.picsou.model.UrssafDeclaration;
import com.picsou.repository.ProSettingRepository;
import com.picsou.repository.ResaleSaleRepository;
import com.picsou.repository.ResaleSimulationRepository;
import com.picsou.repository.UrssafDeclarationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProComptaServiceTest {

    @Mock ResaleSaleRepository saleRepository;
    @Mock UrssafDeclarationRepository declarationRepository;
    @Mock ProSettingRepository settingRepository;
    @Mock ResaleSimulationRepository simulationRepository;
    @InjectMocks ProComptaService service;

    private final FamilyMember owner = ownerMember();

    private static FamilyMember ownerMember() {
        FamilyMember m = FamilyMember.builder().displayName("Allan").build();
        m.setId(1L);
        return m;
    }

    private ResaleSale sale(String date, String type, String platform,
                            String salePrice, String purchase, String shipping,
                            String commission, String packaging) {
        return ResaleSale.builder()
            .member(owner).saleDate(LocalDate.parse(date))
            .itemType(type).platform(platform)
            .salePrice(new BigDecimal(salePrice)).purchasePrice(new BigDecimal(purchase))
            .shippingCost(new BigDecimal(shipping)).platformCommission(new BigDecimal(commission))
            .packagingCost(new BigDecimal(packaging))
            .name("").reference("").notes("")
            .build();
    }

    @Test
    void listSales_derivesNetProfit_likePokecalc() {
        // sale 100 €, purchase 40, commission 5, packaging 0.35, shipping 3
        // charges = 100 × 12.3 % = 12.30 → costs = 60.65 → net = 39.35, marge 39.35 %
        when(settingRepository.findAllByMemberId(1L)).thenReturn(List.of());
        when(saleRepository.findAllByMemberIdOrderBySaleDateDescIdDesc(1L))
            .thenReturn(List.of(sale("2026-06-01", "carte", "ebay", "100.00", "40.00", "3.00", "5.00", "0.35")));

        List<SaleResponse> sales = service.listSales(1L);

        assertThat(sales).hasSize(1);
        SaleResponse r = sales.getFirst();
        assertThat(r.chargesSociales()).isEqualByComparingTo("12.30");
        assertThat(r.totalCouts()).isEqualByComparingTo("60.65");
        assertThat(r.beneficeNet()).isEqualByComparingTo("39.35");
        assertThat(r.margeNette()).isEqualByComparingTo("39.35");
    }

    @Test
    void recap_groupsByType_andComputesUrssafOnSalePriceOnly() {
        when(settingRepository.findAllByMemberId(1L)).thenReturn(List.of());
        List<ResaleSale> monthSales = List.of(
            sale("2026-06-05", "carte", "ebay", "100.00", "0", "0", "10.00", "0"),
            sale("2026-06-10", "carte", "cardmarket", "50.00", "0", "0", "2.50", "0"),
            sale("2026-06-12", "scelle", "vinted", "80.00", "60.00", "5.00", "0", "0"));
        // month window then year-to-date window
        when(saleRepository.findAllByMemberIdAndSaleDateBetween(eq(1L),
            eq(LocalDate.of(2026, 6, 1)), eq(LocalDate.of(2026, 6, 30)))).thenReturn(monthSales);
        when(saleRepository.findAllByMemberIdAndSaleDateBetween(eq(1L),
            eq(LocalDate.of(2026, 1, 1)), eq(LocalDate.of(2026, 6, 30)))).thenReturn(monthSales);
        when(declarationRepository.findByMemberIdAndYearAndMonth(1L, 2026, 6))
            .thenReturn(Optional.empty());

        RecapResponse recap = service.recap(1L, 2026, 6);

        assertThat(recap.byType()).containsKeys("carte", "scelle");
        assertThat(recap.byType().get("carte").count()).isEqualTo(2);
        assertThat(recap.byType().get("carte").ca()).isEqualByComparingTo("150.00");
        // URSSAF assiette (recap view) = sale prices only: 230 × 12.3 % = 28.29
        assertThat(recap.urssaf().ca()).isEqualByComparingTo("230.00");
        assertThat(recap.urssaf().cotisationsSociales()).isEqualByComparingTo("28.29");
        // cfp 0.1 % = 0.23, vfl 1 % = 2.30 → total 30.82
        assertThat(recap.urssaf().totalDue()).isEqualByComparingTo("30.82");
        assertThat(recap.declaration().declared()).isFalse();
        assertThat(recap.seuil().caCumule()).isEqualByComparingTo("230.00");
    }

    @Test
    void declare_freezesAmounts_withShippingInAssiette() {
        when(settingRepository.findAllByMemberId(1L)).thenReturn(List.of());
        when(saleRepository.findAllByMemberIdAndSaleDateBetween(eq(1L), any(), any()))
            .thenReturn(List.of(sale("2026-06-05", "carte", "ebay", "100.00", "0", "10.00", "0", "0")));
        when(declarationRepository.findByMemberIdAndYearAndMonth(1L, 2026, 6))
            .thenReturn(Optional.empty());
        when(declarationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        DeclarationResponse decl = service.declare(owner, 2026, 6);

        // assiette déclaration = sale + shipping = 110 (pokecalc behavior)
        assertThat(decl.totalCa()).isEqualByComparingTo("110.00");
        assertThat(decl.urssafAmount()).isEqualByComparingTo("13.53");
        assertThat(decl.cfpAmount()).isEqualByComparingTo("0.11");
        assertThat(decl.vflAmount()).isEqualByComparingTo("1.10");
        assertThat(decl.totalDue()).isEqualByComparingTo("14.74");
        assertThat(decl.declared()).isTrue();
        assertThat(decl.declaredAt()).isNotNull();
    }

    @Test
    void annual_sumsMonths_andDeclaredUrssaf() {
        when(settingRepository.findAllByMemberId(1L)).thenReturn(List.of());
        when(saleRepository.findAllByMemberIdAndSaleDateBetween(eq(1L),
            eq(LocalDate.of(2026, 1, 1)), eq(LocalDate.of(2026, 12, 31))))
            .thenReturn(List.of(
                sale("2026-04-05", "carte", "ebay", "100.00", "0", "0", "0", "0"),
                sale("2026-05-10", "carte", "vinted", "200.00", "0", "0", "0", "0")));
        UrssafDeclaration paid = UrssafDeclaration.builder()
            .member(owner).year(2026).month(4).totalDue(new BigDecimal("12.30")).declared(true).build();
        when(declarationRepository.findAllByMemberIdAndYearOrderByMonth(1L, 2026))
            .thenReturn(List.of(paid));

        AnnualResponse annual = service.annual(1L, 2026);

        assertThat(annual.monthly()).hasSize(12);
        assertThat(annual.monthly().get(3).ca()).isEqualByComparingTo("100.00"); // April
        assertThat(annual.totalCa()).isEqualByComparingTo("300.00");
        assertThat(annual.urssafPaid()).isEqualByComparingTo("12.30");
        assertThat(annual.byPlatform()).hasSize(2);
        assertThat(annual.byPlatform().getFirst().platform()).isEqualTo("vinted"); // sorted by CA desc
    }

    @Test
    void importSales_skipsAlreadyImportedRows() {
        ResaleSale existing = sale("2026-06-01", "carte", "ebay", "27.50", "0", "0", "2.68", "0.35");
        existing.setReference("26-14561");
        when(saleRepository.findAllByMemberIdOrderBySaleDateDescIdDesc(1L)).thenReturn(List.of(existing));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        SaleRequest dup = new SaleRequest(LocalDate.parse("2026-06-01"), "Machamp", "26-14561", "carte", "ebay",
            new BigDecimal("27.50"), null, null, null, null, null);
        SaleRequest fresh = new SaleRequest(LocalDate.parse("2026-06-02"), "Pikachu", "26-99999", "carte", "ebay",
            new BigDecimal("10.00"), null, null, null, null, null);

        assertThat(service.importSales(owner, List.of(dup, fresh))).isEqualTo(1);
    }

    @Test
    void importDeclarations_skipsExistingMonths() {
        when(declarationRepository.findByMemberIdAndYearAndMonth(1L, 2026, 4))
            .thenReturn(Optional.of(UrssafDeclaration.builder().member(owner).year(2026).month(4).build()));
        when(declarationRepository.findByMemberIdAndYearAndMonth(1L, 2026, 5))
            .thenReturn(Optional.empty());
        when(declarationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ImportDeclaration apr = new ImportDeclaration(2026, 4, new BigDecimal("747.46"), new BigDecimal("91.94"),
            new BigDecimal("0.75"), new BigDecimal("7.47"), new BigDecimal("100.16"), true, null);
        ImportDeclaration may = new ImportDeclaration(2026, 5, new BigDecimal("1199.61"), new BigDecimal("147.55"),
            new BigDecimal("1.20"), new BigDecimal("12.00"), new BigDecimal("160.75"), true, null);

        assertThat(service.importDeclarations(owner, List.of(apr, may))).isEqualTo(1);
    }

    @Test
    void settings_mergeDefaultsWithOverrides() {
        ProSetting custom = ProSetting.builder()
            .member(owner).settingKey("urssaf_rate").settingValue("21.2").build();
        when(settingRepository.findAllByMemberId(1L)).thenReturn(List.of(custom));

        assertThat(service.getSettings(1L))
            .containsEntry("urssaf_rate", "21.2")
            .containsEntry("cfp_rate", "0.1")
            .containsEntry("seuil_annuel", "188700");
    }
}
