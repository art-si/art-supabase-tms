import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import { normalizeNullableText } from '@/utils/form/normalize'
import {
  buildSupabaseRpcRange,
  fetchAllRangePages,
  normalizeSupabaseFunctionError
} from '@/utils/supabase'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeBooleanFilter, withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'
import type { QueryResult } from '@/types/api/response'
import { pickDefinedPayload } from './payload'

type Carrier = Api.Tms.BasicData.Carrier
type CarrierSearchParams = Api.Tms.BasicData.CarrierSearchParams
type CarrierOption = Api.Tms.BasicData.CarrierOption

interface CarrierOptionParams extends Partial<Pick<CarrierOption, 'carrierCode' | 'companyName'>> {
  excludeId?: string
  includeDisabled?: boolean
  ids?: string[]
  maxRows?: number
}

interface SecureListPayload<TRecord, TAccess extends Record<string, string>> {
  records: TRecord[]
  total: number
  fieldAccess?: TAccess
}

interface SecureImportResult {
  count: number
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const CARRIER_PAYLOAD_KEYS = [
  'parentUnitId',
  'carrierCode',
  'companyName',
  'carrierType',
  'carrierTypes',
  'dispatchChannel',
  'dispatchChannels',
  'businessLicenseNo',
  'taxRegistrationNo',
  'legalRepresentative',
  'region',
  'addressDetail',
  'postalCode',
  'enabled',
  'businessLicenseUrl',
  'contactName',
  'contactPhone',
  'contactDepartment',
  'contactPosition',
  'contactEmail',
  'contactQq',
  'invoiceTitle',
  'taxNo',
  'bankName',
  'bankAccountName',
  'bankAccount',
  'signedContract',
  'contractAttachmentUrl',
  'remark'
] as const satisfies readonly (keyof Carrier)[]

const toCarrierListRpcParams = (
  params: CarrierSearchParams & { ids?: string[]; maxRows?: number },
  purpose: 'list' | 'export'
) => {
  const from = purpose === 'export' ? 0 : Math.max(params.from ?? 0, 0)
  const requestedTo = purpose === 'export' ? Math.max((params.maxRows ?? 10000) - 1, 0) : params.to
  return {
    ...buildSupabaseRpcRange(from, requestedTo ?? 9),
    p_record_id: params.recordId || null,
    p_carrier_type: params.carrierType || null,
    p_enabled: normalizeBooleanFilter(params.enabled) ?? null,
    p_signed_contract: normalizeBooleanFilter(params.signedContract) ?? null,
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

export async function fetchCarrierList(params: CarrierSearchParams, options?: ApiRequestOptions) {
  const result = await responseHandle<
    SecureListPayload<Carrier, Api.Tms.BasicData.CarrierFieldAccessMap>
  >(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_carriers_secure', toCarrierListRpcParams(params, 'list')),
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

/** Parent maintenance needs full hierarchy and a concrete write tenant, unlike reference pickers. */
export async function fetchCarrierParentOptions(params: {
  tenantId?: string | null
  recordId?: string
}): Promise<Carrier[]> {
  let tenantId = params.tenantId
  const recordId = params.recordId
  if (recordId) {
    const record = await responseHandle<{ tenantId: string }>(
      () => supabase.from('mdm_carrier').select('tenant_id').eq('id', recordId).single(),
      { breakReturn: true, showErrorMessage: false }
    )
    tenantId = record.data?.tenantId
  }
  if (!tenantId) throw new Error('无法确认承运商所属租户，请刷新后重试')

  const [carriers, identities] = await Promise.all([
    loadAllDocumentPages(fetchCarrierList, {}),
    fetchAllRangePages<{ id: string }>(({ from, to }) =>
      responseHandle<{ id: string }[]>(
        () =>
          supabase
            .from('mdm_carrier')
            .select('id')
            .eq('tenant_id', tenantId)
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: false }
      )
    )
  ])
  if (identities.error) throw identities.error
  const tenantRecordIds = new Set((identities.data ?? []).map((record) => record.id))
  return carriers.filter((carrier) => carrier.id && tenantRecordIds.has(carrier.id))
}

export async function exportCarrierList(
  params: CarrierSearchParams & { ids?: string[]; maxRows?: number }
) {
  const result = await responseHandle<
    SecureListPayload<Carrier, Api.Tms.BasicData.CarrierFieldAccessMap>
  >(() => supabase.rpc('tms_list_carriers_secure', toCarrierListRpcParams(params, 'export')), {
    showErrorMessage: true
  })
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function fetchCarrierDetail(id: string) {
  return await responseHandle<Carrier | null>(
    () => supabase.rpc('tms_get_carrier_secure', { p_id: id }),
    { showErrorMessage: true }
  )
}

export async function analyzeCarrierPerformanceByAi(
  carrierId: string
): Promise<QueryResult<Api.Tms.BasicData.CarrierPerformanceAdvisorResponse>> {
  const { data, error } =
    await supabase.functions.invoke<Api.Tms.BasicData.CarrierPerformanceAdvisorResponse>(
      'ai-carrier-performance-advisor',
      { body: { carrierId } }
    )

  return {
    data: data ?? null,
    error: await normalizeSupabaseFunctionError(error)
  }
}

export async function fetchCarrierOptions(
  params: CarrierOptionParams = {},
  options?: ApiRequestOptions
) {
  const {
    carrierCode,
    companyName,
    excludeId,
    includeDisabled = false,
    ids,
    maxRows = 200
  } = params
  return await responseHandle<CarrierOption[]>(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_carrier_options_secure', {
          p_exclude_id: excludeId || null,
          p_include_disabled: includeDisabled,
          p_keyword: normalizeNullableText(String(companyName || carrierCode || '')),
          p_ids: ids?.length ? ids : null,
          p_max_rows: maxRows
        }),
        options
      ),
    { showErrorMessage: true }
  )
}

export async function addCarrier(params: Carrier) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('tms_create_carrier_multi_secure', {
        p_payload: keysToSnakeDeep(pickDefinedPayload(params, CARRIER_PAYLOAD_KEYS))
      }),
    { showMessage: true, breakReturn: true }
  )
  return { ...result, data: result.data ? { id: result.data } : null }
}

export async function editCarrier(params: Carrier) {
  const { id, ...data } = params
  if (!id) throw new Error('承运商 ID 不能为空')
  return await responseHandle<Carrier>(
    () =>
      supabase.rpc('tms_update_carrier_multi_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep(pickDefinedPayload(data, CARRIER_PAYLOAD_KEYS))
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function deleteCarrier(id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_delete_carrier_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function deleteCarrierBatch(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('tms_delete_carriers_secure', { p_ids: ids }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function importCarriers(rows: Carrier[]) {
  return await responseHandle<SecureImportResult>(
    () =>
      supabase.rpc('tms_import_carriers_secure', {
        p_rows: rows.map((row) => keysToSnakeDeep(pickDefinedPayload(row, CARRIER_PAYLOAD_KEYS)))
      }),
    { breakReturn: true }
  )
}
