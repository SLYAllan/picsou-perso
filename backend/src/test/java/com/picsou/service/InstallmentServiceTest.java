package com.picsou.service;

import com.picsou.dto.InstallmentDtos.InstallmentItem;
import com.picsou.dto.InstallmentDtos.InstallmentPlanResponse;
import com.picsou.model.Account;
import com.picsou.model.AccountScope;
import com.picsou.model.AccountType;
import com.picsou.model.FamilyMember;
import com.picsou.model.InstallmentPlan;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.InstallmentPlanRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InstallmentServiceTest {

    @Mock InstallmentPlanRepository planRepository;
    @Mock AccountRepository accountRepository;
    @InjectMocks InstallmentService installmentService;

    private FamilyMember member(long id) {
        FamilyMember m = FamilyMember.builder().displayName("Allan").build();
        m.setId(id);
        return m;
    }

    private InstallmentPlan plan(String total, LocalDate start, int n, AccountScope scope) {
        return InstallmentPlan.builder()
            .member(member(1L)).label("PayPal 4x")
            .totalAmount(new BigDecimal(total)).startDate(start)
            .installments(n).intervalDays(30).scope(scope)
            .build();
    }

    @Test
    void schedule_splitsEqually_roundingOnLastInstallment() {
        // 100 / 4 = exactly 25 each; 99.99 / 4 = 24.99 ×3 + 25.02 last
        LocalDate today = LocalDate.of(2026, 7, 4);
        List<InstallmentItem> s = InstallmentService.schedule(
            plan("99.99", LocalDate.of(2026, 7, 1), 4, AccountScope.PERSONAL), today);

        assertThat(s).hasSize(4);
        assertThat(s.get(0).amount()).isEqualByComparingTo("24.99");
        assertThat(s.get(3).amount()).isEqualByComparingTo("25.02");
        assertThat(s.stream().map(InstallmentItem::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo("99.99");
        assertThat(s.get(0).date()).isEqualTo(LocalDate.of(2026, 7, 1));
        assertThat(s.get(1).date()).isEqualTo(LocalDate.of(2026, 7, 31));
    }

    @Test
    void schedule_marksPastAndTodayInstallmentsPaid() {
        LocalDate today = LocalDate.of(2026, 7, 31);
        List<InstallmentItem> s = InstallmentService.schedule(
            plan("100", LocalDate.of(2026, 7, 1), 4, AccountScope.PERSONAL), today);

        assertThat(s.get(0).paid()).isTrue();   // 07-01
        assertThat(s.get(1).paid()).isTrue();   // 07-31 (today counts as paid)
        assertThat(s.get(2).paid()).isFalse();  // 08-30
        assertThat(InstallmentService.remaining(
            plan("100", LocalDate.of(2026, 7, 1), 4, AccountScope.PERSONAL), today))
            .isEqualByComparingTo("50");
    }

    @Test
    void toResponse_reportsNextDueDate_andNullWhenSettled() {
        LocalDate today = LocalDate.of(2026, 7, 4);
        InstallmentPlan active = plan("100", LocalDate.of(2026, 7, 1), 4, AccountScope.PERSONAL);
        active.setId(1L);
        InstallmentPlanResponse r = installmentService.toResponse(active, today);
        assertThat(r.paidCount()).isEqualTo(1);
        assertThat(r.nextDueDate()).isEqualTo(LocalDate.of(2026, 7, 31));

        InstallmentPlan settled = plan("100", LocalDate.of(2026, 1, 1), 4, AccountScope.PERSONAL);
        settled.setId(2L);
        InstallmentPlanResponse done = installmentService.toResponse(settled, today);
        assertThat(done.remaining()).isEqualByComparingTo("0");
        assertThat(done.nextDueDate()).isNull();
    }

    @Test
    void refreshDebtAccounts_createsLoanAccountWithRemaining_perScope() {
        FamilyMember owner = member(1L);
        InstallmentPlan p = plan("100", LocalDate.now(), 4, AccountScope.PERSONAL); // 25 paid today → 75 due
        when(planRepository.findAllByMemberIdOrderByStartDateDesc(1L)).thenReturn(List.of(p));
        when(accountRepository.findByExternalAccountIdAndMemberId(any(), eq(1L)))
            .thenReturn(Optional.empty());
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        installmentService.refreshDebtAccounts(owner);

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository).save(captor.capture()); // only PERSONAL (BUSINESS total = 0, no account)
        Account created = captor.getValue();
        assertThat(created.getType()).isEqualTo(AccountType.LOAN);
        assertThat(created.getScope()).isEqualTo(AccountScope.PERSONAL);
        assertThat(created.getCurrentBalance()).isEqualByComparingTo("75");
        assertThat(created.getExternalAccountId()).isEqualTo("installments_personal");
    }

    @Test
    void refreshDebtAccounts_updatesExistingAccount_downToZero() {
        FamilyMember owner = member(1L);
        Account existing = Account.builder().member(owner).type(AccountType.LOAN)
            .currentBalance(new BigDecimal("75")).externalAccountId("installments_personal").build();
        when(planRepository.findAllByMemberIdOrderByStartDateDesc(1L)).thenReturn(List.of());
        when(accountRepository.findByExternalAccountIdAndMemberId("installments_personal", 1L))
            .thenReturn(Optional.of(existing));
        when(accountRepository.findByExternalAccountIdAndMemberId("installments_business", 1L))
            .thenReturn(Optional.empty());
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        installmentService.refreshDebtAccounts(owner);

        assertThat(existing.getCurrentBalance()).isEqualByComparingTo("0");
    }
}
