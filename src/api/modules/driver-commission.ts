import { pick } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNullableText } from '@/utils/form/normalize'

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
  notificationStatus?: 'unlinked' | 'notified' | 'confirmed'
}

export interface DriverCommissionRevision {
  id: string
  ruleId: string
  versionNo: number
  eventType: 'created' | 'revised'
  recordedAt: string
  actorName: string
  snapshot: Partial<DriverCommissionRule>
  notificationStatus: 'unlinked' | 'notified' | 'confirmed'
  notifiedAt: string | null
  confirmedAt: string | null
  canConfirm: boolean
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()
const COMMISSION_WRITE_KEYS = [
  'driverId',
  'ruleName',
  'vehicleTypeProfileId',
  'vehicleId',
  'origin',
  'destination',
  'direction',
  'weightMinTons',
  'weightMaxTons',
  'volumeMinM3',
  'volumeMaxM3',
  'effectiveFrom',
  'effectiveTo',
  'method',
  'rate',
  'enabled',
  'remark'
] as const satisfies readonly (keyof DriverCommissionRule)[]

export async function fetchDriverCommissionRules(driverId: string) {
  const result = await responseHandle<{ records: DriverCommissionRule[]; total: number }>(
    () => supabase.rpc('tms_list_driver_commission_rules_secure', { p_driver_id: driverId }),
    { showErrorMessage: true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function fetchDriverCommissionRevisions(ruleId: string) {
  const result = await responseHandle<{ records: DriverCommissionRevision[]; total: number }>(
    () => supabase.rpc('tms_list_driver_commission_revisions_secure', { p_rule_id: ruleId }),
    { showErrorMessage: true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error
  }
}

export async function confirmDriverCommissionRevision(revisionId: string) {
  return await responseHandle<{ revisionId: string; versionNo: number; confirmedAt: string }>(
    () =>
      supabase.rpc('tms_confirm_driver_commission_revision_secure', { p_revision_id: revisionId }),
    { breakReturn: true }
  )
}

export interface DriverCommissionNotificationResult {
  total: number
  notified: number
  confirmed: number
  unlinked: number
  missingRevision: number
}

export async function notifyDriverCommissionRules(driverId: string) {
  return await responseHandle<DriverCommissionNotificationResult>(
    () => supabase.rpc('tms_notify_driver_commission_rules_secure', { p_driver_id: driverId }),
    { breakReturn: true }
  )
}

export async function saveDriverCommissionRule(id: string | null, payload: DriverCommissionRule) {
  const data = {
    ...pick(payload, COMMISSION_WRITE_KEYS),
    vehicleTypeProfileId: normalizeNullableText(payload.vehicleTypeProfileId),
    vehicleId: normalizeNullableText(payload.vehicleId)
  }
  return await responseHandle<DriverCommissionRule>(
    () =>
      supabase.rpc('tms_save_driver_commission_rule_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep(data)
      }),
    { showMessage: true, breakReturn: true }
  )
}
