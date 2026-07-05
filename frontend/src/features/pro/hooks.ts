import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { proApi, type ProSaleRequest, type ProInvoiceRequest } from './api'

const STALE_TIME = 60 * 1000

export function useProSales() {
  return useQuery({ queryKey: ['pro', 'sales'], queryFn: proApi.sales, staleTime: STALE_TIME })
}

export function useProRecap(year: number, month: number) {
  return useQuery({
    queryKey: ['pro', 'recap', year, month],
    queryFn: () => proApi.recap(year, month),
    staleTime: STALE_TIME,
  })
}

export function useProAnnual(year: number) {
  return useQuery({
    queryKey: ['pro', 'annual', year],
    queryFn: () => proApi.annual(year),
    staleTime: STALE_TIME,
  })
}

export function useProSettings() {
  return useQuery({ queryKey: ['pro', 'settings'], queryFn: proApi.settings, staleTime: 10 * 60 * 1000 })
}

export function useJpyRate() {
  return useQuery({ queryKey: ['pro', 'fx-jpy'], queryFn: proApi.jpyRate, staleTime: 15 * 60 * 1000 })
}

function useInvalidatePro() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['pro'] })
}

export function useCreateSale() {
  const invalidate = useInvalidatePro()
  return useMutation({ mutationFn: (data: ProSaleRequest) => proApi.createSale(data), onSuccess: invalidate })
}

export function useCreateSalesBulk() {
  const invalidate = useInvalidatePro()
  return useMutation({ mutationFn: (sales: ProSaleRequest[]) => proApi.createSalesBulk(sales), onSuccess: invalidate })
}

export function useUpdateSale() {
  const invalidate = useInvalidatePro()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProSaleRequest }) => proApi.updateSale(id, data),
    onSuccess: invalidate,
  })
}

export function useDeleteSale() {
  const invalidate = useInvalidatePro()
  return useMutation({ mutationFn: (id: number) => proApi.deleteSale(id), onSuccess: invalidate })
}

export function useDeclare() {
  const invalidate = useInvalidatePro()
  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) => proApi.declare(year, month),
    onSuccess: invalidate,
  })
}

export function usePutProSettings() {
  const invalidate = useInvalidatePro()
  return useMutation({ mutationFn: (values: Record<string, string>) => proApi.putSettings(values), onSuccess: invalidate })
}

export function useProInvoices() {
  return useQuery({ queryKey: ['pro', 'invoices'], queryFn: proApi.invoices, staleTime: STALE_TIME })
}

export function useNextInvoiceNumber() {
  return useQuery({
    queryKey: ['pro', 'invoices', 'next-number'],
    queryFn: proApi.nextInvoiceNumber,
    staleTime: STALE_TIME,
  })
}

export function useCreateInvoice() {
  const invalidate = useInvalidatePro()
  return useMutation({ mutationFn: (data: ProInvoiceRequest) => proApi.createInvoice(data), onSuccess: invalidate })
}

export function useProSimulations() {
  return useQuery({ queryKey: ['pro', 'simulations'], queryFn: proApi.simulations, staleTime: STALE_TIME })
}

export function useSaveSimulation() {
  const invalidate = useInvalidatePro()
  return useMutation({
    mutationFn: ({ id, simType, name, data }: { id?: number; simType: string; name: string; data: string }) =>
      id ? proApi.updateSimulation(id, { simType, name, data }) : proApi.createSimulation({ simType, name, data }),
    onSuccess: invalidate,
  })
}

export function useDeleteSimulation() {
  const invalidate = useInvalidatePro()
  return useMutation({ mutationFn: (id: number) => proApi.deleteSimulation(id), onSuccess: invalidate })
}
