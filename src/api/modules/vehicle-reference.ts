import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'

export interface TmsVehicleReference {
  id?: string
  carrierId?: string | null
  plateNo: string
  companyName?: string
  vehicleType?: string
  manufacturer?: string
  operationStatus?: string
  primaryDriver?: { driverName?: string } | null
}

export interface TmsVehicleOption {
  id?: string
  carrierId?: string | null
  plateNo: string
  companyName?: string
  vin?: string
  selfNo?: string
  vehicleType?: string
  vehicleTypeProfileId?: string | null
}

export interface TmsVehicleTypeProfile {
  id: string
  category: string
  lengthM: number | null
  volumeM3: number | null
  loadTons: number | null
  status: '1' | '2'
  sort: number
}

interface VehicleReferenceListPayload {
  records: TmsVehicleReference[]
  total: number
}

const { supabase, responseHandle } = useSupabase()

/** Tenant-scoped VMS catalog used for order vehicle specifications. */
export async function fetchTmsVehicleTypeProfiles(tenantId?: string) {
  return await responseHandle<TmsVehicleTypeProfile[]>(
    () =>
      supabase.rpc('vms_list_vehicle_type_profiles_secure', {
        p_tenant_id: tenantId || null,
        p_vehicle_id: null,
        p_carrier_id: null,
        p_include_disabled: false
      }),
    { showErrorMessage: true }
  )
}

/** TMS consumer adapter for the VMS-owned vehicle read contract. */
export async function fetchTmsVehicleReferences(
  params: { carrierId: string; from?: number; to?: number },
  options?: ApiRequestOptions
) {
  const from = Math.max(params.from ?? 0, 0)
  const to = Math.max(params.to ?? 199, from)
  const result = await responseHandle<VehicleReferenceListPayload>(
    () =>
      withRequestOptions(
        supabase.rpc('vms_list_vehicle_archives_secure', {
          p_from: from,
          p_to: to,
          p_record_id: null,
          p_carrier_id: params.carrierId,
          p_plate_no: null,
          p_company_name: null,
          p_vehicle_type: null,
          p_manufacturer: null,
          p_vin: null,
          p_operation_status: null,
          p_audit_status: null,
          p_audit_statuses: null,
          p_create_time_from: null,
          p_create_time_to: null,
          p_ids: null,
          p_purpose: 'list'
        }),
        options
      ),
    { showErrorMessage: true }
  )

  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error
  }
}

export async function fetchTmsVehicleOptions(
  params: { carrierId?: string; plateNo?: string; companyName?: string } = {},
  options?: ApiRequestOptions
) {
  return await responseHandle<TmsVehicleOption[]>(
    () =>
      withRequestOptions(
        supabase.rpc('vms_list_vehicle_archive_options_secure', {
          p_carrier_id: params.carrierId || null,
          p_plate_no: normalizeNullableText(String(params.plateNo ?? '')),
          p_company_name: normalizeNullableText(String(params.companyName ?? '')),
          p_ids: null,
          p_max_rows: 200
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

/** Vehicle choices for one driver's tenant, including platform-all editing. */
export async function fetchTmsDriverCommissionVehicleOptions(tenantId: string, ids?: string[]) {
  return await responseHandle<TmsVehicleOption[]>(
    () =>
      supabase.rpc('vms_list_vehicle_archive_options_for_tenant_secure', {
        p_tenant_id: tenantId,
        p_plate_no: null,
        p_ids: ids?.length ? ids : null,
        p_max_rows: 1000
      }),
    { showErrorMessage: true }
  )
}
