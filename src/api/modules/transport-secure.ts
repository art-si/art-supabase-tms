import { buildSupabaseRpcRange } from '@/utils/supabase'
import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import { withRequestOptions } from '@/api/providers/supabase/query'
import type { ApiRequestOptions, ApiFeedbackOptions } from '@/types/api/request'

export type WaybillListScope = 'pending_waybill_list' | 'loaded_waybill_list'
export type WaybillExportScope = 'pending_waybill_export' | 'loaded_waybill_export'

export type TransportOrderScope =
  | 'order_list'
  | 'order_export'
  | 'order_detail'
  | 'order_open'
  | WaybillListScope
  | WaybillExportScope
  | 'delivery_list'
  | 'delivery_export'
  | 'in_transit'
  | 'dashboard'

type TransportOrderParams = Api.Tms.Waybill.WaybillSearchParams &
  Api.Common.CommonSearchParams & {
    ids?: string[]
    maxRows?: number
    orderStatuses?: string[]
    signedTimeRange?: string[]
    countOnly?: boolean
  }

interface SecureTransportPayload<TRecord, TAccess> {
  records: TRecord[]
  total: number
  fieldAccess?: TAccess
  orderStatusCounts?: Record<string, number>
  waybillStatusCounts?: Record<string, number>
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

const normalizeStatus = (value?: string): string | null =>
  value && value !== '__all__' ? value : null

const createOrderRpcParams = (params: TransportOrderParams, scope: TransportOrderScope) => {
  const from = Math.max(params.from ?? 0, 0)
  const requestedTo = params.maxRows ? from + Math.max(params.maxRows, 1) - 1 : params.to
  const to = Math.max(requestedTo ?? 9, from)
  return {
    p_scope: scope,
    p_from: from,
    p_to: to,
    p_record_id: params.recordId || null,
    p_ids: params.ids?.length ? params.ids : null,
    p_order_status: normalizeStatus(params.orderStatus),
    p_order_statuses: params.orderStatuses?.length ? params.orderStatuses : null,
    p_payment_method: params.paymentMethod || null,
    p_origin_station_id: params.originStationId || null,
    p_destination_station_id: params.destinationStationId || null,
    p_transfer_station_id: params.transferStationId || null,
    p_dispatch_status: normalizeStatus(params.dispatchStatus),
    p_dispatch_statuses: params.dispatchStatuses?.length ? params.dispatchStatuses : null,
    p_dispatch_vehicle_id: params.dispatchVehicleId || null,
    p_waybill_status: normalizeStatus(params.waybillStatus),
    p_cargo_keyword: normalizeNullableText(String(params.cargoKeyword ?? '')),
    p_shipping_keyword: normalizeNullableText(String(params.shippingKeyword ?? '')),
    p_receiving_keyword: normalizeNullableText(String(params.receivingKeyword ?? '')),
    p_vehicle_keyword: normalizeNullableText(String(params.vehicleKeyword ?? '')),
    p_create_time_from: toDateStartTimestamp(params.createTimeRange?.[0]),
    p_create_time_to: toDateEndTimestamp(params.createTimeRange?.[1]),
    p_planned_time_from: toDateStartTimestamp(params.plannedTimeRange?.[0]),
    p_planned_time_to: toDateEndTimestamp(params.plannedTimeRange?.[1]),
    p_signed_time_from: toDateStartTimestamp(params.signedTimeRange?.[0]),
    p_signed_time_to: toDateEndTimestamp(params.signedTimeRange?.[1]),
    p_count_only: params.countOnly === true
  }
}

export async function fetchSecureOrders<TRecord extends Api.Tms.Order.OrderRecord>(
  params: TransportOrderParams,
  scope: TransportOrderScope,
  options?: ApiRequestOptions & ApiFeedbackOptions
) {
  const result = await responseHandle<
    SecureTransportPayload<TRecord, Api.Tms.Order.OrderFieldAccessMap>
  >(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_orders_secure', createOrderRpcParams(params, scope)),
        options
      ),
    { showErrorMessage: options?.showErrorMessage ?? true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {},
    // Status values are database codes. Deep RPC key conversion also camel-cases map keys.
    orderStatusCounts: keysToSnakeDeep(result.data?.orderStatusCounts ?? {}),
    waybillStatusCounts: keysToSnakeDeep(result.data?.waybillStatusCounts ?? {})
  }
}

export async function fetchSecureInTransitWaybills(
  params: {
    from?: number
    to?: number
    statuses?: string[]
    keyword?: string
  },
  options?: ApiRequestOptions & ApiFeedbackOptions
) {
  const result = await responseHandle<
    SecureTransportPayload<Api.Tms.InTransit.MonitorRecord, Api.Tms.Waybill.WaybillFieldAccessMap>
  >(
    () =>
      withRequestOptions(
        supabase.rpc('tms_list_waybills_secure', {
          p_scope: 'in_transit',
          ...buildSupabaseRpcRange(params.from ?? 0, params.to ?? 199),
          p_statuses: params.statuses?.length ? params.statuses : null,
          p_keyword: normalizeNullableText(String(params.keyword ?? ''))
        }),
        options
      ),
    { showErrorMessage: options?.showErrorMessage ?? false }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}
