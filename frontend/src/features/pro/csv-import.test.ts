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
