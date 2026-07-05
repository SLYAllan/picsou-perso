import { describe, expect, it } from 'vitest'
import {
  acquisitionCosts, itemResult, simulationSummary, totalLotEur,
  DEFAULT_SIM_TAX, type SimPlatform, type Simulation,
} from './calculations'

const EBAY: SimPlatform = { id: 'ebay', name: 'eBay', commissionPercent: 13, fixedFee: 0.3, active: true }

function sim(partial: Partial<Simulation>): Simulation {
  return {
    lotPriceJpy: 16200, proxyFeeJpy: 0, shippingFeeJpy: 0,
    exchangeRate: 162, distributionMode: 'proportional', items: [],
    ...partial,
  }
}

describe('simulator calculations (pokecalc port)', () => {
  it('converts the lot total to EUR', () => {
    expect(totalLotEur(sim({ lotPriceJpy: 16200, proxyFeeJpy: 810, shippingFeeJpy: 1620 }))).toBeCloseTo(115, 5)
  })

  it('splits proportionally to resale value', () => {
    const s = sim({
      items: [
        { id: 'a', name: 'A', grade: 'Raw', quantity: 1, purchasePriceJpy: 0, resalePriceEur: 75 },
        { id: 'b', name: 'B', grade: 'Raw', quantity: 1, purchasePriceJpy: 0, resalePriceEur: 25 },
      ],
    })
    const costs = acquisitionCosts(s) // 100 € total
    expect(costs[0]).toBeCloseTo(75, 5)
    expect(costs[1]).toBeCloseTo(25, 5)
  })

  it('splits equally when no resale prices are set', () => {
    const s = sim({
      items: [
        { id: 'a', name: 'A', grade: 'Raw', quantity: 1, purchasePriceJpy: 0, resalePriceEur: 0 },
        { id: 'b', name: 'B', grade: 'Raw', quantity: 1, purchasePriceJpy: 0, resalePriceEur: 0 },
      ],
    })
    const costs = acquisitionCosts(s)
    expect(costs[0]).toBeCloseTo(50, 5)
    expect(costs[1]).toBeCloseTo(50, 5)
  })

  it('computes the pokecalc net margin per platform', () => {
    // resale 100 €, cost 50 €: fee = 13 + 0.30, urssaf 12.30, tax 1 → margin 23.40
    const r = itemResult(50, 100, EBAY, DEFAULT_SIM_TAX)
    expect(r.netMarginEur).toBeCloseTo(23.4, 2)
    expect(r.netMarginPercent).toBeCloseTo(23.4, 2)
    expect(r.roiPercent).toBeCloseTo(46.8, 2)
  })

  it('summary picks the best platform per item', () => {
    const cardmarket: SimPlatform = { id: 'cm', name: 'CM', commissionPercent: 7, fixedFee: 0, active: true }
    const s = sim({
      lotPriceJpy: 8100, // 50 €
      items: [{ id: 'a', name: 'A', grade: 'Raw', quantity: 1, purchasePriceJpy: 0, resalePriceEur: 100 }],
    })
    const summary = simulationSummary(s, [EBAY, cardmarket], DEFAULT_SIM_TAX)
    // CM margin: 100 − 7 − 12.3 − 1 − 50 = 29.70 (better than eBay's 23.40)
    expect(summary.totalNetMarginEur).toBeCloseTo(29.7, 2)
    expect(summary.globalRoiPercent).toBeCloseTo(59.4, 2)
  })
})
