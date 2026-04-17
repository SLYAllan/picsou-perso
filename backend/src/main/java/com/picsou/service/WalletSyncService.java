package com.picsou.service;

import com.picsou.dto.AccountResponse;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.exception.SyncException;
import com.picsou.model.*;
import com.picsou.port.WalletPort;
import com.picsou.port.WalletPort.WalletBalance;
import com.picsou.repository.AccountRepository;
import com.picsou.repository.FamilyMemberRepository;
import com.picsou.repository.WalletAddressRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class WalletSyncService {

    private static final Logger log = LoggerFactory.getLogger(WalletSyncService.class);

    private final List<WalletPort> walletAdapters;
    private final WalletAddressRepository walletRepository;
    private final AccountRepository accountRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final AccountService accountService;
    private final PriceService priceService;

    public WalletSyncService(
        List<WalletPort> walletAdapters,
        WalletAddressRepository walletRepository,
        AccountRepository accountRepository,
        FamilyMemberRepository familyMemberRepository,
        AccountService accountService,
        PriceService priceService
    ) {
        this.walletAdapters = walletAdapters;
        this.walletRepository = walletRepository;
        this.accountRepository = accountRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.accountService = accountService;
        this.priceService = priceService;
    }

    public AccountResponse addWallet(Chain chain, String address, String label, Long memberId) {
        FamilyMember member = familyMemberRepository.findById(memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Family member not found: " + memberId));

        WalletAddress wallet = WalletAddress.builder()
            .member(member)
            .chain(chain)
            .address(address.trim())
            .label(label != null && !label.isBlank() ? label.trim() : null)
            .build();
        walletRepository.save(wallet);

        return sync(wallet.getId(), memberId);
    }

    public AccountResponse sync(Long walletId, Long memberId) {
        WalletAddress wallet = walletRepository.findByIdAndMemberId(walletId, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Wallet not found: " + walletId));

        WalletPort adapter = findAdapter(wallet.getChain());

        try {
            WalletBalance balance = adapter.fetchBalance(wallet.getAddress());

            BigDecimal priceEur = priceService.getPriceEur(balance.nativeSymbol());
            BigDecimal balanceEur = BigDecimal.ZERO;
            if (priceEur != null) {
                balanceEur = balance.nativeAmount().multiply(priceEur).setScale(2, RoundingMode.HALF_UP);
            } else {
                log.warn("No EUR price for {} -- wallet balance will be 0", balance.nativeSymbol());
            }

            wallet.setLastSyncedAt(Instant.now());
            walletRepository.save(wallet);

            String externalId = "wallet_" + wallet.getChain().name().toLowerCase() + "_" + wallet.getId();
            String name = wallet.getLabel() != null
                ? wallet.getLabel()
                : wallet.getChain().name() + " Wallet";

            // Resolve or create the account (without snapshot yet)
            Account account = resolveAccount(externalId, name, balanceEur, balance.nativeSymbol(), memberId);

            // Persist holding before snapshot (so calculateInvestedAmount finds it)
            if (priceEur != null) {
                accountService.upsertHolding(account.getId(), memberId, balance.nativeSymbol().toUpperCase(),
                    balance.nativeSymbol().toUpperCase(), balance.nativeAmount(), priceEur);
            }

            // Now create snapshot with correct invested amount from holding
            accountService.upsertSnapshot(account, balanceEur, LocalDate.now());

            return accountService.toResponse(account);

        } catch (Exception ex) {
            throw new SyncException("Sync wallet " + wallet.getChain() + " echoue : " + ex.getMessage());
        }
    }

    public void removeWallet(Long walletId, Long memberId) {
        WalletAddress wallet = walletRepository.findByIdAndMemberId(walletId, memberId)
            .orElseThrow(() -> new ResourceNotFoundException("Wallet not found: " + walletId));

        String externalId = "wallet_" + wallet.getChain().name().toLowerCase() + "_" + wallet.getId();
        accountRepository.findByExternalAccountIdAndMemberId(externalId, memberId)
            .ifPresent(accountRepository::delete);
        walletRepository.delete(wallet);
        log.info("Removed wallet {} and associated account", walletId);
    }

    public void resyncAll(Long memberId) {
        List<WalletAddress> wallets = walletRepository.findAllByMemberId(memberId);
        for (WalletAddress wallet : wallets) {
            try {
                sync(wallet.getId(), memberId);
            } catch (Exception ex) {
                log.warn("Wallet resync failed for {} {}: {}", wallet.getChain(), wallet.getAddress(), ex.getMessage());
            }
        }
    }

    @Transactional(readOnly = true)
    public List<WalletStatusResponse> listWallets(Long memberId) {
        return walletRepository.findAllByMemberId(memberId).stream()
            .map(w -> new WalletStatusResponse(
                w.getId(), w.getChain(), w.getAddress(), w.getLabel(), w.getLastSyncedAt()))
            .toList();
    }

    private WalletPort findAdapter(Chain chain) {
        return walletAdapters.stream()
            .filter(a -> a.chain().equalsIgnoreCase(chain.name()))
            .findFirst()
            .orElseThrow(() -> new SyncException("Aucun adapteur trouve pour la chain : " + chain));
    }

    private Account resolveAccount(String externalId, String name, BigDecimal balanceEur, String ticker, Long memberId) {
        Optional<Account> existing = accountRepository.findByExternalAccountIdAndMemberId(externalId, memberId);

        Account account;
        if (existing.isPresent()) {
            account = existing.get();
            account.setCurrentBalance(balanceEur);
            account.setLastSyncedAt(Instant.now());
            account.setTicker(null);
        } else {
            FamilyMember member = familyMemberRepository.findById(memberId)
                .orElseThrow(() -> new ResourceNotFoundException("Family member not found: " + memberId));
            account = Account.builder()
                .member(member)
                .name(name)
                .type(AccountType.CRYPTO)
                .provider(ticker)  // provider keeps the symbol for display (BTC, SOL...)
                .currency("EUR")
                .currentBalance(balanceEur)
                .lastSyncedAt(Instant.now())
                .externalAccountId(externalId)
                .isManual(false)
                .color("#f59e0b")
                .build();
        }

        return accountRepository.save(account);
    }

    public record WalletStatusResponse(
        Long id, Chain chain, String address, String label, java.time.Instant lastSyncedAt) {}
}
