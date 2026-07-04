package com.picsou.controller;

import com.picsou.dto.BudgetDtos.*;
import com.picsou.dto.TransactionResponse;
import com.picsou.model.AccountScope;
import com.picsou.service.BudgetService;
import com.picsou.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/api/budget")
public class BudgetController {

    private final BudgetService budgetService;
    private final UserContext userContext;

    public BudgetController(BudgetService budgetService, UserContext userContext) {
        this.budgetService = budgetService;
        this.userContext = userContext;
    }

    @GetMapping("/summary")
    public BudgetSummaryResponse getSummary(@RequestParam String month,
                                            @RequestParam(required = false) AccountScope scope) {
        return budgetService.getSummary(userContext.currentMember(), YearMonth.parse(month), scope);
    }

    @GetMapping("/transactions")
    public List<TransactionResponse> getTransactions(@RequestParam String month,
                                                     @RequestParam(required = false) AccountScope scope,
                                                     @RequestParam(defaultValue = "false") boolean uncategorized) {
        return budgetService.getTransactions(userContext.currentMember(), YearMonth.parse(month), scope, uncategorized);
    }

    @PutMapping("/transactions/{id}/category")
    public TransactionResponse categorize(@PathVariable Long id, @Valid @RequestBody CategorizeRequest req) {
        return budgetService.categorize(id, userContext.currentMemberId(), req);
    }

    @GetMapping("/categories")
    public List<CategoryResponse> getCategories() {
        return budgetService.getCategories(userContext.currentMember());
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse createCategory(@Valid @RequestBody CategoryRequest req) {
        return budgetService.createCategory(userContext.currentMember(), req);
    }

    @PutMapping("/categories/{id}")
    public CategoryResponse updateCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest req) {
        return budgetService.updateCategory(id, userContext.currentMemberId(), req);
    }

    @DeleteMapping("/categories/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCategory(@PathVariable Long id) {
        budgetService.deleteCategory(id, userContext.currentMemberId());
    }
}
