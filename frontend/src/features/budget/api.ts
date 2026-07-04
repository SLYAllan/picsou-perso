import { api } from '@/lib/api-client'
import type { AccountScope, Transaction } from '@/types/api'

export interface BudgetCategory {
  id: number
  name: string
  scope: AccountScope
  color: string
}

export interface CategorySummary {
  name: string
  color: string
  amount: number // signed: expenses negative
  count: number
}

export interface BudgetSummary {
  month: string
  scope: AccountScope | null
  totalIncome: number
  totalExpenses: number // negative
  expensesByCategory: CategorySummary[]
  incomeByCategory: CategorySummary[]
  uncategorizedExpenses: number
  uncategorizedCount: number
}

export interface InstallmentItem {
  date: string
  amount: number
  paid: boolean
}

export interface InstallmentPlan {
  id: number
  label: string
  totalAmount: number
  startDate: string
  installments: number
  intervalDays: number
  scope: AccountScope
  schedule: InstallmentItem[]
  paidCount: number
  remaining: number
  nextDueDate: string | null
}

export interface InstallmentPlanRequest {
  label: string
  totalAmount: number
  startDate: string
  installments?: number
  intervalDays?: number
  scope?: AccountScope
}

const scopeParam = (scope: AccountScope | 'ALL') => (scope === 'ALL' ? {} : { scope })

export const budgetApi = {
  summary: (month: string, scope: AccountScope | 'ALL') =>
    api.get<BudgetSummary>('/budget/summary', { params: { month, ...scopeParam(scope) } }).then(r => r.data),

  transactions: (month: string, scope: AccountScope | 'ALL', uncategorized: boolean) =>
    api.get<Transaction[]>('/budget/transactions', {
      params: { month, uncategorized, ...scopeParam(scope) },
    }).then(r => r.data),

  categorize: (id: number, category: string | null, applyToSimilar: boolean, keyword?: string) =>
    api.put<Transaction>(`/budget/transactions/${id}/category`, { category, applyToSimilar, keyword }).then(r => r.data),

  categories: () => api.get<BudgetCategory[]>('/budget/categories').then(r => r.data),
  createCategory: (data: Omit<BudgetCategory, 'id'>) =>
    api.post<BudgetCategory>('/budget/categories', data).then(r => r.data),
  updateCategory: (id: number, data: Omit<BudgetCategory, 'id'>) =>
    api.put<BudgetCategory>(`/budget/categories/${id}`, data).then(r => r.data),
  deleteCategory: (id: number) => api.delete(`/budget/categories/${id}`).then(() => undefined),

  installments: () => api.get<InstallmentPlan[]>('/installments').then(r => r.data),
  createInstallment: (data: InstallmentPlanRequest) =>
    api.post<InstallmentPlan>('/installments', data).then(r => r.data),
  deleteInstallment: (id: number) => api.delete(`/installments/${id}`).then(() => undefined),
}
