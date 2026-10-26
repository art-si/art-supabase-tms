import { omit } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'

export type DriverCommissionMethod =
  'fixed_per_trip' | 'per_km' | 'per_ton_km' | 'per_volume' | 'freight_percent'

export interface DriverCommissionRule {
  id?: string
  driverId: string
  ruleName: string
  vehicleTypeProfileId: string | null
  vehicleId: string | null
  origin: string
  destination: string
  direction: 'forward' | 'return'
  weightMinTons: number | null
  weightMaxTons: number | null
  volumeMinM3: number | null
  volumeMaxM3: number | null
  effectiveFrom: string
  effectiveTo: string | null
  method: DriverCommissionMethod
  rate: number
  enabled: boolean
  remark: string
  versionNo?: number
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export async function fetchDriverCommissionRules(driverId: string) {
  const result = await responseHandle<{ records: DriverCommissionRule[]; total: number }>(
    () => supabase.rpc('tms_list_driver_commission_rules_secure', { p_driver_id: driverId }),
    { showErrorMessage: true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function saveDriverCommissionRule(id: string | null, payload: DriverCommissionRule) {
  const data = omit(payload, ['id', 'versionNo'])
  return await responseHandle<DriverCommissionRule>(
    () =>
      supabase.rpc('tms_save_driver_commission_rule_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep(data)
      }),
    { showMessage: true, breakReturn: true }
  )
}
