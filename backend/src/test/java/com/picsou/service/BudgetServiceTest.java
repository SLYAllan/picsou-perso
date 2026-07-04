package com.picsou.service;

import com.picsou.dto.BudgetDtos.BudgetSummaryResponse;
import com.picsou.dto.BudgetDtos.CategorizeRequest;
import com.picsou.model.*;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.BudgetCategoryRepository;
import com.picsou.repository.BudgetRuleRepository;
import com.picsou.repository.TransactionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BudgetServiceTest {

    @Mock BudgetCategoryRepository categoryRepository;
    @Mock BudgetRuleRepository ruleRepository;
    @Mock TransactionRepository transactionRepository;
    @Mock AccountRepository accountRepository;
    @InjectMocks BudgetService budgetService;

    private final FamilyMember owner = ownerMember();

    private static FamilyMember ownerMember() {
        FamilyMember m = FamilyMember.builder().displayName("Allan").build();
        m.setId(1L);
        return m;
    }

    private Account account(long id, AccountScope scope) {
        Account a = Account.builder().member(owner).name("A" + id)
            .type(AccountType.CHECKING).scope(scope).build();
        a.setId(id);
        return a;
    }

    private Transaction tx(long id, Account account, String description, String amount, String category) {
        Transaction t = Transaction.builder()
            .account(account).date(LocalDate.of(2026, 7, 3))
            .description(description).amount(new BigDecimal(amount))
            .category(category).build();
        t.setId(id);
        return t;
    }

    @Test
    void summary_aggregatesByCategory_andScopesAccounts() {
        Account perso = account(1L, AccountScope.PERSONAL);
        Account pro = account(2L, AccountScope.BUSINESS);
        when(categoryRepository.countByMemberId(1L)).thenReturn(10L);
        when(categoryRepository.findAllByMemberIdOrderByScopeAscNameAsc(1L)).thenReturn(List.of());
        when(ruleRepository.findAllByMemberId(1L)).thenReturn(List.of());
        when(accountRepository.findAllByMemberIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(perso, pro));
        // scope=PERSONAL → only account 1's transactions are fetched
        when(transactionRepository.findByAccountIdInAndDateBetweenOrderByDateDesc(
                eq(List.of(1L)), any(), any()))
            .thenReturn(List.of(
                tx(1, perso, "CB CARREFOUR", "-50.00", "Courses"),
                tx(2, perso, "CB CARREFOUR MARKET", "-30.00", "Courses"),
                tx(3, perso, "VIREMENT SALAIRE", "1000.00", "Revenus"),
                tx(4, perso, "CB MYSTERE", "-5.00", null)));

        BudgetSummaryResponse s = budgetService.getSummary(owner, YearMonth.of(2026, 7), AccountScope.PERSONAL);

        assertThat(s.totalIncome()).isEqualByComparingTo("1000");
        assertThat(s.totalExpenses()).isEqualByComparingTo("-85");
        assertThat(s.expensesByCategory()).hasSize(1);
        assertThat(s.expensesByCategory().get(0).name()).isEqualTo("Courses");
        assertThat(s.expensesByCategory().get(0).amount()).isEqualByComparingTo("-80");
        assertThat(s.expensesByCategory().get(0).count()).isEqualTo(2);
        assertThat(s.incomeByCategory().get(0).name()).isEqualTo("Revenus");
        assertThat(s.uncategorizedCount()).isEqualTo(1);
        assertThat(s.uncategorizedExpenses()).isEqualByComparingTo("-5");
    }

    @Test
    void summary_excludesInvestmentTransactions() {
        Account perso = account(1L, AccountScope.PERSONAL);
        when(categoryRepository.countByMemberId(1L)).thenReturn(10L);
        when(categoryRepository.findAllByMemberIdOrderByScopeAscNameAsc(1L)).thenReturn(List.of());
        when(ruleRepository.findAllByMemberId(1L)).thenReturn(List.of());
        when(accountRepository.findAllByMemberIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(perso));
        Transaction buy = tx(1, perso, "BUY IWDA", "-500.00", null);
        buy.setTicker("IWDA.AS");
        when(transactionRepository.findByAccountIdInAndDateBetweenOrderByDateDesc(anyList(), any(), any()))
            .thenReturn(List.of(buy));

        BudgetSummaryResponse s = budgetService.getSummary(owner, YearMonth.of(2026, 7), null);

        assertThat(s.totalExpenses()).isEqualByComparingTo("0");
        assertThat(s.uncategorizedCount()).isZero();
    }

    @Test
    void categorize_withApplyToSimilar_createsRuleAndBackfills() {
        Account perso = account(1L, AccountScope.PERSONAL);
        Transaction target = tx(1, perso, "CB CARREFOUR 0307", "-50.00", null);
        Transaction similar = tx(2, perso, "CB CARREFOUR 0107", "-20.00", null);
        Transaction other = tx(3, perso, "CB FNAC", "-10.00", null);
        when(transactionRepository.findByIdAndMemberId(1L, 1L)).thenReturn(Optional.of(target));
        when(ruleRepository.findByMemberIdAndKeyword(1L, "CARREFOUR")).thenReturn(Optional.empty());
        when(ruleRepository.save(any(BudgetRule.class))).thenAnswer(inv -> inv.getArgument(0));
        when(accountRepository.findAllByMemberIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(perso));
        when(transactionRepository.findByAccountIdInAndDateBetweenOrderByDateDesc(anyList(), any(), any()))
            .thenReturn(List.of(similar, other));
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));

        budgetService.categorize(1L, 1L, new CategorizeRequest("Courses", true, "carrefour"));

        assertThat(target.getCategory()).isEqualTo("Courses");
        assertThat(similar.getCategory()).isEqualTo("Courses");
        assertThat(other.getCategory()).isNull();
    }

    @Test
    void applyRules_categorizesMatchingUncategorizedOnly() {
        Account perso = account(1L, AccountScope.PERSONAL);
        BudgetRule rule = BudgetRule.builder().member(owner).keyword("NETFLIX").categoryName("Abonnements").build();
        Transaction match = tx(1, perso, "Prlv NETFLIX SARL", "-13.49", null);
        Transaction alreadySet = tx(2, perso, "NETFLIX", "-13.49", "Loisirs");
        when(ruleRepository.findAllByMemberId(1L)).thenReturn(List.of(rule));
        when(accountRepository.findAllByMemberIdOrderByCreatedAtAsc(1L)).thenReturn(List.of(perso));
        // uncategorizedOnly fetch → only `match` comes back
        when(transactionRepository.findByAccountIdInAndDateBetweenOrderByDateDesc(anyList(), any(), any()))
            .thenReturn(List.of(match, alreadySet));
        when(transactionRepository.save(any(Transaction.class))).thenAnswer(inv -> inv.getArgument(0));

        budgetService.applyRules(1L, YearMonth.of(2026, 7), null);

        assertThat(match.getCategory()).isEqualTo("Abonnements");
        assertThat(alreadySet.getCategory()).isEqualTo("Loisirs"); // untouched
    }
}
