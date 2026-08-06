// Vinted sale receipts — port of pokecalc's parse-pdf route + parseVintedPdf.
// One PDF per sale; pdf.js is lazily imported so it stays out of the main bundle.
import type { ProSaleRequest } from './api'
import { DEFAULT_PACKAGING } from './csv-import'

/**
 * Extracts the page text, one line per row of glyphs. pdf.js gives loose items,
 * so we group them by their y coordinate — the regexes below are line-anchored.
 */
export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  // Bundled through Vite's ?worker rather than served as-is: pdf.js ships its worker
  // as a .mjs, an extension nginx has no MIME type for, so it arrived as
  // application/octet-stream and nosniff refused to run it.
  const PdfWorker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker()

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const lines = new Map<number, { x: number; s: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || item.str === '') continue
      const y = Math.round(item.transform[5])
      const line = lines.get(y) ?? []
      line.push({ x: item.transform[4], s: item.str })
      lines.set(y, line)
    }
    pages.push(
      [...lines.entries()]
        .sort((a, b) => b[0] - a[0]) // PDF y grows upwards
        .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim())
        .join('\n'),
    )
  }
  await task.destroy()
  return pages.join('\n')
}

/**
 * A Vinted receipt: payment date, transaction number, then the ordered items
 * before the "Frais de port" line. Shipping and buyer protection are paid by the
 * buyer, so they stay out of the sale — same as pokecalc.
 */
export function parseVintedPdf(text: string): ProSaleRequest[] {
  const dateMatch = text.match(/Date de paiement\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  const refMatch = text.match(/Num[ée]ro de la transaction\s*:?\s*(\d+)/i)
  if (!dateMatch || !refMatch) return []

  const [d, m, y] = dateMatch[1].split('/')
  const saleDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const reference = refMatch[1]

  const euro = (re: RegExp) => {
    const hit = text.match(re)
    return hit ? parseFloat(hit[1].replace(',', '.')) : 0
  }
  const shipping = euro(/Frais de port\s+(\d+[.,]\d{2})\s*€/i)
  const commission = euro(/Protection acheteurs[\s\S]*?(\d+[.,]\d{2})\s*€/i)
  const total = euro(/Total\s*:?\s*(\d+[.,]\d{2})\s*€/i)

  const commandeIdx = text.search(/Commande/i)
  const fraisIdx = text.search(/Frais de port/i)
  if (commandeIdx < 0 || fraisIdx < 0) return []

  const items: { name: string; price: number }[] = []
  const itemRegex = /^(.+?)\s+(\d+[.,]\d{2})\s*€\s*$/gm
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(text.substring(commandeIdx, fraisIdx))) !== null) {
    const name = match[1].trim()
    const lower = name.toLowerCase()
    if (lower.includes('code de retour') || lower.includes('commande')) continue
    items.push({ name, price: parseFloat(match[2].replace(',', '.')) })
  }
  // Some receipts list nothing parsable — fall back to the total minus what the buyer paid on top
  if (items.length === 0 && total > 0) {
    items.push({ name: 'Article Vinted', price: total - shipping - commission })
  }

  return items.map(item => ({
    saleDate,
    name: item.name,
    reference,
    itemType: 'carte',
    platform: 'vinted',
    salePrice: item.price,
    purchasePrice: 0,
    shippingCost: 0,
    platformCommission: 0,
    packagingCost: DEFAULT_PACKAGING,
    notes: '',
  }))
}
