package com.picsou.controller;

import com.picsou.dto.InstallmentDtos.*;
import com.picsou.service.InstallmentService;
import com.picsou.service.UserContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/installments")
public class InstallmentController {

    private final InstallmentService installmentService;
    private final UserContext userContext;

    public InstallmentController(InstallmentService installmentService, UserContext userContext) {
        this.installmentService = installmentService;
        this.userContext = userContext;
    }

    @GetMapping
    public List<InstallmentPlanResponse> list() {
        return installmentService.list(userContext.currentMemberId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InstallmentPlanResponse create(@Valid @RequestBody InstallmentPlanRequest req) {
        return installmentService.create(userContext.currentMember(), req);
    }

    @PutMapping("/{id}")
    public InstallmentPlanResponse update(@PathVariable Long id, @Valid @RequestBody InstallmentPlanRequest req) {
        return installmentService.update(id, userContext.currentMemberId(), req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        installmentService.delete(id, userContext.currentMemberId());
    }
}
