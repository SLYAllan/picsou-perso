import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCards } from '@/features/collection/hooks'
import { summarizeCards, type CollectibleCard } from '@/features/collection/api'
import { AddCardModal } from '@/components/shared/AddCardModal'
import { CardDetailModal } from '@/components/shared/CardDetailModal'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ImageOff, Plus, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'

export function CollectionPage() {
  const { t } = useTranslation()
  const { data: cards, isLoading } = useCards()

  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedCard, setSelectedCard] = useState<CollectibleCard | null>(null)
  const [gameFilter, setGameFilter] = useState<number | 'ALL'>('ALL')
  const [query, setQuery] = useState('')

  // Game tabs come from the games actually present in the collection
  const gameTabs = useMemo(() => {
    const byId = new Map<number, string>()
    for (const c of cards ?? []) byId.set(c.categoryId, c.gameName)
    return [...byId.entries()].map(([categoryId, name]) => ({ categoryId, name }))
  }, [cards])

  const filteredCards = useMemo(() => {
    let list = cards ?? []
    if (gameFilter !== 'ALL') list = list.filter(c => c.categoryId === gameFilter)
    const needle = query.trim().toLowerCase()
    if (needle) list = list.filter(c => c.name.toLowerCase().includes(needle))
    return [...list].sort((a, b) => (b.currentValueEur ?? b.costBasisEur) - (a.currentValueEur ?? a.costBasisEur))
  }, [cards, gameFilter, query])

  const summary = useMemo(() => summarizeCards(filteredCards), [filteredCards])
  const pnlPositive = summary.pnl >= 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('collection.title')}
        actions={
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="size-4" />
            {t('collection.addCard')}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (cards ?? []).length === 0 ? (
        <EmptyState
          icon={<WalletCards className="size-12" />}
          title={t('collection.empty')}
          action={{ label: t('collection.addCard'), onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <>
          {/* Summary card */}
          <Card>
            <CardContent>
              <CardTitle>{t('collection.totalValue')}</CardTitle>
              <CurrencyDisplay value={summary.totalValue} className="text-4xl font-bold" />
              <div className="mt-3 flex items-center gap-2">
                {pnlPositive
                  ? <TrendingUp className="text-emerald-500" size={18} />
                  : <TrendingDown className="text-red-500" size={18} />}
                <span className={`text-sm font-medium ${pnlPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                  <CurrencyDisplay value={summary.pnl} showSign />
                  {summary.pnlPercent != null && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({pnlPositive ? '+' : ''}{summary.pnlPercent.toFixed(1)}%)
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('collection.invested')}: <CurrencyDisplay value={summary.totalCost} />
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {[{ categoryId: 'ALL' as const, name: t('collection.allGames') }, ...gameTabs].map(tab => (
                <button
                  key={tab.categoryId}
                  onClick={() => setGameFilter(tab.categoryId as number | 'ALL')}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    gameFilter === tab.categoryId
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {tab.name}
                </button>
              ))}
            </div>
            <Input
              placeholder={t('collection.searchCard')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="ml-auto h-8 w-56"
            />
          </div>

          {/* Card list */}
          <Card>
            <CardContent className="divide-y">
              {filteredCards.map(card => {
                const cardPnlPositive = (card.pnlEur ?? 0) >= 0
                return (
                  <button
                    key={card.holdingId}
                    onClick={() => setSelectedCard(card)}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt="" className="h-12 w-9 rounded-sm object-contain" loading="lazy" />
                    ) : (
                      <div className="flex h-12 w-9 items-center justify-center rounded-sm bg-muted">
                        <ImageOff className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {card.gameName} · ×{card.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      {card.currentValueEur != null ? (
                        <CurrencyDisplay value={card.currentValueEur} className="text-sm font-semibold tabular-nums" />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      {card.pnlEur != null && (
                        <p className={`text-xs tabular-nums ${cardPnlPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                          {cardPnlPositive ? '+' : ''}<CurrencyDisplay value={card.pnlEur} />
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
              {filteredCards.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">{t('collection.noResults')}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AddCardModal open={showAddModal} onOpenChange={setShowAddModal} />
      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </div>
  )
}
