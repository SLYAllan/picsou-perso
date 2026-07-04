package com.picsou.service;

import com.picsou.dto.InstallmentDtos.*;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.model.*;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.InstallmentPlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Split payments (PayPal 4x & co). The schedule is computed on the fly; the
 * remaining due per scope is mirrored into an auto-maintained LOAN account
 * ("Paiements 4x") so it flows through liabilities/net worth/history for free
 * — same reuse pattern as the collectibles COLLECTIBLE account.
 */
@Service
@Transactional
public class InstallmentService {

    static final String INSTALLMENT_ACCOUNT_NAME = "Paiements 4x";
    static final String INSTALLMENT_ACCOUNT_COLOR = "#ef4444";
    static final String EXTERNAL_ID_PREFIX = "installments_";

    private final InstallmentPlanRepository planRepository;
    private final AccountRepository accountRepository;

    public InstallmentService(InstallmentPlanRepository planRepository,
                              AccountRepository accountRepository) {
        this.planRepository = planRepository;
        this.accountRepository = accountRepository;
    }

    public List<InstallmentPlanResponse> list(Long memberId) {
        return planRepository.findAllByMemberIdOrderByStartDateDesc(memberId).stream()
            .map(p -> toResponse(p, LocalDate.now()))
            .toList();
    }

    public InstallmentPlanResponse create(FamilyMember member, InstallmentPlanRequest req) {
        InstallmentPlan plan = planRepository.save(InstallmentPlan.builder()
            .member(member)
            .label(req.label().trim())
            .totalAmount(req.totalAmount())
            .startDate(req.startDate())
            .installments(req.installments() != null ? req.installments() : 4)
            .intervalDays(req.intervalDays() != null ? req.intervalDays() : 30)
            .scope(req.scope() != null ? req.scope() : AccountScope.PERSONAL)
            .build());
        refreshDebtAccounts(member);
        return toResponse(plan, LocalDate.now());
    }

    public InstallmentPlanResponse update(Long id, Long memberId, InstallmentPlanRequest req) {
        InstallmentPlan plan = getOrThrow(id, memberId);
        plan.setLabel(req.label().trim());
        plan.setTotalAmount(req.totalAmount());
        plan.setStartDate(req.startDate());
        if (req.installments() != null) plan.setInstallments(req.installments());
        if (req.intervalDays() != null) plan.setIntervalDays(req.intervalDays());
        if (req.scope() != null) plan.setScope(req.scope());
        planRepository.save(plan);
        refreshDebtAccounts(plan.getMember());
        return toResponse(plan, LocalDate.now());
    }

    public void delete(Long id, Long memberId) {
        InstallmentPlan plan = getOrThrow(id, memberId);
        FamilyMember member = plan.getMember();
        planRepository.delete(plan);
        refreshDebtAccounts(member);
    }

    // ─── Schedule math ────────────────────────────────────────────────────────

    /** Equal parts at startDate + k·intervalDays; rounding difference lands on the last installment. */
    static List<InstallmentItem> schedule(InstallmentPlan plan, LocalDate today) {
        int n = plan.getInstallments();
        BigDecimal part = plan.getTotalAmount().divide(BigDecimal.valueOf(n), 2, RoundingMode.FLOOR);
        BigDecimal last = plan.getTotalAmount().subtract(part.multiply(BigDecimal.valueOf(n - 1)));

        List<InstallmentItem> items = new ArrayList<>(n);
        for (int k = 0; k < n; k++) {
            LocalDate date = plan.getStartDate().plusDays((long) k * plan.getIntervalDays());
            BigDecimal amount = (k == n - 1) ? last : part;
            items.add(new InstallmentItem(date, amount, !date.isAfter(today)));
        }
        return items;
    }

    static BigDecimal remaining(InstallmentPlan plan, LocalDate today) {
        return schedule(plan, today).stream()
            .filter(i -> !i.paid())
            .map(InstallmentItem::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    InstallmentPlanResponse toResponse(InstallmentPlan plan, LocalDate today) {
        List<InstallmentItem> schedule = schedule(plan, today);
        int paidCount = (int) schedule.stream().filter(InstallmentItem::paid).count();
        LocalDate nextDue = schedule.stream()
            .filter(i -> !i.paid())
            .map(InstallmentItem::date)
            .findFirst().orElse(null);
        return new InstallmentPlanResponse(
            plan.getId(), plan.getLabel(), plan.getTotalAmount(), plan.getStartDate(),
            plan.getInstallments(), plan.getIntervalDays(), plan.getScope(),
            schedule, paidCount, remaining(plan, today), nextDue);
    }

    // ─── Auto-maintained debt account ─────────────────────────────────────────

    /**
     * Mirror the remaining due into one LOAN account per (member, scope).
     * Called on every plan CRUD and by the daily scheduler (an installment
     * passing its date reduces the debt without any user action).
     */
    public void refreshDebtAccounts(FamilyMember member) {
        LocalDate today = LocalDate.now();
        List<InstallmentPlan> plans = planRepository.findAllByMemberIdOrderByStartDateDesc(member.getId());

        for (AccountScope scope : AccountScope.values()) {
            BigDecimal totalRemaining = plans.stream()
                .filter(p -> p.getScope() == scope)
                .map(p -> remaining(p, today))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            String externalId = EXTERNAL_ID_PREFIX + scope.name().toLowerCase();
            Optional<Account> existing = accountRepository
                .findByExternalAccountIdAndMemberId(externalId, member.getId());

            if (existing.isPresent()) {
                Account account = existing.get();
                account.setCurrentBalance(totalRemaining);
                accountRepository.save(account);
            } else if (totalRemaining.signum() > 0) {
                accountRepository.save(Account.builder()
                    .member(member)
                    .name(INSTALLMENT_ACCOUNT_NAME)
                    .type(AccountType.LOAN)
                    .scope(scope)
                    .currency("EUR")
                    .currentBalance(totalRemaining)
                    .isManual(true)
                    .color(INSTALLMENT_ACCOUNT_COLOR)
                    .externalAccountId(externalId)
                    .build());
            }
        }
    }

    private InstallmentPlan getOrThrow(Long id, Long memberId) {
        return planRepository.findByIdAndMemberId(id, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Installment plan not found: " + id));
    }
}
