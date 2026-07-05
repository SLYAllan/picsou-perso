import { api } from '@/lib/api-client'

// --- Compta ---

export interface ProSale {
  id: number
  saleDate: string
  name: string
  reference: string
  itemType: string
  platform: string
  salePrice: number
  purchasePrice: number
  shippingCost: number
  platformCommission: number
  packagingCost: number
  notes: string
  chargesSociales: number
  totalCouts: number
  beneficeNet: number
  margeNette: number
}

export interface ProSaleRequest {
  saleDate: string
  name?: string
  reference?: string
  itemType?: string
  platform?: string
  salePrice: number
  purchasePrice?: number
  shippingCost?: number
  platformCommission?: number
  packagingCost?: number
  notes?: string
}

export interface CategoryStats {
  count: number
  ca: number
  purchase: number
  commission: number
  packaging: number
  shipping: number
  totalCosts: number
  benefice: number
  marge: number
}

export interface RecapResponse {
  month: number
  year: number
  byType: Record<string, CategoryStats>
  totals: CategoryStats
  urssaf: {
    ca: number
    cotisationsSociales: number
    cfp: number
    versementLiberatoire: number
    totalDue: number
  }
  declaration: { declared: boolean; declaredAt: string | null }
  seuil: { annuel: number; caCumule: number; restant: number; pourcentageUtilise: number }
}

export interface PlatformStats {
  platform: string
  count: number
  ca: number
  totalCommission: number
  avgCommissionPct: number
  beneficeNet: number
  margeNette: number
}

export interface AnnualResponse {
  year: number
  monthly: { month: number; ca: number; benefice: number; count: number }[]
  totalCa: number
  totalBenefice: number
  totalCount: number
  urssafPaid: number
  seuil: { annuel: number; caCumule: number; restant: number; pourcentageUtilise: number }
  byPlatform: PlatformStats[]
}

export interface DeclarationResponse {
  year: number
  month: number
  totalCa: number
  urssafAmount: number
  cfpAmount: number
  vflAmount: number
  totalDue: number
  declared: boolean
  declaredAt: string | null
}

// --- Invoices ---

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface ProInvoice {
  id: number
  invoiceNumber: string
  invoiceDate: string
  clientName: string
  clientAddress: string
  clientEmail: string
  items: InvoiceItem[]
  shippingCost: number
  subtotal: number
  total: number
  notes: string
  createdAt: string
}

export interface ProInvoiceRequest {
  invoiceDate: string
  clientName: string
  clientAddress?: string
  clientEmail?: string
  items: InvoiceItem[]
  shippingCost?: number
  notes?: string
}

// --- One-shot pokecalc import ---

export interface PokecalcExport {
  sales: ProSaleRequest[]
  invoices: (Omit<ProInvoiceRequest, 'items'> & { invoiceNumber: string; items: InvoiceItem[]; subtotal?: number; total?: number })[]
  declarations: {
    year: number
    month: number
    totalCa: number
    urssafAmount: number
    cfpAmount: number
    vflAmount: number
    totalDue: number
    declared: boolean
    declaredAt: string | null
  }[]
}

export interface ImportResult {
  salesImported: number
  invoicesImported: number
  declarationsImported: number
}

// --- Simulations ---

export interface ProSimulation {
  id: number
  simType: 'cards' | 'accessories'
  name: string
  data: string // full simulation JSON (client-side format)
  createdAt: string
  updatedAt: string
}

export const proApi = {
  sales: () => api.get<ProSale[]>('/pro/sales').then(r => r.data),
  createSale: (data: ProSaleRequest) => api.post<ProSale>('/pro/sales', data).then(r => r.data),
  createSalesBulk: (sales: ProSaleRequest[]) =>
    api.post<ProSale[]>('/pro/sales/bulk', { sales }).then(r => r.data),
  updateSale: (id: number, data: ProSaleRequest) =>
    api.put<ProSale>(`/pro/sales/${id}`, data).then(r => r.data),
  deleteSale: (id: number) => api.delete(`/pro/sales/${id}`).then(() => undefined),

  recap: (year: number, month: number) =>
    api.get<RecapResponse>('/pro/recap', { params: { year, month } }).then(r => r.data),
  annual: (year: number) =>
    api.get<AnnualResponse>('/pro/annual', { params: { year } }).then(r => r.data),
  declare: (year: number, month: number) =>
    api.post<DeclarationResponse>('/pro/declarations', { year, month }).then(r => r.data),

  settings: () => api.get<Record<string, string>>('/pro/settings').then(r => r.data),
  putSettings: (values: Record<string, string>) =>
    api.put<Record<string, string>>('/pro/settings', values).then(r => r.data),

  invoices: () => api.get<ProInvoice[]>('/pro/invoices').then(r => r.data),
  nextInvoiceNumber: () =>
    api.get<{ invoiceNumber: string }>('/pro/invoices/next-number').then(r => r.data.invoiceNumber),
  createInvoice: (data: ProInvoiceRequest) =>
    api.post<ProInvoice>('/pro/invoices', data).then(r => r.data),

  simulations: () => api.get<ProSimulation[]>('/pro/simulations').then(r => r.data),
  createSimulation: (data: { simType: string; name: string; data: string }) =>
    api.post<ProSimulation>('/pro/simulations', data).then(r => r.data),
  updateSimulation: (id: number, data: { simType: string; name: string; data: string }) =>
    api.put<ProSimulation>(`/pro/simulations/${id}`, data).then(r => r.data),
  deleteSimulation: (id: number) => api.delete(`/pro/simulations/${id}`).then(() => undefined),

  importData: (payload: PokecalcExport) =>
    api.post<ImportResult>('/pro/import', payload).then(r => r.data),

  jpyRate: () => api.get<{ jpyPerEur: number | null }>('/pro/fx/jpy').then(r => r.data.jpyPerEur),
}
