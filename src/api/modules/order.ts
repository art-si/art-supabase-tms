import { useSupabase } from '@/hooks/core/useSupabase'
import type { QueryResult } from '@/types/api/response'
import type { ApiRequestOptions } from '@/types/api/request'
import { fetchSecureOrders } from '@tms/api/modules/transport-secure'
import { canEditField } from '@/utils/field-permission'
import { normalizeSupabaseFunctionError } from '@/utils/supabase'
import { omit, pick } from 'lodash-es'

type OrderRecord = Api.Tms.Order.OrderRecord
type OrderSearchParams = Api.Tms.Order.OrderSearchParams
type OrderFreightPayload = Api.Tms.Order.OrderFreightPayload
const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export async function fetchOrderList(
  params: OrderSearchParams & Api.Common.CommonSearchParams,
  options?: ApiRequestOptions
) {
  return await fetchSecureOrders<OrderRecord>(params, 'order_list', options)
}

export async function fetchOrderStatusCounts(
  params: OrderSearchParams
): Promise<Record<string, number>> {
  const sharedFilters = { ...params, orderStatus: undefined }
  const result = await fetchSecureOrders<OrderRecord>(
    { ...sharedFilters, countOnly: true },
    'order_list'
  )
  return result.orderStatusCounts
}

export async function exportOrderList(
  params: OrderSearchParams & { ids?: string[]; maxRows?: number }
) {
  return await fetchSecureOrders<OrderRecord>(params, 'order_export')
}

export async function fetchOrderDetail(id: string, options: { showErrorMessage?: boolean } = {}) {
  return await responseHandle<OrderRecord | null>(
    () => supabase.rpc('tms_get_order_detail_secure', { p_id: id }),
    { showErrorMessage: options.showErrorMessage ?? true }
  )
}

export async function fetchOrderContractSummary(id: string) {
  return await responseHandle<NonNullable<OrderRecord['contract']>>(
    () => supabase.rpc('tms_get_order_contract_summary', { p_order_id: id }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '关联合同加载失败，请重试' }
  )
}

export async function addOrder(params: OrderRecord) {
  return await responseHandle<OrderRecord>(
    () =>
      supabase.rpc('tms_create_order_with_contract_secure', {
        p_payload: toOrderWritePayload(params),
        p_contract_id: params.contractId ?? null
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function analyzeOrderByAi(
  params: Api.Tms.Order.AiOrderAnalyzeRequest
): Promise<QueryResult<Api.Tms.Order.AiOrderAnalyzeResponse>> {
  const { data, error } = await supabase.functions.invoke<Api.Tms.Order.AiOrderAnalyzeResponse>(
    'ai-order-assistant',
    { body: params }
  )

  return {
    data: data ?? null,
    error: await normalizeSupabaseFunctionError(error)
  }
}

export async function generateAiOrderExample(
  params: Api.Tms.Order.AiOrderExampleRequest = {}
): Promise<QueryResult<Api.Tms.Order.AiOrderExampleResponse>> {
  const { data, error } = await supabase.functions.invoke<Api.Tms.Order.AiOrderExampleResponse>(
    'ai-order-assistant',
    { body: { ...params, action: 'generate_example' } }
  )

  return {
    data: data ?? null,
    error: await normalizeSupabaseFunctionError(error)
  }
}

export async function createAiOrderMasterData(tasks: Api.Tms.Order.AiOrderMasterDataCreateTask[]) {
  return await responseHandle<Api.Tms.Order.AiOrderMasterDataCreateResult[]>(
    () =>
      supabase.rpc('create_ai_order_master_data', {
        p_tasks: keysToSnakeDeep(tasks)
      }),
    { breakReturn: true }
  )
}

export async function reviewAiOrderArtifact(
  params: Api.Tms.Order.AiOrderReviewRequest
): Promise<QueryResult<Api.Tms.Order.AiOrderReviewResponse>> {
  const { data, error } = await supabase.functions.invoke<Api.Tms.Order.AiOrderReviewResponse>(
    'ai-order-assistant',
    { body: params }
  )

  return {
    data: data ?? null,
    error: await normalizeSupabaseFunctionError(error)
  }
}

const ORDER_WRITE_FIELDS = [
  'order_no',
  'order_status',
  'origin_station',
  'destination_station',
  'transfer_station',
  'delivery_method',
  'shipping_customer_id',
  'receiving_customer_id',
  'shipping_contact_name',
  'shipping_contact_phone',
  'shipping_address_detail',
  'receiving_contact_name',
  'receiving_contact_phone',
  'receiving_address_detail',
  'cargo_items',
  'cargo_quantity_total',
  'cargo_weight_total',
  'cargo_volume_total',
  'transport_fee',
  'delivery_fee',
  'unloading_fee',
  'collect_payment_fee',
  'transfer_fee',
  'declared_value',
  'insurance_fee',
  'package_fee',
  'other_fee',
  'total_fee',
  'payment_method',
  'cash_amount',
  'collect_amount',
  'monthly_amount',
  'cod_amount',
  'handling_fee',
  'payment_total',
  'transport_mode',
  'order_remark',
  'image_urls',
  'origin_station_id',
  'destination_station_id',
  'transfer_station_id',
  'transfer_station_ids',
  'shipping_address_id',
  'receiving_address_id',
  'shipping_longitude',
  'shipping_latitude',
  'receiving_longitude',
  'receiving_latitude',
  'shipping_region_path',
  'receiving_region_path',
  'distance_km',
  'departure_at',
  'arrival_at',
  'order_config'
] as const

const ORDER_SENSITIVE_WRITE_FIELDS: Record<Api.Tms.Order.OrderFieldKey, readonly string[]> = {
  shipperContact: ['shipping_contact_phone'],
  shipperAddress: ['shipping_address_detail', 'shipping_address_id', 'shipping_region_path'],
  receiverContact: ['receiving_contact_phone'],
  receiverAddress: ['receiving_address_detail', 'receiving_address_id', 'receiving_region_path'],
  cargoPricing: [],
  freightAmounts: [
    'transport_fee',
    'delivery_fee',
    'unloading_fee',
    'collect_payment_fee',
    'transfer_fee',
    'insurance_fee',
    'package_fee',
    'other_fee',
    'total_fee'
  ],
  settlementAmounts: [
    'declared_value',
    'cash_amount',
    'collect_amount',
    'monthly_amount',
    'cod_amount',
    'handling_fee',
    'payment_total'
  ],
  driverPhone: [],
  proofAttachments: ['image_urls'],
  routeCoordinates: [
    'shipping_longitude',
    'shipping_latitude',
    'receiving_longitude',
    'receiving_latitude',
    'distance_km'
  ]
}

function toOrderWritePayload(params: OrderRecord): Record<string, unknown> {
  const payload = pick({ ...keysToSnakeDeep(params) }, ORDER_WRITE_FIELDS) as Record<
    string,
    unknown
  >
  if (!params.id) return payload

  // The edit form never changes a document number. Keep the server's existing value.
  delete payload.order_no

  Object.entries(ORDER_SENSITIVE_WRITE_FIELDS).forEach(([field, columns]) => {
    if (canEditField(params.fieldAccess, field as Api.Tms.Order.OrderFieldKey)) return
    columns.forEach((column) => delete payload[column])
  })
  if (!canEditField(params.fieldAccess, 'proofAttachments')) {
    const config = payload.order_config
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      payload.order_config = omit(config, 'attachment_urls')
    }
  }
  return payload
}

export async function editOrder(params: OrderRecord) {
  const id = params.id
  if (!id) throw new Error('缺少订单 ID')
  return await responseHandle<OrderRecord>(
    () =>
      supabase.rpc('tms_update_order_with_contract_secure', {
        p_id: id,
        p_payload: toOrderWritePayload(params),
        p_contract_id: params.contractId ?? null
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function editOrderFreight(params: OrderFreightPayload) {
  const { id, ...data } = params
  if (!id) throw new Error('缺少订单 ID')

  return await responseHandle<OrderRecord>(
    () =>
      supabase.rpc('tms_update_order_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep(data),
        p_action: 'edit_freight'
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function deleteOrder(id: string) {
  return await responseHandle(() => supabase.rpc('tms_delete_order_secure', { p_order_id: id }), {
    showMessage: true,
    breakReturn: true
  })
}

export async function deleteOrderBatch(ids: string[]) {
  return await responseHandle(
    () => supabase.rpc('tms_delete_orders_secure', { p_order_ids: ids }),
    { showMessage: true, breakReturn: true }
  )
}
