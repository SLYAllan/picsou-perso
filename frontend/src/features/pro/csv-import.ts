import type { ProSaleRequest } from './api'

/** pokecalc's default packaging cost, same as the sale modal. */
export const DEFAULT_PACKAGING = 0.35

/** CSV header → sale field. FR/EN synonyms + the headers our own exportCsv writes. */
const HEADER_MAP: Record<string, keyof ProSaleRequest> = {
  'date': 'saleDate',
  'nom': 'name', 'name': 'name', 'article': 'name', 'article name': 'name', 'nom / article': 'name',
  'reference': 'reference', 'référence': 'reference', 'order number': 'reference',
  'type': 'itemType',
  'plateforme': 'platform', 'platform': 'platform',
  'prix de vente': 'salePrice', 'sale price': 'salePrice', 'sale_price': 'salePrice',
  'prix': 'salePrice', 'price': 'salePrice',
  "prix d'achat": 'purchasePrice', 'purchase price': 'purchasePrice', 'purchase_price': 'purchasePrice',
  'frais de port': 'shippingCost', 'shipping': 'shippingCost', 'shipping cost': 'shippingCost',
  'shipping_cost': 'shippingCost', 'port': 'shippingCost',
  'commission plateforme': 'platformCommission', 'commission': 'platformCommission',
  'platform_commission': 'platformCommission',
  'frais emballage': 'packagingCost', 'emballage': 'packagingCost', 'packaging': 'packagingCost',
  'packaging_cost': 'packagingCost',
  'notes': 'notes', 'acheteur': 'notes',
}

export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // Excel/our export write a BOM
  const sep = body.includes(';') && !body.split('\n')[0].includes(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', inQuotes = false
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (inQuotes) {
      if (c === '"' && body[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else if (c === '"') inQuotes = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(v => v.trim() !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some(v => v.trim() !== '')) rows.push(row)
  return rows
}

/**
 * "18,60 €" → 18.6, "1.234,56 €" → 1234.56, "1,234.56" → 1234.56.
 * The last separator is the decimal one; anything before it is a thousands mark.
 */
export function parseCsvAmount(raw: string | undefined): number {
  const s = (raw ?? '').replace(/[^\d,.-]/g, '')
  const dec = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  if (dec < 0) return parseFloat(s) || 0
  return parseFloat(`${s.slice(0, dec).replace(/[.,]/g, '')}.${s.slice(dec + 1)}`) || 0
}

/** Accepts ISO, dd/mm/yyyy and Cardmarket's dd.mm.yyyy (with or without a time part). */
export function toIsoDate(raw: string): string {
  const s = (raw ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const dmy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return s
}

export type CsvImportResult =
  | { ok: true; sales: ProSaleRequest[] }
  | { ok: false; reason: 'empty' | 'headers' }

/**
 * Cardmarket "Transaction Summary": one `Sales` row + one `Fees` row per order,
 * joined by Reference. Withdrawals and everything else are ignored.
 */
function parseCardmarket(rows: string[][], head: string[]): ProSaleRequest[] {
  const iDate = head.indexOf('date')
  const iCat = head.indexOf('category')
  const iRef = head.indexOf('reference')
  const iAmount = head.indexOf('amount')
  const iBuyer = head.indexOf('counterpart')

  const fees = new Map<string, number>()
  for (const r of rows.slice(1)) {
    if (r[iCat]?.trim().toLowerCase() !== 'fees') continue
    const ref = r[iRef]?.trim() ?? ''
    fees.set(ref, (fees.get(ref) ?? 0) + Math.abs(parseCsvAmount(r[iAmount])))
  }

  return rows.slice(1)
    .filter(r => r[iCat]?.trim().toLowerCase() === 'sales')
    .map(r => {
      const ref = r[iRef]?.trim() ?? ''
      return {
        saleDate: toIsoDate(r[iDate] ?? ''),
        name: '',
        reference: ref,
        itemType: 'carte',
        platform: 'cardmarket',
        salePrice: parseCsvAmount(r[iAmount]),
        purchasePrice: 0,
        shippingCost: 0,
        platformCommission: Number((fees.get(ref) ?? 0).toFixed(2)),
        packagingCost: DEFAULT_PACKAGING,
        notes: iBuyer >= 0 ? (r[iBuyer]?.trim() ?? '') : '',
      }
    })
}

function parseGeneric(rows: string[][], head: string[]): CsvImportResult {
  const mapping = head.map(h => HEADER_MAP[h] ?? null)
  if (!mapping.includes('saleDate') || !mapping.includes('salePrice')) {
    return { ok: false, reason: 'headers' }
  }
  const sales: ProSaleRequest[] = []
  for (const row of rows.slice(1)) {
    const req: ProSaleRequest = { saleDate: '', salePrice: 0 }
    mapping.forEach((field, i) => {
      if (!field || row[i] === undefined) return
      const raw = row[i].trim()
      if (field === 'saleDate') req.saleDate = toIsoDate(raw)
      else if (field === 'name' || field === 'reference' || field === 'itemType'
        || field === 'platform' || field === 'notes') req[field] = raw
      else req[field] = parseCsvAmount(raw)
    })
    sales.push(req)
  }
  return { ok: true, sales }
}

/** Parses a sales CSV — Cardmarket statement or generic/our own export. */
export function parseSalesCsv(text: string): CsvImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { ok: false, reason: 'empty' }
  const head = rows[0].map(h => h.trim().toLowerCase())

  const result = head.includes('category') && head.includes('amount')
    ? { ok: true as const, sales: parseCardmarket(rows, head) }
    : parseGeneric(rows, head)

  if (!result.ok) return result
  // Negative price = refund; only rows without a date or a zero amount are dropped
  const sales = result.sales.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.saleDate) && s.salePrice !== 0)
  return sales.length === 0 ? { ok: false, reason: 'empty' } : { ok: true, sales }
}
