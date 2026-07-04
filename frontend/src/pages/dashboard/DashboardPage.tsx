import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useDashboard, useNetWorthIntraday, usePnl } from '@/features/dashboard/hooks'
import { useHistory } from '@/features/history/hooks'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { PageHeader } from '@/components/shared/PageHeader'
import { NetWorthChart } from '@/components/shared/NetWorthChart'
import { DistributionPie } from '@/components/shared/DistributionPie'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { HoldingsCard } from '@/components/shared/HoldingsCard'
import { SyncAllModal } from '@/components/sync/SyncAllModal'
import { type TimeRange } from '@/components/shared/TimeRangeSelector'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
} from '@/components/ui/item'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, TrendingDown, Plus, RefreshCw, ChevronDown } from 'lucide-react'
import { todayLabel } from '@/lib/utils'
import { GoalDetailModal } from '@/pages/goals/GoalDetailModal'

type WealthMode = 'net' | 'gross' | 'financial'
type ScopeFilter = 'ALL' | 'PERSONAL' | 'BUSINESS'

const EXCLUDED_FINANCIAL = new Set(['CHECKING', 'LOAN'])
const SCOPE_KEYS: ScopeFilter[] = ['ALL', 'PERSONAL', 'BUSINESS']

export function DashboardPage() {
  const { t } = useTranslation()
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [range, setRange] = useState<TimeRange>('1Y')
  const [wealthMode, setWealthMode] = useState<WealthMode>('net')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL')
  const [detailGoalId, setDetailGoalId] = useState<number | null>(null)

  const { data, isLoading } = useDashboard(range)

  // Perso/pro scoping applies before the wealth mode: headline, chart and pie all
  // read from these filtered lists so a scope only ever sees its own accounts.
  const distribution = useMemo(() => {
    if (!data) return []
    if (scopeFilter === 'ALL') return data.distribution
    return data.distribution.filter(d => d.scope === scopeFilter)
  }, [data, scopeFilter])
  const liabilities = useMemo(() => {
    if (!data) return []
    if (scopeFilter === 'ALL') return data.liabilities
    return data.liabilities.filter(l => l.scope === scopeFilter)
  }, [data, scopeFilter])

  // Account IDs filtered by the selected wealth mode — drives both the headline value
  // and the history chart so the curve never includes categories the mode excludes.
  const chartAccountIds = useMemo(() => {
    switch (wealthMode) {
      case 'gross':
        // Assets only (no liabilities)
        return distribution.map(d => d.accountId)
      case 'financial':
        // Financial assets: drop checking and any loan that slipped into distribution
        return distribution
          .filter(d => !EXCLUDED_FINANCIAL.has(d.accountType))
          .map(d => d.accountId)
      default:
        // Net worth: all accounts including liabilities
        return [...distribution.map(d => d.accountId), ...liabilities.map(l => l.accountId)]
    }
  }, [distribution, liabilities, wealthMode])
  // Accounts that actually have holdings/tickers — used for PnL only.
  // Mirrors the chart filter: in "financial" mode we still drop excluded categories
  // (in practice CHECKING/LOAN don't carry holdings, so this is a no-op safety net).
  const investmentAccountIds = useMemo(() => {
    return distribution
      .filter(d => d.hasHoldings)
      .filter(d => wealthMode !== 'financial' || !EXCLUDED_FINANCIAL.has(d.accountType))
      .map(d => d.accountId)
  }, [distribution, wealthMode])
  const historyMonths = useMemo(() => {
    if (range === 'ALL') return 1200
    if (range === '3M') return 3
    if (range === '1M' || range === '7D') return 1
    if (range === 'YTD') return new Date().getMonth() + 1
    return 12
  }, [range])
  const { data: history } = useHistory(chartAccountIds, historyMonths)
  const { data: intraday } = useNetWorthIntraday(chartAccountIds, range === '24H')

  // Compute fromDate for PnL range
  const pnlFromDate = useMemo(() => {
    const now = new Date()
    let from: Date
    switch (range) {
      case '24H': from = new Date(now.getTime() - 24 * 60 * 60 * 1000); break
      case '7D': from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7); break
      case '1M': from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break
      case '3M': from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break
      case 'YTD': from = new Date(now.getFullYear(), 0, 1); break
      case '1Y': from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break
      default: return undefined // ALL → live PnL only
    }
    return from.toISOString().slice(0, 10)
  }, [range])

  const { data: pnlData } = usePnl(investmentAccountIds, pnlFromDate)

  // Compute wealth value based on selected mode (over the scoped lists — the
  // backend's totalNetWorth ignores the perso/pro filter, so recompute here)
  const wealthValue = useMemo(() => {
    const sumAccounts = (items: typeof distribution, exclude?: Set<string>) =>
      items
        .filter(d => !exclude || !exclude.has(d.accountType))
        .reduce((s, d) => s + d.balanceEur, 0)

    switch (wealthMode) {
      case 'gross':
        return sumAccounts(distribution)
      case 'financial':
        return sumAccounts(distribution, EXCLUDED_FINANCIAL)
      default:
        return sumAccounts(distribution) - liabilities.reduce((s, l) => s + l.balanceEur, 0)
    }
  }, [distribution, liabilities, wealthMode])

  const scopedLiabilitiesTotal = useMemo(
    () => liabilities.reduce((s, l) => s + l.balanceEur, 0),
    [liabilities]
  )

  // PnL: use range fields when available, fall back to live PnL (ALL range)
  const pnl = pnlData?.rangePnl != null ? pnlData.rangePnl : (pnlData?.pnl ?? 0)
  const pnlPct = pnlData?.rangePnlPercent != null
    ? pnlData.rangePnlPercent.toFixed(1)
    : (pnlData?.pnlPercent != null ? pnlData.pnlPercent.toFixed(1) : null)
  const pnlPositive = pnl >= 0

  if (isLoading || !data) {
    return <LoadingSkeleton />
  }

  const wealthModeOptions: { value: WealthMode; key: string }[] = [
    { value: 'net', key: 'netWorth' },
    { value: 'gross', key: 'grossWorth' },
    { value: 'financial', key: 'financialWorth' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        surtitle={todayLabel()}
        title={t('dashboard.title')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSyncModal(true)}
          >
            <RefreshCw className="mr-2 size-4" />
            {t('dashboard.syncAccounts')}
          </Button>
        }
      />

      {/* Wealth hero */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  {t(`dashboard.${wealthModeOptions.find(m => m.value === wealthMode)!.key}`)}
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {wealthModeOptions.map(m => (
                  <DropdownMenuItem
                    key={m.value}
                    onClick={() => setWealthMode(m.value)}
                    className={wealthMode === m.value ? 'font-semibold' : ''}
                  >
                    {t(`dashboard.${m.key}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center gap-1">
              {SCOPE_KEYS.map(s => (
                <button
                  key={s}
                  onClick={() => setScopeFilter(s)}
                  className={`inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    scopeFilter === s
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {t(`accounts.scope.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <CurrencyDisplay value={wealthValue} className="text-4xl font-bold" />

          {scopedLiabilitiesTotal > 0 && wealthMode === 'net' && (
            <div className="mt-2 flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {t('dashboard.totalAssets')}:
              </span>
              <CurrencyDisplay value={wealthValue + scopedLiabilitiesTotal} />
              <span className="text-red-500">-</span>
              <span className="text-muted-foreground">
                {t('dashboard.totalLiabilities')}:
              </span>
              <CurrencyDisplay value={scopedLiabilitiesTotal} className="text-red-500" />
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            {pnlPositive
              ? <TrendingUp className="text-emerald-500" size={18} />
              : <TrendingDown className="text-red-500" size={18} />}
            <span
              className={`text-sm font-medium ${pnlPositive ? 'text-emerald-500' : 'text-red-500'}`}
            >
              <CurrencyDisplay value={pnl} />
              {pnlPct !== null && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({pnlPositive ? '+' : ''}{pnlPct}%)
                </span>
              )}
            </span>
            <span className="text-sm text-muted-foreground">{t('dashboard.netWorthChange')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Charts row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.gainLoss')}</CardTitle>
          </CardHeader>
          <CardContent>
            <NetWorthChart data={history ?? []} intraday={intraday ?? []} range={range} onRangeChange={setRange} />
          </CardContent>
        </Card>

        <DistributionPie data={distribution} />
      </div>

      {/* Goals section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.goals')}</CardTitle>
          <CardDescription>{t('dashboard.goalsDescription')}</CardDescription>
          {data.goalSummaries.length > 0 && (
            <CardAction>
              <Button variant="outline" size="sm" asChild>
                <Link to="/goals">
                  <Plus />
                  {t('dashboard.newGoal')}
                </Link>
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {data.goalSummaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.noGoals')}</p>
          ) : (
            <ItemGroup className="gap-3">
              {[...data.goalSummaries]
                .sort((a, b) => b.percentComplete - a.percentComplete)
                .slice(0, 3)
                .map((goal) => (
                <Item
                  key={goal.id}
                  variant="muted"
                  className="flex-col items-stretch rounded-4xl px-4 py-3 gap-4 cursor-pointer"
                  onClick={() => setDetailGoalId(goal.id)}
                >
                  <ItemContent className="gap-3">
                    <ItemDescription className="cn-font-heading text-xs font-medium tracking-wider text-muted-foreground uppercase">
                      {goal.name}
                    </ItemDescription>
                    <CurrencyDisplay
                      value={goal.currentTotal}
                      className="text-3xl font-semibold tabular-nums"
                    />
                    <Progress value={goal.percentComplete} className="h-2.5 [&_[data-slot=progress-indicator]]:bg-emerald-500" />
                  </ItemContent>
                  <ItemFooter>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(goal.percentComplete)}% {t('dashboard.achieved')}
                    </span>
                    <CurrencyDisplay
                      value={goal.targetAmount}
                      className="text-sm font-medium tabular-nums"
                    />
                  </ItemFooter>
                </Item>
              ))}
              {data.goalSummaries.length > 3 && (
                <Button variant="ghost" size="sm" className="w-full" asChild>
                  <Link to="/goals">
                    {t('dashboard.otherGoals', { count: data.goalSummaries.length - 3 })}
                  </Link>
                </Button>
              )}
            </ItemGroup>
          )}
        </CardContent>
        {data.goalSummaries.length > 0 && (
          <CardFooter>
            <CardDescription className="text-center">
              {t('dashboard.goalsSummary')}
            </CardDescription>
          </CardFooter>
        )}
      </Card>

      {/* Holdings overview */}
      <HoldingsCard />

      {/* Sync all modal */}
      <SyncAllModal open={showSyncModal} onOpenChange={setShowSyncModal} />

      {/* Goal detail modal */}
      <GoalDetailModal goalId={detailGoalId} onClose={() => setDetailGoalId(null)} />
    </div>
  )
}
