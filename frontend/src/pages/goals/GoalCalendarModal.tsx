import { useState } from 'react'
import { motion } from 'motion/react'
import { X, Loader2 } from 'lucide-react'
import { GlassCard } from '../../components/shared'
import { formatEur } from '../../lib/utils'
import { useGoalMonths, useSetMonthOverride, useDeleteMonthOverride } from '../../hooks/useGoals'
import type { GoalProgress, GoalMonthEntry } from '../../lib/api'

interface Props {
  goal: GoalProgress
  onClose: () => void
}

const MONTH_ABBR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

function isPastOrCurrent(ym: string): boolean {
  const now = new Date()
  const [y, m] = ym.split('-').map(Number)
  return y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)
}

function isCurrentMonth(ym: string): boolean {
  const now = new Date()
  const [y, m] = ym.split('-').map(Number)
  return y === now.getFullYear() && m === now.getMonth() + 1
}

function monthAbbr(ym: string): string {
  return MONTH_ABBR[parseInt(ym.split('-')[1]) - 1]
}

function fullMonthName(ym: string): string {
  const [year, month] = ym.split('-')
  return new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function groupByYear(months: GoalMonthEntry[]): { year: number; entries: GoalMonthEntry[] }[] {
  const map = new Map<number, GoalMonthEntry[]>()
  for (const e of months) {
    const year = parseInt(e.yearMonth.split('-')[0])
    if (!map.has(year)) map.set(year, [])
    map.get(year)!.push(e)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, entries]) => ({ year, entries }))
}

interface ArcProps {
  color: string
  pct: number
  label: string
  labelClass: string
}

function getArcProps(entry: GoalMonthEntry, isPast: boolean): ArcProps {
  if (!isPast) {
    return { color: '#e5e7eb', pct: 0, label: '···', labelClass: 'text-gray-300' }
  }
  if (entry.effective == null) {
    return { color: '#e5e7eb', pct: 0, label: '–', labelClass: 'text-gray-300' }
  }
  const obj = entry.objective ?? 0
  const ratio = obj > 0 ? entry.effective / obj : 1
  if (ratio >= 1) {
    return { color: '#22c55e', pct: ratio, label: `${Math.round(ratio * 100)}%`, labelClass: 'text-green-600' }
  }
  if (ratio >= 0.6) {
    return { color: '#f59e0b', pct: ratio, label: `${Math.round(ratio * 100)}%`, labelClass: 'text-amber-500' }
  }
  return { color: '#f43f5e', pct: ratio, label: `${Math.round(ratio * 100)}%`, labelClass: 'text-red-500' }
}

function ProgressRing({ pct, color, size = 60, stroke = 5 }: {
  pct: number; color: string; size?: number; stroke?: number
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, pct)) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function GoalCalendarModal({ goal, onClose }: Props) {
  const { data: months, isLoading } = useGoalMonths(goal.id)
  const setOverride = useSetMonthOverride()
  const deleteOverride = useDeleteMonthOverride()

  const [selectedYm, setSelectedYm] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleClose = () => {
    setSelectedYm(null)
    onClose()
  }

  const selectMonth = (entry: GoalMonthEntry) => {
    if (selectedYm === entry.yearMonth) {
      setSelectedYm(null)
    } else {
      setSelectedYm(entry.yearMonth)
      setEditValue(String(entry.effective ?? entry.objective ?? ''))
    }
  }

  const handleSave = async () => {
    if (!selectedYm) return
    const amount = parseFloat(editValue)
    if (isNaN(amount) || amount < 0) return
    await setOverride.mutateAsync({ id: goal.id, ym: selectedYm, amount })
  }

  const handleReset = async () => {
    if (!selectedYm) return
    await deleteOverride.mutateAsync({ id: goal.id, ym: selectedYm })
  }

  const pastMonths = (months ?? []).filter(e => isPastOrCurrent(e.yearMonth))
  const achievedCount = pastMonths.filter(
    e => e.effective != null && e.objective != null && e.effective >= e.objective
  ).length

  const selectedEntry = selectedYm
    ? (months ?? []).find(e => e.yearMonth === selectedYm) ?? null
    : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <GlassCard rounded="2xl" className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-gray-900" style={{ fontSize: 17, fontWeight: 600 }}>
              {goal.name}
            </h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-5">
            <p className="text-gray-400" style={{ fontSize: 12, fontWeight: 500 }}>
              Cible mensuelle : {formatEur(goal.monthlyNeeded)}
            </p>
            {!isLoading && pastMonths.length > 0 && (
              <span
                className="px-2 py-0.5 rounded-full bg-green-500/[0.08] text-green-600"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {achievedCount}/{pastMonths.length} ✓
              </span>
            )}
          </div>

          {/* Month grid grouped by year */}
          {isLoading ? (
            <div>
              <div className="h-4 w-10 rounded bg-black/[0.04] animate-pulse mb-3" />
              <div className="grid grid-cols-6 gap-x-2 gap-y-3">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-[52px] h-[52px] rounded-full bg-black/[0.04] animate-pulse" />
                    <div className="h-2.5 w-5 rounded bg-black/[0.04] animate-pulse mt-0.5" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groupByYear((months ?? []).filter(e => isPastOrCurrent(e.yearMonth))).map(({ year, entries }) => (
                <div key={year}>
                  <p
                    className="text-gray-400 mb-3"
                    style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}
                  >
                    {year}
                  </p>
                  <div className="grid grid-cols-6 gap-x-2 gap-y-3">
                    {entries.map(entry => {
                      const isCurrent = isCurrentMonth(entry.yearMonth)
                      const isSelected = selectedYm === entry.yearMonth
                      const hasOverride = entry.override != null
                      const { color, pct, label, labelClass } = getArcProps(entry, true)

                      const ringClass = [
                        'relative rounded-full',
                        isSelected
                          ? 'ring-2 ring-violet-500 ring-offset-1'
                          : hasOverride
                            ? 'ring-2 ring-violet-300 ring-offset-1'
                            : isCurrent
                              ? 'ring-1 ring-violet-300 ring-offset-1'
                              : '',
                      ].filter(Boolean).join(' ')

                      return (
                        <motion.div
                          key={entry.yearMonth}
                          animate={{ scale: isSelected ? 1.08 : 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          className="flex flex-col items-center gap-0.5 cursor-pointer"
                          onClick={() => selectMonth(entry)}
                        >
                          <div className={ringClass}>
                            <ProgressRing pct={pct} color={color} size={52} stroke={5} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={labelClass} style={{ fontSize: 11, fontWeight: 700 }}>
                                {label}
                              </span>
                            </div>
                            {hasOverride && (
                              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-500 border border-white" />
                            )}
                          </div>
                          <span className="text-gray-600" style={{ fontSize: 11, fontWeight: 600 }}>
                            {monthAbbr(entry.yearMonth)}
                          </span>
                          <span className="text-gray-400" style={{ fontSize: 11 }}>
                            {entry.effective != null
                              ? formatEur(entry.effective, { compact: true })
                              : '—'}
                          </span>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Always-visible edit panel */}
          <div className="mt-5 pt-4 border-t border-black/[0.05]">
            {selectedEntry == null ? (
              <p className="text-gray-300 text-center py-3" style={{ fontSize: 12, fontWeight: 500 }}>
                Cliquez sur un mois pour modifier l'objectif
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-gray-700" style={{ fontSize: 13, fontWeight: 600 }}>
                      {fullMonthName(selectedEntry.yearMonth)}
                    </p>
                    {selectedEntry.override != null && (
                      <span
                        className="px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500"
                        style={{ fontSize: 9, fontWeight: 600 }}
                      >
                        modifié
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedYm(null)}
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="relative mb-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    placeholder={String(goal.monthlyNeeded)}
                    className="h-9 pl-3 pr-8 w-full rounded-[10px] bg-black/[0.03] text-[13px] border-none outline-none focus:ring-2 focus:ring-gray-900/10"
                    autoFocus
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    style={{ fontSize: 13 }}
                  >
                    €
                  </span>
                </div>

                <button
                  onClick={() => setEditValue(String(goal.monthlyNeeded))}
                  className="w-full mb-3 h-8 px-3 rounded-[10px] bg-violet-500/[0.07] text-violet-600 flex items-center justify-between hover:bg-violet-500/[0.12] transition-colors"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  <span>Objectif calculé</span>
                  <span className="flex items-center gap-1">
                    {formatEur(goal.monthlyNeeded)}
                    <span className="text-violet-400">→ Appliquer</span>
                  </span>
                </button>

                <div className="flex gap-2">
                  {selectedEntry.override != null && (
                    <button
                      onClick={handleReset}
                      disabled={deleteOverride.isPending}
                      className="flex-1 h-9 bg-black/[0.04] text-gray-500 rounded-[10px] text-[12px] font-[600] flex items-center justify-center gap-1.5 disabled:opacity-60 hover:bg-black/[0.07] transition-colors"
                    >
                      {deleteOverride.isPending && <Loader2 size={11} className="animate-spin" />}
                      Réinitialiser
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={setOverride.isPending}
                    className="flex-1 h-9 bg-gray-900 text-white rounded-[10px] text-[12px] font-[600] flex items-center justify-center gap-1.5 disabled:opacity-60 hover:bg-gray-800 transition-colors"
                  >
                    {setOverride.isPending && <Loader2 size={11} className="animate-spin" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  )
}
