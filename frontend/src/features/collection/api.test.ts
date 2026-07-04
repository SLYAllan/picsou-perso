import { describe, expect, it } from 'vitest'
import { summarizeCards, type CollectibleCard } from './api'

function card(partial: Partial<CollectibleCard>): CollectibleCard {
  return {
    holdingId: 1,
    ticker: 'TCG:89:24344:693380:N',
    categoryId: 89,
    gameName: 'Riftbound',
    name: 'Annie',
    imageUrl: null,
    quantity: 1,
    averageBuyIn: 10,
    currentPriceEur: null,
    currentValueEur: null,
    costBasisEur: 10,
    pnlEur: null,
    pnlPercent: null,
    createdAt: '2026-07-04T00:00:00Z',
    ...partial,
  }
}

describe('summarizeCards', () => {
  it('sums value, cost and pnl over priced cards', () => {
    const summary = summarizeCards([
      card({ costBasisEur: 20, currentValueEur: 30 }),
      card({ costBasisEur: 10, currentValueEur: 5 }),
    ])
    expect(summary.totalValue).toBe(35)
    expect(summary.totalCost).toBe(30)
    expect(summary.pnl).toBe(5)
    expect(summary.pnlPercent).toBeCloseTo(16.67, 1)
  })

  it('falls back to cost basis when a card has no price (no invented pnl)', () => {
    const summary = summarizeCards([card({ costBasisEur: 12, currentValueEur: null })])
    expect(summary.totalValue).toBe(12)
    expect(summary.pnl).toBe(0)
  })

  it('reports null percent on an empty or free collection', () => {
    expect(summarizeCards([]).pnlPercent).toBeNull()
    expect(summarizeCards([card({ costBasisEur: 0, currentValueEur: 3 })]).pnlPercent).toBeNull()
  })
})
