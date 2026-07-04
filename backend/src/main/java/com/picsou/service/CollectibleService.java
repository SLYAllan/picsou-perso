package com.picsou.service;

import com.picsou.adapter.TcgCsvPriceProvider;
import com.picsou.adapter.TcgCsvPriceProvider.TcgTicker;
import com.picsou.dto.CollectibleCardRequest;
import com.picsou.dto.CollectibleCardResponse;
import com.picsou.dto.CollectibleCardUpdateRequest;
import com.picsou.dto.CollectibleCatalogResponses.GameResponse;
import com.picsou.dto.CollectibleCatalogResponses.GroupResponse;
import com.picsou.dto.CollectibleCatalogResponses.ProductResponse;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.model.Account;
import com.picsou.model.AccountHolding;
import com.picsou.model.AccountScope;
import com.picsou.model.AccountType;
import com.picsou.repository.AccountHoldingRepository;
import com.picsou.repository.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * TCG collection tracked as an investment. Cards are AccountHolding rows on a
 * per-member COLLECTIBLE account (auto-created on first add), so they flow
 * through the existing net-worth / history / PnL pipeline unchanged. Prices
 * come from TcgCsvPriceProvider via the standard PriceService routing.
 */
@Service
@Transactional(readOnly = true)
public class CollectibleService {

    static final String COLLECTION_ACCOUNT_NAME = "Collection";
    static final String COLLECTION_ACCOUNT_COLOR = "#f59e0b";

    private final AccountRepository accountRepository;
    private final AccountHoldingRepository holdingRepository;
    private final PriceService priceService;
    private final TcgCsvPriceProvider tcgCsv;

    public CollectibleService(AccountRepository accountRepository,
                              AccountHoldingRepository holdingRepository,
                              PriceService priceService,
                              TcgCsvPriceProvider tcgCsv) {
        this.accountRepository = accountRepository;
        this.holdingRepository = holdingRepository;
        this.priceService = priceService;
        this.tcgCsv = tcgCsv;
    }

    // ─── Catalog (proxied from tcgcsv.com) ────────────────────────────────────

    public List<GameResponse> getGames() {
        return TcgCsvPriceProvider.SUPPORTED_GAMES.entrySet().stream()
            .map(e -> new GameResponse(e.getKey(), e.getValue()))
            .toList();
    }

    public List<GroupResponse> getGroups(int categoryId) {
        requireSupportedGame(categoryId);
        return tcgCsv.getGroups(categoryId).stream()
            .map(g -> new GroupResponse(g.groupId(), g.name(), g.abbreviation(), g.publishedOn()))
            .toList();
    }

    public List<ProductResponse> searchProducts(int categoryId, long groupId, String query) {
        requireSupportedGame(categoryId);
        String needle = normalize(query);

        Map<String, BigDecimal> pricesUsd = tcgCsv.getGroupPricesUsd(categoryId, groupId);
        return tcgCsv.getProducts(categoryId, groupId).stream()
            .filter(p -> needle.isEmpty() || normalize(p.name()).contains(needle))
            .map(p -> {
                Map<String, BigDecimal> productPrices = new HashMap<>();
                pricesUsd.forEach((key, usd) -> {
                    // price keys are "productId:subTypeCode"
                    String prefix = p.productId() + ":";
                    if (key.startsWith(prefix)) {
                        productPrices.put(key.substring(prefix.length()), usd);
                    }
                });
                return new ProductResponse(p.productId(), p.name(), p.imageUrl(), productPrices);
            })
            .toList();
    }

    // ─── Collection CRUD ──────────────────────────────────────────────────────

    public List<CollectibleCardResponse> listCards(Long memberId) {
        return accountRepository.findAllByMemberIdAndType(memberId, AccountType.COLLECTIBLE).stream()
            .flatMap(account -> holdingRepository.findByAccountIdOrderByCurrentPriceDesc(account.getId()).stream())
            .map(this::toResponse)
            .toList();
    }

    @Transactional
    public CollectibleCardResponse addCard(com.picsou.model.FamilyMember member, CollectibleCardRequest req) {
        requireSupportedGame(req.categoryId());
        Account account = getOrCreateCollectionAccount(member);

        String ticker = new TcgTicker(req.categoryId(), req.groupId(), req.productId(), req.subTypeCode()).format();
        BigDecimal addQty = BigDecimal.valueOf(req.quantity());

        Optional<AccountHolding> existing = holdingRepository.findByAccountIdAndTicker(account.getId(), ticker);
        AccountHolding holding;
        if (existing.isPresent()) {
            holding = existing.get();
            BigDecimal oldQty = holding.getQuantity();
            BigDecimal oldAvg = holding.getAverageBuyIn() != null ? holding.getAverageBuyIn() : BigDecimal.ZERO;
            BigDecimal newQty = oldQty.add(addQty);
            // Weighted average purchase price across the merged copies
            BigDecimal newAvg = oldQty.multiply(oldAvg).add(addQty.multiply(req.purchasePriceEur()))
                .divide(newQty, 8, RoundingMode.HALF_UP);
            holding.setQuantity(newQty);
            holding.setAverageBuyIn(newAvg);
        } else {
            holding = AccountHolding.builder()
                .account(account)
                .ticker(ticker)
                .quantity(addQty)
                .averageBuyIn(req.purchasePriceEur())
                .build();
        }
        holding.setName(req.name());
        holding.setImageUrl(req.imageUrl());
        holding.setLastSyncedAt(Instant.now());

        return toResponse(holdingRepository.save(holding));
    }

    @Transactional
    public CollectibleCardResponse updateCard(Long holdingId, Long memberId, CollectibleCardUpdateRequest req) {
        AccountHolding holding = getOwnedCard(holdingId, memberId);
        holding.setQuantity(req.quantity());
        if (req.averageBuyIn() != null) {
            holding.setAverageBuyIn(req.averageBuyIn());
        }
        return toResponse(holdingRepository.save(holding));
    }

    @Transactional
    public void deleteCard(Long holdingId, Long memberId) {
        holdingRepository.delete(getOwnedCard(holdingId, memberId));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private Account getOrCreateCollectionAccount(com.picsou.model.FamilyMember member) {
        return accountRepository.findFirstByMemberIdAndTypeOrderByCreatedAtAsc(member.getId(), AccountType.COLLECTIBLE)
            .orElseGet(() -> accountRepository.save(Account.builder()
                .member(member)
                .name(COLLECTION_ACCOUNT_NAME)
                .type(AccountType.COLLECTIBLE)
                .scope(AccountScope.PERSONAL)
                .currency("EUR")
                .isManual(true)
                .color(COLLECTION_ACCOUNT_COLOR)
                .build()));
    }

    /** Load a card holding and enforce it belongs to a COLLECTIBLE account of this member. */
    private AccountHolding getOwnedCard(Long holdingId, Long memberId) {
        return holdingRepository.findById(holdingId)
            .filter(h -> h.getAccount().getType() == AccountType.COLLECTIBLE)
            .filter(h -> h.getAccount().getMember().getId().equals(memberId))
            .orElseThrow(() -> new ResourceNotFoundException("Card not found: " + holdingId));
    }

    private CollectibleCardResponse toResponse(AccountHolding holding) {
        TcgTicker parsed = TcgTicker.parse(holding.getTicker());
        int categoryId = parsed != null ? parsed.categoryId() : 0;

        BigDecimal quantity = holding.getQuantity();
        BigDecimal averageBuyIn = holding.getAverageBuyIn() != null ? holding.getAverageBuyIn() : BigDecimal.ZERO;
        BigDecimal costBasis = averageBuyIn.multiply(quantity);
        BigDecimal currentPriceEur = priceService.getPriceEur(holding.getTicker());
        BigDecimal currentValueEur = currentPriceEur != null ? currentPriceEur.multiply(quantity) : null;
        BigDecimal pnlEur = currentValueEur != null ? currentValueEur.subtract(costBasis) : null;
        BigDecimal pnlPercent = (pnlEur != null && costBasis.signum() != 0)
            ? pnlEur.divide(costBasis, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100))
            : null;

        return new CollectibleCardResponse(
            holding.getId(),
            holding.getTicker(),
            categoryId,
            TcgCsvPriceProvider.SUPPORTED_GAMES.getOrDefault(categoryId, "Unknown"),
            holding.getName(),
            holding.getImageUrl(),
            quantity,
            holding.getAverageBuyIn(),
            currentPriceEur,
            currentValueEur,
            costBasis,
            pnlEur,
            pnlPercent,
            holding.getCreatedAt()
        );
    }

    private void requireSupportedGame(int categoryId) {
        if (!TcgCsvPriceProvider.SUPPORTED_GAMES.containsKey(categoryId)) {
            throw new ResourceNotFoundException("Unsupported TCG category: " + categoryId);
        }
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .trim();
    }
}
