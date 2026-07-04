import { api } from '@/lib/api-client'

export interface CollectibleGame {
  categoryId: number
  name: string
}

export interface CollectibleGroup {
  groupId: number
  name: string
  abbreviation: string | null
  publishedOn: string | null
}

export interface CollectibleProduct {
  productId: number
  name: string
  imageUrl: string | null
  /** TCGplayer market prices in USD, keyed by sub-type code (N, F, H, RH...) */
  pricesUsd: Record<string, number>
}

export interface CollectibleCard {
  holdingId: number
  ticker: string
  categoryId: number
  gameName: string
  name: string
  imageUrl: string | null
  quantity: number
  averageBuyIn: number | null
  currentPriceEur: number | null
  currentValueEur: number | null
  costBasisEur: number
  pnlEur: number | null
  pnlPercent: number | null
  createdAt: string
}

export interface AddCardRequest {
  categoryId: number
  groupId: number
  productId: number
  subTypeCode: string
  quantity: number
  purchasePriceEur: number
  name: string
  imageUrl?: string
}

export interface UpdateCardRequest {
  quantity: number
  averageBuyIn?: number
}

export const collectionApi = {
  games: () =>
    api.get<CollectibleGame[]>('/collectibles/games').then(r => r.data),

  groups: (categoryId: number) =>
    api.get<CollectibleGroup[]>(`/collectibles/games/${categoryId}/groups`).then(r => r.data),

  products: (categoryId: number, groupId: number) =>
    api.get<CollectibleProduct[]>(`/collectibles/games/${categoryId}/groups/${groupId}/products`).then(r => r.data),

  cards: () =>
    api.get<CollectibleCard[]>('/collectibles/cards').then(r => r.data),

  addCard: (data: AddCardRequest) =>
    api.post<CollectibleCard>('/collectibles/cards', data).then(r => r.data),

  updateCard: (holdingId: number, data: UpdateCardRequest) =>
    api.put<CollectibleCard>(`/collectibles/cards/${holdingId}`, data).then(r => r.data),

  deleteCard: (holdingId: number) =>
    api.delete(`/collectibles/cards/${holdingId}`).then(() => undefined),
}

/** Aggregate portfolio-style totals over the collection. */
export function summarizeCards(cards: CollectibleCard[]): {
  totalValue: number
  totalCost: number
  pnl: number
  pnlPercent: number | null
} {
  const totalValue = cards.reduce((s, c) => s + (c.currentValueEur ?? c.costBasisEur), 0)
  const totalCost = cards.reduce((s, c) => s + c.costBasisEur, 0)
  const pnl = totalValue - totalCost
  const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : null
  return { totalValue, totalCost, pnl, pnlPercent }
}
