import { buildSupabaseRpcRange } from '@/utils/supabase'
import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'
import { startWorkflow } from '@/api/workflow'

type Contract = Api.Tms.BasicData.Contract
type ContractSearchParams = Api.Tms.BasicData.ContractSearchParams
type ContractTransportDetail = Api.Tms.BasicData.ContractTransportDetail
type ContractDetailSelectorItem = Api.Tms.BasicData.ContractDetailSelectorItem
type ContractDetailSelectorSearchParams = Api.Tms.BasicData.ContractDetailSelectorSearchParams
type ContractFieldAccessMap = Api.Tms.BasicData.ContractFieldAccessMap
type SensitiveNumber = Api.Tms.BasicData.SensitiveNumber

interface SecureContractListPayload {
  records: Contract[]
  total: number
  fieldAccess: ContractFieldAccessMap
}

export type ContractDetailListRow = Contract & {
  detailRowKey: string
  detailIndex: number
  detailCargoId?: string | null
  detailCargoCode?: string | null
  detailCargoDescription?: string | null
  detailContractQuantity?: number | null
  detailUnit?: string | null
  detailTransportUnitPrice?: SensitiveNumber
  detailFreight?: SensitiveNumber
}

interface SecureContractDetailListPayload {
  records: ContractDetailListRow[]
  total: number
  fieldAccess: ContractFieldAccessMap
}

interface ImportContractResult {
  count: number
  ids: string[]
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const CONTRACT_PAYLOAD_KEYS = [
  'contractNo',
  'contractName',
  'paperContractNo',
  'mnemonicCode',
  'contractCategory',
  'transportMode',
  'businessContractType',
  'customerId',
  'carrierId',
  'contactName',
  'waybillNo',
  'customerSignatory',
  'billingMethod',
  'billingUnit',
  'contractAmount',
  'transportUnitPrice',
  'roadConsumptionRate',
  'lossDeductionPrice',
  'signTime',
  'effectiveDate',
  'expiryDate',
  'isCompleted',
  'agreedTransportQuantity',
  'transportRoute',
  'shipperName',
  'payerName',
  'consigneeName',
  'specialTransportRequirements',
  'otherDeductionTerms',
  'handler',
  'contractDescription',
  'transportDetails',
  'attachments'
] as const satisfies readonly (keyof Contract)[]

const normalizeSensitiveNumber = (value: unknown): SensitiveNumber | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim() === '***') return '***'
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

const normalizeTransportDetail = (value: unknown): ContractTransportDetail | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const detail = value as Record<string, unknown>
  const cargoDescription = String(detail.cargoDescription ?? '').trim()
  const cargoCode = String(detail.cargoCode ?? '').trim()
  const unit = String(detail.unit ?? '').trim()
  if (!cargoDescription || !cargoCode || !unit) return null

  const contractQuantity = Number(detail.contractQuantity)
  if (!Number.isFinite(contractQuantity) || contractQuantity < 0) return null

  const transportUnitPrice = normalizeSensitiveNumber(detail.transportUnitPrice)
  const freight = normalizeSensitiveNumber(detail.freight)
  return {
    cargoId: detail.cargoId ? String(detail.cargoId) : null,
    cargoDescription,
    cargoCode,
    contractQuantity,
    unit,
    ...(transportUnitPrice === undefined ? {} : { transportUnitPrice }),
    ...(freight === undefined ? {} : { freight })
  }
}

const normalizeContractRecord = (record: Contract): Contract => ({
  ...record,
  transportDetails: Array.isArray(record.transportDetails)
    ? record.transportDetails
        .map((item: unknown) => normalizeTransportDetail(item))
        .filter((item): item is ContractTransportDetail => item !== null)
    : [],
  attachments: Array.isArray(record.attachments) ? record.attachments : undefined
})

const toContractPayload = (contract: Contract): Record<string, unknown> =>
  Object.fromEntries(
    CONTRACT_PAYLOAD_KEYS.filter((key) => contract[key] !== undefined).map((key) => [
      key,
      contract[key]
    ])
  )

const toContractListRpcParams = (
  params: ContractSearchParams & { ids?: string[]; maxRows?: number },
  purpose: 'list' | 'export'
) => {
  const from = purpose === 'export' ? 0 : Math.max(params.from ?? 0, 0)
  const requestedTo = purpose === 'export' ? Math.max((params.maxRows ?? 10000) - 1, 0) : params.to
  return {
    ...buildSupabaseRpcRange(from, requestedTo ?? 9),
    p_contract_status: params.lifecycleStatus || null,
    p_business_contract_type: params.businessContractType || null,
    p_contract_category: params.contractCategory || null,
    p_customer_id: params.customerId || null,
    p_carrier_id: params.carrierId || null,
    p_billing_method: params.billingMethod || null,
    p_keyword: normalizeNullableText(String(params.keyword ?? '')),
    p_create_time_from: params.createTimeRange?.[0]
      ? toDateStartTimestamp(params.createTimeRange[0])
      : null,
    p_create_time_to: params.createTimeRange?.[1]
      ? toDateEndTimestamp(params.createTimeRange[1])
      : null,
    p_record_id: params.recordId || null,
    p_ids: params.ids?.length ? params.ids : null,
    p_purpose: purpose
  }
}

export async function fetchContractList(params: ContractSearchParams, options?: ApiRequestOptions) {
  const query = supabase.rpc('tms_list_contracts_secure', toContractListRpcParams(params, 'list'))
  const result = await responseHandle<SecureContractListPayload>(
    () => withRequestOptions(query, options),
    { showErrorMessage: true }
  )
  return {
    data: (result.data?.records ?? []).map(normalizeContractRecord),
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

async function loadContractDetailRows(
  params: ContractSearchParams & { ids?: string[]; maxRows?: number },
  purpose: 'list' | 'export',
  options?: ApiRequestOptions
) {
  const query = supabase.rpc(
    'tms_list_contract_detail_rows_secure',
    toContractListRpcParams(params, purpose)
  )
  const result = await responseHandle<SecureContractDetailListPayload>(
    () => withRequestOptions(query, options),
    { showErrorMessage: true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export function fetchContractDetailRows(params: ContractSearchParams, options?: ApiRequestOptions) {
  return loadContractDetailRows(params, 'list', options)
}

export function exportContractDetailRows(
  params: ContractSearchParams & { ids?: string[]; maxRows?: number }
) {
  return loadContractDetailRows(params, 'export')
}

export async function fetchAvailableContractDetailList(
  params: ContractDetailSelectorSearchParams,
  options?: ApiRequestOptions
) {
  const { from = 0, to = 9 } = params
  const keyword = String(params.keyword ?? '').trim()
  const query = supabase.rpc('tms_list_available_contract_details', {
    p_keyword: keyword || null
  })
  const result = await responseHandle<ContractDetailSelectorItem[]>(
    () => withRequestOptions(query, options),
    { showErrorMessage: true }
  )
  const details = result.data ?? []
  return { ...result, data: details.slice(from, to + 1), total: details.length }
}

export interface OrderContractCandidate {
  id: string
  contractNo: string
  contractName: string
  customerId: string
  paperContractNo: string | null
  mnemonicCode: string | null
  contractCategory: string | null
  transportMode: string | null
  carrierName: string | null
  customerName: string | null
  contactName: string | null
  customerSignatory: string | null
  handler: string | null
  signTime: string | null
  effectiveDate: string | null
  expiryDate: string | null
}

export async function fetchOrderContractCandidates(customerId: string, keyword = '') {
  const result = await responseHandle<OrderContractCandidate[]>(
    () =>
      supabase.rpc('tms_list_order_contract_candidates_v2', {
        p_customer_id: customerId,
        p_keyword: normalizeNullableText(keyword)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '可用合同加载失败，请重试' }
  )
  return result.data ?? []
}

export async function fetchOrderContractDetails(contractId: string, keyword = '') {
  const result = await responseHandle<ContractDetailSelectorItem[]>(
    () =>
      supabase.rpc('tms_list_order_contract_details', {
        p_contract_id: contractId,
        p_keyword: normalizeNullableText(keyword)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '合同明细加载失败，请重试' }
  )
  return result.data ?? []
}

export async function exportContractList(
  params: ContractSearchParams & { ids?: string[]; maxRows?: number }
) {
  const result = await responseHandle<SecureContractListPayload>(
    () => supabase.rpc('tms_list_contracts_secure', toContractListRpcParams(params, 'export')),
    { showErrorMessage: true }
  )
  return {
    data: (result.data?.records ?? []).map(normalizeContractRecord),
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function fetchContractDetail(id: string) {
  const result = await responseHandle<Contract | null>(
    () => supabase.rpc('tms_get_contract_secure', { p_id: id }),
    { showErrorMessage: true }
  )
  return { ...result, data: result.data ? normalizeContractRecord(result.data) : null }
}

export async function addContract(params: Contract) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('tms_create_contract_secure', {
        p_payload: keysToSnakeDeep(toContractPayload(params))
      }),
    { showMessage: true, breakReturn: true }
  )
  return { ...result, data: result.data ? { id: result.data } : null }
}

export async function copyContract(sourceId: string) {
  if (!sourceId) throw new Error('原合同 ID 不能为空')
  return await responseHandle<string>(
    () => supabase.rpc('tms_copy_contract_secure', { p_source_id: sourceId }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, message: '合同副本已创建' }
  )
}

export async function terminateContract(id: string, reason: string) {
  if (!id) throw new Error('合同 ID 不能为空')
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_terminate_contract_secure', { p_id: id, p_reason: reason }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, message: '合同已终止' }
  )
}

export async function submitContractForApproval(contract: Contract) {
  if (!contract.id) throw new Error('合同 ID 不能为空')
  return await startWorkflow(
    {
      businessType: 'tms_contract',
      businessId: contract.id,
      businessTitle: `合同 ${contract.contractNo || contract.contractName || contract.id}`
    },
    {
      showErrorMessage: false,
      errorMessage: '合同已保存为草稿，但审批未发起。请检查运输合同审批流程是否已发布并启用后重试。'
    }
  )
}

export async function editContract(params: Contract) {
  if (!params.id) throw new Error('合同 ID 不能为空')
  return await responseHandle<Contract>(
    () =>
      supabase.rpc('tms_update_contract_secure', {
        p_id: params.id,
        p_payload: keysToSnakeDeep(toContractPayload(params))
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function deleteContract(id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_delete_contract_secure', { p_id: id }),
    {
      showMessage: true,
      showErrorMessage: false,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: '合同已不存在或当前账号无权删除，请刷新列表后重试。'
    }
  )
}

export async function deleteContractBatch(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('tms_delete_contracts_secure', { p_ids: ids }),
    {
      showMessage: true,
      showErrorMessage: false,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: '合同已不存在或当前账号无权删除，请刷新列表后重试。'
    }
  )
}

export async function importContracts(rows: Contract[]) {
  const payload = rows.map((row) => keysToSnakeDeep(toContractPayload(row)))
  return await responseHandle<ImportContractResult>(
    () => supabase.rpc('tms_import_contracts_secure', { p_rows: payload }),
    { breakReturn: true }
  )
}
