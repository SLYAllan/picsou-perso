import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useJpyRate, useProSettings, usePutProSettings,
  useProSimulations, useSaveSimulation, useDeleteSimulation,
} from '@/features/pro/hooks'
import {
  acquisitionCosts, itemResult, simulationSummary, marginLevel, totalLotEur,
  CARD_GRADES, DEFAULT_EXCHANGE_RATE, DEFAULT_SIM_PLATFORMS, DEFAULT_SIM_TAX,
  type SimItem, type SimPlatform, type Simulation,
} from '@/features/pro/calculations'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { NumericInput } from '@/components/shared/NumericInput'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn, parseAmount } from '@/lib/utils'
import { FolderOpen, Plus, RefreshCw, Save, Settings2, Trash2, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

type SimType = 'cards' | 'accessories'

interface SimSettings {
  platforms: SimPlatform[]
  urssafRate: number
  incomeTaxRate: number
}

const EMPTY_SIM: Simulation = {
  lotPriceJpy: 0, proxyFeeJpy: 0, shippingFeeJpy: 0,
  exchangeRate: DEFAULT_EXCHANGE_RATE, distributionMode: 'proportional', items: [],
}

function parseSimSettings(raw: string | undefined): SimSettings {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<SimSettings>
      if (Array.isArray(parsed.platforms)) {
        return {
          platforms: parsed.platforms,
          urssafRate: parsed.urssafRate ?? DEFAULT_SIM_TAX.urssafRate,
          incomeTaxRate: parsed.incomeTaxRate ?? DEFAULT_SIM_TAX.incomeTaxRate,
        }
      }
    } catch { /* fall through to defaults */ }
  }
  return { platforms: DEFAULT_SIM_PLATFORMS, ...DEFAULT_SIM_TAX }
}

let itemSeq = 0
const newItemId = () => `item-${Date.now()}-${itemSeq++}`

export function SimulatorTab() {
  const { t } = useTranslation()
  const [simType, setSimType] = useState<SimType>('cards')
  const [rawSim, setSim] = useState<Simulation>(EMPTY_SIM)
  // '' = auto (live FX rate); any typed value overrides it
  const [rateInput, setRateInput] = useState('')
  const [loadedId, setLoadedId] = useState<number | null>(null)
  const [simName, setSimName] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showLoad, setShowLoad] = useState(false)
  const [deleteSimId, setDeleteSimId] = useState<number | null>(null)

  const { data: jpyRate, refetch: refetchRate, isFetching: rateFetching } = useJpyRate()
  const { data: settingsMap } = useProSettings()
  const { data: simulations } = useProSimulations()
  const saveSimulation = useSaveSimulation()
  const deleteSimulation = useDeleteSimulation()

  const settings = useMemo(() => parseSimSettings(settingsMap?.simulator), [settingsMap])
  const tax = { urssafRate: settings.urssafRate, incomeTaxRate: settings.incomeTaxRate }
  const activePlatforms = settings.platforms.filter(p => p.active)

  // Live FX rate by default; typing in the field overrides it
  const effectiveRate = rateInput !== ''
    ? (parseAmount(rateInput) || DEFAULT_EXCHANGE_RATE)
    : (jpyRate && jpyRate > 0 ? jpyRate : DEFAULT_EXCHANGE_RATE)
  const sim = useMemo<Simulation>(() => ({ ...rawSim, exchangeRate: effectiveRate }), [rawSim, effectiveRate])

  const costs = useMemo(() => acquisitionCosts(sim), [sim])
  const summary = useMemo(
    () => simulationSummary(sim, settings.platforms, tax),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, settings]
  )

  function setField(field: keyof Simulation, raw: string) {
    setSim(prev => ({ ...prev, [field]: parseAmount(raw) || 0 }))
  }

  function addItem() {
    const item: SimItem = {
      id: newItemId(), name: '', grade: simType === 'cards' ? 'Raw' : '',
      quantity: 1, purchasePriceJpy: 0, resalePriceEur: 0,
    }
    setSim(prev => ({ ...prev, items: [...prev.items, item] }))
  }

  function updateItem(id: string, patch: Partial<SimItem>) {
    setSim(prev => ({ ...prev, items: prev.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }))
  }

  function removeItem(id: string) {
    setSim(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }))
  }

  async function handleSave() {
    if (!simName.trim()) return
    const saved = await saveSimulation.mutateAsync({
      id: loadedId ?? undefined, simType, name: simName.trim(), data: JSON.stringify(sim),
    })
    setLoadedId(saved.id)
  }

  function loadSimulation(id: number) {
    const found = (simulations ?? []).find(s => s.id === id)
    if (!found) return
    try {
      const parsed = JSON.parse(found.data) as Simulation
      setSim(parsed)
      setRateInput(parsed.exchangeRate ? String(parsed.exchangeRate) : '')
      setSimType(found.simType)
      setSimName(found.name)
      setLoadedId(found.id)
      setShowLoad(false)
    } catch { /* corrupt data — ignore */ }
  }

  function resetSim() {
    setSim(EMPTY_SIM)
    setRateInput('')
    setSimName('')
    setLoadedId(null)
  }

  const scoped = sim.items
  const isCards = simType === 'cards'

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(['cards', 'accessories'] as const).map(k => (
            <button
              key={k}
              onClick={() => { setSimType(k); resetSim() }}
              className={cn(
                'inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                simType === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {t(`pro.sim.${k}`)}
            </button>
          ))}
        </div>
        <span className="h-4 w-px bg-border" />
        <Input
          value={simName} onChange={e => setSimName(e.target.value)}
          placeholder={t('pro.sim.namePlaceholder')} className="h-8 w-48"
        />
        <Button variant="outline" size="sm" onClick={handleSave} disabled={!simName.trim() || saveSimulation.isPending}>
          <Save className="size-4" />{t('common.save')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowLoad(true)} disabled={(simulations ?? []).length === 0}>
          <FolderOpen className="size-4" />{t('pro.sim.load')}
        </Button>
        <Button variant="ghost" size="sm" onClick={resetSim}>{t('pro.sim.reset')}</Button>
        <Button variant="ghost" size="icon" className="ml-auto size-8" onClick={() => setShowSettings(true)}>
          <Settings2 className="size-4" />
        </Button>
      </div>

      {/* Lot inputs */}
      <Card>
        <CardHeader><CardTitle>{t('pro.sim.lot')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="space-y-2">
            <Label>{t('pro.sim.lotPrice')} (¥)</Label>
            <NumericInput value={sim.lotPriceJpy ? String(sim.lotPriceJpy) : ''} onChange={e => setField('lotPriceJpy', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('pro.sim.proxyFee')} (¥)</Label>
            <NumericInput value={sim.proxyFeeJpy ? String(sim.proxyFeeJpy) : ''} onChange={e => setField('proxyFeeJpy', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('pro.sim.shippingFee')} (¥)</Label>
            <NumericInput value={sim.shippingFeeJpy ? String(sim.shippingFeeJpy) : ''} onChange={e => setField('shippingFeeJpy', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              {t('pro.sim.exchangeRate')}
              <button
                onClick={() => refetchRate()}
                className="text-muted-foreground transition-colors hover:text-foreground"
                title={t('pro.sim.refreshRate')}
              >
                <RefreshCw className={cn('size-3', rateFetching && 'animate-spin')} />
              </button>
            </Label>
            <NumericInput
              value={rateInput !== '' ? rateInput : String(effectiveRate)}
              onChange={e => setRateInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('pro.sim.totalCost')}</Label>
            <div className="flex h-9 items-center text-sm font-semibold tabular-nums">
              <CurrencyDisplay value={totalLotEur(sim)} />
            </div>
          </div>
          {isCards && (
            <div className="col-span-2 flex items-center gap-2 lg:col-span-5">
              <Switch
                checked={sim.distributionMode === 'manual'}
                onCheckedChange={c => setSim(prev => ({ ...prev, distributionMode: c ? 'manual' : 'proportional' }))}
              />
              <span className="text-sm text-muted-foreground">
                {sim.distributionMode === 'manual' ? t('pro.sim.distManual') : t('pro.sim.distProportional')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle>{isCards ? t('pro.sim.cardsList') : t('pro.sim.accessoriesList')}</CardTitle>
          <CardAction>
            <Button size="sm" onClick={addItem}><Plus className="size-4" />{t('pro.sim.addItem')}</Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          {scoped.length === 0 && <p className="text-sm text-muted-foreground">{t('pro.sim.noItems')}</p>}
          {scoped.map((item, idx) => {
            const qty = Math.max(1, item.quantity)
            const unitCost = (costs[idx] ?? 0) / qty
            return (
              <div key={item.id} className="flex min-w-fit flex-wrap items-end gap-2 border-b border-border/50 pb-2">
                <div className="w-48 space-y-1">
                  {idx === 0 && <Label className="text-xs">{t('pro.sim.itemName')}</Label>}
                  <Input className="h-8" value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })} />
                </div>
                {isCards ? (
                  <div className="w-24 space-y-1">
                    {idx === 0 && <Label className="text-xs">{t('pro.sim.grade')}</Label>}
                    <select
                      className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
                      value={item.grade}
                      onChange={e => updateItem(item.id, { grade: e.target.value })}
                    >
                      {CARD_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="w-16 space-y-1">
                    {idx === 0 && <Label className="text-xs">{t('pro.invoices.qty')}</Label>}
                    <NumericInput className="h-8" value={String(item.quantity)}
                      onChange={e => updateItem(item.id, { quantity: Math.max(1, Math.round(parseAmount(e.target.value) || 1)) })} />
                  </div>
                )}
                {sim.distributionMode === 'manual' && isCards && (
                  <div className="w-24 space-y-1">
                    {idx === 0 && <Label className="text-xs">{t('pro.sim.purchaseJpy')}</Label>}
                    <NumericInput className="h-8" value={item.purchasePriceJpy ? String(item.purchasePriceJpy) : ''}
                      onChange={e => updateItem(item.id, { purchasePriceJpy: parseAmount(e.target.value) || 0 })} />
                  </div>
                )}
                <div className="w-24 space-y-1">
                  {idx === 0 && <Label className="text-xs">{t('pro.sim.resaleEur')}</Label>}
                  <NumericInput className="h-8" value={item.resalePriceEur ? String(item.resalePriceEur) : ''}
                    onChange={e => updateItem(item.id, { resalePriceEur: parseAmount(e.target.value) || 0 })} />
                </div>
                <div className="w-20 space-y-1 text-right">
                  {idx === 0 && <Label className="block text-xs">{t('pro.sim.cost')}</Label>}
                  <div className="flex h-8 items-center justify-end text-xs tabular-nums text-muted-foreground">
                    <CurrencyDisplay value={unitCost} />
                  </div>
                </div>
                {activePlatforms.map(p => {
                  const r = itemResult(unitCost, item.resalePriceEur, p, tax)
                  const level = marginLevel(r.netMarginPercent)
                  return (
                    <div key={p.id} className="w-24 space-y-1 text-right">
                      {idx === 0 && <Label className="block truncate text-xs">{p.name}</Label>}
                      <div className={cn(
                        'flex h-8 items-center justify-end text-xs font-medium tabular-nums',
                        level === 'profitable' ? 'text-emerald-500' : level === 'close' ? 'text-yellow-500' : 'text-red-500'
                      )}>
                        <CurrencyDisplay value={r.netMarginEur} showSign />
                      </div>
                    </div>
                  )
                })}
                <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => removeItem(item.id)}>
                  <X className="size-4" />
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Summary */}
      {scoped.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card><CardContent>
            <p className="text-xs text-muted-foreground">{t('pro.sim.investment')}</p>
            <CurrencyDisplay value={summary.totalInvestmentEur} className="text-xl font-semibold" />
            <p className="text-xs text-muted-foreground tabular-nums">{summary.totalInvestmentJpy.toLocaleString()} ¥</p>
          </CardContent></Card>
          <Card><CardContent>
            <p className="text-xs text-muted-foreground">{t('pro.sim.expectedRevenue')}</p>
            <CurrencyDisplay value={summary.totalRevenueEur} className="text-xl font-semibold" />
          </CardContent></Card>
          <Card><CardContent>
            <p className="text-xs text-muted-foreground">{t('pro.sim.bestMargin')}</p>
            <CurrencyDisplay value={summary.totalNetMarginEur} showSign
              className={cn('text-xl font-semibold', summary.totalNetMarginEur >= 0 ? 'text-emerald-500' : 'text-red-500')} />
            <p className="text-xs text-muted-foreground">{summary.averageMarginPercent.toFixed(1)} % {t('pro.sim.ofRevenue')}</p>
          </CardContent></Card>
          <Card><CardContent>
            <p className="text-xs text-muted-foreground">ROI</p>
            <p className={cn('text-xl font-semibold tabular-nums', summary.globalRoiPercent >= 0 ? 'text-emerald-500' : 'text-red-500')}>
              {summary.globalRoiPercent.toFixed(1)} %
            </p>
          </CardContent></Card>
        </div>
      )}

      <SimSettingsModal open={showSettings} onOpenChange={setShowSettings} settings={settings} />

      {/* Load dialog */}
      <Dialog open={showLoad} onOpenChange={setShowLoad}>
        {showLoad && (
          <DialogContent key="content" className="max-w-md">
            <DialogHeader><DialogTitle>{t('pro.sim.savedSims')}</DialogTitle></DialogHeader>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {(simulations ?? []).map(s => (
                <div key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                  <button className="flex-1 text-left" onClick={() => loadSimulation(s.id)}>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`pro.sim.${s.simType}`)} · {new Date(s.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteSimId(s.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteSimId !== null}
        onOpenChange={open => { if (!open) setDeleteSimId(null) }}
        title={t('pro.sim.deleteSim')}
        description={t('pro.sim.deleteSimConfirm')}
        onConfirm={async () => {
          if (deleteSimId !== null) await deleteSimulation.mutateAsync(deleteSimId)
          setDeleteSimId(null)
        }}
        loading={deleteSimulation.isPending}
        variant="destructive"
      />
    </div>
  )
}

function SimSettingsModal({ open, onOpenChange, settings }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: SimSettings
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <SimSettingsContent key="content" settings={settings} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function SimSettingsContent({ settings, onClose }: { settings: SimSettings; onClose: () => void }) {
  const { t } = useTranslation()
  const putSettings = usePutProSettings()
  const [platforms, setPlatforms] = useState<SimPlatform[]>(settings.platforms)
  const [urssafRate, setUrssafRate] = useState(String(settings.urssafRate))
  const [incomeTaxRate, setIncomeTaxRate] = useState(String(settings.incomeTaxRate))

  function updatePlatform(id: string, patch: Partial<SimPlatform>) {
    setPlatforms(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function handleSave() {
    await putSettings.mutateAsync({
      simulator: JSON.stringify({
        platforms,
        urssafRate: parseAmount(urssafRate) || DEFAULT_SIM_TAX.urssafRate,
        incomeTaxRate: parseAmount(incomeTaxRate) || DEFAULT_SIM_TAX.incomeTaxRate,
      }),
    })
    onClose()
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{t('pro.sim.settings')}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t('pro.sim.platforms')}</Label>
          {platforms.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <Switch checked={p.active} onCheckedChange={c => updatePlatform(p.id, { active: c })} />
              <span className="w-24 text-sm">{p.name}</span>
              <NumericInput className="h-8 w-20" value={String(p.commissionPercent)}
                onChange={e => updatePlatform(p.id, { commissionPercent: parseAmount(e.target.value) || 0 })} />
              <span className="text-xs text-muted-foreground">% + </span>
              <NumericInput className="h-8 w-20" value={String(p.fixedFee)}
                onChange={e => updatePlatform(p.id, { fixedFee: parseAmount(e.target.value) || 0 })} />
              <span className="text-xs text-muted-foreground">€</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 border-t pt-4">
          <div className="space-y-2">
            <Label>URSSAF (%)</Label>
            <NumericInput value={urssafRate} onChange={e => setUrssafRate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('pro.sim.incomeTax')} (%)</Label>
            <NumericInput value={incomeTaxRate} onChange={e => setIncomeTaxRate(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={putSettings.isPending}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={putSettings.isPending}>
          {putSettings.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
