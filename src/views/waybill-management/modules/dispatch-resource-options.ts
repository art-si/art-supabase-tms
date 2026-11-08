import { prepareVehicleDriverPortraits } from '@/api/vehicle-driver-select'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import {
  fetchDispatchCandidates,
  type DispatchMode,
  type DispatchDriverCandidate,
  type DispatchVehicleCandidate
} from '@tms/api'

export function dispatchResourceKind(mode: DispatchMode, resource: 'vehicle' | 'driver') {
  if (resource === 'vehicle') {
    return mode === 'carrier'
      ? 'carrier_vehicle'
      : mode === 'individual_driver'
        ? 'individual_vehicle'
        : 'vehicle'
  }
  return mode === 'carrier'
    ? 'carrier_driver'
    : mode === 'individual_driver'
      ? 'individual_driver'
      : 'self_driver'
}

export async function fetchDispatchResourceOptions(
  mode: DispatchMode,
  resource: 'vehicle' | 'driver',
  tenantId: string | undefined,
  params: DataSelectFetchParams
) {
  if (!tenantId) throw new Error('运单缺少所属租户，请刷新列表后重试')
  const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  const result = await fetchDispatchCandidates<DispatchVehicleCandidate | DispatchDriverCandidate>({
    kind: dispatchResourceKind(mode, resource),
    tenantId,
    keyword: params.keyword,
    from,
    to
  })
  await prepareVehicleDriverPortraits(result.data)
  return result
}
