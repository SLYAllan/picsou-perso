import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { budgetApi, type InstallmentPlanRequest, type BudgetCategory } from './api'
import type { AccountScope } from '@/types/api'

const SUMMARY_STALE_TIME = 60 * 1000

export function useBudgetSummary(month: string, scope: AccountScope | 'ALL') {
  return useQuery({
    queryKey: ['budget', 'summary', month, scope],
    queryFn: () => budgetApi.summary(month, scope),
    staleTime: SUMMARY_STALE_TIME,
  })
}

export function useBudgetTransactions(month: string, scope: AccountScope | 'ALL', uncategorized: boolean) {
  return useQuery({
    queryKey: ['budget', 'transactions', month, scope, uncategorized],
    queryFn: () => budgetApi.transactions(month, scope, uncategorized),
    staleTime: SUMMARY_STALE_TIME,
  })
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget', 'categories'],
    queryFn: budgetApi.categories,
    staleTime: 10 * 60 * 1000,
  })
}

function useInvalidateBudget() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['budget'] })
}

export function useCategorize() {
  const invalidate = useInvalidateBudget()
  return useMutation({
    mutationFn: ({ id, category, applyToSimilar, keyword }: {
      id: number; category: string | null; applyToSimilar: boolean; keyword?: string
    }) => budgetApi.categorize(id, category, applyToSimilar, keyword),
    onSuccess: invalidate,
  })
}

export function useCreateCategory() {
  const invalidate = useInvalidateBudget()
  return useMutation({
    mutationFn: (data: Omit<BudgetCategory, 'id'>) => budgetApi.createCategory(data),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateBudget()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Omit<BudgetCategory, 'id'> }) =>
      budgetApi.updateCategory(id, data),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateBudget()
  return useMutation({
    mutationFn: (id: number) => budgetApi.deleteCategory(id),
    onSuccess: invalidate,
  })
}

export function useInstallments() {
  return useQuery({
    queryKey: ['installments'],
    queryFn: budgetApi.installments,
    staleTime: SUMMARY_STALE_TIME,
  })
}

function useInvalidateInstallments() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['installments'] })
    // The auto "Paiements 4x" LOAN account feeds accounts + dashboard
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useCreateInstallment() {
  const invalidate = useInvalidateInstallments()
  return useMutation({
    mutationFn: (data: InstallmentPlanRequest) => budgetApi.createInstallment(data),
    onSuccess: invalidate,
  })
}

export function useDeleteInstallment() {
  const invalidate = useInvalidateInstallments()
  return useMutation({
    mutationFn: (id: number) => budgetApi.deleteInstallment(id),
    onSuccess: invalidate,
  })
}
