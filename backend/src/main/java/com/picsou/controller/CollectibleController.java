package com.picsou.controller;

import com.picsou.dto.CollectibleCardRequest;
import com.picsou.dto.CollectibleCardResponse;
import com.picsou.dto.CollectibleCardUpdateRequest;
import com.picsou.dto.CollectibleCatalogResponses.GameResponse;
import com.picsou.dto.CollectibleCatalogResponses.GroupResponse;
import com.picsou.dto.CollectibleCatalogResponses.ProductResponse;
import com.picsou.service.CollectibleService;
import com.picsou.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/collectibles")
public class CollectibleController {

    private final CollectibleService collectibleService;
    private final UserContext userContext;

    public CollectibleController(CollectibleService collectibleService, UserContext userContext) {
        this.collectibleService = collectibleService;
        this.userContext = userContext;
    }

    // ─── Catalog ──────────────────────────────────────────────────────────────

    @GetMapping("/games")
    public List<GameResponse> getGames() {
        return collectibleService.getGames();
    }

    @GetMapping("/games/{categoryId}/groups")
    public List<GroupResponse> getGroups(@PathVariable int categoryId) {
        return collectibleService.getGroups(categoryId);
    }

    @GetMapping("/games/{categoryId}/groups/{groupId}/products")
    public List<ProductResponse> searchProducts(@PathVariable int categoryId,
                                                @PathVariable long groupId,
                                                @RequestParam(required = false) String q) {
        return collectibleService.searchProducts(categoryId, groupId, q);
    }

    // ─── Collection ───────────────────────────────────────────────────────────

    @GetMapping("/cards")
    public List<CollectibleCardResponse> listCards() {
        return collectibleService.listCards(userContext.currentMemberId());
    }

    @PostMapping("/cards")
    @ResponseStatus(HttpStatus.CREATED)
    public CollectibleCardResponse addCard(@Valid @RequestBody CollectibleCardRequest req) {
        return collectibleService.addCard(userContext.currentMember(), req);
    }

    @PutMapping("/cards/{holdingId}")
    public CollectibleCardResponse updateCard(@PathVariable Long holdingId,
                                              @Valid @RequestBody CollectibleCardUpdateRequest req) {
        return collectibleService.updateCard(holdingId, userContext.currentMemberId(), req);
    }

    @DeleteMapping("/cards/{holdingId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCard(@PathVariable Long holdingId) {
        collectibleService.deleteCard(holdingId, userContext.currentMemberId());
    }
}
