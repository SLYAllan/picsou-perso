import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { goalsApi, type GoalRequest } from '../lib/api'


export const GOALS_KEY = ['goals'] as const

export function useGoals() {
  return useQuery({
    queryKey: GOALS_KEY,
    queryFn: goalsApi.list,
  })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GoalRequest) => goalsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOALS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: GoalRequest }) => goalsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOALS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => goalsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GOALS_KEY })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useGoalMonths(id: number | null) {
  return useQuery({
    queryKey: ['goals', id, 'months'],
    queryFn: () => goalsApi.getMonths(id!),
    enabled: id != null,
  })
}

export function useSetMonthOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ym, amount }: { id: number; ym: string; amount: number }) =>
      goalsApi.setMonthOverride(id, ym, amount),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['goals', id, 'months'] })
    },
  })
}

export function useDeleteMonthOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ym }: { id: number; ym: string }) =>
      goalsApi.deleteMonthOverride(id, ym),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['goals', id, 'months'] })
    },
  })
}
