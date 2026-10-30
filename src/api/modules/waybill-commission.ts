import { useSupabase } from '@/hooks/core/useSupabase'

export type WaybillCommissionLegKind = 'forward' | 'return'

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
  legKind: WaybillCommissionLegKind
  availableLegKinds: WaybillCommissionLegKind[]
  estimate: WaybillCommissionEstimate | null
  history: WaybillCommissionAudit[]
}

const { supabase, responseHandle } = useSupabase()

export async function fetchWaybillCommission(
  waybillId: string,
  legKind: WaybillCommissionLegKind = 'forward'
): Promise<WaybillCommissionSummary> {
  const result = await responseHandle<WaybillCommissionSummary>(
    () =>
      supabase.rpc('tms_get_waybill_leg_commission_secure', {
        p_waybill_id: waybillId,
        p_leg_kind: legKind
      }),
    { showErrorMessage: false }
  )
  if (result.error || !result.data) throw result.error ?? new Error('司机提成资料加载失败')
  const data = result.data
  const kinds: WaybillCommissionLegKind[] = ['forward', 'return']
  const available = Array.isArray(data.availableLegKinds)
    ? kinds.filter((kind) => data.availableLegKinds.includes(kind))
    : []
  if (data.legKind !== legKind || !available.includes(legKind))
    throw new Error('提成货段资料不完整，请重新加载后核对')
  return { ...data, availableLegKinds: available }
}

export async function overrideWaybillLegCommission(
  waybillId: string,
  legKind: WaybillCommissionLegKind,
  amount: number,
  reason: string
): Promise<void> {
  const result = await responseHandle(
    () =>
      supabase.rpc('tms_override_waybill_leg_commission_secure', {
        p_waybill_id: waybillId,
        p_leg_kind: legKind,
        p_amount: amount,
        p_reason: reason
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
}
