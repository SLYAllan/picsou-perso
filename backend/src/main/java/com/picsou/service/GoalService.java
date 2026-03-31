package com.picsou.service;

import com.picsou.dto.AccountResponse;
import com.picsou.dto.GoalMonthEntryResponse;
import com.picsou.dto.GoalProgressResponse;
import com.picsou.dto.GoalRequest;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.model.Account;
import com.picsou.model.BalanceSnapshot;
import com.picsou.model.Goal;
import com.picsou.model.GoalMonthOverride;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.BalanceSnapshotRepository;
import com.picsou.repository.GoalMonthOverrideRepository;
import com.picsou.repository.GoalRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class GoalService {

    private final GoalRepository goalRepository;
    private final AccountRepository accountRepository;
    private final BalanceSnapshotRepository snapshotRepository;
    private final AccountService accountService;
    private final GoalMonthOverrideRepository overrideRepository;

    public GoalService(
        GoalRepository goalRepository,
        AccountRepository accountRepository,
        BalanceSnapshotRepository snapshotRepository,
        AccountService accountService,
        GoalMonthOverrideRepository overrideRepository
    ) {
        this.goalRepository = goalRepository;
        this.accountRepository = accountRepository;
        this.snapshotRepository = snapshotRepository;
        this.accountService = accountService;
        this.overrideRepository = overrideRepository;
    }

    public List<GoalProgressResponse> findAll() {
        return goalRepository.findAllWithAccounts().stream()
            .map(this::toProgressResponse)
            .toList();
    }

    public GoalProgressResponse findById(Long id) {
        return toProgressResponse(getOrThrow(id));
    }

    @Transactional
    public GoalProgressResponse create(GoalRequest req) {
        List<Account> accounts = accountRepository.findAllById(req.accountIds());
        if (accounts.size() != req.accountIds().size()) {
            throw new IllegalArgumentException("One or more account IDs not found");
        }

        Goal goal = Goal.builder()
            .name(req.name())
            .targetAmount(req.targetAmount())
            .deadline(req.deadline())
            .accounts(new ArrayList<>(accounts))
            .build();

        return toProgressResponse(goalRepository.save(goal));
    }

    @Transactional
    public GoalProgressResponse update(Long id, GoalRequest req) {
        Goal goal = getOrThrow(id);

        List<Account> accounts = accountRepository.findAllById(req.accountIds());
        if (accounts.size() != req.accountIds().size()) {
            throw new IllegalArgumentException("One or more account IDs not found");
        }

        goal.setName(req.name());
        goal.setTargetAmount(req.targetAmount());
        goal.setDeadline(req.deadline());
        goal.setAccounts(new ArrayList<>(accounts));

        return toProgressResponse(goalRepository.save(goal));
    }

    @Transactional
    public void delete(Long id) {
        if (!goalRepository.existsById(id)) throw ResourceNotFoundException.goal(id);
        goalRepository.deleteById(id);
    }

    // ─── Progress calculation ─────────────────────────────────────────────────

    GoalProgressResponse toProgressResponse(Goal goal) {
        List<AccountResponse> accountResponses = goal.getAccounts().stream()
            .map(accountService::toResponse)
            .toList();

        BigDecimal currentTotal = accountResponses.stream()
            .map(AccountResponse::currentBalanceEur)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal target = goal.getTargetAmount();
        long monthsLeft = Math.max(0, ChronoUnit.MONTHS.between(LocalDate.now(), goal.getDeadline()));

        BigDecimal needed = target.subtract(currentTotal);
        BigDecimal monthlyNeeded;

        if (monthsLeft > 0) {
            monthlyNeeded = needed.divide(BigDecimal.valueOf(monthsLeft), 2, RoundingMode.HALF_UP);
        } else {
            monthlyNeeded = needed; // deadline passed or this month
        }

        BigDecimal percentComplete = target.compareTo(BigDecimal.ZERO) > 0
            ? currentTotal.divide(target, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
            : BigDecimal.ZERO;

        BigDecimal avgMonthlyContribution = calculateAvgMonthlyContribution(goal.getAccounts());
        // null = no history yet → give benefit of the doubt (not "late")
        boolean isOnTrack = monthlyNeeded.compareTo(BigDecimal.ZERO) <= 0
            || avgMonthlyContribution == null
            || avgMonthlyContribution.compareTo(monthlyNeeded) >= 0;

        BigDecimal surplus = avgMonthlyContribution != null
            ? avgMonthlyContribution.subtract(monthlyNeeded)
            : BigDecimal.ZERO;

        return GoalProgressResponse.from(
            goal, accountResponses, currentTotal, percentComplete,
            monthsLeft, monthlyNeeded, avgMonthlyContribution, isOnTrack, surplus
        );
    }

    /**
     * Calculates average monthly contribution over the last 3 months
     * by comparing balance snapshots (first vs last, averaged over elapsed months).
     * Returns null when no snapshot history is available yet.
     */
    private BigDecimal calculateAvgMonthlyContribution(List<Account> accounts) {
        if (accounts.isEmpty()) return null;

        LocalDate threeMonthsAgo = LocalDate.now().minusMonths(3).withDayOfMonth(1);
        BigDecimal totalContribution = BigDecimal.ZERO;
        int accountsWithData = 0;

        for (Account account : accounts) {
            List<BalanceSnapshot> snapshots = snapshotRepository
                .findRecentByAccountId(account.getId(), threeMonthsAgo);

            if (snapshots.size() >= 2) {
                BigDecimal first = snapshots.get(0).getBalance();
                BigDecimal last = snapshots.get(snapshots.size() - 1).getBalance();
                long months = Math.max(1, ChronoUnit.MONTHS.between(
                    snapshots.get(0).getDate(),
                    snapshots.get(snapshots.size() - 1).getDate()
                ));
                totalContribution = totalContribution.add(
                    last.subtract(first).divide(BigDecimal.valueOf(months), 2, RoundingMode.HALF_UP)
                );
                accountsWithData++;
            }
        }

        if (accountsWithData == 0) return null;
        return totalContribution.divide(BigDecimal.valueOf(accountsWithData), 2, RoundingMode.HALF_UP);
    }

    // ─── Monthly history ──────────────────────────────────────────────────────

    public List<GoalMonthEntryResponse> getMonthlyEntries(Long goalId) {
        Goal goal = getOrThrow(goalId);
        BigDecimal objective = toProgressResponse(goal).monthlyNeeded();

        Map<String, BigDecimal> overrideMap = overrideRepository.findByGoalId(goalId).stream()
            .collect(Collectors.toMap(GoalMonthOverride::getYearMonth, GoalMonthOverride::getAmount));

        YearMonth startMonth = YearMonth.from(
            goal.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate()
        );
        YearMonth endMonth = YearMonth.from(goal.getDeadline());

        List<GoalMonthEntryResponse> entries = new ArrayList<>();
        YearMonth current = startMonth;
        while (!current.isAfter(endMonth)) {
            String ym = current.toString();
            BigDecimal actual = calculateActualForMonth(goal, current);
            BigDecimal override = overrideMap.get(ym);
            BigDecimal effective = override != null ? override : actual;
            entries.add(new GoalMonthEntryResponse(ym, objective, actual, override, effective));
            current = current.plusMonths(1);
        }
        return entries;
    }

    @Transactional
    public GoalMonthEntryResponse setMonthOverride(Long goalId, String yearMonth, BigDecimal amount) {
        Goal goal = getOrThrow(goalId);
        GoalMonthOverride entry = overrideRepository
            .findByGoalIdAndYearMonth(goalId, yearMonth)
            .orElseGet(GoalMonthOverride::new);
        entry.setGoal(goal);
        entry.setYearMonth(yearMonth);
        entry.setAmount(amount);
        overrideRepository.save(entry);

        BigDecimal objective = toProgressResponse(goal).monthlyNeeded();
        BigDecimal actual = calculateActualForMonth(goal, YearMonth.parse(yearMonth));
        return new GoalMonthEntryResponse(yearMonth, objective, actual, amount, amount);
    }

    @Transactional
    public GoalMonthEntryResponse deleteMonthOverride(Long goalId, String yearMonth) {
        overrideRepository.findByGoalIdAndYearMonth(goalId, yearMonth)
            .ifPresent(overrideRepository::delete);
        Goal goal = getOrThrow(goalId);
        BigDecimal objective = toProgressResponse(goal).monthlyNeeded();
        BigDecimal actual = calculateActualForMonth(goal, YearMonth.parse(yearMonth));
        return new GoalMonthEntryResponse(yearMonth, objective, actual, null, actual);
    }

    private BigDecimal calculateActualForMonth(Goal goal, YearMonth ym) {
        if (ym.isAfter(YearMonth.now())) return null;

        LocalDate prevMonthEnd = ym.minusMonths(1).atEndOfMonth();
        LocalDate thisMonthEnd = ym.atEndOfMonth();

        BigDecimal total = BigDecimal.ZERO;
        boolean hasData = false;

        for (Account account : goal.getAccounts()) {
            Optional<BalanceSnapshot> prev = snapshotRepository
                .findFirstByAccountIdAndDateLessThanEqualOrderByDateDesc(account.getId(), prevMonthEnd);
            Optional<BalanceSnapshot> curr = snapshotRepository
                .findFirstByAccountIdAndDateLessThanEqualOrderByDateDesc(account.getId(), thisMonthEnd);

            if (prev.isPresent() && curr.isPresent()) {
                total = total.add(curr.get().getBalance().subtract(prev.get().getBalance()));
                hasData = true;
            }
        }

        return hasData ? total.setScale(2, RoundingMode.HALF_UP) : null;
    }

    private Goal getOrThrow(Long id) {
        return goalRepository.findById(id)
            .orElseThrow(() -> ResourceNotFoundException.goal(id));
    }
}
