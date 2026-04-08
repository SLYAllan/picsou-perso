import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useDashboard } from '@/features/dashboard/hooks'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { PageHeader } from '@/components/shared/PageHeader'
import { NetWorthChart } from '@/components/shared/NetWorthChart'
import { DistributionPie } from '@/components/shared/DistributionPie'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { HoldingsCard } from '@/components/shared/HoldingsCard'
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
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
} from '@/components/ui/item'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, TrendingDown, Plus } from 'lucide-react'
import { todayLabel } from '@/lib/utils'

export function DashboardPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useDashboard()

  if (isLoading || !data) {
    return <LoadingSkeleton />
  }

  const trend = data.totalNetWorth - data.previousTotal
  const trendPct =
    data.previousTotal > 0 ? ((trend / data.previousTotal) * 100).toFixed(1) : null
  const trendPositive = trend >= 0

  return (
    <div className="space-y-6">
      <PageHeader
        surtitle={todayLabel()}
        title={t('dashboard.title')}
      />

      {/* Net worth hero */}
      <Card>
        <CardContent>
          <CardTitle>{t('dashboard.netWorth')}</CardTitle>
          <CurrencyDisplay value={data.totalNetWorth} className="text-4xl font-bold" />

          <div className="mt-3 flex items-center gap-2">
            {trendPositive
              ? <TrendingUp className="text-emerald-500" size={18} />
              : <TrendingDown className="text-red-500" size={18} />}
            <span
              className={`text-sm font-medium ${trendPositive ? 'text-emerald-500' : 'text-red-500'}`}
            >
              <CurrencyDisplay value={trend} />
              {trendPct !== null && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({trendPositive ? '+' : ''}{trendPct}%)
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
            <NetWorthChart data={data.netWorthHistory} />
          </CardContent>
        </Card>

        <DistributionPie data={data.distribution} />
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
              {data.goalSummaries.slice(0, 3).map((goal) => (
                <Item
                  key={goal.id}
                  variant="muted"
                  className="flex-col items-stretch rounded-4xl px-4 py-3 gap-4"
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
    </div>
  )
}
