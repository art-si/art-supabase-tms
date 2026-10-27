import { useSupabase } from '@/hooks/core/useSupabase'

export interface WaybillCommissionEstimate {
  amount: number | null
  matched: boolean
  snapshot: {
    ruleId?: string
    versionNo?: number
    method?: string
    rate?: number
  } | null
  baseEstimate?: WaybillCommissionEstimate | null
  manualOverride?: {
    amount: number
    reason: string
    actorAuthUserId: string
    at: string
  }
}

export interface WaybillCommissionAudit {
  id: string
  previousEstimate: WaybillCommissionEstimate | null
  amount: number
  reason: string
  actorAuthUserId: string
  actorName: string
  createdAt: string
}

export interface WaybillCommissionSummary {
  waybillId: string
  waybillNo: string
  status: string
  driverId: string | null
  estimate: WaybillCommissionEstimate | null
  history: WaybillCommissionAudit[]
}

const { supabase, responseHandle } = useSupabase()

export async function fetchWaybillCommission(waybillId: string): Promise<WaybillCommissionSummary> {
  const result = await responseHandle<WaybillCommissionSummary>(
    () => supabase.rpc('tms_get_waybill_commission_secure', { p_waybill_id: waybillId }),
    { showErrorMessage: false }
  )
  if (result.error || !result.data) throw result.error ?? new Error('司机提成资料加载失败')
  return result.data
}

export async function overrideForwardCommission(
  waybillId: string,
  amount: number,
  reason: string
): Promise<void> {
  const result = await responseHandle(
    () =>
      supabase.rpc('tms_override_forward_commission_secure', {
        p_waybill_id: waybillId,
        p_amount: amount,
        p_reason: reason
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}
