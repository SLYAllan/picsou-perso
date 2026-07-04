import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useBudgetSummary, useBudgetTransactions, useBudgetCategories,
  useCategorize, useInstallments, useDeleteInstallment,
} from '@/features/budget/hooks'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { cn, getLocale } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Plus, Settings2, Trash2 } from 'lucide-react'
import type { AccountScope } from '@/types/api'
import { AddInstallmentModal } from './AddInstallmentModal'
import { CategoryManageModal } from './CategoryManageModal'

type ScopeFilter = 'ALL' | AccountScope
const SCOPE_KEYS: ScopeFilter[] = ['ALL', 'PERSONAL', 'BUSINESS']

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export function BudgetPage() {
  const { t } = useTranslation()
  const [month, setMonth] = useState(() => currentMonth())
  const [scope, setScope] = useState<ScopeFilter>('PERSONAL')
  const [showInstallmentModal, setShowInstallmentModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null)

  const { data: summary, isLoading } = useBudgetSummary(month, scope)
  const { data: uncategorized } = useBudgetTransactions(month, scope, true)
  const { data: categories } = useBudgetCategories()
  const { data: installments } = useInstallments()
  const categorize = useCategorize()
  const deleteInstallment = useDeleteInstallment()

  const net = (summary?.totalIncome ?? 0) + (summary?.totalExpenses ?? 0)
  const maxExpense = useMemo(
    () => Math.max(...(summary?.expensesByCategory ?? []).map(c => Math.abs(c.amount)), 1),
    [summary]
  )
  const scopedCategories = useMemo(
    () => (categories ?? []).filter(c => scope === 'ALL' || c.scope === scope),
    [categories, scope]
  )
  const activePlans = useMemo(
    () => (installments ?? []).filter(p =>
      (scope === 'ALL' || p.scope === scope)),
    [installments, scope]
  )

  async function handleAssign(txId: number, category: string, applyToSimilar: boolean) {
    if (!category) return
    await categorize.mutateAsync({ id: txId, category, applyToSimilar })
  }

  if (isLoading || !summary) return <LoadingSkeleton />

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('budget.title')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowCategoryModal(true)}>
            <Settings2 className="size-4" />
            {t('budget.manageCategories')}
          </Button>
        }
      />

      {/* Month + scope selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">
            {monthLabel(month, getLocale())}
          </span>
          <Button
            variant="ghost" size="icon" className="size-7"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <span className="h-4 w-px bg-border" />
        <div className="flex items-center gap-1">
          {SCOPE_KEYS.map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                scope === s
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {t(`accounts.scope.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent>
          <p className="text-xs text-muted-foreground">{t('budget.income')}</p>
          <CurrencyDisplay value={summary.totalIncome} className="text-2xl font-semibold text-emerald-500" />
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-muted-foreground">{t('budget.expenses')}</p>
          <CurrencyDisplay value={summary.totalExpenses} className="text-2xl font-semibold text-red-500" />
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-muted-foreground">{t('budget.net')}</p>
          <CurrencyDisplay value={net} showSign
            className={cn('text-2xl font-semibold', net >= 0 ? 'text-emerald-500' : 'text-red-500')} />
        </CardContent></Card>
      </div>

      {/* Expenses by category */}
      <Card>
        <CardHeader><CardTitle>{t('budget.byCategory')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {summary.expensesByCategory.length === 0 && summary.uncategorizedCount === 0 && (
            <p className="text-sm text-muted-foreground">{t('budget.noTransactions')}</p>
          )}
          {summary.expensesByCategory.map(cat => (
            <div key={cat.name} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {cat.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">×{cat.count}</span>
                </span>
                <CurrencyDisplay value={cat.amount} className="tabular-nums" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${(Math.abs(cat.amount) / maxExpense) * 100}%`, backgroundColor: cat.color }}
                />
              </div>
            </div>
          ))}
          {summary.uncategorizedCount > 0 && (
            <div className="flex items-baseline justify-between gap-2 border-t pt-3 text-sm text-muted-foreground">
              <span>{t('budget.uncategorized')} <span className="text-xs">×{summary.uncategorizedCount}</span></span>
              <CurrencyDisplay value={summary.uncategorizedExpenses} className="tabular-nums" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uncategorized transactions quick-assign */}
      {(uncategorized ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('budget.toCategorize')}</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {(uncategorized ?? []).slice(0, 30).map(tx => (
              <div key={tx.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">{tx.date}</p>
                </div>
                <CurrencyDisplay value={tx.amount} className="text-sm tabular-nums" />
                <select
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
                  defaultValue=""
                  onChange={e => handleAssign(tx.id, e.target.value, true)}
                  disabled={categorize.isPending}
                >
                  <option value="" disabled>{t('budget.assign')}</option>
                  {scopedCategories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">{t('budget.applySimilarHint')}</p>
          </CardContent>
        </Card>
      )}

      {/* Installment plans (PayPal 4x) */}
      <Card>
        <CardHeader>
          <CardTitle>{t('budget.installments')}</CardTitle>
          <CardAction>
            <Button size="sm" onClick={() => setShowInstallmentModal(true)}>
              <Plus className="size-4" />
              {t('budget.addInstallment')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="divide-y">
          {activePlans.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('budget.noInstallments')}</p>
          )}
          {activePlans.map(plan => {
            const settled = plan.remaining === 0
            return (
              <div key={plan.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{plan.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {plan.paidCount}/{plan.installments} {t('budget.paid')}
                    {plan.nextDueDate && <> · {t('budget.nextDue')} {plan.nextDueDate}</>}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold tabular-nums', settled ? 'text-emerald-500' : 'text-red-500')}>
                    {settled ? t('budget.settled') : <>-<CurrencyDisplay value={plan.remaining} /></>}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    / <CurrencyDisplay value={plan.totalAmount} />
                  </p>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => setDeletePlanId(plan.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <AddInstallmentModal open={showInstallmentModal} onOpenChange={setShowInstallmentModal} defaultScope={scope === 'ALL' ? 'PERSONAL' : scope} />
      <CategoryManageModal open={showCategoryModal} onOpenChange={setShowCategoryModal} />
      <ConfirmDialog
        open={deletePlanId !== null}
        onOpenChange={(open) => { if (!open) setDeletePlanId(null) }}
        title={t('budget.deleteInstallment')}
        description={t('budget.deleteInstallmentConfirm')}
        onConfirm={async () => {
          if (deletePlanId !== null) await deleteInstallment.mutateAsync(deletePlanId)
          setDeletePlanId(null)
        }}
        loading={deleteInstallment.isPending}
        variant="destructive"
      />
    </div>
  )
}
