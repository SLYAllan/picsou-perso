import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePriceHistory } from '@/features/accounts/hooks'
import { useUpdateCard, useDeleteCard } from '@/features/collection/hooks'
import type { CollectibleCard } from '@/features/collection/api'
import { NetWorthChart } from '@/components/shared/NetWorthChart'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { NumericInput } from '@/components/shared/NumericInput'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { type TimeRange } from '@/components/shared/TimeRangeSelector'
import { parseAmount } from '@/lib/utils'
import { ImageOff, TrendingDown, TrendingUp, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CardDetailModalProps {
  card: CollectibleCard | null
  onClose: () => void
}

export function CardDetailModal({ card, onClose }: CardDetailModalProps) {
  return (
    <Dialog open={card != null} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      {card != null && <CardDetailContent key={card.holdingId} card={card} onClose={onClose} />}
    </Dialog>
  )
}

function CardDetailContent({ card, onClose }: { card: CollectibleCard; onClose: () => void }) {
  const { t } = useTranslation()
  const [range, setRange] = useState<TimeRange>('1Y')
  const [quantity, setQuantity] = useState(String(card.quantity))
  const [buyIn, setBuyIn] = useState(card.averageBuyIn != null ? String(card.averageBuyIn) : '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateCard = useUpdateCard()
  const deleteCard = useDeleteCard()

  const months = range === 'ALL' ? 1200 : range === '3M' ? 3 : range === '1M' || range === '7D' ? 1 : range === 'YTD' ? new Date().getMonth() + 1 : 12
  const { data: rawHistory } = usePriceHistory(card.ticker, months, range)

  const history = useMemo(
    () => (rawHistory ?? []).map(p => ({ date: p.date, total: p.priceEur })),
    [rawHistory]
  )

  const pnlPositive = (card.pnlEur ?? 0) >= 0
  const dirty =
    parseAmount(quantity) !== card.quantity ||
    (buyIn !== '' ? parseAmount(buyIn) : null) !== card.averageBuyIn

  async function handleSave() {
    const qty = parseAmount(quantity)
    if (!qty || qty <= 0) return
    await updateCard.mutateAsync({
      holdingId: card.holdingId,
      data: {
        quantity: qty,
        averageBuyIn: buyIn !== '' ? parseAmount(buyIn) : undefined,
      },
    })
    onClose()
  }

  async function handleDelete() {
    await deleteCard.mutateAsync(card.holdingId)
    setConfirmDelete(false)
    onClose()
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <DialogTitle className="text-lg">{card.name}</DialogTitle>
          {card.pnlPercent != null && (
            <Badge
              className={pnlPositive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1' : 'bg-red-500/10 text-red-600 dark:text-red-400 gap-1'}
            >
              {pnlPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {pnlPositive ? '+' : ''}{card.pnlPercent.toFixed(1)}%
            </Badge>
          )}
        </div>
        <DialogDescription>{card.gameName}</DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="flex gap-4">
          {card.imageUrl ? (
            <img src={card.imageUrl} alt="" className="h-36 rounded-md object-contain" />
          ) : (
            <div className="flex h-36 w-24 items-center justify-center rounded-md bg-muted">
              <ImageOff className="size-8 text-muted-foreground" />
            </div>
          )}
          <div className="grid flex-1 grid-cols-2 content-start gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.marketPrice')}</p>
              {card.currentPriceEur != null
                ? <CurrencyDisplay value={card.currentPriceEur} className="text-sm font-semibold tabular-nums" />
                : <span className="text-sm text-muted-foreground">—</span>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.totalValue')}</p>
              {card.currentValueEur != null
                ? <CurrencyDisplay value={card.currentValueEur} className="text-sm font-semibold tabular-nums" />
                : <span className="text-sm text-muted-foreground">—</span>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t('collection.costBasis')}</p>
              <CurrencyDisplay value={card.costBasisEur} className="text-sm font-semibold tabular-nums" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{t('holdings.pnl')}</p>
              {card.pnlEur != null ? (
                <span className={`text-sm font-semibold tabular-nums ${pnlPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                  {pnlPositive ? '+' : ''}<CurrencyDisplay value={card.pnlEur} />
                </span>
              ) : <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <NetWorthChart data={history} intraday={[]} range={range} onRangeChange={setRange} />
        )}

        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-qty">{t('collection.quantity')}</Label>
            <NumericInput id="edit-qty" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-buyin">{t('collection.avgBuyIn')}</Label>
            <NumericInput id="edit-buyin" value={buyIn} onChange={e => setBuyIn(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            {t('collection.removeCard')}
          </Button>
          <Button onClick={handleSave} disabled={!dirty || updateCard.isPending}>
            {updateCard.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('collection.removeCard')}
        description={t('collection.removeConfirm')}
        onConfirm={handleDelete}
        loading={deleteCard.isPending}
        variant="destructive"
      />
    </DialogContent>
  )
}
