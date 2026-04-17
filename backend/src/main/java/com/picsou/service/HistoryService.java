package com.picsou.service;

import com.picsou.dto.DashboardResponse.AccountPoint;
import com.picsou.dto.DashboardResponse.NetWorthPoint;
import com.picsou.model.Account;
import com.picsou.model.AccountHolding;
import com.picsou.model.AccountType;
import com.picsou.model.PriceSnapshot;
import com.picsou.repository.AccountHoldingRepository;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.BalanceSnapshotRepository;
import com.picsou.repository.PriceSnapshotRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class HistoryService {

    private static final Logger log = LoggerFactory.getLogger(HistoryService.class);

    private final AccountRepository accountRepository;
    private final BalanceSnapshotRepository snapshotRepository;
    private final AccountHoldingRepository holdingRepository;
    private final PriceService priceService;
    private final PriceSnapshotRepository priceSnapshotRepository;
    private final AccountService accountService;

    public HistoryService(
        AccountRepository accountRepository,
        BalanceSnapshotRepository snapshotRepository,
        AccountHoldingRepository holdingRepository,
        PriceService priceService,
        PriceSnapshotRepository priceSnapshotRepository,
        AccountService accountService
    ) {
        this.accountRepository = accountRepository;
        this.snapshotRepository = snapshotRepository;
        this.holdingRepository = holdingRepository;
        this.priceService = priceService;
        this.priceSnapshotRepository = priceSnapshotRepository;
        this.accountService = accountService;
    }

    public List<NetWorthPoint> buildHistory(List<Long> accountIds, int months) {
        return buildHistory(accountIds, months, false, null);
    }

    public List<NetWorthPoint> buildHistory(List<Long> accountIds, int months, Long memberId) {
        return buildHistory(accountIds, months, false, memberId);
    }

    /**
     * Build daily history with PnL for a set of accounts over the last N months.
     *
     * For each date:
     * - total = forward-filled sum of account balances (market value)
     * - invested = holdings cost basis (qty x avgBuyIn, constant) + cash portion
     *   where cash = total - holdings market value at that date (from price_snapshot)
     *
     * When split=true, each point also includes per-account breakdown in the accounts map.
     * Today's point is replaced with live-calculated values.
     */
    public List<NetWorthPoint> buildHistory(List<Long> accountIds, int months, boolean split, Long memberId) {
        List<Account> accounts = accountRepository.findAllById(accountIds);
        if (accounts.isEmpty()) return List.of();

        // Validate all accounts belong to the requesting member
        if (memberId != null) {
            for (Account account : accounts) {
                if (!account.getMember().getId().equals(memberId)) {
                    throw com.picsou.exception.ResourceNotFoundException.account(account.getId());
                }
            }
        }

        LocalDate from = LocalDate.now().minusMonths(months);
        LocalDate to = LocalDate.now();

        Set<Long> loanIds = accounts.stream()
            .filter(a -> a.getType() == AccountType.LOAN)
            .map(Account::getId)
            .collect(Collectors.toSet());

        // Pre-load holdings and group by account
        Map<Long, List<AccountHolding>> holdingsByAccount = new HashMap<>();
        for (Account account : accounts) {
            holdingsByAccount.put(account.getId(), holdingRepository.findByAccount_Id(account.getId()));
        }

        // Per-account forward-filled balances + sorted dates
        ForwardFillData ffData = buildPerAccountForwardFill(from, accounts);

        // Collect all holding tickers
        Set<String> allTickers = new HashSet<>();
        for (List<AccountHolding> holdings : holdingsByAccount.values()) {
            for (AccountHolding h : holdings) {
                if (h.getTicker() != null) allTickers.add(h.getTicker().toUpperCase());
            }
        }

        // Pre-fetch all historical prices for these tickers in one query
        Map<String, Map<LocalDate, BigDecimal>> priceHistoryByTicker = new HashMap<>();
        if (!allTickers.isEmpty()) {
            List<PriceSnapshot> priceSnapshots = priceSnapshotRepository.findByTickerInAndDateBetween(allTickers, from, to);
            for (PriceSnapshot ps : priceSnapshots) {
                priceHistoryByTicker
                    .computeIfAbsent(ps.getTicker(), k -> new HashMap<>())
                    .put(ps.getDate(), ps.getPriceEur());
            }
        }

        // Pre-calculate holdings cost basis per account (constant across time)
        record HoldingData(String ticker, BigDecimal quantity, BigDecimal avgBuyEur) {}
        Map<Long, List<HoldingData>> accountHoldings = new HashMap<>();
        Map<Long, BigDecimal> accountHoldingsInvested = new HashMap<>();

        for (Account account : accounts) {
            List<AccountHolding> holdings = holdingsByAccount.getOrDefault(account.getId(), List.of());
            List<HoldingData> holdingDataList = new ArrayList<>();
            BigDecimal invested = BigDecimal.ZERO;

            for (AccountHolding h : holdings) {
                BigDecimal qty = h.getQuantity();
                BigDecimal avgBuy = h.getAverageBuyIn() != null ? h.getAverageBuyIn() : BigDecimal.ZERO;
                BigDecimal avgBuyEur = priceService.toEur(avgBuy, account.getCurrency(), null);
                holdingDataList.add(new HoldingData(
                    h.getTicker() != null ? h.getTicker().toUpperCase() : null,
                    qty,
                    avgBuyEur
                ));
                invested = invested.add(qty.multiply(avgBuyEur));
            }

            accountHoldings.put(account.getId(), holdingDataList);
            accountHoldingsInvested.put(account.getId(), invested);
        }

        // Build the history points
        List<NetWorthPoint> result = new ArrayList<>();
        for (LocalDate date : ffData.dates()) {
            BigDecimal aggTotal = BigDecimal.ZERO;
            BigDecimal aggHoldingsInvested = BigDecimal.ZERO;
            BigDecimal aggHoldingsMarketValue = BigDecimal.ZERO;
            Map<Long, AccountPoint> accountPoints = split ? new HashMap<>() : null;

            for (Account account : accounts) {
                Long accId = account.getId();
                NavigableMap<LocalDate, BigDecimal> accBalances = ffData.balanceByAccount().get(accId);
                var floorEntry = accBalances != null ? accBalances.floorEntry(date) : null;
                BigDecimal rawBalance = floorEntry != null ? floorEntry.getValue() : BigDecimal.ZERO;
                BigDecimal accTotal = loanIds.contains(accId) ? rawBalance.negate() : rawBalance;

                if (accTotal.compareTo(BigDecimal.ZERO) <= 0 && loanIds.contains(accId)) {
                    aggTotal = aggTotal.add(accTotal);
                } else {
                    aggTotal = aggTotal.add(accTotal);
                }

                // Per-account holdings market value at this date
                List<HoldingData> holdingDataList = accountHoldings.getOrDefault(accId, List.of());
                BigDecimal accHoldingsInvested = accountHoldingsInvested.getOrDefault(accId, BigDecimal.ZERO);
                BigDecimal accHoldingsMarketValue = BigDecimal.ZERO;

                for (HoldingData hd : holdingDataList) {
                    if (hd.ticker == null) continue;
                    Map<LocalDate, BigDecimal> priceHistory = priceHistoryByTicker.get(hd.ticker);
                    if (priceHistory != null) {
                        BigDecimal priceAtDate = priceHistory.get(date);
                        if (priceAtDate != null) {
                            accHoldingsMarketValue = accHoldingsMarketValue.add(hd.quantity.multiply(priceAtDate));
                        }
                    }
                }

                aggHoldingsInvested = aggHoldingsInvested.add(accHoldingsInvested);
                aggHoldingsMarketValue = aggHoldingsMarketValue.add(accHoldingsMarketValue);

                if (split) {
                    BigDecimal accInvested;
                    if (accHoldingsMarketValue.compareTo(BigDecimal.ZERO) > 0) {
                        BigDecimal cash = accTotal.subtract(accHoldingsMarketValue);
                        accInvested = accHoldingsInvested.add(cash.max(BigDecimal.ZERO));
                    } else {
                        accInvested = accTotal;
                    }
                    accountPoints.put(accId, new AccountPoint(accTotal, accInvested, accTotal.subtract(accInvested)));
                }
            }

            BigDecimal invested;
            if (aggHoldingsMarketValue.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal cash = aggTotal.subtract(aggHoldingsMarketValue);
                invested = aggHoldingsInvested.add(cash.max(BigDecimal.ZERO));
            } else {
                invested = aggTotal;
            }

            BigDecimal pnl = aggTotal.subtract(invested);
            result.add(new NetWorthPoint(date, aggTotal, invested, pnl, accountPoints));
        }

        // Replace today's point with live-calculated values
        BigDecimal liveTotal = BigDecimal.ZERO;
        BigDecimal liveInvested = BigDecimal.ZERO;
        Map<Long, AccountPoint> liveAccountPoints = split ? new HashMap<>() : null;

        for (Account account : accounts) {
            BigDecimal accLive = accountService.liveBalanceEur(account);
            BigDecimal accInvested = accountService.calculateInvestedAmount(account);

            if (account.getType() == AccountType.LOAN) {
                liveTotal = liveTotal.subtract(accLive);
            } else {
                liveTotal = liveTotal.add(accLive);
                liveInvested = liveInvested.add(accInvested);
            }

            if (split) {
                BigDecimal total = account.getType() == AccountType.LOAN ? accLive.negate() : accLive;
                BigDecimal invested = account.getType() == AccountType.LOAN ? BigDecimal.ZERO : accInvested;
                liveAccountPoints.put(account.getId(), new AccountPoint(total, invested, total.subtract(invested)));
            }
        }

        LocalDate today = LocalDate.now();
        NetWorthPoint livePoint = new NetWorthPoint(today, liveTotal, liveInvested, liveTotal.subtract(liveInvested), liveAccountPoints);

        boolean replaced = false;
        for (int i = result.size() - 1; i >= 0; i--) {
            if (result.get(i).date().equals(today)) {
                result.set(i, livePoint);
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            result.add(livePoint);
        }

        log.info("buildHistory: {} dates, {} accounts, split={}, livePoint total={} invested={}",
            result.size(), accounts.size(), split, liveTotal, liveInvested);

        return result;
    }

    /**
     * Compute the live PnL for a set of accounts.
     */
    public com.picsou.dto.PnlResponse buildPnl(List<Long> accountIds, Long memberId) {
        List<Account> accounts = accountRepository.findAllById(accountIds);
        if (accounts.isEmpty()) {
            return new com.picsou.dto.PnlResponse(BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, null);
        }

        // Validate all accounts belong to the requesting member
        if (memberId != null) {
            for (Account account : accounts) {
                if (!account.getMember().getId().equals(memberId)) {
                    throw com.picsou.exception.ResourceNotFoundException.account(account.getId());
                }
            }
        }

        BigDecimal liveTotal = BigDecimal.ZERO;
        BigDecimal liveInvested = BigDecimal.ZERO;

        for (Account account : accounts) {
            if (account.getType() == AccountType.LOAN) {
                liveTotal = liveTotal.subtract(accountService.liveBalanceEur(account));
            } else {
                liveTotal = liveTotal.add(accountService.liveBalanceEur(account));
                liveInvested = liveInvested.add(accountService.calculateInvestedAmount(account));
            }
        }

        BigDecimal pnl = liveTotal.subtract(liveInvested);
        BigDecimal pnlPercent = liveInvested.compareTo(BigDecimal.ZERO) > 0
            ? pnl.multiply(BigDecimal.valueOf(100)).divide(liveInvested, 1, java.math.RoundingMode.HALF_UP)
            : null;

        return new com.picsou.dto.PnlResponse(liveTotal, liveInvested, pnl, pnlPercent);
    }

    /** Per-account forward-filled snapshot data. */
    private record ForwardFillData(
        NavigableSet<LocalDate> dates,
        Map<Long, NavigableMap<LocalDate, BigDecimal>> balanceByAccount
    ) {}

    private ForwardFillData buildPerAccountForwardFill(LocalDate from, List<Account> accounts) {
        List<Long> accountIds = accounts.stream().map(Account::getId).toList();
        List<Object[]> rows = snapshotRepository.findForwardFillDataByAccountIds(from, accountIds);

        Map<Long, NavigableMap<LocalDate, BigDecimal>> balanceByAccount = new HashMap<>();
        NavigableSet<LocalDate> allDates = new TreeSet<>();

        for (Object[] row : rows) {
            Long accId = (Long) row[0];
            LocalDate date = (LocalDate) row[1];
            BigDecimal balance = (BigDecimal) row[2];
            balanceByAccount.computeIfAbsent(accId, k -> new TreeMap<>()).put(date, balance);
            allDates.add(date);
        }

        return new ForwardFillData(allDates, balanceByAccount);
    }
}
