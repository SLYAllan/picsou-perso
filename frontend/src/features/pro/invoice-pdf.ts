// UwUTCG invoice PDF — straight port of pokecalc's factures page generator.
// jsPDF + Poppins are lazily imported so they stay out of the main bundle.
import type { InvoiceItem } from './api'

export const SELLER = {
  name: 'Allan Courly',
  address: '48 Rue Daniel Mayer',
  city: '37100 Tours',
  siret: '842 270 134 00039',
  email: 'uwu.tcg.uwu@gmail.com',
  phone: '06 52 98 22 88',
  tva: 'TVA non applicable, art. 293 B du CGI',
}

export interface InvoicePdfData {
  invoiceNumber: string
  date: string
  clientName: string
  clientAddress: string
  clientEmail: string
  items: InvoiceItem[]
  shippingCost: number
  subtotal: number
  total: number
  notes: string
}

export function formatInvoiceDate(date: string): string {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

function formatEur(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €'
}

interface LoadedImage {
  data: string
  width: number
  height: number
}

// Downscales the logo so the embedded PNG stays small (source is ~1900px;
// without this the generated PDF balloons to ~13 MB).
async function loadImageAsBase64(url: string, maxSize = 240): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      resolve({ data: canvas.toDataURL('image/png'), width: w, height: h })
    }
    img.onerror = reject
    img.src = url
  })
}

// UwUTCG brand palette (matches the DA / Facture.psd mockup)
const BRAND = {
  charcoal: [38, 37, 35] as [number, number, number],
  magenta: [230, 57, 139] as [number, number, number],
  gray: [120, 120, 120] as [number, number, number],
  lightGray: [155, 155, 155] as [number, number, number],
  hairline: [228, 228, 228] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
}

export async function generateInvoicePdf(data: InvoicePdfData, filename: string) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF('p', 'mm', 'a4')

  // Embed Poppins (brand font) — lazily imported so it stays out of the main bundle.
  let FONT = 'helvetica'
  try {
    const { POPPINS_REGULAR, POPPINS_BOLD } = await import('./poppinsFont')
    pdf.addFileToVFS('Poppins-Regular.ttf', POPPINS_REGULAR)
    pdf.addFont('Poppins-Regular.ttf', 'Poppins', 'normal')
    pdf.addFileToVFS('Poppins-Bold.ttf', POPPINS_BOLD)
    pdf.addFont('Poppins-Bold.ttf', 'Poppins', 'bold')
    FONT = 'Poppins'
  } catch { /* fall back to Helvetica if the font fails to load */ }
  pdf.setFont(FONT, 'normal')

  const W = 210
  const margin = 18
  const contentW = W - margin * 2
  const right = margin + contentW

  type RGB = [number, number, number]
  const fill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
  const ink = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2])
  const stroke = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])

  let y = 24

  // --- Logo + wordmark (left) ---
  let wordmarkX = margin
  try {
    const logo = await loadImageAsBase64('/uwutcg-logo.png', 240)
    const logoH = 17
    const logoW = logoH * (logo.width / logo.height)
    pdf.addImage(logo.data, 'PNG', margin, y - 14, logoW, logoH)
    wordmarkX = margin + logoW + 3.5
  } catch { /* logo unavailable, text-only fallback */ }

  pdf.setFont(FONT, 'bold')
  pdf.setFontSize(21)
  ink(BRAND.charcoal)
  pdf.text('UwUTCG', wordmarkX, y)

  // --- FACTURE + number/date (right) ---
  pdf.setFontSize(21)
  pdf.text('FACTURE', right, y, { align: 'right' })

  let iy = y + 6.5
  pdf.setFontSize(9)
  const labelGap = 3
  pdf.setFont(FONT, 'bold')
  ink(BRAND.charcoal)
  pdf.text(data.invoiceNumber, right, iy, { align: 'right' })
  const numW = pdf.getTextWidth(data.invoiceNumber)
  pdf.setFont(FONT, 'normal')
  ink(BRAND.gray)
  pdf.text('N°', right - numW - labelGap, iy, { align: 'right' })
  iy += 4.8
  const dateStr = formatInvoiceDate(data.date)
  pdf.setFont(FONT, 'bold')
  ink(BRAND.charcoal)
  pdf.text(dateStr, right, iy, { align: 'right' })
  const dateW = pdf.getTextWidth(dateStr)
  pdf.setFont(FONT, 'normal')
  ink(BRAND.gray)
  pdf.text('Date', right - dateW - labelGap, iy, { align: 'right' })

  // --- Seller block (under wordmark) ---
  let sy = y + 6.5
  pdf.setFontSize(8)
  pdf.setFont(FONT, 'bold')
  ink(BRAND.charcoal)
  pdf.text(SELLER.name, margin, sy); sy += 3.7
  pdf.setFont(FONT, 'normal')
  ink(BRAND.gray)
  pdf.text(SELLER.address, margin, sy); sy += 3.7
  pdf.text(SELLER.city, margin, sy); sy += 3.7
  pdf.text(SELLER.email, margin, sy); sy += 3.7
  pdf.text(SELLER.phone, margin, sy)

  // --- Magenta divider ---
  y = Math.max(sy, iy) + 7
  fill(BRAND.magenta)
  pdf.rect(margin, y, contentW, 1.4, 'F')
  y += 10

  // --- Facturer à ---
  pdf.setFontSize(7.5)
  pdf.setFont(FONT, 'bold')
  ink(BRAND.magenta)
  pdf.text('FACTURER À', margin, y)
  y += 5.5
  pdf.setFontSize(10.5)
  ink(BRAND.charcoal)
  pdf.text(data.clientName || '—', margin, y)
  y += 4.8
  if (data.clientAddress) {
    pdf.setFont(FONT, 'normal')
    pdf.setFontSize(8.5)
    ink(BRAND.gray)
    for (const line of data.clientAddress.split('\n')) {
      pdf.text(line, margin, y)
      y += 3.9
    }
  }
  if (data.clientEmail) {
    pdf.setFont(FONT, 'normal')
    pdf.setFontSize(8.5)
    ink(BRAND.lightGray)
    pdf.text(data.clientEmail, margin, y)
    y += 3.9
  }
  y += 7

  // --- Items table ---
  const colDesc = margin + 4
  const colQty = right - 60
  const colPU = right - 32
  const colTot = right - 4

  fill(BRAND.charcoal)
  pdf.rect(margin, y - 4.6, contentW, 7, 'F')
  pdf.setFontSize(7.5)
  pdf.setFont(FONT, 'bold')
  ink(BRAND.white)
  pdf.text('DESCRIPTION', colDesc, y)
  pdf.text('QTÉ', colQty, y, { align: 'center' })
  pdf.text('P.U.', colPU, y, { align: 'right' })
  pdf.text('TOTAL', colTot, y, { align: 'right' })
  y += 7

  pdf.setFontSize(9)
  for (const item of data.items) {
    pdf.setFont(FONT, 'normal')
    ink(BRAND.charcoal)
    const descLines: string[] = pdf.splitTextToSize(item.description || '—', colQty - colDesc - 8)
    pdf.text(descLines, colDesc, y)
    ink(BRAND.gray)
    pdf.text(String(item.quantity), colQty, y, { align: 'center' })
    pdf.text(formatEur(item.unitPrice), colPU, y, { align: 'right' })
    pdf.setFont(FONT, 'bold')
    ink(BRAND.charcoal)
    pdf.text(formatEur(item.quantity * item.unitPrice), colTot, y, { align: 'right' })
    const rowH = Math.max(1, descLines.length) * 4
    y += rowH + 1.5
    stroke(BRAND.hairline)
    pdf.setLineWidth(0.2)
    pdf.line(margin, y, right, y)
    y += 4
  }

  // --- Totals ---
  y += 2
  const totLabelX = right - 60
  pdf.setFontSize(9)
  pdf.setFont(FONT, 'normal')
  ink(BRAND.gray)
  pdf.text('Sous-total', totLabelX, y)
  ink(BRAND.charcoal)
  pdf.text(formatEur(data.subtotal), colTot, y, { align: 'right' })
  y += 5.2

  if (data.shippingCost > 0) {
    ink(BRAND.gray)
    pdf.text('Frais de port', totLabelX, y)
    ink(BRAND.charcoal)
    pdf.text(formatEur(data.shippingCost), colTot, y, { align: 'right' })
    y += 5.2
  }

  // TOTAL pill (magenta)
  y += 1.5
  const pillW = 64
  const pillX = right - pillW
  fill(BRAND.magenta)
  pdf.roundedRect(pillX, y - 4.8, pillW, 9, 1.6, 1.6, 'F')
  pdf.setFontSize(10.5)
  pdf.setFont(FONT, 'bold')
  ink(BRAND.white)
  pdf.text('TOTAL', pillX + 4, y + 1)
  pdf.text(formatEur(data.total), colTot, y + 1, { align: 'right' })
  y += 13

  // --- Notes ---
  if (data.notes) {
    pdf.setFontSize(8.5)
    pdf.setFont(FONT, 'normal')
    ink(BRAND.gray)
    const noteLines: string[] = pdf.splitTextToSize(data.notes, contentW)
    pdf.text(noteLines, margin, y)
    y += noteLines.length * 4 + 4
  }

  // --- Footer ---
  const footerY = 282
  fill(BRAND.magenta)
  pdf.rect(margin, footerY - 6, contentW, 0.8, 'F')
  pdf.setFontSize(7)
  pdf.setFont(FONT, 'bold')
  ink(BRAND.charcoal)
  pdf.text(SELLER.tva, W / 2, footerY, { align: 'center' })
  pdf.setFont(FONT, 'normal')
  ink(BRAND.gray)
  pdf.text(
    `SIRET ${SELLER.siret}  ·  ${SELLER.name}  ·  ${SELLER.address}, ${SELLER.city}`,
    W / 2, footerY + 3.7, { align: 'center' },
  )
  pdf.text(
    "Paiement comptant — pénalité de retard : 3× le taux d'intérêt légal. Pas d'escompte pour paiement anticipé.",
    W / 2, footerY + 7.2, { align: 'center' },
  )

  pdf.save(`${filename}.pdf`)
}
