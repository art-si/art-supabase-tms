import { normalizeNullableText } from '@/utils/form/normalize'
import { normalizeCoordinatePair } from '@/utils/geo'
import { useSupabase, type RunQueryOptions } from '@/hooks/core/useSupabase'
import type { QueryResult } from '@/types/api/response'
import type { WaybillExportScope, WaybillListScope } from '@tms/api/modules/transport-secure'
import {
  fetchDispatchWorkbench,
  fetchExecutionSources,
  submitDispatchPlan
} from '@tms/api/modules/dispatch-execution'
import { isPlainObject } from 'lodash-es'
import { buildSupabaseRpcRange, normalizeSupabaseFunctionError } from '@/utils/supabase'

type WaybillRecord = Api.Tms.Waybill.WaybillRecord
type WaybillSearchParams = Api.Tms.Waybill.WaybillSearchParams
type WaybillDispatchPayload = Api.Tms.Waybill.WaybillDispatchPayload
type DispatchVehicleOption = Api.Tms.Waybill.DispatchVehicleOption
type DispatchVehicleSearchParams = Api.Tms.Waybill.DispatchVehicleSearchParams
type CargoOperationType = Api.Tms.Waybill.CargoOperationType
type CargoOperationContext = Api.Tms.Waybill.CargoOperationContext
type CargoOperationCheckinPayload = Api.Tms.Waybill.CargoOperationCheckinPayload
type CargoOperationCompletePayload = Api.Tms.Waybill.CargoOperationCompletePayload
type ExecutionContext = Api.Tms.Waybill.ExecutionContext
type ExecutionDeparturePayload = Api.Tms.Waybill.ExecutionDeparturePayload
type ExecutionSignaturePayload = Api.Tms.Waybill.ExecutionSignaturePayload
type ExecutionCompletionPayload = Api.Tms.Waybill.ExecutionCompletionPayload
type WaybillDetailRecord = Api.Tms.Waybill.WaybillDetailRecord
type CargoRequestFeedback = Pick<RunQueryOptions, 'showMessage' | 'showErrorMessage'>
type WaybillExpenseLocationRecord = Api.Tms.Waybill.WaybillExpenseLocationRecord

interface WaybillExpenseLocationQueryRecord extends WaybillExpenseLocationRecord {
  costType?: string | null
}

interface WaybillStatusCountResult {
  total: number
  counts: Record<string, number>
}

export type { WaybillExportScope, WaybillListScope } from '@tms/api/modules/transport-secure'

const { supabase, responseHandle } = useSupabase()

const ENERGY_COST_TYPES = new Set([
  'fuel',
  'in_transit_energy',
  'in_transit_charging',
  'in_transit_gas'
])

export async function fetchWaybillDetail(waybillId: string) {
  const detailResult = await responseHandle<WaybillDetailRecord | null>(
    () => supabase.rpc('tms_get_waybill_detail_secure', { p_waybill_id: waybillId }),
    {
      breakReturn: true,
      errorMessage: '运单详情加载失败，请稍后重试'
    }
  )
  if (!detailResult.data) return detailResult

  const data = detailResult.data
  const sourcesResult = await fetchExecutionSources(waybillId)
  if (sourcesResult.error) throw new Error('运单来源加载失败，请稍后重试')
  return {
    ...detailResult,
    data: {
      ...data,
      routePoints: normalizeWaybillRoutePoints(data.routePoints),
      pickupPhotos: normalizeUrlList(data.pickupPhotos),
      deliveryPhotos: normalizeUrlList(data.deliveryPhotos),
      receiptAttachments: normalizeUrlList(data.receiptAttachments),
      events: (data.events ?? []).map((event) => ({
        ...event,
        payload: isPlainObject(event.payload) ? event.payload : {}
      })),
      proofs: data.proofs ?? [],
      cargoOperations: data.cargoOperations ?? [],
      costs: Array.isArray(data.costs)
        ? data.costs.map((cost) => ({ ...cost, attachments: normalizeUrlList(cost.attachments) }))
        : [],
      expenseLocations: normalizeExpenseLocations(data.expenseLocations ?? []),
      sources: sourcesResult.data ?? [],
      execution: data.execution ?? null
    }
  }
}

function normalizeWaybillRoutePoints(value: unknown): Api.Tms.Waybill.WaybillRoutePoint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isPlainObject(item)) return []
    const coordinate = normalizeCoordinatePair(
      item.longitude ?? item.lng,
      item.latitude ?? item.lat
    )
    if (!coordinate) return []
    const { longitude, latitude } = coordinate
    const speedKmh = Number(item.speedKmh ?? item.speed ?? item.velocity)
    return [
      {
        name: typeof item.name === 'string' ? item.name : null,
        address: typeof item.address === 'string' ? item.address : null,
        type: typeof item.type === 'string' ? item.type : null,
        capturedAt: getFirstString(item, [
          'capturedAt',
          'timestamp',
          'recordedAt',
          'eventTime',
          'gpsTime',
          'time'
        ]),
        speedKmh: Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : null,
        source: typeof item.source === 'string' ? item.source : null,
        longitude,
        latitude
      }
    ]
  })
}

function normalizeExpenseLocations(
  records: WaybillExpenseLocationQueryRecord[]
): WaybillExpenseLocationRecord[] {
  return records.flatMap((record) => {
    const coordinate = normalizeCoordinatePair(record.expenseLongitude, record.expenseLatitude)
    const category = String(
      record.expenseItem?.businessCategory || record.costType || ''
    ).toLowerCase()
    const label =
      `${record.expenseItem?.itemCode || ''} ${record.expenseItem?.itemName || ''}`.toLowerCase()
    const isEnergyExpense =
      ENERGY_COST_TYPES.has(category) ||
      /(fuel|gas|charging|energy|加油|燃油|充电|能源)/i.test(label)

    if (!isEnergyExpense || !coordinate) return []
    const { longitude, latitude } = coordinate
    // Expense evidence uses the origin pair as an unset-location sentinel.
    if (longitude === 0 && latitude === 0) return []
    return [
      {
        id: record.id,
        occurredOn: record.occurredOn,
        expenseLocation: record.expenseLocation,
        expenseLongitude: longitude,
        expenseLatitude: latitude,
        expenseCoordinateSource: record.expenseCoordinateSource,
        expenseItem: record.expenseItem
      }
    ]
  })
}

function getFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function normalizeUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!isPlainObject(item) || typeof item.url !== 'string') return []
    const url = item.url.trim()
    return url ? [url] : []
  })
}

export async function fetchWaybillStatusCounts(
  params: WaybillSearchParams,
  scope: WaybillListScope
): Promise<WaybillStatusCountResult> {
  const sharedFilters = { ...params, waybillStatus: undefined }
  const result = await fetchDispatchWorkbench(
    { ...sharedFilters, countOnly: true },
    scope === 'pending_waybill_list' ? 'pending' : 'loaded'
  )

  return { total: result.total, counts: result.waybillStatusCounts }
}

export async function fetchWaybillList(
  params: WaybillSearchParams & Api.Common.CommonSearchParams,
  scope: WaybillListScope
) {
  return await fetchDispatchWorkbench(
    params,
    scope === 'pending_waybill_list' ? 'pending' : 'loaded'
  )
}

export async function exportWaybillList(
  params: WaybillSearchParams & { ids?: string[]; maxRows?: number },
  scope: WaybillExportScope
) {
  return await fetchDispatchWorkbench(
    params,
    scope === 'pending_waybill_export' ? 'pending' : 'loaded'
  )
}

function createFullAllocation(row: WaybillRecord): Api.Tms.Waybill.DispatchAllocation {
  if (!row.id) throw new Error('请选择有效的原始运输单')
  const cargoItems = row.remainingCargoItems ?? row.cargoItems ?? []
  const lines = cargoItems.flatMap((item, lineIndex) => {
    const quantity = Number(item.quantity ?? 0)
    const weightKg = Number(item.weightKg ?? 0)
    const volumeM3 = Number(item.volumeM3 ?? 0)
    return quantity + weightKg + volumeM3 > 0 ? [{ lineIndex, quantity, weightKg, volumeM3 }] : []
  })
  if (!lines.length) throw new Error(`原始运输单 ${row.orderNo} 已无可配载货量`)
  return {
    orderId: row.id,
    lines
  }
}

function createPlanExecution(
  params: WaybillDispatchPayload,
  rows: WaybillRecord[]
): Api.Tms.Waybill.DispatchPlanExecution {
  return {
    dispatchMode: params.dispatchMode,
    dispatchCarrierId: params.dispatchCarrierId,
    dispatchAgreementId: params.dispatchAgreementId,
    dispatchVehicleId: params.dispatchVehicleId,
    dispatchDriverId: params.dispatchDriverId,
    plannedDepartureTime: params.plannedDepartureTime,
    plannedArrivalTime: params.plannedArrivalTime,
    dispatchRemark: params.dispatchRemark,
    allocations: rows.map(createFullAllocation)
  }
}

export async function dispatchWaybill(row: WaybillRecord, params: WaybillDispatchPayload) {
  return await submitDispatchPlan({
    kind: 'single',
    executions: [createPlanExecution(params, [row])]
  })
}

export async function dispatchWaybillBatch(rows: WaybillRecord[], params: WaybillDispatchPayload) {
  if (!rows.length) throw new Error('请选择需要配载的运单')
  return await submitDispatchPlan({
    kind: 'single',
    executions: rows.map((row) => createPlanExecution(params, [row]))
  })
}

export async function mergeWaybills(rows: WaybillRecord[], params: WaybillDispatchPayload) {
  if (rows.length < 2) throw new Error('请至少选择两张原始运输单')
  return await submitDispatchPlan({
    kind: 'merge',
    executions: [createPlanExecution(params, rows)]
  })
}

export async function cancelWaybillDispatch(id: string) {
  const result = await responseHandle<WaybillRecord[]>(
    () => supabase.rpc('tms_revoke_order_dispatch_secure', { p_order_ids: [id] }),
    { showMessage: true, breakReturn: true }
  )
  return { ...result, data: result.data?.[0] ?? null }
}

export async function cancelWaybillDispatchBatch(ids: string[]) {
  return await responseHandle<WaybillRecord[]>(
    () => supabase.rpc('tms_revoke_order_dispatch_secure', { p_order_ids: ids }),
    { showMessage: true, breakReturn: true }
  )
}

export async function cancelWaybillOrder(id: string) {
  return await responseHandle(
    () => supabase.rpc('tms_cancel_waybill_order_secure', { p_order_id: id }),
    { showMessage: true, breakReturn: true }
  )
}

export async function cancelWaybillOrderBatch(ids: string[]) {
  return await responseHandle(
    () => supabase.rpc('tms_cancel_waybill_orders_secure', { p_order_ids: ids }),
    { showMessage: true, breakReturn: true }
  )
}

export async function confirmWaybillAcceptance(waybillId: string) {
  return await responseHandle(
    () => supabase.rpc('tms_accept_assigned_waybill', { p_waybill_id: waybillId }),
    {
      showMessage: true,
      breakReturn: true
    }
  )
}

export async function fetchWaybillCargoOperationContext(
  waybillId: string,
  operationType: CargoOperationType,
  options: CargoRequestFeedback = {}
) {
  return await responseHandle<CargoOperationContext>(
    () =>
      supabase.rpc('tms_get_waybill_cargo_operation_context', {
        p_waybill_id: waybillId,
        p_operation_type: operationType
      }),
    { showErrorMessage: true, ...options }
  )
}

export async function checkInWaybillCargoOperation(
  params: CargoOperationCheckinPayload,
  options: CargoRequestFeedback = {}
) {
  return await responseHandle<CargoOperationContext>(
    () =>
      supabase.rpc('tms_check_in_waybill_cargo_operation', {
        p_waybill_id: params.waybillId,
        p_operation_type: params.operationType,
        p_longitude: params.longitude,
        p_latitude: params.latitude,
        p_accuracy_m: params.accuracyM ?? null,
        p_location_text: normalizeNullableText(params.locationText),
        p_outside_reason: normalizeNullableText(params.outsideReason),
        p_automatic: params.automatic === true
      }),
    { showMessage: true, breakReturn: true, ...options }
  )
}

export async function completeWaybillCargoOperation(
  params: CargoOperationCompletePayload,
  options: CargoRequestFeedback = {}
) {
  return await responseHandle<CargoOperationContext>(
    () =>
      supabase.rpc('tms_complete_waybill_cargo_operation', {
        p_waybill_id: params.waybillId,
        p_operation_type: params.operationType,
        p_weight_ton: params.weightTon,
        p_photo_urls: params.photoUrls,
        p_weighbridge_ticket_urls: params.weighbridgeTicketUrls,
        p_remark: normalizeNullableText(params.remark)
      }),
    { showMessage: true, breakReturn: true, ...options }
  )
}

export async function fetchWaybillExecutionContext(waybillId: string) {
  return await responseHandle<ExecutionContext>(
    () =>
      supabase.rpc('tms_get_waybill_execution_context', {
        p_waybill_id: waybillId
      }),
    { showErrorMessage: true }
  )
}

export async function recordWaybillDeparture(params: ExecutionDeparturePayload) {
  return await responseHandle<ExecutionContext>(
    () =>
      supabase.rpc('tms_record_waybill_departure', {
        p_waybill_id: params.waybillId,
        p_departure_time: params.departureTime,
        p_odometer_km: params.odometerKm,
        p_photo_urls: params.photoUrls,
        p_remark: params.remark || null
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function signWaybill(params: ExecutionSignaturePayload) {
  return await responseHandle<ExecutionContext>(
    () =>
      supabase.rpc('tms_sign_waybill', {
        p_waybill_id: params.waybillId,
        p_signed_at: params.signedAt,
        p_signer_name: params.signerName,
        p_receipt_urls: params.receiptUrls,
        p_signature_urls: params.signatureUrls,
        p_remark: params.remark || null
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function completeWaybillExecution(params: ExecutionCompletionPayload) {
  return await responseHandle<ExecutionContext>(
    () =>
      supabase.rpc('tms_complete_waybill_execution', {
        p_waybill_id: params.waybillId,
        p_return_time: params.returnTime,
        p_return_odometer_km: params.returnOdometerKm,
        p_empty_mileage_km: params.emptyMileageKm ?? null,
        p_departure_fuel_liters: params.departureFuelLiters ?? null,
        p_refueled_liters: params.refueledLiters ?? null,
        p_return_fuel_liters: params.returnFuelLiters ?? null,
        p_photo_urls: params.photoUrls,
        p_remark: params.remark || null
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function cancelAssignedWaybill(waybillId: string, reason: string) {
  return await responseHandle<ExecutionContext>(
    () =>
      supabase.rpc('tms_cancel_assigned_waybill', {
        p_waybill_id: waybillId,
        p_reason: reason
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function fetchDispatchVehicleOptions(params: DispatchVehicleSearchParams = {}) {
  const { from = 0, to = 9, keyword } = params
  const result = await responseHandle<{ records: DispatchVehicleOption[]; total: number }>(
    () =>
      supabase.rpc('vms_list_dispatch_vehicle_options_secure', {
        ...buildSupabaseRpcRange(from, to),
        p_keyword: normalizeNullableText(String(keyword ?? ''))
      }),
    { showErrorMessage: true }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error
  }
}

export async function recommendDispatchResourcesByAi(
  orderId: string,
  limit = 5
): Promise<QueryResult<Api.Tms.Waybill.DispatchRecommendationResponse>> {
  const { data, error } =
    await supabase.functions.invoke<Api.Tms.Waybill.DispatchRecommendationResponse>(
      'ai-dispatch-advisor',
      { body: { orderId, limit } }
    )

  return {
    data: data ?? null,
    error: await normalizeSupabaseFunctionError(error)
  }
}
