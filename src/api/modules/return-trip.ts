import { useSupabase } from '@/hooks/core/useSupabase'

export interface ReturnTripCandidate {
  id: string
  waybillNo: string
  status: string
  orderId: string
  hasReturnLeg: boolean
}

export interface ReturnTripInput {
  originStation: string
  destinationStation: string
  plannedDepartureAt: string | null
  distanceKm: number | null
  cargoWeightTons: number | null
  cargoVolumeM3: number | null
  freightIncome: number
  informationFee: number
  technicalServiceFee: number
  directTollFee: number
  directMiscFee: number
  sharedCostAllocationPct: number
  remark: string | null
}

export interface ReturnTripSummary {
  waybillId: string
  waybillNo: string
  forwardRevenue: number
  returnRevenue: number
  tripPlannedRevenue: number
  returnDirectPlannedExpense: number
  sharedApprovedToll: number
  returnAllocatedToll: number
  returnProjectedGrossProfit: number
  returnProjectedMargin: number
  forwardCommissionEstimate: { amount?: number | null; matched?: boolean } | null
  returnCommissionEstimate: { amount?: number | null; matched?: boolean } | null
  accountingStatus: 'planned_only'
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

export async function fetchReturnTripCandidates(orderId: string): Promise<ReturnTripCandidate[]> {
  const result = await responseHandle<ReturnTripCandidate[]>(
    () => supabase.rpc('tms_list_return_trip_candidates_secure', { p_order_id: orderId }),
    { showErrorMessage: true }
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export async function createReturnTrip(waybillId: string, input: ReturnTripInput) {
  return await responseHandle<{ id: string; waybillId: string; waybillNo: string }>(
    () =>
      supabase.rpc('tms_create_return_leg_secure', {
        p_waybill_id: waybillId,
        p_payload: keysToSnakeDeep(input)
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function fetchReturnSharedToll(waybillId: string): Promise<number> {
  const result = await responseHandle<number>(
    () => supabase.rpc('tms_get_return_shared_toll_secure', { p_waybill_id: waybillId }),
    { showErrorMessage: true }
  )
  if (result.error) throw result.error
  return Number(result.data ?? 0)
}

export async function fetchReturnTripSummary(waybillId: string): Promise<ReturnTripSummary> {
  const result = await responseHandle<ReturnTripSummary>(
    () => supabase.rpc('tms_get_return_trip_summary_secure', { p_waybill_id: waybillId }),
    { showErrorMessage: true }
  )
  if (result.error || !result.data) throw result.error ?? new Error('返程收益预估不可用')
  return result.data
}
