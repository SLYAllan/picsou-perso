// Japan-lot resale simulator math — straight port of pokecalc's lib/calculations.ts.
// All pure functions; the simulation JSON persisted via /pro/simulations uses these types.

export interface SimPlatform {
  id: string
  name: string
  commissionPercent: number
  fixedFee: number
  active: boolean
}

export interface SimTaxSettings {
  urssafRate: number
  incomeTaxRate: number
}

export const DEFAULT_SIM_PLATFORMS: SimPlatform[] = [
  { id: 'ebay', name: 'eBay', commissionPercent: 13, fixedFee: 0.3, active: true },
  { id: 'cardmarket', name: 'CardMarket', commissionPercent: 7, fixedFee: 0, active: true },
  { id: 'vinted', name: 'Vinted', commissionPercent: 5, fixedFee: 0, active: true },
  { id: 'tiktok', name: 'TikTok Shop', commissionPercent: 5, fixedFee: 0, active: true },
]

export const DEFAULT_SIM_TAX: SimTaxSettings = { urssafRate: 12.3, incomeTaxRate: 1 }

export const DEFAULT_EXCHANGE_RATE = 162

export const CARD_GRADES = ['Raw', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'CGC 10', 'CGC 9.5', 'CGC 9', 'Other'] as const

export interface SimItem {
  id: string
  name: string
  grade: string // cards only ('' for accessories)
  quantity: number // accessories only (1 for cards)
  purchasePriceJpy: number // manual cost share (manual distribution)
  resalePriceEur: number
}

export interface Simulation {
  lotPriceJpy: number
  proxyFeeJpy: number
  shippingFeeJpy: number
  exchangeRate: number
  distributionMode: 'manual' | 'proportional'
  items: SimItem[]
}

export interface ItemResult {
  acquisitionCostEur: number
  platformFeeEur: number
  urssafEur: number
  incomeTaxEur: number
  netMarginEur: number
  netMarginPercent: number
  roiPercent: number
}

export function totalLotJpy(sim: Simulation): number {
  return sim.lotPriceJpy + sim.proxyFeeJpy + sim.shippingFeeJpy
}

export function totalLotEur(sim: Simulation): number {
  return sim.exchangeRate > 0 ? totalLotJpy(sim) / sim.exchangeRate : 0
}

/** Acquisition cost of each item in EUR, following the distribution mode. */
export function acquisitionCosts(sim: Simulation): number[] {
  const totalEur = totalLotEur(sim)
  const qty = (i: SimItem) => Math.max(1, i.quantity)
  if (sim.distributionMode === 'manual') {
    // Manual JPY purchase prices, proxy/shipping spread proportionally to them
    const manualTotalJpy = sim.items.reduce((s, i) => s + i.purchasePriceJpy * qty(i), 0)
    return sim.items.map(i => {
      const share = manualTotalJpy > 0 ? (i.purchasePriceJpy * qty(i)) / manualTotalJpy : 1 / (sim.items.length || 1)
      return totalEur * share
    })
  }
  // Proportional to expected resale value
  const values = sim.items.map(i => i.resalePriceEur * qty(i))
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) {
    const perItem = totalEur / (values.length || 1)
    return values.map(() => perItem)
  }
  return values.map(v => (v / total) * totalEur)
}

/** pokecalc calculateItemResult: net margin of one item on one platform. */
export function itemResult(
  acquisitionCostEur: number,
  resalePriceEur: number,
  platform: SimPlatform,
  tax: SimTaxSettings,
): ItemResult {
  const platformFeeEur = resalePriceEur * (platform.commissionPercent / 100) + platform.fixedFee
  const urssafEur = resalePriceEur * (tax.urssafRate / 100)
  const incomeTaxEur = resalePriceEur * (tax.incomeTaxRate / 100)
  const netMarginEur = resalePriceEur - platformFeeEur - urssafEur - incomeTaxEur - acquisitionCostEur
  return {
    acquisitionCostEur,
    platformFeeEur,
    urssafEur,
    incomeTaxEur,
    netMarginEur,
    netMarginPercent: resalePriceEur > 0 ? (netMarginEur / resalePriceEur) * 100 : 0,
    roiPercent: acquisitionCostEur > 0 ? (netMarginEur / acquisitionCostEur) * 100 : 0,
  }
}

export interface SimSummary {
  totalInvestmentJpy: number
  totalInvestmentEur: number
  totalRevenueEur: number
  totalNetMarginEur: number
  averageMarginPercent: number
  globalRoiPercent: number
}

/** Summary over all items using each item's BEST active platform. */
export function simulationSummary(sim: Simulation, platforms: SimPlatform[], tax: SimTaxSettings): SimSummary {
  const costs = acquisitionCosts(sim)
  const active = platforms.filter(p => p.active)
  let totalRevenue = 0
  let totalMargin = 0
  sim.items.forEach((item, idx) => {
    const qty = Math.max(1, item.quantity)
    const revenue = item.resalePriceEur * qty
    totalRevenue += revenue
    const results = active.map(p => itemResult(costs[idx] / qty, item.resalePriceEur, p, tax))
    const best = results.length ? Math.max(...results.map(r => r.netMarginEur)) : -costs[idx] / qty
    totalMargin += best * qty
  })
  const totalInvestmentEur = totalLotEur(sim)
  return {
    totalInvestmentJpy: totalLotJpy(sim),
    totalInvestmentEur,
    totalRevenueEur: totalRevenue,
    totalNetMarginEur: totalMargin,
    averageMarginPercent: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0,
    globalRoiPercent: totalInvestmentEur > 0 ? (totalMargin / totalInvestmentEur) * 100 : 0,
  }
}

export function marginLevel(marginPercent: number): 'profitable' | 'close' | 'unprofitable' {
  if (marginPercent >= 15) return 'profitable'
  if (marginPercent >= 5) return 'close'
  return 'unprofitable'
}
