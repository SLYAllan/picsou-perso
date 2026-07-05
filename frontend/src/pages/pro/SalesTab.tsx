import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProSales, useCreateSale, useUpdateSale, useDeleteSale, useCreateSalesBulk } from '@/features/pro/hooks'
import type { ProSale, ProSaleRequest } from '@/features/pro/api'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { NumericInput } from '@/components/shared/NumericInput'
import { DateInput } from '@/components/shared/DateInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, parseAmount } from '@/lib/utils'
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const PLATFORMS = ['cardmarket', 'ebay', 'vinted', 'tiktokshop', 'autre']
const TYPES = ['carte', 'scelle', 'accessoire', 'autre']

// CSV header → sale field auto-mapping (FR/EN, pokecalc import page condensed)
const HEADER_MAP: Record<string, keyof ProSaleRequest> = {
  'date': 'saleDate',
  'nom': 'name', 'name': 'name', 'article': 'name', 'article name': 'name', 'nom / article': 'name',
  'reference': 'reference', 'référence': 'reference', 'order number': 'reference',
  'type': 'itemType',
  'plateforme': 'platform', 'platform': 'platform',
  'prix de vente': 'salePrice', 'sale price': 'salePrice', 'prix': 'salePrice', 'price': 'salePrice',
  "prix d'achat": 'purchasePrice', 'purchase price': 'purchasePrice',
  'frais de port': 'shippingCost', 'shipping': 'shippingCost', 'shipping cost': 'shippingCost', 'port': 'shippingCost',
  'commission plateforme': 'platformCommission', 'commission': 'platformCommission',
  'frais emballage': 'packagingCost', 'emballage': 'packagingCost', 'packaging': 'packagingCost',
  'notes': 'notes', 'acheteur': 'notes',
}

function parseCsv(text: string): string[][] {
  const sep = text.includes(';') && !text.split('\n')[0].includes(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(v => v.trim() !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some(v => v.trim() !== '')) rows.push(row)
  return rows
}

function toIsoDate(raw: string): string {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`
  return s
}

export function SalesTab() {
  const { t } = useTranslation()
  const { data: sales, isLoading } = useProSales()
  const deleteSale = useDeleteSale()
  const bulkCreate = useCreateSalesBulk()
  const [editSale, setEditSale] = useState<ProSale | 'new' | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [importInfo, setImportInfo] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const totals = useMemo(() => {
    const list = sales ?? []
    return {
      ca: list.reduce((s, v) => s + v.salePrice, 0),
      benefice: list.reduce((s, v) => s + v.beneficeNet, 0),
    }
  }, [sales])

  function exportCsv() {
    const header = 'date;name;reference;type;platform;sale_price;purchase_price;shipping_cost;platform_commission;packaging_cost;benefice_net;notes'
    const lines = (sales ?? []).map(s => [
      s.saleDate, s.name, s.reference, s.itemType, s.platform,
      s.salePrice, s.purchasePrice, s.shippingCost, s.platformCommission, s.packagingCost,
      s.beneficeNet, s.notes,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ventes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importCsv(file: File) {
    const rows = parseCsv(await file.text())
    if (rows.length < 2) { setImportInfo(t('pro.sales.importEmpty')); return }
    const headers = rows[0].map(h => h.trim().toLowerCase())
    const mapping = headers.map(h => HEADER_MAP[h] ?? null)
    if (!mapping.includes('saleDate') || !mapping.includes('salePrice')) {
      setImportInfo(t('pro.sales.importBadHeaders'))
      return
    }
    const toImport: ProSaleRequest[] = []
    for (const row of rows.slice(1)) {
      const req: ProSaleRequest = { saleDate: '', salePrice: 0 }
      mapping.forEach((field, i) => {
        if (!field || row[i] === undefined) return
        const raw = row[i].trim()
        if (field === 'saleDate') req.saleDate = toIsoDate(raw)
        else if (field === 'name' || field === 'reference' || field === 'itemType' || field === 'platform' || field === 'notes') {
          req[field] = raw
        } else {
          req[field] = parseAmount(raw) || 0
        }
      })
      if (req.saleDate && req.salePrice > 0) toImport.push(req)
    }
    if (toImport.length === 0) { setImportInfo(t('pro.sales.importEmpty')); return }
    await bulkCreate.mutateAsync(toImport)
    setImportInfo(t('pro.sales.importDone', { count: toImport.length }))
  }

  if (isLoading) return <LoadingSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEditSale('new')}>
          <Plus className="size-4" />{t('pro.sales.add')}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={(sales ?? []).length === 0}>
          <Download className="size-4" />{t('pro.sales.exportCsv')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={bulkCreate.isPending}>
          <Upload className="size-4" />{t('pro.sales.importCsv')}
        </Button>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) importCsv(f)
            e.target.value = ''
          }}
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {t('pro.sales.count', { count: (sales ?? []).length })} · CA <CurrencyDisplay value={totals.ca} />
          {' · '}{t('pro.sales.netProfit')}{' '}
          <CurrencyDisplay value={totals.benefice} className={cn(totals.benefice >= 0 ? 'text-emerald-500' : 'text-red-500')} />
        </span>
      </div>
      {importInfo && <p className="text-xs text-muted-foreground">{importInfo}</p>}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">{t('pro.sales.date')}</th>
                <th className="px-3 py-2">{t('pro.sales.article')}</th>
                <th className="px-3 py-2">{t('pro.sales.platform')}</th>
                <th className="px-3 py-2 text-right">{t('pro.sales.salePrice')}</th>
                <th className="px-3 py-2 text-right">{t('pro.sales.costs')}</th>
                <th className="px-3 py-2 text-right">{t('pro.sales.netProfit')}</th>
                <th className="px-3 py-2 text-right">{t('pro.sales.margin')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(sales ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">{t('pro.sales.empty')}</td></tr>
              )}
              {(sales ?? []).map(s => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{s.saleDate}</td>
                  <td className="max-w-64 truncate px-3 py-2" title={s.name}>{s.name || s.reference || '—'}</td>
                  <td className="px-3 py-2 capitalize">{s.platform}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><CurrencyDisplay value={s.salePrice} /></td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground"><CurrencyDisplay value={s.totalCouts} /></td>
                  <td className={cn('px-3 py-2 text-right font-medium tabular-nums', s.beneficeNet >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                    <CurrencyDisplay value={s.beneficeNet} />
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', s.margeNette >= 30 ? 'text-emerald-500' : s.margeNette >= 10 ? 'text-yellow-500' : 'text-red-500')}>
                    {s.margeNette.toFixed(1)} %
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditSale(s)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <SaleModal sale={editSale} onClose={() => setEditSale(null)} />
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title={t('pro.sales.delete')}
        description={t('pro.sales.deleteConfirm')}
        onConfirm={async () => {
          if (deleteId !== null) await deleteSale.mutateAsync(deleteId)
          setDeleteId(null)
        }}
        loading={deleteSale.isPending}
        variant="destructive"
      />
    </div>
  )
}

function SaleModal({ sale, onClose }: { sale: ProSale | 'new' | null; onClose: () => void }) {
  return (
    <Dialog open={sale !== null} onOpenChange={open => { if (!open) onClose() }}>
      {sale !== null && <SaleModalContent key="content" sale={sale === 'new' ? null : sale} onClose={onClose} />}
    </Dialog>
  )
}

function SaleModalContent({ sale, onClose }: { sale: ProSale | null; onClose: () => void }) {
  const { t } = useTranslation()
  const createSale = useCreateSale()
  const updateSale = useUpdateSale()
  const [saleDate, setSaleDate] = useState(sale?.saleDate ?? new Date().toISOString().slice(0, 10))
  const [name, setName] = useState(sale?.name ?? '')
  const [reference, setReference] = useState(sale?.reference ?? '')
  const [itemType, setItemType] = useState(sale?.itemType ?? 'carte')
  const [platform, setPlatform] = useState(sale?.platform ?? 'cardmarket')
  const [salePrice, setSalePrice] = useState(sale ? String(sale.salePrice) : '')
  const [purchasePrice, setPurchasePrice] = useState(sale ? String(sale.purchasePrice) : '')
  const [shippingCost, setShippingCost] = useState(sale ? String(sale.shippingCost) : '')
  const [commission, setCommission] = useState(sale ? String(sale.platformCommission) : '')
  const [packagingCost, setPackagingCost] = useState(sale ? String(sale.packagingCost) : '0.35')
  const [notes, setNotes] = useState(sale?.notes ?? '')

  const pending = createSale.isPending || updateSale.isPending
  const valid = saleDate !== '' && (parseAmount(salePrice) || 0) > 0

  async function handleSubmit() {
    const data: ProSaleRequest = {
      saleDate, name, reference, itemType, platform, notes,
      salePrice: parseAmount(salePrice) || 0,
      purchasePrice: parseAmount(purchasePrice) || 0,
      shippingCost: parseAmount(shippingCost) || 0,
      platformCommission: parseAmount(commission) || 0,
      packagingCost: parseAmount(packagingCost) || 0,
    }
    if (sale) await updateSale.mutateAsync({ id: sale.id, data })
    else await createSale.mutateAsync(data)
    onClose()
  }

  const selectCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus:border-ring'

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{sale ? t('pro.sales.edit') : t('pro.sales.add')}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sale-date">{t('pro.sales.date')}</Label>
            <DateInput id="sale-date" value={saleDate} onChange={setSaleDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-ref">{t('pro.sales.reference')}</Label>
            <Input id="sale-ref" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sale-name">{t('pro.sales.article')}</Label>
          <Input id="sale-name" value={name} onChange={e => setName(e.target.value)} placeholder="Machamp 045/080 Holo…" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sale-type">{t('pro.sales.type')}</Label>
            <select id="sale-type" className={selectCls} value={itemType} onChange={e => setItemType(e.target.value)}>
              {TYPES.map(v => <option key={v} value={v}>{t(`pro.types.${v}`)}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-platform">{t('pro.sales.platform')}</Label>
            <select id="sale-platform" className={selectCls} value={platform} onChange={e => setPlatform(e.target.value)}>
              {PLATFORMS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sale-price">{t('pro.sales.salePrice')} (€)</Label>
            <NumericInput id="sale-price" value={salePrice} onChange={e => setSalePrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-purchase">{t('pro.sales.purchasePrice')} (€)</Label>
            <NumericInput id="sale-purchase" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="sale-shipping">{t('pro.sales.shipping')} (€)</Label>
            <NumericInput id="sale-shipping" value={shippingCost} onChange={e => setShippingCost(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-commission">{t('pro.sales.commission')} (€)</Label>
            <NumericInput id="sale-commission" value={commission} onChange={e => setCommission(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sale-packaging">{t('pro.sales.packaging')} (€)</Label>
            <NumericInput id="sale-packaging" value={packagingCost} onChange={e => setPackagingCost(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sale-notes">{t('pro.sales.notes')}</Label>
          <Input id="sale-notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} disabled={!valid || pending}>
          {pending ? t('common.loading') : t('common.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
