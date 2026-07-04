import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useBudgetCategories, useCreateCategory, useDeleteCategory,
} from '@/features/budget/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Plus, Trash2 } from 'lucide-react'
import type { AccountScope } from '@/types/api'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface CategoryManageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoryManageModal({ open, onOpenChange }: CategoryManageModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Content key="content" />}
    </Dialog>
  )
}

function Content() {
  const { t } = useTranslation()
  const { data: categories } = useBudgetCategories()
  const createCategory = useCreateCategory()
  const deleteCategory = useDeleteCategory()
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState<AccountScope>('PERSONAL')
  const [deleteId, setDeleteId] = useState<number | null>(null)

  async function handleAdd() {
    if (!newName.trim()) return
    await createCategory.mutateAsync({ name: newName.trim(), scope: newScope, color: '#6366f1' })
    setNewName('')
  }

  const byScope = (scope: AccountScope) => (categories ?? []).filter(c => c.scope === scope)

  return (
    <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('budget.manageCategories')}</DialogTitle>
        <DialogDescription>{t('budget.manageCategoriesDesc')}</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        {(['PERSONAL', 'BUSINESS'] as const).map(scope => (
          <div key={scope} className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`accounts.scope.${scope}`)}
            </p>
            {byScope(scope).map(cat => (
              <div key={cat.id} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                <span className="flex-1 text-sm">{cat.name}</span>
                <Button
                  variant="ghost" size="icon"
                  className="size-6 text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(cat.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        ))}

        <div className="flex items-center gap-2 border-t pt-4">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={t('budget.newCategory')}
            className="h-8 flex-1"
          />
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
            value={newScope}
            onChange={e => setNewScope(e.target.value as AccountScope)}
          >
            <option value="PERSONAL">{t('accounts.scope.PERSONAL')}</option>
            <option value="BUSINESS">{t('accounts.scope.BUSINESS')}</option>
          </select>
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createCategory.isPending}>
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setDeleteId(null) }}
        title={t('budget.deleteCategory')}
        description={t('budget.deleteCategoryConfirm')}
        onConfirm={async () => {
          if (deleteId !== null) await deleteCategory.mutateAsync(deleteId)
          setDeleteId(null)
        }}
        loading={deleteCategory.isPending}
        variant="destructive"
      />
    </DialogContent>
  )
}
