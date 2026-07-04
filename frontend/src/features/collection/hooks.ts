import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { collectionApi, type AddCardRequest, type UpdateCardRequest } from './api'

const CATALOG_STALE_TIME = 24 * 60 * 60 * 1000 // tcgcsv catalog changes daily at most
const CARDS_STALE_TIME = 60 * 1000

export function useGames() {
  return useQuery({
    queryKey: ['collection', 'games'],
    queryFn: collectionApi.games,
    staleTime: CATALOG_STALE_TIME,
  })
}

export function useGroups(categoryId: number | null) {
  return useQuery({
    queryKey: ['collection', 'groups', categoryId],
    queryFn: () => collectionApi.groups(categoryId!),
    enabled: categoryId != null,
    staleTime: CATALOG_STALE_TIME,
  })
}

/** Full product list of a set — card search filters client-side over this. */
export function useProducts(categoryId: number | null, groupId: number | null) {
  return useQuery({
    queryKey: ['collection', 'products', categoryId, groupId],
    queryFn: () => collectionApi.products(categoryId!, groupId!),
    enabled: categoryId != null && groupId != null,
    staleTime: CATALOG_STALE_TIME,
  })
}

export function useCards() {
  return useQuery({
    queryKey: ['collection', 'cards'],
    queryFn: collectionApi.cards,
    staleTime: CARDS_STALE_TIME,
  })
}

function useInvalidateCollection() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['collection', 'cards'] })
    // The collection account and its valuation feed accounts + dashboard
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }
}

export function useAddCard() {
  const invalidate = useInvalidateCollection()
  return useMutation({
    mutationFn: (data: AddCardRequest) => collectionApi.addCard(data),
    onSuccess: invalidate,
  })
}

export function useUpdateCard() {
  const invalidate = useInvalidateCollection()
  return useMutation({
    mutationFn: ({ holdingId, data }: { holdingId: number; data: UpdateCardRequest }) =>
      collectionApi.updateCard(holdingId, data),
    onSuccess: invalidate,
  })
}

export function useDeleteCard() {
  const invalidate = useInvalidateCollection()
  return useMutation({
    mutationFn: (holdingId: number) => collectionApi.deleteCard(holdingId),
    onSuccess: invalidate,
  })
}
