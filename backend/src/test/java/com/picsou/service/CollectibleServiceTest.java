package com.picsou.service;

import com.picsou.adapter.TcgCsvPriceProvider;
import com.picsou.dto.CollectibleCardRequest;
import com.picsou.dto.CollectibleCardResponse;
import com.picsou.dto.CollectibleCardUpdateRequest;
import com.picsou.exception.ResourceNotFoundException;
import com.picsou.model.Account;
import com.picsou.model.AccountHolding;
import com.picsou.model.AccountType;
import com.picsou.model.FamilyMember;
import com.picsou.repository.AccountHoldingRepository;
import com.picsou.repository.AccountRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CollectibleServiceTest {

    @Mock AccountRepository accountRepository;
    @Mock AccountHoldingRepository holdingRepository;
    @Mock PriceService priceService;
    @Mock TcgCsvPriceProvider tcgCsv;
    @InjectMocks CollectibleService collectibleService;

    private static final String TICKER = "TCG:89:24344:693380:N";

    private FamilyMember member(long id) {
        FamilyMember m = FamilyMember.builder().displayName("Allan").build();
        m.setId(id);
        return m;
    }

    private Account collectionAccount(long accountId, FamilyMember owner) {
        Account a = Account.builder()
            .member(owner)
            .name("Collection")
            .type(AccountType.COLLECTIBLE)
            .currency("EUR")
            .build();
        a.setId(accountId);
        return a;
    }

    private CollectibleCardRequest addRequest(int quantity, String priceEur) {
        return new CollectibleCardRequest(89, 24344L, 693380L, "N", quantity,
            new BigDecimal(priceEur), "Annie - Origins", "https://img/annie.jpg");
    }

    @Test
    void addCard_createsCollectionAccountOnFirstAdd() {
        FamilyMember owner = member(1L);
        when(accountRepository.findFirstByMemberIdAndTypeOrderByCreatedAtAsc(1L, AccountType.COLLECTIBLE))
            .thenReturn(Optional.empty());
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> {
            Account a = inv.getArgument(0);
            a.setId(10L);
            return a;
        });
        when(holdingRepository.findByAccountIdAndTicker(10L, TICKER)).thenReturn(Optional.empty());
        when(holdingRepository.save(any(AccountHolding.class))).thenAnswer(inv -> inv.getArgument(0));
        when(priceService.getPriceEur(anyString())).thenReturn(null);

        CollectibleCardResponse response = collectibleService.addCard(owner, addRequest(2, "10"));

        ArgumentCaptor<Account> created = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository).save(created.capture());
        assertThat(created.getValue().getType()).isEqualTo(AccountType.COLLECTIBLE);
        assertThat(created.getValue().getName()).isEqualTo("Collection");
        assertThat(response.ticker()).isEqualTo(TICKER);
        assertThat(response.quantity()).isEqualByComparingTo("2");
        assertThat(response.averageBuyIn()).isEqualByComparingTo("10");
        assertThat(response.gameName()).contains("Riftbound");
        assertThat(response.currentValueEur()).isNull(); // price unknown → no invented value
    }

    @Test
    void addCard_reusesExistingCollectionAccount() {
        FamilyMember owner = member(1L);
        Account account = collectionAccount(10L, owner);
        when(accountRepository.findFirstByMemberIdAndTypeOrderByCreatedAtAsc(1L, AccountType.COLLECTIBLE))
            .thenReturn(Optional.of(account));
        when(holdingRepository.findByAccountIdAndTicker(10L, TICKER)).thenReturn(Optional.empty());
        when(holdingRepository.save(any(AccountHolding.class))).thenAnswer(inv -> inv.getArgument(0));
        when(priceService.getPriceEur(anyString())).thenReturn(null);

        collectibleService.addCard(owner, addRequest(1, "5"));

        verify(accountRepository, org.mockito.Mockito.never()).save(any(Account.class));
    }

    @Test
    void addCard_mergesIntoExistingPosition_withWeightedAverage() {
        FamilyMember owner = member(1L);
        Account account = collectionAccount(10L, owner);
        AccountHolding existing = AccountHolding.builder()
            .account(account)
            .ticker(TICKER)
            .quantity(new BigDecimal("2"))
            .averageBuyIn(new BigDecimal("10"))
            .build();
        when(accountRepository.findFirstByMemberIdAndTypeOrderByCreatedAtAsc(1L, AccountType.COLLECTIBLE))
            .thenReturn(Optional.of(account));
        when(holdingRepository.findByAccountIdAndTicker(10L, TICKER)).thenReturn(Optional.of(existing));
        when(holdingRepository.save(any(AccountHolding.class))).thenAnswer(inv -> inv.getArgument(0));
        when(priceService.getPriceEur(anyString())).thenReturn(new BigDecimal("20"));

        // 2 copies @10 + 1 copy @16 → 3 copies @12
        CollectibleCardResponse response = collectibleService.addCard(owner, addRequest(1, "16"));

        assertThat(response.quantity()).isEqualByComparingTo("3");
        assertThat(response.averageBuyIn()).isEqualByComparingTo("12");
        assertThat(response.costBasisEur()).isEqualByComparingTo("36");
        assertThat(response.currentValueEur()).isEqualByComparingTo("60");
        assertThat(response.pnlEur()).isEqualByComparingTo("24");
        assertThat(response.pnlPercent().doubleValue()).isCloseTo(66.67, within(0.01));
    }

    @Test
    void updateCard_refusesCardOfAnotherMember() {
        FamilyMember other = member(2L);
        Account othersAccount = collectionAccount(10L, other);
        AccountHolding holding = AccountHolding.builder()
            .account(othersAccount)
            .ticker(TICKER)
            .quantity(BigDecimal.ONE)
            .build();
        holding.setId(77L);
        when(holdingRepository.findById(77L)).thenReturn(Optional.of(holding));

        assertThatThrownBy(() -> collectibleService.updateCard(77L, 1L,
                new CollectibleCardUpdateRequest(BigDecimal.ONE, null)))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void deleteCard_refusesNonCollectibleHolding() {
        FamilyMember owner = member(1L);
        Account pea = Account.builder().member(owner).name("PEA").type(AccountType.PEA).build();
        pea.setId(11L);
        AccountHolding stock = AccountHolding.builder()
            .account(pea)
            .ticker("IWDA.AS")
            .quantity(BigDecimal.ONE)
            .build();
        stock.setId(78L);
        when(holdingRepository.findById(78L)).thenReturn(Optional.of(stock));

        assertThatThrownBy(() -> collectibleService.deleteCard(78L, 1L))
            .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void addCard_rejectsUnsupportedGame() {
        CollectibleCardRequest req = new CollectibleCardRequest(1, 1L, 1L, "N", 1,
            BigDecimal.ONE, "Black Lotus", null);

        assertThatThrownBy(() -> collectibleService.addCard(member(1L), req))
            .isInstanceOf(ResourceNotFoundException.class);
    }
}
