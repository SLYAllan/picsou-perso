package com.picsou.service;

import com.picsou.dto.ProDtos.*;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.model.FamilyMember;
import com.picsou.model.ProSetting;
import com.picsou.model.ResaleSale;
import com.picsou.model.ResaleSimulation;
import com.picsou.model.UrssafDeclaration;
import com.picsou.repository.ProSettingRepository;
import com.picsou.repository.ResaleSaleRepository;
import com.picsou.repository.ResaleSimulationRepository;
import com.picsou.repository.UrssafDeclarationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Micro-entreprise bookkeeping ported from pokecalc: per-sale net profit,
 * monthly URSSAF recap, annual view, platform stats, declarations, settings
 * and saved simulations. Charges are always recomputed from the current
 * rates — only declarations freeze amounts (at declaration time).
 */
@Service
public class ProComptaService {

    /** pokecalc defaults — overridable per member via pro_setting. */
    static final Map<String, String> DEFAULT_SETTINGS = Map.of(
        "urssaf_rate", "12.3",
        "cfp_rate", "0.1",
        "versement_liberatoire_rate", "1.0",
        "seuil_annuel", "188700",
        "default_packaging_cost", "0.35"
    );

    private final ResaleSaleRepository saleRepository;
    private final UrssafDeclarationRepository declarationRepository;
    private final ProSettingRepository settingRepository;
    private final ResaleSimulationRepository simulationRepository;

    public ProComptaService(ResaleSaleRepository saleRepository,
                            UrssafDeclarationRepository declarationRepository,
                            ProSettingRepository settingRepository,
                            ResaleSimulationRepository simulationRepository) {
        this.saleRepository = saleRepository;
        this.declarationRepository = declarationRepository;
        this.settingRepository = settingRepository;
        this.simulationRepository = simulationRepository;
    }

    // --- Sales ---

    public List<SaleResponse> listSales(Long memberId) {
        double urssafRate = rate(memberId, "urssaf_rate");
        return saleRepository.findAllByMemberIdOrderBySaleDateDescIdDesc(memberId).stream()
            .map(s -> toResponse(s, urssafRate))
            .toList();
    }

    @Transactional
    public SaleResponse createSale(FamilyMember member, SaleRequest req) {
        ResaleSale sale = apply(ResaleSale.builder().member(member).build(), req);
        return toResponse(saleRepository.save(sale), rate(member.getId(), "urssaf_rate"));
    }

    @Transactional
    public List<SaleResponse> createSalesBulk(FamilyMember member, List<SaleRequest> reqs) {
        List<ResaleSale> sales = reqs.stream()
            .map(r -> apply(ResaleSale.builder().member(member).build(), r))
            .toList();
        double urssafRate = rate(member.getId(), "urssaf_rate");
        return saleRepository.saveAll(sales).stream().map(s -> toResponse(s, urssafRate)).toList();
    }

    @Transactional
    public SaleResponse updateSale(Long id, Long memberId, SaleRequest req) {
        ResaleSale sale = saleRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Sale not found: " + id));
        return toResponse(saleRepository.save(apply(sale, req)), rate(memberId, "urssaf_rate"));
    }

    @Transactional
    public void deleteSale(Long id, Long memberId) {
        ResaleSale sale = saleRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Sale not found: " + id));
        saleRepository.delete(sale);
    }

    private ResaleSale apply(ResaleSale sale, SaleRequest req) {
        sale.setSaleDate(req.saleDate());
        sale.setName(orEmpty(req.name()));
        sale.setReference(orEmpty(req.reference()));
        sale.setItemType(req.itemType() == null || req.itemType().isBlank() ? "carte" : req.itemType());
        sale.setPlatform(req.platform() == null || req.platform().isBlank() ? "cardmarket" : req.platform());
        sale.setSalePrice(orZero(req.salePrice()));
        sale.setPurchasePrice(orZero(req.purchasePrice()));
        sale.setShippingCost(orZero(req.shippingCost()));
        sale.setPlatformCommission(orZero(req.platformCommission()));
        sale.setPackagingCost(orZero(req.packagingCost()));
        sale.setNotes(orEmpty(req.notes()));
        return sale;
    }

    /** pokecalc enrichSale: charges = salePrice × urssaf%, net = sale − (purchase + commission + packaging + shipping + charges). */
    private SaleResponse toResponse(ResaleSale s, double urssafRate) {
        double sale = s.getSalePrice().doubleValue();
        double charges = sale * urssafRate / 100.0;
        double totalCosts = s.getPurchasePrice().doubleValue() + s.getPlatformCommission().doubleValue()
            + s.getPackagingCost().doubleValue() + s.getShippingCost().doubleValue() + charges;
        double net = sale - totalCosts;
        double marge = sale > 0 ? net / sale * 100.0 : 0;
        return new SaleResponse(
            s.getId(), s.getSaleDate(), s.getName(), s.getReference(), s.getItemType(), s.getPlatform(),
            s.getSalePrice(), s.getPurchasePrice(), s.getShippingCost(), s.getPlatformCommission(),
            s.getPackagingCost(), s.getNotes(),
            round2(charges), round2(totalCosts), round2(net), round2(marge)
        );
    }

    // --- Recap ---

    public RecapResponse recap(Long memberId, int year, int month) {
        Map<String, String> settings = getSettings(memberId);
        double urssafRate = dbl(settings, "urssaf_rate");
        LocalDate from = LocalDate.of(year, month, 1);
        List<ResaleSale> sales = saleRepository.findAllByMemberIdAndSaleDateBetween(
            memberId, from, from.plusMonths(1).minusDays(1));

        Map<String, double[]> acc = new TreeMap<>();
        for (ResaleSale s : sales) {
            String type = s.getItemType().isBlank() ? "autre" : s.getItemType();
            double[] a = acc.computeIfAbsent(type, k -> new double[7]);
            accumulate(a, s, urssafRate);
        }

        Map<String, CategoryStats> byType = new LinkedHashMap<>();
        double[] tot = new double[7];
        for (Map.Entry<String, double[]> e : acc.entrySet()) {
            byType.put(e.getKey(), toStats(e.getValue()));
            for (int i = 0; i < tot.length; i++) tot[i] += e.getValue()[i];
        }

        double ca = sales.stream().mapToDouble(s -> s.getSalePrice().doubleValue()).sum();
        UrssafBlock urssaf = urssafBlock(ca, settings);

        DeclarationStatus declaration = declarationRepository
            .findByMemberIdAndYearAndMonth(memberId, year, month)
            .map(d -> new DeclarationStatus(d.isDeclared(), d.getDeclaredAt()))
            .orElse(new DeclarationStatus(false, null));

        double caCumule = saleRepository.findAllByMemberIdAndSaleDateBetween(
                memberId, LocalDate.of(year, 1, 1), from.plusMonths(1).minusDays(1)).stream()
            .mapToDouble(s -> s.getSalePrice().doubleValue()).sum();

        return new RecapResponse(month, year, byType, toStats(tot), urssaf, declaration,
            seuil(caCumule, dbl(settings, "seuil_annuel")));
    }

    public AnnualResponse annual(Long memberId, int year) {
        Map<String, String> settings = getSettings(memberId);
        double urssafRate = dbl(settings, "urssaf_rate");
        List<ResaleSale> sales = saleRepository.findAllByMemberIdAndSaleDateBetween(
            memberId, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));

        double[][] byMonth = new double[13][6]; // ca, purchase, commission, packaging, shipping, count
        Map<String, double[]> byPlatform = new LinkedHashMap<>();
        for (ResaleSale s : sales) {
            double[] m = byMonth[s.getSaleDate().getMonthValue()];
            addRaw(m, s);
            addRaw(byPlatform.computeIfAbsent(s.getPlatform(), k -> new double[6]), s);
        }

        List<MonthlyPoint> monthly = new ArrayList<>();
        double totalCa = 0, totalBenefice = 0;
        int totalCount = 0;
        for (int m = 1; m <= 12; m++) {
            double[] a = byMonth[m];
            double benefice = beneficeOf(a, urssafRate);
            totalCa += a[0];
            totalBenefice += benefice;
            totalCount += (int) a[5];
            monthly.add(new MonthlyPoint(m, round2(a[0]), round2(benefice), (int) a[5]));
        }

        double urssafPaid = declarationRepository.findAllByMemberIdAndYearOrderByMonth(memberId, year).stream()
            .filter(UrssafDeclaration::isDeclared)
            .mapToDouble(d -> d.getTotalDue().doubleValue()).sum();

        List<PlatformStats> platforms = byPlatform.entrySet().stream()
            .sorted((a, b) -> Double.compare(b.getValue()[0], a.getValue()[0]))
            .map(e -> platformStats(e.getKey(), e.getValue(), urssafRate))
            .toList();

        return new AnnualResponse(year, monthly, round2(totalCa), round2(totalBenefice), totalCount,
            round2(urssafPaid), seuil(totalCa, dbl(settings, "seuil_annuel")), platforms);
    }

    // --- Declarations ---

    /** Marks a month as declared, freezing the amounts (assiette = sale price + shipping, pokecalc behavior). */
    @Transactional
    public DeclarationResponse declare(FamilyMember member, int year, int month) {
        Map<String, String> settings = getSettings(member.getId());
        LocalDate from = LocalDate.of(year, month, 1);
        double ca = saleRepository.findAllByMemberIdAndSaleDateBetween(
                member.getId(), from, from.plusMonths(1).minusDays(1)).stream()
            .mapToDouble(s -> s.getSalePrice().doubleValue() + s.getShippingCost().doubleValue()).sum();

        double urssafAmount = r2(ca * dbl(settings, "urssaf_rate") / 100.0);
        double cfpAmount = r2(ca * dbl(settings, "cfp_rate") / 100.0);
        double vflAmount = r2(ca * dbl(settings, "versement_liberatoire_rate") / 100.0);

        UrssafDeclaration decl = declarationRepository
            .findByMemberIdAndYearAndMonth(member.getId(), year, month)
            .orElseGet(() -> UrssafDeclaration.builder().member(member).year(year).month(month).build());
        decl.setTotalCa(round2(ca));
        decl.setUrssafAmount(round2(urssafAmount));
        decl.setCfpAmount(round2(cfpAmount));
        decl.setVflAmount(round2(vflAmount));
        decl.setTotalDue(round2(urssafAmount + cfpAmount + vflAmount));
        decl.setDeclared(true);
        decl.setDeclaredAt(Instant.now());
        decl = declarationRepository.save(decl);

        return new DeclarationResponse(decl.getYear(), decl.getMonth(), decl.getTotalCa(),
            decl.getUrssafAmount(), decl.getCfpAmount(), decl.getVflAmount(), decl.getTotalDue(),
            decl.isDeclared(), decl.getDeclaredAt());
    }

    public List<DeclarationResponse> listDeclarations(Long memberId, int year) {
        return declarationRepository.findAllByMemberIdAndYearOrderByMonth(memberId, year).stream()
            .map(d -> new DeclarationResponse(d.getYear(), d.getMonth(), d.getTotalCa(),
                d.getUrssafAmount(), d.getCfpAmount(), d.getVflAmount(), d.getTotalDue(),
                d.isDeclared(), d.getDeclaredAt()))
            .toList();
    }

    /**
     * One-shot pokecalc import of sales: rows whose (date, reference, price)
     * already exist are skipped — idempotent, safe to re-upload.
     */
    @Transactional
    public int importSales(FamilyMember member, List<SaleRequest> reqs) {
        if (reqs == null) return 0;
        var existing = saleRepository.findAllByMemberIdOrderBySaleDateDescIdDesc(member.getId()).stream()
            .map(s -> s.getSaleDate() + "|" + s.getReference() + "|" + s.getSalePrice().stripTrailingZeros().toPlainString())
            .collect(java.util.stream.Collectors.toSet());
        int imported = 0;
        for (SaleRequest r : reqs) {
            String key = r.saleDate() + "|" + orEmpty(r.reference()) + "|"
                + orZero(r.salePrice()).stripTrailingZeros().toPlainString();
            if (existing.contains(key)) continue;
            saleRepository.save(apply(ResaleSale.builder().member(member).build(), r));
            imported++;
        }
        return imported;
    }

    /**
     * One-shot pokecalc import of declarations: existing (year, month) rows are
     * skipped — idempotent, safe to re-upload.
     */
    @Transactional
    public int importDeclarations(FamilyMember member, List<ImportDeclaration> declarations) {
        if (declarations == null) return 0;
        int imported = 0;
        for (ImportDeclaration d : declarations) {
            if (declarationRepository.findByMemberIdAndYearAndMonth(member.getId(), d.year(), d.month()).isPresent()) {
                continue;
            }
            declarationRepository.save(UrssafDeclaration.builder()
                .member(member).year(d.year()).month(d.month())
                .totalCa(orZero(d.totalCa()))
                .urssafAmount(orZero(d.urssafAmount()))
                .cfpAmount(orZero(d.cfpAmount()))
                .vflAmount(orZero(d.vflAmount()))
                .totalDue(orZero(d.totalDue()))
                .declared(d.declared())
                .declaredAt(d.declaredAt())
                .build());
            imported++;
        }
        return imported;
    }

    // --- Settings ---

    public Map<String, String> getSettings(Long memberId) {
        Map<String, String> merged = new LinkedHashMap<>(DEFAULT_SETTINGS);
        for (ProSetting s : settingRepository.findAllByMemberId(memberId)) {
            merged.put(s.getSettingKey(), s.getSettingValue());
        }
        return merged;
    }

    @Transactional
    public Map<String, String> putSettings(FamilyMember member, Map<String, String> values) {
        for (Map.Entry<String, String> e : values.entrySet()) {
            ProSetting setting = settingRepository
                .findByMemberIdAndSettingKey(member.getId(), e.getKey())
                .orElseGet(() -> ProSetting.builder().member(member).settingKey(e.getKey()).build());
            setting.setSettingValue(e.getValue());
            settingRepository.save(setting);
        }
        return getSettings(member.getId());
    }

    // --- Simulations ---

    public List<SimulationResponse> listSimulations(Long memberId) {
        return simulationRepository.findAllByMemberIdOrderByUpdatedAtDesc(memberId).stream()
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public SimulationResponse createSimulation(FamilyMember member, SimulationRequest req) {
        ResaleSimulation sim = ResaleSimulation.builder()
            .member(member).simType(req.simType()).name(req.name()).data(req.data())
            .build();
        return toResponse(simulationRepository.save(sim));
    }

    @Transactional
    public SimulationResponse updateSimulation(Long id, Long memberId, SimulationRequest req) {
        ResaleSimulation sim = simulationRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Simulation not found: " + id));
        sim.setSimType(req.simType());
        sim.setName(req.name());
        sim.setData(req.data());
        return toResponse(simulationRepository.save(sim));
    }

    @Transactional
    public void deleteSimulation(Long id, Long memberId) {
        ResaleSimulation sim = simulationRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Simulation not found: " + id));
        simulationRepository.delete(sim);
    }

    private SimulationResponse toResponse(ResaleSimulation sim) {
        return new SimulationResponse(sim.getId(), sim.getSimType(), sim.getName(), sim.getData(),
            sim.getCreatedAt(), sim.getUpdatedAt());
    }

    // --- Helpers ---

    // acc: [ca, purchase, commission, packaging, shipping, count, benefice]
    private void accumulate(double[] a, ResaleSale s, double urssafRate) {
        double sale = s.getSalePrice().doubleValue();
        double charges = sale * urssafRate / 100.0;
        double costs = s.getPurchasePrice().doubleValue() + s.getPlatformCommission().doubleValue()
            + s.getPackagingCost().doubleValue() + s.getShippingCost().doubleValue() + charges;
        a[0] += sale;
        a[1] += s.getPurchasePrice().doubleValue();
        a[2] += s.getPlatformCommission().doubleValue();
        a[3] += s.getPackagingCost().doubleValue();
        a[4] += s.getShippingCost().doubleValue();
        a[5] += 1;
        a[6] += sale - costs;
    }

    // raw: [ca, purchase, commission, packaging, shipping, count]
    private void addRaw(double[] a, ResaleSale s) {
        a[0] += s.getSalePrice().doubleValue();
        a[1] += s.getPurchasePrice().doubleValue();
        a[2] += s.getPlatformCommission().doubleValue();
        a[3] += s.getPackagingCost().doubleValue();
        a[4] += s.getShippingCost().doubleValue();
        a[5] += 1;
    }

    private double beneficeOf(double[] a, double urssafRate) {
        double charges = a[0] * urssafRate / 100.0;
        return a[0] - (a[1] + a[2] + a[3] + a[4] + charges);
    }

    private CategoryStats toStats(double[] a) {
        double totalCosts = a[0] - a[6]; // benefice = ca − totalCosts
        double marge = a[0] > 0 ? a[6] / a[0] * 100.0 : 0;
        return new CategoryStats((int) a[5], round2(a[0]), round2(a[1]), round2(a[2]), round2(a[3]),
            round2(a[4]), round2(totalCosts), round2(a[6]), round2(marge));
    }

    private PlatformStats platformStats(String platform, double[] a, double urssafRate) {
        double benefice = beneficeOf(a, urssafRate);
        double marge = a[0] > 0 ? benefice / a[0] * 100.0 : 0;
        double avgCommission = a[0] > 0 ? a[2] / a[0] * 100.0 : 0;
        return new PlatformStats(platform, (int) a[5], round2(a[0]), round2(a[2]),
            round2(avgCommission), round2(benefice), round2(marge));
    }

    private UrssafBlock urssafBlock(double ca, Map<String, String> settings) {
        double cotisations = r2(ca * dbl(settings, "urssaf_rate") / 100.0);
        double cfp = r2(ca * dbl(settings, "cfp_rate") / 100.0);
        double vfl = r2(ca * dbl(settings, "versement_liberatoire_rate") / 100.0);
        return new UrssafBlock(round2(ca), round2(cotisations), round2(cfp), round2(vfl),
            round2(cotisations + cfp + vfl));
    }

    private SeuilBlock seuil(double caCumule, double annuel) {
        return new SeuilBlock(round2(annuel), round2(caCumule), round2(annuel - caCumule),
            round2(annuel > 0 ? caCumule / annuel * 100.0 : 0));
    }

    private double rate(Long memberId, String key) {
        return dbl(getSettings(memberId), key);
    }

    private double dbl(Map<String, String> settings, String key) {
        try {
            return Double.parseDouble(settings.get(key));
        } catch (RuntimeException e) {
            return Double.parseDouble(DEFAULT_SETTINGS.get(key));
        }
    }

    private static double r2(double n) {
        return Math.round(n * 100.0) / 100.0;
    }

    private static BigDecimal round2(double n) {
        return BigDecimal.valueOf(n).setScale(2, RoundingMode.HALF_UP);
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    private static BigDecimal orZero(BigDecimal b) {
        return b == null ? BigDecimal.ZERO : b;
    }
}
