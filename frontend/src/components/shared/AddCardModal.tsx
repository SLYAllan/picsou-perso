import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGames, useGroups, useProducts, useAddCard } from '@/features/collection/hooks'
import type { CollectibleProduct } from '@/features/collection/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumericInput } from '@/components/shared/NumericInput'
import { parseAmount } from '@/lib/utils'
import { ArrowLeft, ImageOff, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const SUBTYPE_LABEL_KEYS: Record<string, string> = {
  N: 'collection.subtypes.N',
  F: 'collection.subtypes.F',
  H: 'collection.subtypes.H',
  RH: 'collection.subtypes.RH',
}

interface AddCardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddCardModal({ open, onOpenChange }: AddCardModalProps) {
  // Key-remount resets all wizard state each time the modal opens
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <AddCardModalContent key="content" onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function AddCardModalContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CollectibleProduct | null>(null)
  const [subTypeCode, setSubTypeCode] = useState<string>('N')
  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')

  const { data: games } = useGames()
  const { data: groups, isLoading: groupsLoading } = useGroups(categoryId)
  const { data: products, isLoading: productsLoading } = useProducts(categoryId, groupId)
  const addCard = useAddCard()

  const results = useMemo(() => {
    if (!products) return []
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? products.filter(p => p.name.toLowerCase().includes(needle))
      : products
    return matches.slice(0, 50)
  }, [products, query])

  const groupName = useMemo(
    () => groups?.find(g => g.groupId === groupId)?.name ?? '',
    [groups, groupId]
  )

  const availableSubtypes = selected ? Object.keys(selected.pricesUsd) : []

  function handleSelectProduct(p: CollectibleProduct) {
    setSelected(p)
    const codes = Object.keys(p.pricesUsd)
    setSubTypeCode(codes.includes('N') ? 'N' : codes[0] ?? 'N')
  }

  async function handleSubmit() {
    if (!selected || categoryId == null || groupId == null) return
    const qty = Math.max(1, Math.round(parseAmount(quantity) || 1))
    await addCard.mutateAsync({
      categoryId,
      groupId,
      productId: selected.productId,
      subTypeCode,
      quantity: qty,
      purchasePriceEur: parseAmount(price) || 0,
      name: `${selected.name} · ${groupName}`.slice(0, 100),
      imageUrl: selected.imageUrl ?? undefined,
    })
    onClose()
  }

  const selectClass =
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus:border-ring'

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('collection.addCard')}</DialogTitle>
        <DialogDescription>{t('collection.addCardDesc')}</DialogDescription>
      </DialogHeader>

      {selected ? (
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {t('common.back', 'Retour')}
          </button>

          <div className="flex gap-4">
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" className="h-28 rounded-md object-contain" />
            ) : (
              <div className="flex h-28 w-20 items-center justify-center rounded-md bg-muted">
                <ImageOff className="size-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium">{selected.name}</p>
              <p className="text-sm text-muted-foreground">{groupName}</p>
              {selected.pricesUsd[subTypeCode] != null && (
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {t('collection.marketPrice')}: ${selected.pricesUsd[subTypeCode].toFixed(2)}
                </p>
              )}
            </div>
          </div>

          {availableSubtypes.length > 1 && (
            <div className="space-y-2">
              <Label>{t('collection.subtype')}</Label>
              <div className="flex flex-wrap gap-1">
                {availableSubtypes.map(code => (
                  <button
                    key={code}
                    onClick={() => setSubTypeCode(code)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      subTypeCode === code
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {SUBTYPE_LABEL_KEYS[code] ? t(SUBTYPE_LABEL_KEYS[code]) : code}
                    {selected.pricesUsd[code] != null && ` · $${selected.pricesUsd[code].toFixed(2)}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="card-qty">{t('collection.quantity')}</Label>
              <NumericInput id="card-qty" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-price">{t('collection.purchasePrice')}</Label>
              <NumericInput id="card-price" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={addCard.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={addCard.isPending || !price}>
              {addCard.isPending ? t('common.loading') : t('collection.addToCollection')}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="card-game">{t('collection.game')}</Label>
              <select
                id="card-game"
                className={selectClass}
                value={categoryId ?? ''}
                onChange={e => {
                  setCategoryId(e.target.value ? Number(e.target.value) : null)
                  setGroupId(null)
                  setQuery('')
                }}
              >
                <option value="">—</option>
                {(games ?? []).map(g => (
                  <option key={g.categoryId} value={g.categoryId}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-set">{t('collection.set')}</Label>
              <select
                id="card-set"
                className={selectClass}
                value={groupId ?? ''}
                disabled={categoryId == null || groupsLoading}
                onChange={e => {
                  setGroupId(e.target.value ? Number(e.target.value) : null)
                  setQuery('')
                }}
              >
                <option value="">{groupsLoading ? t('common.loading') : '—'}</option>
                {(groups ?? []).map(g => (
                  <option key={g.groupId} value={g.groupId}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {groupId != null && (
            <>
              <Input
                placeholder={t('collection.searchCard')}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {productsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {results.map(p => (
                    <button
                      key={p.productId}
                      onClick={() => handleSelectProduct(p)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted transition-colors"
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-10 w-8 rounded-sm object-contain" loading="lazy" />
                      ) : (
                        <div className="flex h-10 w-8 items-center justify-center rounded-sm bg-muted">
                          <ImageOff className="size-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                      {p.pricesUsd.N != null && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          ${p.pricesUsd.N.toFixed(2)}
                        </span>
                      )}
                    </button>
                  ))}
                  {results.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t('collection.noResults')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </DialogContent>
  )
}
