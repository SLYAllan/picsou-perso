import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProInvoices, useNextInvoiceNumber, useCreateInvoice } from '@/features/pro/hooks'
import type { InvoiceItem, ProInvoice } from '@/features/pro/api'
import { generateInvoicePdf, formatInvoiceDate, SELLER } from '@/features/pro/invoice-pdf'
import { CurrencyDisplay } from '@/components/shared/CurrencyDisplay'
import { NumericInput } from '@/components/shared/NumericInput'
import { DateInput } from '@/components/shared/DateInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseAmount, getLocale } from '@/lib/utils'
import { Download, Plus, X } from 'lucide-react'

interface DraftItem {
  description: string
  quantity: string
  unitPrice: string
}

function formatEur(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €'
}

export function InvoicesTab() {
  const { t } = useTranslation()
  const { data: history } = useProInvoices()
  const { data: nextNumber } = useNextInvoiceNumber()
  const createInvoice = useCreateInvoice()

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [items, setItems] = useState<DraftItem[]>([{ description: '', quantity: '1', unitPrice: '' }])
  const [shippingCost, setShippingCost] = useState('')
  const [notes, setNotes] = useState('')
  const [generating, setGenerating] = useState(false)

  const parsedItems: InvoiceItem[] = items.map(i => ({
    description: i.description,
    quantity: Math.max(1, Math.round(parseAmount(i.quantity) || 1)),
    unitPrice: parseAmount(i.unitPrice) || 0,
  }))
  const subtotal = parsedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const shipping = parseAmount(shippingCost) || 0
  const total = subtotal + shipping

  function updateItem(index: number, field: keyof DraftItem, value: string) {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      // The server assigns the definitive number — the PDF uses what comes back.
      const saved = await createInvoice.mutateAsync({
        invoiceDate: date, clientName, clientAddress, clientEmail,
        items: parsedItems, shippingCost: shipping, notes,
      })
      await generateInvoicePdf({
        invoiceNumber: saved.invoiceNumber, date: saved.invoiceDate,
        clientName: saved.clientName, clientAddress: saved.clientAddress, clientEmail: saved.clientEmail,
        items: saved.items, shippingCost: saved.shippingCost,
        subtotal: saved.subtotal, total: saved.total, notes: saved.notes,
      }, saved.invoiceNumber)
      setClientName(''); setClientAddress(''); setClientEmail('')
      setItems([{ description: '', quantity: '1', unitPrice: '' }])
      setShippingCost(''); setNotes('')
    } finally {
      setGenerating(false)
    }
  }

  async function redownload(inv: ProInvoice) {
    if (generating) return
    setGenerating(true)
    try {
      await generateInvoicePdf({
        invoiceNumber: inv.invoiceNumber, date: inv.invoiceDate,
        clientName: inv.clientName, clientAddress: inv.clientAddress, clientEmail: inv.clientEmail,
        items: inv.items, shippingCost: inv.shippingCost,
        subtotal: inv.subtotal, total: inv.total, notes: inv.notes,
      }, inv.invoiceNumber)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t('pro.invoices.info')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('pro.invoices.number')}</Label>
                <Input value={nextNumber ?? '…'} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-date">{t('pro.invoices.date')}</Label>
                <DateInput id="inv-date" value={date} onChange={setDate} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('pro.invoices.client')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="inv-client">{t('pro.invoices.clientName')}</Label>
                <Input id="inv-client" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-address">{t('pro.invoices.clientAddress')}</Label>
                <textarea
                  id="inv-address" rows={2} value={clientAddress}
                  onChange={e => setClientAddress(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-email">{t('pro.invoices.clientEmail')}</Label>
                <Input id="inv-email" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('pro.invoices.items')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    {i === 0 && <Label>{t('pro.invoices.description')}</Label>}
                    <Input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} />
                  </div>
                  <div className="w-16 space-y-2">
                    {i === 0 && <Label>{t('pro.invoices.qty')}</Label>}
                    <NumericInput value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                  </div>
                  <div className="w-24 space-y-2">
                    {i === 0 && <Label>{t('pro.invoices.unitPrice')}</Label>}
                    <NumericInput value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)} />
                  </div>
                  <Button
                    variant="ghost" size="icon" className="size-9 text-destructive hover:text-destructive"
                    onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))}
                    disabled={items.length <= 1}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full"
                onClick={() => setItems(prev => [...prev, { description: '', quantity: '1', unitPrice: '' }])}>
                <Plus className="size-4" />{t('pro.invoices.addItem')}
              </Button>
              <div className="grid grid-cols-2 gap-4 border-t pt-3">
                <div className="space-y-2">
                  <Label htmlFor="inv-shipping">{t('pro.invoices.shipping')} (€)</Label>
                  <NumericInput id="inv-shipping" value={shippingCost} onChange={e => setShippingCost(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-notes">{t('pro.invoices.notes')}</Label>
                  <Input id="inv-notes" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" onClick={handleGenerate} disabled={generating || !clientName || subtotal <= 0}>
            {generating ? t('common.loading') : t('pro.invoices.download')}
          </Button>
        </div>

        {/* Live preview (UwUTCG branding) */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardContent className="bg-white p-8 text-[11px] leading-relaxed text-gray-900" style={{ minHeight: '600px' }}>
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <img src="/uwutcg-logo.png" alt="UwUTCG" className="size-11 object-contain" />
                    <span className="text-2xl font-black tracking-tight" style={{ color: '#262523' }}>UwUTCG</span>
                  </div>
                  <div className="space-y-0.5 text-[10px] text-gray-500">
                    <div className="font-semibold" style={{ color: '#262523' }}>{SELLER.name}</div>
                    <div>{SELLER.address}</div>
                    <div>{SELLER.city}</div>
                    <div>{SELLER.email}</div>
                    <div>{SELLER.phone}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-2 text-2xl font-black" style={{ color: '#262523' }}>FACTURE</div>
                  <div className="space-y-0.5 text-[10px]">
                    <div><span className="text-gray-500">N° </span><span className="font-bold" style={{ color: '#262523' }}>{nextNumber ?? ''}</span></div>
                    <div><span className="text-gray-500">Date </span><span className="font-bold" style={{ color: '#262523' }}>{formatInvoiceDate(date)}</span></div>
                  </div>
                </div>
              </div>
              <div className="mb-5 h-[3px] w-full" style={{ backgroundColor: '#E6398B' }} />
              <div className="mb-6">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: '#E6398B' }}>Facturer à</div>
                <div className="text-base font-bold" style={{ color: '#262523' }}>{clientName || '—'}</div>
                {clientAddress && <div className="whitespace-pre-line text-gray-600">{clientAddress}</div>}
                {clientEmail && <div className="text-gray-400">{clientEmail}</div>}
              </div>
              <table className="mb-4 w-full border-collapse">
                <thead>
                  <tr style={{ backgroundColor: '#262523', color: '#fff' }}>
                    <th className="rounded-l px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider">Description</th>
                    <th className="w-12 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider">Qté</th>
                    <th className="w-20 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider">P.U.</th>
                    <th className="w-24 rounded-r px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedItems.map((item, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="px-2 py-2" style={{ color: '#262523' }}>{item.description || '—'}</td>
                      <td className="px-2 py-2 text-center text-gray-500">{item.quantity}</td>
                      <td className="px-2 py-2 text-right text-gray-500">{formatEur(item.unitPrice)}</td>
                      <td className="px-2 py-2 text-right font-bold" style={{ color: '#262523' }}>{formatEur(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mb-6 flex justify-end">
                <div className="w-60">
                  <div className="flex justify-between py-1 text-gray-500">
                    <span>Sous-total</span>
                    <span style={{ color: '#262523' }}>{formatEur(subtotal)}</span>
                  </div>
                  {shipping > 0 && (
                    <div className="flex justify-between py-1 text-gray-500">
                      <span>Frais de port</span>
                      <span style={{ color: '#262523' }}>{formatEur(shipping)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between rounded-md px-3 py-2 text-sm font-black text-white" style={{ backgroundColor: '#E6398B' }}>
                    <span>TOTAL</span>
                    <span>{formatEur(total)}</span>
                  </div>
                </div>
              </div>
              {notes && <div className="mb-4 italic text-gray-600">{notes}</div>}
              <div className="pt-3" style={{ borderTop: '2px solid #E6398B' }}>
                <div className="space-y-0.5 text-center text-[9px] text-gray-400">
                  <div className="font-bold" style={{ color: '#262523' }}>{SELLER.tva}</div>
                  <div>SIRET {SELLER.siret} · {SELLER.name} · {SELLER.address}, {SELLER.city}</div>
                  <div>Paiement comptant — pénalité de retard : 3× le taux d&apos;intérêt légal. Pas d&apos;escompte pour paiement anticipé.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* History */}
      {(history ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('pro.invoices.history', { count: (history ?? []).length })}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">N°</th>
                  <th className="px-3 py-2">{t('pro.invoices.date')}</th>
                  <th className="px-3 py-2">{t('pro.invoices.client')}</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map(inv => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{inv.invoiceNumber}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {new Date(inv.invoiceDate).toLocaleDateString(getLocale())}
                    </td>
                    <td className="max-w-56 truncate px-3 py-2">{inv.clientName || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums"><CurrencyDisplay value={inv.total} /></td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => redownload(inv)} disabled={generating}>
                        <Download className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
