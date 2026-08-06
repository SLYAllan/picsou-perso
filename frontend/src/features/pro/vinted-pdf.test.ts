import { describe, it, expect } from 'vitest'
import { parseVintedPdf } from './vinted-pdf'

// Text layout of a Vinted sale receipt, as pdfToText flattens it.
const RECEIPT = `Vinted
Reçu de commande
Date de paiement : 14/07/2026
Numéro de la transaction : 4821993017
Commande
Machamp 045/080 Holo 12,50 €
Ronflex Promo 7,00 €
Frais de port 3,29 €
Protection acheteurs
et service 1,45 €
Total : 24,24 €`

describe('parseVintedPdf', () => {
  it('makes one sale per item, priced without shipping or buyer protection', () => {
    expect(parseVintedPdf(RECEIPT)).toEqual([
      {
        saleDate: '2026-07-14', name: 'Machamp 045/080 Holo', reference: '4821993017',
        itemType: 'carte', platform: 'vinted', salePrice: 12.5, purchasePrice: 0,
        shippingCost: 0, platformCommission: 0, packagingCost: 0.35, notes: '',
      },
      {
        saleDate: '2026-07-14', name: 'Ronflex Promo', reference: '4821993017',
        itemType: 'carte', platform: 'vinted', salePrice: 7, purchasePrice: 0,
        shippingCost: 0, platformCommission: 0, packagingCost: 0.35, notes: '',
      },
    ])
  })

  it('falls back to the total minus what the buyer paid on top', () => {
    const noItems = RECEIPT
      .replace('Machamp 045/080 Holo 12,50 €\n', '')
      .replace('Ronflex Promo 7,00 €\n', '')
    const sales = parseVintedPdf(noItems)
    expect(sales).toHaveLength(1)
    expect(sales[0].name).toBe('Article Vinted')
    expect(sales[0].salePrice).toBeCloseTo(19.5, 2)
  })

  it('returns nothing when the PDF is not a Vinted receipt', () => {
    expect(parseVintedPdf('Facture Bouygues Telecom\nTotal : 24,24 €')).toEqual([])
  })
})
