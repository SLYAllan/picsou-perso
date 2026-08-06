import { describe, it, expect } from 'vitest'
import { parseVintedPdf } from './vinted-pdf'

// A real "Formulaire de retour de commande" (Vinted's receipt), exactly as
// pdfToText flattens it — the trailing return-code notice is cut for brevity.
// 4,00 × 3 + 3,23 shipping + 1,30 protection = 16,53, the total on the form.
const RECEIPT = `Formulaire de retour de commande
Adresse de retour du vendeur : Date de paiement : 15/04/2026 13 h 37
"UwU TCG" Numéro de la transaction : 19221830757
48 Rue Daniel Mayer, A01
37100 Tours
France
uwu.tcg.uwu@gmail.com
Commande Code de retour Prix
Lot de Cartes Pokémon Japonaise Vintage #10 4,00 €
Lot de Cartes Pokémon Japonaise Vintage #12 4,00 €
Lot de Cartes Pokémon Japonaise Vintage #14 4,00 €
Frais de port 3,23 €
Protection acheteurs 1,30 €
(Pro)
Total: 16,53 €
Codes de retour
1 – L'article semble être une contrefaçon`

describe('parseVintedPdf', () => {
  it('makes one sale per item, priced without shipping or buyer protection', () => {
    const common = {
      saleDate: '2026-04-15', reference: '19221830757', itemType: 'carte',
      platform: 'vinted', salePrice: 4, purchasePrice: 0, shippingCost: 0,
      platformCommission: 0, packagingCost: 0.35, notes: '',
    }
    expect(parseVintedPdf(RECEIPT)).toEqual([
      { ...common, name: 'Lot de Cartes Pokémon Japonaise Vintage #10' },
      { ...common, name: 'Lot de Cartes Pokémon Japonaise Vintage #12' },
      { ...common, name: 'Lot de Cartes Pokémon Japonaise Vintage #14' },
    ])
  })

  it('ignores the address block above the item table', () => {
    // "Formulaire de retour de commande" also contains "commande" — a
    // case-insensitive search would start the item section on the title line.
    expect(parseVintedPdf(RECEIPT).some(s => s.name?.includes('Rue Daniel Mayer'))).toBe(false)
  })

  it('falls back to the total minus what the buyer paid on top', () => {
    const noItems = RECEIPT.replace(/^Lot de Cartes.*\n/gm, '')
    const sales = parseVintedPdf(noItems)
    expect(sales).toHaveLength(1)
    expect(sales[0].name).toBe('Article Vinted')
    expect(sales[0].salePrice).toBeCloseTo(12, 2) // 16,53 − 3,23 − 1,30
  })

  it('returns nothing when the PDF is not a Vinted receipt', () => {
    expect(parseVintedPdf('Facture Bouygues Telecom\nTotal : 24,24 €')).toEqual([])
  })
})
