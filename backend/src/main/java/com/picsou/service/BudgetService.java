package com.picsou.service;

import com.picsou.dto.BudgetDtos.*;
import com.picsou.dto.TransactionResponse;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.model.*;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.BudgetCategoryRepository;
import com.picsou.repository.BudgetRuleRepository;
import com.picsou.repository.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * Monthly income/expense tracking per category, on top of already-synced
 * transactions. Uses the pre-existing transaction.category text column;
 * categories and keyword rules are member-scoped entities. Rules are applied
 * lazily on every budget read (idempotent — only touches uncategorized rows),
 * so the sync pipeline stays untouched.
 */
@Service
@Transactional
public class BudgetService {

    /** Default category palette, cycled. */
    private static final String[] COLORS = {
        "#6366f1", "#0ea5e9", "#22c55e", "#eab308", "#f97316",
        "#ef4444", "#a855f7", "#14b8a6", "#f43f5e", "#84cc16",
    };

    private static final List<String> DEFAULT_PERSONAL = List.of(
        "Courses", "Restaurants", "Transport", "Logement", "Abonnements",
        "Loisirs", "Santé", "Shopping", "Voyages", "Revenus");
    private static final List<String> DEFAULT_BUSINESS = List.of(
        "Matériel", "Logiciels", "Frais bancaires", "URSSAF & impôts",
        "Déplacements", "Prestations");

    private final BudgetCategoryRepository categoryRepository;
    private final BudgetRuleRepository ruleRepository;
    private final TransactionRepository transactionRepository;
    private final AccountRepository accountRepository;

    public BudgetService(BudgetCategoryRepository categoryRepository,
                         BudgetRuleRepository ruleRepository,
                         TransactionRepository transactionRepository,
                         AccountRepository accountRepository) {
        this.categoryRepository = categoryRepository;
        this.ruleRepository = ruleRepository;
        this.transactionRepository = transactionRepository;
        this.accountRepository = accountRepository;
    }

    // ─── Categories ───────────────────────────────────────────────────────────

    public List<CategoryResponse> getCategories(FamilyMember member) {
        seedDefaultsIfEmpty(member);
        return categoryRepository.findAllByMemberIdOrderByScopeAscNameAsc(member.getId()).stream()
            .map(CategoryResponse::from)
            .toList();
    }

    public CategoryResponse createCategory(FamilyMember member, CategoryRequest req) {
        BudgetCategory category = BudgetCategory.builder()
            .member(member)
            .name(req.name().trim())
            .scope(req.scope())
            .color(req.color() != null ? req.color() : COLORS[0])
            .build();
        return CategoryResponse.from(categoryRepository.save(category));
    }

    public CategoryResponse updateCategory(Long id, Long memberId, CategoryRequest req) {
        BudgetCategory category = categoryRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));
        String oldName = category.getName();
        category.setName(req.name().trim());
        category.setScope(req.scope());
        if (req.color() != null) category.setColor(req.color());
        BudgetCategory saved = categoryRepository.save(category);

        if (!oldName.equals(saved.getName())) {
            // Rename cascades to already-categorized transactions and rules
            renameOnTransactions(memberId, oldName, saved.getName());
            ruleRepository.findAllByMemberId(memberId).stream()
                .filter(r -> r.getCategoryName().equals(oldName))
                .forEach(r -> { r.setCategoryName(saved.getName()); ruleRepository.save(r); });
        }
        return CategoryResponse.from(saved);
    }

    public void deleteCategory(Long id, Long memberId) {
        BudgetCategory category = categoryRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));
        renameOnTransactions(memberId, category.getName(), null);
        ruleRepository.deleteByMemberIdAndCategoryName(memberId, category.getName());
        categoryRepository.delete(category);
    }

    private void renameOnTransactions(Long memberId, String oldName, String newName) {
        for (Transaction t : memberTransactions(memberId, null, null, null)) {
            if (oldName.equals(t.getCategory())) {
                t.setCategory(newName);
                transactionRepository.save(t);
            }
        }
    }

    private void seedDefaultsIfEmpty(FamilyMember member) {
        if (categoryRepository.countByMemberId(member.getId()) > 0) return;
        int i = 0;
        for (String name : DEFAULT_PERSONAL) {
            categoryRepository.save(BudgetCategory.builder()
                .member(member).name(name).scope(AccountScope.PERSONAL)
                .color(COLORS[i++ % COLORS.length]).build());
        }
        for (String name : DEFAULT_BUSINESS) {
            categoryRepository.save(BudgetCategory.builder()
                .member(member).name(name).scope(AccountScope.BUSINESS)
                .color(COLORS[i++ % COLORS.length]).build());
        }
    }

    // ─── Monthly summary + transactions ──────────────────────────────────────

    public BudgetSummaryResponse getSummary(FamilyMember member, YearMonth month, AccountScope scope) {
        seedDefaultsIfEmpty(member);
        applyRules(member.getId(), month, scope);

        Map<String, String> colorsByName = new HashMap<>();
        categoryRepository.findAllByMemberIdOrderByScopeAscNameAsc(member.getId())
            .forEach(c -> colorsByName.put(c.getName(), c.getColor()));

        Map<String, List<Transaction>> expenses = new HashMap<>();
        Map<String, List<Transaction>> income = new HashMap<>();
        BigDecimal totalIncome = BigDecimal.ZERO;
        BigDecimal totalExpenses = BigDecimal.ZERO;
        BigDecimal uncategorizedExpenses = BigDecimal.ZERO;
        int uncategorizedCount = 0;

        for (Transaction t : memberTransactions(member.getId(), month, scope, null)) {
            boolean isIncome = t.getAmount().signum() > 0;
            if (isIncome) totalIncome = totalIncome.add(t.getAmount());
            else totalExpenses = totalExpenses.add(t.getAmount());

            String cat = t.getCategory();
            if (cat == null || cat.isBlank()) {
                uncategorizedCount++;
                if (!isIncome) uncategorizedExpenses = uncategorizedExpenses.add(t.getAmount());
                continue;
            }
            (isIncome ? income : expenses).computeIfAbsent(cat, k -> new ArrayList<>()).add(t);
        }

        return new BudgetSummaryResponse(
            month.toString(), scope, totalIncome, totalExpenses,
            toSummaries(expenses, colorsByName),
            toSummaries(income, colorsByName),
            uncategorizedExpenses, uncategorizedCount);
    }

    public List<TransactionResponse> getTransactions(FamilyMember member, YearMonth month,
                                                     AccountScope scope, boolean uncategorizedOnly) {
        applyRules(member.getId(), month, scope);
        return memberTransactions(member.getId(), month, scope,
                uncategorizedOnly ? Boolean.TRUE : null).stream()
            .map(TransactionResponse::from)
            .toList();
    }

    public TransactionResponse categorize(Long transactionId, Long memberId, CategorizeRequest req) {
        Transaction transaction = transactionRepository.findByIdAndMemberId(transactionId, memberId)
            .orElseThrow(() -> ResourceNotFoundException.transaction(transactionId));

        String category = (req.category() == null || req.category().isBlank()) ? null : req.category().trim();
        transaction.setCategory(category);
        transactionRepository.save(transaction);

        if (req.applyToSimilar() && category != null) {
            String keyword = normalize(req.keyword() != null && !req.keyword().isBlank()
                ? req.keyword() : transaction.getDescription());
            if (!keyword.isBlank()) {
                BudgetRule rule = ruleRepository.findByMemberIdAndKeyword(memberId, keyword)
                    .orElseGet(() -> BudgetRule.builder()
                        .member(transaction.getAccount().getMember())
                        .keyword(keyword)
                        .build());
                rule.setCategoryName(category);
                ruleRepository.save(rule);
                // Backfill every uncategorized transaction matching the new rule
                for (Transaction t : memberTransactions(memberId, null, null, Boolean.TRUE)) {
                    if (normalize(t.getDescription()).contains(keyword)) {
                        t.setCategory(category);
                        transactionRepository.save(t);
                    }
                }
            }
        }
        return TransactionResponse.from(transaction);
    }

    /** Apply keyword rules to uncategorized transactions of the requested slice. Idempotent. */
    void applyRules(Long memberId, YearMonth month, AccountScope scope) {
        List<BudgetRule> rules = ruleRepository.findAllByMemberId(memberId);
        if (rules.isEmpty()) return;
        for (Transaction t : memberTransactions(memberId, month, scope, Boolean.TRUE)) {
            String description = normalize(t.getDescription());
            for (BudgetRule rule : rules) {
                if (description.contains(rule.getKeyword())) {
                    t.setCategory(rule.getCategoryName());
                    transactionRepository.save(t);
                    break;
                }
            }
        }
    }

    /**
     * Budget-relevant transactions of a member: scope-matching accounts, minus
     * investment rows (security buys/sells are portfolio movements, not spending).
     */
    private List<Transaction> memberTransactions(Long memberId, YearMonth month,
                                                 AccountScope scope, Boolean uncategorizedOnly) {
        List<Long> accountIds = accountRepository.findAllByMemberIdOrderByCreatedAtAsc(memberId).stream()
            .filter(a -> scope == null || a.getScope() == scope)
            .map(Account::getId)
            .toList();
        if (accountIds.isEmpty()) return List.of();

        LocalDate from = month != null ? month.atDay(1) : LocalDate.of(1970, 1, 1);
        LocalDate to = month != null ? month.atEndOfMonth() : LocalDate.of(9999, 12, 31);

        return transactionRepository.findByAccountIdInAndDateBetweenOrderByDateDesc(accountIds, from, to).stream()
            .filter(t -> t.getTicker() == null)
            .filter(t -> uncategorizedOnly == null
                || (t.getCategory() == null || t.getCategory().isBlank()))
            .toList();
    }

    private List<CategorySummary> toSummaries(Map<String, List<Transaction>> byCategory,
                                              Map<String, String> colorsByName) {
        return byCategory.entrySet().stream()
            .map(e -> new CategorySummary(
                e.getKey(),
                colorsByName.getOrDefault(e.getKey(), "#6b7280"),
                e.getValue().stream().map(Transaction::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add),
                e.getValue().size()))
            .sorted(Comparator.comparing(s -> s.amount().abs(), Comparator.reverseOrder()))
            .toList();
    }

    private static String normalize(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }
}
