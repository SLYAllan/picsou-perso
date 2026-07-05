import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SalesTab } from './SalesTab'
import { RecapTab } from './RecapTab'
import { InvoicesTab } from './InvoicesTab'
import { SimulatorTab } from './SimulatorTab'

/** Pro suite (ported from pokecalc): resale bookkeeping, URSSAF recap, invoices, Japan simulator. */
export function ProPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <PageHeader title={t('pro.title')} />
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">{t('pro.tabs.sales')}</TabsTrigger>
          <TabsTrigger value="recap">{t('pro.tabs.recap')}</TabsTrigger>
          <TabsTrigger value="invoices">{t('pro.tabs.invoices')}</TabsTrigger>
          <TabsTrigger value="simulator">{t('pro.tabs.simulator')}</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4"><SalesTab /></TabsContent>
        <TabsContent value="recap" className="mt-4"><RecapTab /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab /></TabsContent>
        <TabsContent value="simulator" className="mt-4"><SimulatorTab /></TabsContent>
      </Tabs>
    </div>
  )
}
