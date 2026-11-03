import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import { normalizeNullableText } from '@/utils/form/normalize'
import { buildSupabaseRpcRange, normalizeSupabaseFunctionError } from '@/utils/supabase'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeBooleanFilter, withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'
import type { QueryResult } from '@/types/api/response'
import { pickDefinedPayload } from '@/utils/form/pick-defined-payload'

type Carrier = Api.Tms.BasicData.Carrier
type CarrierSearchParams = Api.Tms.BasicData.CarrierSearchParams
type CarrierOption = Api.Tms.BasicData.CarrierOption

interface CarrierOptionParams extends Partial<Pick<CarrierOption, 'carrierCode' | 'companyName'>> {
  tenantId?: string | null
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
  'contacts',
  'billingAccounts',
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

type CarrierParentOption = Pick<
  Carrier,
  'parentUnitId' | 'carrierCode' | 'companyName' | 'enabled'
> & { id: string }

/** Parent maintenance needs the complete tenant hierarchy, not a capped reference picker. */
export async function fetchCarrierParentOptions(params: {
  tenantId?: string | null
  recordId?: string
}): Promise<CarrierParentOption[]> {
  const recordId = params.recordId || null
  const targetTenantId = recordId ? null : params.tenantId || null

  return loadAllDocumentPages<CarrierParentOption, { from?: number; to?: number }>(
    async ({ from, to }) => {
      const { data, error } = await responseHandle<{
        records: CarrierParentOption[]
        total: number
      }>(
        () =>
          supabase.rpc('tms_list_carrier_parent_options_secure', {
            p_target_tenant_id: targetTenantId,
            p_record_id: recordId,
            p_from: from ?? 0,
            p_to: to ?? 499
          }),
        { breakReturn: true, showErrorMessage: false }
      )
      return { data: data?.records, total: data?.total, error }
    },
    {}
  )
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

export async function fetchCarrierChildren(carrierId: string) {
  return await responseHandle<{
    contacts: Api.Tms.BasicData.CarrierContact[]
    billingAccounts: Api.Tms.BasicData.CarrierBillingAccount[]
  }>(() => supabase.rpc('tms_get_carrier_children_secure', { p_carrier_id: carrierId }), {
    showErrorMessage: false,
    breakReturn: true
  })
}

export async function fetchCarrierDefaultBillingAccount(carrierId: string) {
  return await responseHandle<Api.Tms.BasicData.CarrierBillingAccount | null>(
    () =>
      supabase.rpc('tms_get_carrier_default_billing_account_secure', { p_carrier_id: carrierId }),
    { showErrorMessage: false, breakReturn: true }
  )
}

export async function fetchCarrierBillingAccountsForDispatch(carrierId: string) {
  return await responseHandle<Api.Tms.BasicData.CarrierBillingAccount[]>(
    () =>
      supabase.rpc('tms_list_carrier_billing_accounts_for_dispatch_secure', {
        p_carrier_id: carrierId
      }),
    { showErrorMessage: false, breakReturn: true }
  )
}

export interface CarrierBillingAccountReference {
  waybillId: string
  waybillNo: string
  status: string
  createTime: string
}

export async function fetchCarrierBillingAccountReferences(accountId: string) {
  return await responseHandle<CarrierBillingAccountReference[]>(
    () =>
      supabase.rpc('tms_list_carrier_billing_account_references_secure', {
        p_account_id: accountId
      }),
    { showErrorMessage: false, breakReturn: true }
  )
}

export async function fetchWaybillCarrierBillingSnapshot(waybillId: string) {
  return await responseHandle<Api.Tms.BasicData.CarrierBillingAccount | null>(
    () =>
      supabase.rpc('tms_get_waybill_carrier_billing_snapshot_secure', { p_waybill_id: waybillId }),
    { showErrorMessage: false, breakReturn: true }
  )
}

export interface CarrierWaybillSummary {
  id: string
  waybillNo: string
  status: string
  originCity?: string | null
  destinationCity?: string | null
  createTime?: string
}

export interface CarrierStatementSummary {
  id: string
  statementNo: string
  status: string
  periodStart: string
  periodEnd: string
  settledAmount?: number | null
}

export async function fetchCarrierWaybills(carrierId: string) {
  return await responseHandle<CarrierWaybillSummary[]>(
    () => supabase.rpc('tms_list_carrier_waybill_summaries_secure', { p_carrier_id: carrierId }),
    { showErrorMessage: false, breakReturn: true }
  )
}

export async function fetchCarrierStatements(carrierId: string) {
  const result = await responseHandle<{ records: CarrierStatementSummary[]; total: number }>(
    () =>
      supabase.rpc('tms_list_carrier_statements_secure', {
        p_carrier_id: carrierId,
        p_from: 0,
        p_to: 199,
        p_purpose: 'list'
      }),
    { showErrorMessage: false, breakReturn: true }
  )
  return { ...result, data: result.data?.records ?? [], total: result.data?.total ?? 0 }
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
    tenantId,
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
          p_max_rows: maxRows,
          p_tenant_id: tenantId || null
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
