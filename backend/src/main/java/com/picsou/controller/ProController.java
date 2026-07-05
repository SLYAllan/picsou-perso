package com.picsou.controller;

import com.picsou.dto.ProDtos.*;
import com.picsou.service.PriceService;
import com.picsou.service.ProComptaService;
import com.picsou.service.ProInvoiceService;
import com.picsou.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Pro suite: resale bookkeeping, URSSAF recap, UwUTCG invoices, Japan simulator. */
@RestController
@RequestMapping("/api/pro")
public class ProController {

    private final ProComptaService comptaService;
    private final ProInvoiceService invoiceService;
    private final PriceService priceService;
    private final UserContext userContext;

    public ProController(ProComptaService comptaService, ProInvoiceService invoiceService,
                         PriceService priceService, UserContext userContext) {
        this.comptaService = comptaService;
        this.invoiceService = invoiceService;
        this.priceService = priceService;
        this.userContext = userContext;
    }

    // --- Sales ---

    @GetMapping("/sales")
    public List<SaleResponse> listSales() {
        return comptaService.listSales(userContext.currentMemberId());
    }

    @PostMapping("/sales")
    @ResponseStatus(HttpStatus.CREATED)
    public SaleResponse createSale(@Valid @RequestBody SaleRequest req) {
        return comptaService.createSale(userContext.currentMember(), req);
    }

    @PostMapping("/sales/bulk")
    @ResponseStatus(HttpStatus.CREATED)
    public List<SaleResponse> createSalesBulk(@Valid @RequestBody BulkSalesRequest req) {
        return comptaService.createSalesBulk(userContext.currentMember(), req.sales());
    }

    @PutMapping("/sales/{id}")
    public SaleResponse updateSale(@PathVariable Long id, @Valid @RequestBody SaleRequest req) {
        return comptaService.updateSale(id, userContext.currentMemberId(), req);
    }

    @DeleteMapping("/sales/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSale(@PathVariable Long id) {
        comptaService.deleteSale(id, userContext.currentMemberId());
    }

    /** One-shot pokecalc import (sales + invoices + declarations). Idempotent on invoices/declarations. */
    @PostMapping("/import")
    @ResponseStatus(HttpStatus.CREATED)
    public ImportResult importData(@Valid @RequestBody ImportRequest req) {
        var member = userContext.currentMember();
        int sales = comptaService.importSales(member, req.sales());
        int invoices = invoiceService.importInvoices(member, req.invoices());
        int declarations = comptaService.importDeclarations(member, req.declarations());
        return new ImportResult(sales, invoices, declarations);
    }

    // --- Recap / annual / declarations ---

    @GetMapping("/recap")
    public RecapResponse recap(@RequestParam(required = false) Integer year,
                               @RequestParam(required = false) Integer month) {
        LocalDate now = LocalDate.now();
        return comptaService.recap(userContext.currentMemberId(),
            year != null ? year : now.getYear(),
            month != null ? month : now.getMonthValue());
    }

    @GetMapping("/annual")
    public AnnualResponse annual(@RequestParam(required = false) Integer year) {
        return comptaService.annual(userContext.currentMemberId(),
            year != null ? year : LocalDate.now().getYear());
    }

    @GetMapping("/declarations")
    public List<DeclarationResponse> declarations(@RequestParam(required = false) Integer year) {
        return comptaService.listDeclarations(userContext.currentMemberId(),
            year != null ? year : LocalDate.now().getYear());
    }

    @PostMapping("/declarations")
    @ResponseStatus(HttpStatus.CREATED)
    public DeclarationResponse declare(@Valid @RequestBody DeclareRequest req) {
        return comptaService.declare(userContext.currentMember(), req.year(), req.month());
    }

    // --- Settings ---

    @GetMapping("/settings")
    public Map<String, String> getSettings() {
        return comptaService.getSettings(userContext.currentMemberId());
    }

    @PutMapping("/settings")
    public Map<String, String> putSettings(@RequestBody Map<String, String> values) {
        return comptaService.putSettings(userContext.currentMember(), values);
    }

    // --- Invoices ---

    @GetMapping("/invoices")
    public List<InvoiceResponse> listInvoices() {
        return invoiceService.list(userContext.currentMemberId());
    }

    @GetMapping("/invoices/next-number")
    public Map<String, String> nextInvoiceNumber(@RequestParam(required = false) Integer year) {
        return Map.of("invoiceNumber", invoiceService.nextNumber(userContext.currentMemberId(),
            year != null ? year : LocalDate.now().getYear()));
    }

    @PostMapping("/invoices")
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceResponse createInvoice(@Valid @RequestBody InvoiceRequest req) {
        return invoiceService.create(userContext.currentMember(), req);
    }

    // --- Simulations ---

    @GetMapping("/simulations")
    public List<SimulationResponse> listSimulations() {
        return comptaService.listSimulations(userContext.currentMemberId());
    }

    @PostMapping("/simulations")
    @ResponseStatus(HttpStatus.CREATED)
    public SimulationResponse createSimulation(@Valid @RequestBody SimulationRequest req) {
        return comptaService.createSimulation(userContext.currentMember(), req);
    }

    @PutMapping("/simulations/{id}")
    public SimulationResponse updateSimulation(@PathVariable Long id, @Valid @RequestBody SimulationRequest req) {
        return comptaService.updateSimulation(id, userContext.currentMemberId(), req);
    }

    @DeleteMapping("/simulations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSimulation(@PathVariable Long id) {
        comptaService.deleteSimulation(id, userContext.currentMemberId());
    }

    // --- FX ---

    /** JPY per 1 EUR for the simulator (e.g. ~162). Null-safe: 404-free, returns null rate when FX is down. */
    @GetMapping("/fx/jpy")
    public JpyRateResponse jpyRate() {
        BigDecimal eurPerJpy = priceService.getFxRateToEur("JPY");
        if (eurPerJpy == null || eurPerJpy.signum() <= 0) {
            return new JpyRateResponse(null);
        }
        return new JpyRateResponse(BigDecimal.ONE.divide(eurPerJpy, 2, RoundingMode.HALF_UP));
    }
}
