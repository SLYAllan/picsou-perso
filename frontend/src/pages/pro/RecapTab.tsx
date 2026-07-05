import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProRecap, useProAnnual, useDeclare } from '@/features/pro/hooks'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn, getLocale } from '@/lib/utils'
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

function monthLabel(year: number, month: number, locale: string): string {
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export function RecapTab() {
  const { t } = useTranslation()
  const now = new Date()
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const { data: recap, isLoading } = useProRecap(period.year, period.month)
  const { data: annual } = useProAnnual(period.year)
  const declare = useDeclare()

  function shift(delta: number) {
    const d = new Date(period.year, period.month - 1 + delta, 1)
    setPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const isCurrentOrFuture = period.year > now.getFullYear()
    || (period.year === now.getFullYear() && period.month >= now.getMonth() + 1)

  if (isLoading || !recap) return <LoadingSkeleton />

  const monthMax = Math.max(...(annual?.monthly ?? []).map(m => m.ca), 1)

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium capitalize">
          {monthLabel(period.year, period.month, getLocale())}
        </span>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(1)} disabled={isCurrentOrFuture}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Month summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent>
          <p className="text-xs text-muted-foreground">{t('pro.recap.ca')}</p>
          <CurrencyDisplay value={recap.totals.ca} className="text-2xl font-semibold" />
          <p className="text-xs text-muted-foreground">{t('pro.sales.count', { count: recap.totals.count })}</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-muted-foreground">{t('pro.recap.benefice')}</p>
          <CurrencyDisplay value={recap.totals.benefice}
            className={cn('text-2xl font-semibold', recap.totals.benefice >= 0 ? 'text-emerald-500' : 'text-red-500')} />
          <p className="text-xs text-muted-foreground">{t('pro.recap.marge')} {recap.totals.marge.toFixed(1)} %</p>
        </CardContent></Card>
        <Card><CardContent>
          <p className="text-xs text-muted-foreground">{t('pro.recap.totalDue')}</p>
          <CurrencyDisplay value={recap.urssaf.totalDue} className="text-2xl font-semibold text-orange-500" />
          <p className="text-xs text-muted-foreground">
            URSSAF <CurrencyDisplay value={recap.urssaf.cotisationsSociales} /> · CFP <CurrencyDisplay value={recap.urssaf.cfp} /> · VFL <CurrencyDisplay value={recap.urssaf.versementLiberatoire} />
          </p>
        </CardContent></Card>
      </div>

      {/* Declaration */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          {recap.declaration.declared ? (
            <>
              <CheckCircle2 className="size-5 text-emerald-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">{t('pro.recap.declared')}</p>
                {recap.declaration.declaredAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(recap.declaration.declaredAt).toLocaleDateString(getLocale())}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex-1">
                <p className="text-sm font-medium">{t('pro.recap.notDeclared')}</p>
                <p className="text-xs text-muted-foreground">{t('pro.recap.declareHint')}</p>
              </div>
              <Button
                size="sm"
                onClick={() => declare.mutate({ year: period.year, month: period.month })}
                disabled={declare.isPending}
              >
                {declare.isPending ? t('common.loading') : t('pro.recap.markDeclared')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* By type */}
      {Object.keys(recap.byType).length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('pro.recap.byType')}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">{t('pro.sales.type')}</th>
                  <th className="px-3 py-2 text-right">{t('pro.recap.count')}</th>
                  <th className="px-3 py-2 text-right">{t('pro.recap.ca')}</th>
                  <th className="px-3 py-2 text-right">{t('pro.recap.costs')}</th>
                  <th className="px-3 py-2 text-right">{t('pro.recap.benefice')}</th>
                  <th className="px-3 py-2 text-right">{t('pro.recap.marge')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(recap.byType).map(([type, s]) => (
                  <tr key={type} className="border-b border-border/50">
                    <td className="px-3 py-2 capitalize">{t(`pro.types.${type}`, type)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><CurrencyDisplay value={s.ca} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground"><CurrencyDisplay value={s.totalCosts} /></td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', s.benefice >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                      <CurrencyDisplay value={s.benefice} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.marge.toFixed(1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Seuil */}
      <Card>
        <CardHeader><CardTitle>{t('pro.recap.seuil', { year: period.year })}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <CurrencyDisplay value={recap.seuil.caCumule} className="font-semibold" />
            <span className="text-muted-foreground">/ <CurrencyDisplay value={recap.seuil.annuel} /></span>
          </div>
          <Progress value={Math.min(100, recap.seuil.pourcentageUtilise)} />
          <p className="text-xs text-muted-foreground">
            {recap.seuil.pourcentageUtilise.toFixed(2)} % · {t('pro.recap.seuilRestant')} <CurrencyDisplay value={recap.seuil.restant} />
          </p>
        </CardContent>
      </Card>

      {/* Annual overview */}
      {annual && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>{t('pro.recap.annual', { year: period.year })}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {annual.monthly.map(m => (
                <div key={m.month} className="flex items-center gap-2 text-xs">
                  <span className="w-8 capitalize text-muted-foreground">
                    {new Date(period.year, m.month - 1, 1).toLocaleDateString(getLocale(), { month: 'short' })}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(m.ca / monthMax) * 100}%` }} />
                  </div>
                  <CurrencyDisplay value={m.ca} className="w-20 text-right tabular-nums" />
                  <CurrencyDisplay value={m.benefice}
                    className={cn('w-20 text-right tabular-nums', m.benefice >= 0 ? 'text-emerald-500' : 'text-red-500')} />
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="font-medium">{t('pro.recap.totalYear')}</span>
                <span className="tabular-nums">
                  <CurrencyDisplay value={annual.totalCa} />
                  {' · '}
                  <CurrencyDisplay value={annual.totalBenefice}
                    className={cn(annual.totalBenefice >= 0 ? 'text-emerald-500' : 'text-red-500')} />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('pro.recap.urssafPaid')} <CurrencyDisplay value={annual.urssafPaid} />
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('pro.recap.byPlatform')}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">{t('pro.sales.platform')}</th>
                    <th className="px-3 py-2 text-right">{t('pro.recap.count')}</th>
                    <th className="px-3 py-2 text-right">{t('pro.recap.ca')}</th>
                    <th className="px-3 py-2 text-right">{t('pro.recap.avgCommission')}</th>
                    <th className="px-3 py-2 text-right">{t('pro.recap.benefice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {annual.byPlatform.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">{t('pro.sales.empty')}</td></tr>
                  )}
                  {annual.byPlatform.map(p => (
                    <tr key={p.platform} className="border-b border-border/50">
                      <td className="px-3 py-2 capitalize">{p.platform}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums"><CurrencyDisplay value={p.ca} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.avgCommissionPct.toFixed(1)} %</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums font-medium', p.beneficeNet >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                        <CurrencyDisplay value={p.beneficeNet} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
