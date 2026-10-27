import { buildSupabaseRpcRange } from '@/utils/supabase'
import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeBooleanFilter, withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiFeedbackOptions, ApiRequestOptions } from '@/types/api/request'
import type { QueryResult } from '@/types/api/response'
import { pickDefinedPayload } from './payload'

type Driver = Api.Tms.BasicData.Driver
type DriverProfile = Api.Tms.BasicData.DriverProfile
type DriverWritePayload = Omit<Driver, 'carrierId'> & {
  carrierId: string | null
  profile?: DriverProfile
}
type DriverSearchParams = Api.Tms.BasicData.DriverSearchParams
type DriverOption = Api.Tms.BasicData.DriverOption
type DriverAssignedVehicle = Api.Tms.BasicData.DriverAssignedVehicle
type DriverEmployeeOption = Api.Tms.BasicData.DriverEmployeeOption

export interface DriverCertificateRecord {
  id: string
  certificateType: string
  certificateNo: string
  issueDate: string | null
  validFrom: string | null
  expiresOn: string
  responsibleName: string
  status: string
  attachments: { name: string; url: string }[]
}

export interface DriverInvitation {
  id: string
  phone: string
  driverOwnership: string
  carrierId: string | null
  status: 'pending' | 'profile_created'
  linkedDriverId: string | null
  requestedAt: string
}

export interface DriverImportResult {
  processed: number
  succeeded: number
  failed: number
  records: { rowNumber: number; success: boolean; id: string | null; error: string | null }[]
}

interface DriverOptionParams extends Partial<
  Pick<DriverOption, 'carrierId' | 'driverName' | 'driverType'>
> {
  ids?: string[]
  includeDisabled?: boolean
  maxRows?: number
}

interface SecureListPayload<TRecord, TAccess extends Record<string, string>> {
  records: TRecord[]
  total: number
  fieldAccess?: TAccess
}

interface DriverEmployeeOptionParams {
  keyword?: string
  from?: number
  to?: number
}

interface DriverEmployeeOptionPayload {
  records: DriverEmployeeOption[]
  total: number
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

const DRIVER_PAYLOAD_KEYS = [
  'employeeId',
  'carrierId',
  'driverName',
  'phone',
  'gender',
  'idCardNo',
  'licenseType',
  'driverType',
  'licenseExpireDate',
  'homeAddress',
  'emergencyContactName',
  'emergencyContactPhone',
  'enabled',
  'idCardFrontUrl',
  'idCardBackUrl',
  'driverLicenseFrontUrl',
  'driverLicenseBackUrl',
  'remark'
] as const satisfies readonly (keyof Driver)[]

export async function fetchDriverEmployeeOptions(
  params: DriverEmployeeOptionParams,
  options?: ApiRequestOptions
) {
  const from = Math.max(params.from ?? 0, 0)
  const result = await responseHandle<DriverEmployeeOptionPayload>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_driver_employee_options_secure', {
          ...buildSupabaseRpcRange(from, params.to ?? from + 9),
          p_keyword: normalizeNullableText(String(params.keyword ?? ''))
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

const toDriverListRpcParams = (
  params: DriverSearchParams & { ids?: string[]; maxRows?: number },
  purpose: 'list' | 'export'
) => {
  const from = purpose === 'export' ? 0 : Math.max(params.from ?? 0, 0)
  const requestedTo = purpose === 'export' ? Math.max((params.maxRows ?? 10000) - 1, 0) : params.to
  return {
    ...buildSupabaseRpcRange(from, requestedTo ?? 9),
    p_record_id: params.recordId || null,
    p_carrier_id: params.carrierId || null,
    p_driver_type: params.driverType || null,
    p_gender: params.gender || null,
    p_enabled: normalizeBooleanFilter(params.enabled) ?? null,
    p_keyword: normalizeNullableText(String(params.keyword ?? '')),
    p_create_time_from: params.createTimeRange?.[0]
      ? toDateStartTimestamp(params.createTimeRange[0])
      : null,
    p_create_time_to: params.createTimeRange?.[1]
      ? toDateEndTimestamp(params.createTimeRange[1])
      : null,
    p_ids: params.ids?.length ? params.ids : null,
    p_purpose: purpose
  }
}

export async function fetchDriverList(params: DriverSearchParams, options?: ApiRequestOptions) {
  const result = await responseHandle<
    SecureListPayload<Driver, Api.Tms.BasicData.DriverFieldAccessMap>
  >(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_drivers_secure', toDriverListRpcParams(params, 'list')),
        options
      ),
    { showErrorMessage: true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function exportDriverList(
  params: DriverSearchParams & { ids?: string[]; maxRows?: number }
) {
  const result = await responseHandle<
    SecureListPayload<Driver, Api.Tms.BasicData.DriverFieldAccessMap>
  >(() => supabase.rpc('tms_list_drivers_secure', toDriverListRpcParams(params, 'export')), {
    showErrorMessage: true
  })
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function fetchDriverDetail(id: string, options: ApiFeedbackOptions = {}) {
  return await responseHandle<Driver | null>(
    () => supabase.rpc('tms_get_driver_secure', { p_id: id }),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
}

export async function fetchDriverProfile(driverId: string) {
  return await responseHandle<DriverProfile | null>(
    () => supabase.rpc('tms_get_driver_profile_secure', { p_driver_id: driverId }),
    { showErrorMessage: true }
  )
}

export async function fetchDriverCertificates(driverId: string) {
  const result = await responseHandle<{ records: DriverCertificateRecord[]; total: number }>(
    () => supabase.rpc('tms_list_driver_certificates_secure', { p_driver_id: driverId }),
    { showErrorMessage: true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function fetchDriverInvitations() {
  const result = await responseHandle<{ records: DriverInvitation[]; total: number }>(
    () => supabase.rpc('tms_list_driver_invitations_secure', { p_from: 0, p_to: 19 }),
    { showErrorMessage: true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function fetchDriverInvitation(id: string) {
  return await responseHandle<DriverInvitation | null>(
    () => supabase.rpc('tms_get_driver_invitation_secure', { p_id: id }),
    { showErrorMessage: true }
  )
}

export async function createDriverInvitation(input: {
  phone: string
  driverOwnership: string
  carrierId: string | null
}) {
  return await responseHandle<DriverInvitation>(
    () =>
      supabase.rpc('tms_create_driver_invitation_secure', {
        p_phone: input.phone,
        p_driver_ownership: input.driverOwnership,
        p_carrier_id: input.carrierId,
        p_target_tenant_id: null
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function importDrivers(rows: Array<Record<string, unknown>>) {
  return await responseHandle<DriverImportResult>(
    () =>
      supabase.rpc('tms_import_drivers_secure', {
        p_rows: keysToSnakeDeep(rows),
        p_target_tenant_id: null
      }),
    { showErrorMessage: true, breakReturn: true }
  )
}

export async function fetchDriverOptions(
  params: DriverOptionParams = {},
  options?: ApiRequestOptions
) {
  const { carrierId, driverName, driverType, ids, includeDisabled = false, maxRows = 200 } = params
  return await responseHandle<DriverOption[]>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_driver_options_secure', {
          p_carrier_id: carrierId || null,
          p_driver_name: normalizeNullableText(String(driverName ?? '')),
          p_driver_type: driverType || null,
          p_ids: ids?.length ? ids : null,
          p_include_disabled: includeDisabled,
          p_max_rows: maxRows
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function fetchDriverListByCarrierId(carrierId: string) {
  return await responseHandle<Driver[]>(
    () => supabase.rpc('tms_list_drivers_by_carrier_secure', { p_carrier_id: carrierId }),
    { showErrorMessage: true }
  )
}

export async function fetchDriverAssignedVehicles(
  params: { driverId: string; carrierId: string },
  options?: ApiRequestOptions
) {
  const { driverId, carrierId } = params
  if (!UUID_PATTERN.test(driverId)) {
    throw new Error('司机标识无效，请刷新页面后重试')
  }

  try {
    const result = await responseHandle<DriverAssignedVehicle[]>(
      () =>
        withRequestOptions(
          supabase.rpc('vms_list_driver_assigned_vehicles_secure', {
            p_driver_id: driverId,
            p_carrier_id: carrierId || null
          }),
          options
        ),
      { showErrorMessage: false, breakReturn: true }
    )
    const data = result.data ?? []
    return { data, total: data.length, error: null } satisfies QueryResult<DriverAssignedVehicle[]>
  } catch (error) {
    return { data: null, error } satisfies QueryResult<DriverAssignedVehicle[]>
  }
}

export async function addDriver(params: DriverWritePayload) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('tms_create_driver_secure', {
        p_payload: keysToSnakeDeep({
          ...pickDefinedPayload(params, DRIVER_PAYLOAD_KEYS),
          ...(params.tenantId ? { targetTenantId: params.tenantId } : {}),
          ...(params.profile ? { profile: params.profile } : {})
        })
      }),
    { showMessage: true, breakReturn: true }
  )
  return { ...result, data: result.data ? { id: result.data } : null }
}

export async function editDriver(params: DriverWritePayload) {
  const { id, ...data } = params
  if (!id) throw new Error('司机 ID 不能为空')
  return await responseHandle<Driver>(
    () =>
      supabase.rpc('tms_update_driver_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep({
          ...pickDefinedPayload(data, DRIVER_PAYLOAD_KEYS),
          ...(data.profile ? { profile: data.profile } : {})
        })
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function deleteDriver(id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_delete_driver_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function deleteDriverBatch(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('tms_delete_drivers_secure', { p_ids: ids }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}
