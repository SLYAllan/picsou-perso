package com.picsou.controller;

import com.picsou.dto.GoalMonthEntryResponse;
import com.picsou.dto.GoalMonthOverrideRequest;
import com.picsou.dto.GoalProgressResponse;
import com.picsou.dto.GoalRequest;
import com.picsou.service.GoalService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/goals")
public class GoalController {

    private final GoalService goalService;

    public GoalController(GoalService goalService) {
        this.goalService = goalService;
    }

    @GetMapping
    public List<GoalProgressResponse> findAll() {
        return goalService.findAll();
    }

    @GetMapping("/{id}")
    public GoalProgressResponse findById(@PathVariable Long id) {
        return goalService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GoalProgressResponse create(@Valid @RequestBody GoalRequest req) {
        return goalService.create(req);
    }

    @PutMapping("/{id}")
    public GoalProgressResponse update(@PathVariable Long id, @Valid @RequestBody GoalRequest req) {
        return goalService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        goalService.delete(id);
    }

    @GetMapping("/{id}/months")
    public List<GoalMonthEntryResponse> getMonthlyEntries(@PathVariable Long id) {
        return goalService.getMonthlyEntries(id);
    }

    @PutMapping("/{id}/months/{yearMonth}")
    public GoalMonthEntryResponse setMonthOverride(
        @PathVariable Long id,
        @PathVariable String yearMonth,
        @Valid @RequestBody GoalMonthOverrideRequest req
    ) {
        return goalService.setMonthOverride(id, yearMonth, req.amount());
    }

    @DeleteMapping("/{id}/months/{yearMonth}")
    public GoalMonthEntryResponse deleteMonthOverride(
        @PathVariable Long id,
        @PathVariable String yearMonth
    ) {
        return goalService.deleteMonthOverride(id, yearMonth);
    }
}
