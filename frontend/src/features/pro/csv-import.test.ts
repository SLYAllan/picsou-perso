import { describe, it, expect } from 'vitest'
import { parseSalesCsv, parseCsvAmount, toIsoDate } from './csv-import'

// Real Cardmarket "Transaction Summary" export, trimmed to two orders + one withdrawal.
const CARDMARKET = `Date;Transaction;Category;Type;Counterpart;Reference;Amount;Starting balance (EUR);Closing balance (EUR)
06.07.2026 11:24:35;989824700;Fees;Commissions;Cardmarket;1285784310;-0,63 €;0,00 €;-0,63 €
06.07.2026 11:24:35;989824698;Sales;Sales;lachaussette;1285784310;18,60 €;-0,63 €;17,97 €
06.07.2026 11:27:44;989826857;Withdrawal;Withdrawals;-;BE91905182425176;-17,97 €;17,97 €;0,00 €
19.07.2026 16:18:33;996551470;Fees;Commissions;Cardmarket;1286407502;-0,51 €;0,00 €;-0,51 €
19.07.2026 16:18:33;996551468;Sales;Sales;Enderworld73;1286407502;15,45 €;-0,51 €;14,94 €
`

describe('parseCsvAmount', () => {
  it('reads both decimal conventions and thousands marks', () => {
    expect(parseCsvAmount('18,60 €')).toBe(18.6)
    expect(parseCsvAmount('-0,63 €')).toBe(-0.63)
    expect(parseCsvAmount('1.234,56 €')).toBe(1234.56)
    expect(parseCsvAmount('1,234.56')).toBe(1234.56)
    expect(parseCsvAmount('20.35')).toBe(20.35)
    expect(parseCsvAmount('')).toBe(0)
  })
})

describe('toIsoDate', () => {
  it('accepts ISO, dd/mm/yyyy and Cardmarket dd.mm.yyyy with a time part', () => {
    expect(toIsoDate('2026-07-06')).toBe('2026-07-06')
    expect(toIsoDate('6/7/2026')).toBe('2026-07-06')
    expect(toIsoDate('06.07.2026 11:24:35')).toBe('2026-07-06')
  })
})

describe('parseSalesCsv — Cardmarket statement', () => {
  const result = parseSalesCsv(CARDMARKET)

  it('keeps one sale per order, withdrawals dropped', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sales).toHaveLength(2)
  })

  it('attaches the fee row to its sale via the reference', () => {
    if (!result.ok) throw new Error('parse failed')
    expect(result.sales[0]).toEqual({
      saleDate: '2026-07-06',
      name: '',
      reference: '1285784310',
      itemType: 'carte',
      platform: 'cardmarket',
      salePrice: 18.6,
      purchasePrice: 0,
      shippingCost: 0,
      platformCommission: 0.63,
      packagingCost: 0.35,
      notes: 'lachaussette',
    })
    expect(result.sales[1].platformCommission).toBe(0.51)
  })
})

// eBay "Rapport sur les transactions", real layout (38 columns, notes preamble),
// buyer identities and item titles replaced — this repo is public.
const EBAY = `\uFEFF--,--,--,--,--,--,--,--,--,--,--,--,--
"Remarques"
"Les montants bruts des transactions et les frais sont indiqués dans la devise de la transaction."
"Vendeur";"uwu.tcg"
"Date de début";"01/06/2026 00:00:00 AM CEST"
"Date de création de la transaction";"Type";"Numéro de commande";"Ancien numéro de commande";"Pseudo de l'acheteur";"Nom de l'acheteur";"Ville de livraison";"Province/région/État de livraison";"Code postal de livraison";"Pays de livraison";"Montant net";"Devise du versement";"Date du versement";"Numéro du versement";"Mode de versement";"Statut du versement";"Motif du blocage";"Numéro de l'objet";"Numéro de la transaction";"Titre de l'objet";"Libellé personnalisé";"Quantité";"Sous-total de l'objet";"Livraison et expédition";"Taxe collectée par le vendeur";"Taxe collectée par eBay";"Taux de TVA indiqué par le vendeur";"Commission sur le prix final - fixe";"Commission sur le prix final - variable";"Frais d'exploitation réglementaires";"Frais pour taux très élevé d'objets non conformes à la description";"Frais pour Performance insuffisante";"Frais de transactions internationales";"Montant brut de la transaction";"Devise de la transaction";"Taux de change";"Numéro de référence";"Description"
"30 juil. 2026";"Commande";"27-14935-59534";"27-14935-59534";"acheteur1";"Prenom Nom";"Ville";"--";"00000";"GB";"12,79";"EUR";"--";"--";"--";"--";"--";"335899057961";"10086873327327";"Carte Pokemon 1";"--";"1";"8,39";"6,66";"--";"3,01";"0%";"-0,35";"-1,63";"-0,06";"--";"--";"-0,22";"15,05";"EUR";"--";"--";"--"
"28 juil. 2026";"Commande";"01-14971-78398";"01-14971-78398";"acheteur2";"Prenom Nom";"Ville";"--";"00000";"FR";"6,9";"EUR";"30 juil. 2026";"7625816503";"WISE EUROPE SA NV *5176";"Fonds transférés";"--";"--";"--";"--";"--";"--";"--";"--";"--";"--";"0%";"--";"--";"--";"--";"--";"--";"7,99";"EUR";"--";"--";"--"
"28 juil. 2026";"Commande";"01-14971-78398";"01-14971-78398";"acheteur2";"Prenom Nom";"Ville";"--";"00000";"FR";"--";"--";"30 juil. 2026";"7625816503";"WISE EUROPE SA NV *5176";"Fonds transférés";"--";"335950369458";"10082757923501";"Carte Pokemon 2";"--";"1";"1,39";"2,5";"--";"--";"20%";"--";"-0,35";"-0,01";"--";"--";"--";"--";"--";"--";"--";"--"
"24 juil. 2026";"Commande";"19-14903-47700";"19-14903-47700";"acheteur3";"Prenom Nom";"Ville";"--";"00000";"ES";"34,43";"EUR";"22 juil. 2026";"7613402335";"WISE EUROPE SA NV *5176";"Fonds transférés";"--";"336523572398";"10083415936119";"Carte remboursée";"--";"1";"30";"7,99";"--";"--";"0%";"-0,35";"-3,08";"-0,12";"--";"--";"--";"37,99";"EUR";"--";"--";"--"
"24 juil. 2026";"Remboursement";"19-14903-47700";"19-14903-47700";"acheteur3";"Prenom Nom";"Ville";"--";"00000";"ES";"-34,43";"EUR";"22 juil. 2026";"7613402335";"WISE EUROPE SA NV *5176";"Fonds transférés";"--";"336523572398";"10083415936119";"Carte remboursée";"--";"1";"-30";"-7,99";"--";"--";"0%";"--";"--";"--";"--";"--";"--";"-37,99";"EUR";"--";"--";"--"
"24 juil. 2026";"Ajustement";"--";"--";"--";"--";"--";"--";"--";"--";"-10,01";"EUR";"29 juil. 2026";"7623936487";"WISE EUROPE SA NV *5176";"Fonds transférés";"--";"--";"--";"--";"--";"--";"--";"--";"--";"--";"0%";"--";"--";"--";"--";"--";"--";"-10,01";"EUR";"--";"--";"Frais de bon de réduction"
`

describe('parseSalesCsv — eBay transaction report', () => {
  const result = parseSalesCsv(EBAY)

  it('skips the notes preamble, payout and adjustment rows', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sales.map(s => s.name)).toEqual(['Carte Pokemon 1', 'Carte Pokemon 2'])
  })

  it('reads the French date and sums the four fee columns', () => {
    if (!result.ok) throw new Error('parse failed')
    expect(result.sales[0]).toEqual({
      saleDate: '2026-07-30',
      name: 'Carte Pokemon 1',
      reference: '27-14935-59534',
      itemType: 'carte',
      platform: 'ebay',
      salePrice: 8.39,
      purchasePrice: 0,
      shippingCost: 6.66,
      platformCommission: 2.26, // 0,35 + 1,63 + 0,06 + 0,22
      packagingCost: 0.35,
      notes: 'acheteur1',
    })
    expect(result.sales[1].platformCommission) // 0,35 + 0,01, the two "--" columns ignored
      .toBe(0.36)
  })

  it('drops a refunded order entirely', () => {
    if (!result.ok) throw new Error('parse failed')
    expect(result.sales.some(s => s.reference === '19-14903-47700')).toBe(false)
  })
})

describe('parseSalesCsv — generic', () => {
  it('re-imports what exportCsv writes (BOM + snake_case headers)', () => {
    const exported = '﻿'
      + 'date;name;reference;type;platform;sale_price;purchase_price;shipping_cost;platform_commission;packaging_cost;benefice_net;notes\n'
      + '"2026-07-06";"Machamp";"REF1";"carte";"cardmarket";"18.6";"5";"0";"0.63";"0.35";"12.62";"note"'
    const result = parseSalesCsv(exported)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sales).toEqual([{
      saleDate: '2026-07-06', name: 'Machamp', reference: 'REF1', itemType: 'carte',
      platform: 'cardmarket', salePrice: 18.6, purchasePrice: 5, shippingCost: 0,
      platformCommission: 0.63, packagingCost: 0.35, notes: 'note',
    }])
  })

  it('rejects a file without a sale price column', () => {
    expect(parseSalesCsv('date;platform\n2026-07-06;cardmarket')).toEqual({ ok: false, reason: 'headers' })
  })

  it('keeps refunds (negative price) and drops undated rows', () => {
    const result = parseSalesCsv('date;prix\n06.07.2026;-4,50\n;12,00')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sales).toHaveLength(1)
    expect(result.sales[0].salePrice).toBe(-4.5)
  })
})
