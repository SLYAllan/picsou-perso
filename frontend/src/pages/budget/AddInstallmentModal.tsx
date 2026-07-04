import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateInstallment } from '@/features/budget/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumericInput } from '@/components/shared/NumericInput'
import { DateInput } from '@/components/shared/DateInput'
import { parseAmount } from '@/lib/utils'
import type { AccountScope } from '@/types/api'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface AddInstallmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultScope: AccountScope
}

export function AddInstallmentModal({ open, onOpenChange, defaultScope }: AddInstallmentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Content key="content" defaultScope={defaultScope} onClose={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function Content({ defaultScope, onClose }: { defaultScope: AccountScope; onClose: () => void }) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [installments, setInstallments] = useState('4')
  const [scope, setScope] = useState<AccountScope>(defaultScope)
  const createInstallment = useCreateInstallment()

  const valid = label.trim() !== '' && (parseAmount(amount) || 0) > 0 && startDate !== ''

  async function handleSubmit() {
    await createInstallment.mutateAsync({
      label: label.trim(),
      totalAmount: parseAmount(amount),
      startDate,
      installments: Math.max(2, Math.round(parseAmount(installments) || 4)),
      scope,
    })
    onClose()
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{t('budget.addInstallment')}</DialogTitle>
        <DialogDescription>{t('budget.addInstallmentDesc')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="inst-label">{t('budget.installmentLabel')}</Label>
          <Input id="inst-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="PayPal 4x — PC portable" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="inst-amount">{t('budget.totalAmount')}</Label>
            <NumericInput id="inst-amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="399.99" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inst-count">{t('budget.installmentsCount')}</Label>
            <NumericInput id="inst-count" value={installments} onChange={e => setInstallments(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="inst-date">{t('budget.firstPayment')}</Label>
            <DateInput id="inst-date" value={startDate} onChange={setStartDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inst-scope">{t('accounts.scope.label')}</Label>
            <select
              id="inst-scope"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none focus:border-ring"
              value={scope}
              onChange={e => setScope(e.target.value as AccountScope)}
            >
              <option value="PERSONAL">{t('accounts.scope.PERSONAL')}</option>
              <option value="BUSINESS">{t('accounts.scope.BUSINESS')}</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('budget.installmentHint')}</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={createInstallment.isPending}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!valid || createInstallment.isPending}>
          {createInstallment.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
