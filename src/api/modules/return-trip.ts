import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNullableText } from '@/utils/form/normalize'

export interface ReturnTripCandidate {
  id: string
  waybillNo: string
  status: string
  orderId: string
  tenantId: string
  driverId: string | null
  vehicleId: string | null
  driverName: string | null
  plateNo: string | null
  hasReturnLeg: boolean
  hasForwardAllocation: boolean
  canAddReturn: boolean
}

export interface ReturnOrderResult {
  orderId: string
  orderNo: string
  waybillId: string
  waybillNo: string
}

export type WaybillDispatchType = 'forward_load' | 'return_load' | 'return_empty'

export interface EmptyReturnTripInput {
  originStation: string
  destinationStation: string
  plannedDepartureTime?: string | null
  plannedArrivalTime?: string | null
  remark?: string | null
}

export async function createEmptyReturnTrip(
  forwardWaybillId: string,
  input: EmptyReturnTripInput
): Promise<{ waybillId: string; waybillNo: string }> {
  const result = await responseHandle<{ waybillId: string; waybillNo: string }>(
    () =>
      supabase.rpc('tms_create_empty_return_secure', {
        p_source_waybill_id: forwardWaybillId,
        p_payload: keysToSnakeDeep(input)
      }),
    { showMessage: true, breakReturn: true }
  )
  if (result.error || !result.data) throw result.error ?? new Error('空载返程创建失败，请稍后重试')
  return result.data
}

export async function createReturnOrder(
  sourceOrderId: string,
  sourceWaybillId: string,
  order: Api.Tms.Order.OrderRecord
): Promise<ReturnOrderResult> {
  const result = await responseHandle<ReturnOrderResult>(
    () =>
      supabase.rpc('tms_create_return_order_secure', {
        p_source_order_id: sourceOrderId,
        p_source_waybill_id: sourceWaybillId,
        p_payload: keysToSnakeDeep(order)
      }),
    { showMessage: true, breakReturn: true }
  )
  if (result.error || !result.data) throw result.error ?? new Error('返程运输单保存失败')
  return result.data
}

export interface ReturnTripInput {
  returnCustomerId: string
  originStation: string
  destinationStation: string
  plannedDepartureAt: string | null
  distanceKm: number | null
  cargoWeightTons: number | null
  cargoVolumeM3: number | null
  freightIncome: number
  informationFee: number
  technicalServiceFee: number
  directTollFee: number
  directMiscFee: number
  sharedCostAllocationPct: number
  remark: string | null
}

export interface ReturnTripSummary {
  waybillId: string
  waybillNo: string
  forwardWaybillId?: string
  forwardWaybillNo?: string
  returns?: ReturnSegmentSummary[]
  forwardOriginStation: string | null
  forwardDestinationStation: string | null
  returnOriginStation: string | null
  returnDestinationStation: string | null
  returnCustomerName: string | null
  returnLegId: string | null
  forwardRevenue?: number | string | null
  returnRevenue?: number | string | null
  tripPlannedRevenue?: number | string | null
  tripActualRevenue?: number | string | null
  tripActualCost?: number | string | null
  tripActualGrossProfit?: number | string | null
  returnDirectPlannedExpense?: number | string | null
  sharedApprovedToll?: number | string | null
  returnAllocatedToll?: number | string | null
  returnPlannedCommission?: number | string | null
  returnProjectedGrossProfit?: number | string | null
  returnProjectedMargin?: number | string | null
  returnActualRevenue?: number | string | null
  returnActualCost?: number | string | null
  returnActualGrossProfit?: number | string | null
  actualAccountingStatus:
    'pending_receivable' | 'approved_to_date' | 'partial_cost' | 'ambiguous_receivable'
  forwardCommissionEstimate: { amount?: number | null; matched?: boolean } | null
  returnCommissionEstimate: { amount?: number | null; matched?: boolean } | null
  accountingStatus: 'planned_only'
}

export interface ReturnSegmentSummary {
  waybillId: string
  waybillNo: string
  legId: string | null
  dispatchType: Exclude<WaybillDispatchType, 'forward_load'>
  sequence: number
  returnCustomerName: string | null
  originStation: string | null
  destinationStation: string | null
  plannedRevenue: number | string | null
  directPlannedExpense: number | string | null
  allocatedSharedToll: number | string | null
  plannedCommission: number | string | null
  projectedGrossProfit: number | string | null
  projectedMargin: number | string | null
  actualRevenue: number | string | null
  actualCost: number | string | null
  actualGrossProfit: number | string | null
  accountingStatus: ReturnTripSummary['actualAccountingStatus']
}

export interface ReturnProfitReportRow {
  legId: string
  waybillId: string
  waybillNo: string
  forwardWaybillId?: string
  forwardWaybillNo?: string
  dispatchType?: Exclude<WaybillDispatchType, 'forward_load'>
  sequence?: number
  waybillStatus: string
  tenantId: string
  tenantName: string
  returnCustomerName: string | null
  originStation: string
  destinationStation: string
  departureAt: string
  plateNo: string | null
  driverName: string | null
  sharedCostAllocationPct: number
  plannedRevenue: number | string | null
  plannedExpense: number | string | null
  allocatedSharedToll: number | string | null
  plannedCommission?: number | string | null
  projectedGrossProfit: number | string | null
  actualRevenue: number | string | null
  actualCost: number | string | null
  actualGrossProfit: number | string | null
  accountingStatus: ReturnTripSummary['actualAccountingStatus']
}

export interface ReturnProfitReportResult {
  records: ReturnProfitReportRow[]
  total: number
  summary: {
    returnCount: number
    approvedCount: number
    pendingCount: number
    projectedRevenue: number | null
    projectedCommission?: number | string | null
    projectedGrossProfit: number | null
    approvedRevenueToDate: number | null
    approvedCostToDate: number | null
    approvedGrossProfitToDate: number | null
    moneyVisible: boolean
  }
}

export interface ReturnTripPreview {
  matched?: boolean
  amount?: number | string | null
  projectedGrossProfit?: number | string | null
  projectedGrossMargin?: number | string | null
  allocatedToll?: number | string | null
}

export type ReturnTripPreviewInput = Pick<
  ReturnTripInput,
  | 'returnCustomerId'
  | 'originStation'
  | 'destinationStation'
  | 'plannedDepartureAt'
  | 'distanceKm'
  | 'cargoWeightTons'
  | 'cargoVolumeM3'
  | 'freightIncome'
  | 'informationFee'
  | 'technicalServiceFee'
  | 'directTollFee'
  | 'directMiscFee'
  | 'sharedCostAllocationPct'
>

function isPreviewAmount(value: unknown): value is number | '***' | null {
  return value == null || value === '***' || (typeof value === 'number' && Number.isFinite(value))
}

export async function previewReturnTrip(
  waybillId: string,
  input: ReturnTripPreviewInput
): Promise<ReturnTripPreview> {
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_preview_return_leg_commission_secure', {
        p_waybill_id: waybillId,
        p_data: keysToSnakeDeep(input)
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  const data = result.data
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('返程收益预览资料不完整')
  const preview = data as Record<string, unknown>
  if (
    (preview.matched !== undefined && typeof preview.matched !== 'boolean') ||
    !isPreviewAmount(preview.amount) ||
    !isPreviewAmount(preview.projectedGrossProfit) ||
    !isPreviewAmount(preview.projectedGrossMargin) ||
    !isPreviewAmount(preview.allocatedToll)
  )
    throw new Error('返程收益预览资料不完整')
  return {
    matched: preview.matched as boolean | undefined,
    amount: preview.amount,
    projectedGrossProfit: preview.projectedGrossProfit,
    projectedGrossMargin: preview.projectedGrossMargin,
    allocatedToll: preview.allocatedToll
  }
}

export async function fetchReturnProfitReport(params: {
  current?: number
  size?: number
  dates?: string[]
  keyword?: string
}): Promise<ReturnProfitReportResult> {
  const current = Math.max(params.current ?? 1, 1)
  const size = Math.max(params.size ?? 20, 1)
  const result = await responseHandle<ReturnProfitReportResult>(
    () =>
      supabase.rpc('tms_return_profit_report_secure', {
        p_offset: (current - 1) * size,
        p_limit: size,
        p_start_date: params.dates?.[0] || null,
        p_end_date: params.dates?.[1] || null,
        p_keyword: normalizeNullableText(params.keyword)
      }),
    { showErrorMessage: true }
  )
  if (result.error || !result.data) throw result.error ?? new Error('返程毛利报表不可用')
  return result.data
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

export async function fetchReturnTripCandidates(orderId: string): Promise<ReturnTripCandidate[]> {
  const result = await responseHandle<ReturnTripCandidate[]>(
    () => supabase.rpc('tms_list_return_trip_candidates_secure', { p_order_id: orderId }),
    { showErrorMessage: true }
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export async function createReturnTrip(waybillId: string, input: ReturnTripInput) {
  return await responseHandle<{ id: string; waybillId: string; waybillNo: string }>(
    () =>
      supabase.rpc('tms_create_return_leg_secure', {
        p_waybill_id: waybillId,
        p_payload: keysToSnakeDeep(input)
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function fetchReturnSharedToll(waybillId: string): Promise<number> {
  const result = await responseHandle<number>(
    () => supabase.rpc('tms_get_return_shared_toll_secure', { p_waybill_id: waybillId }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  return Number(result.data ?? 0)
}

export async function fetchReturnTripSummary(waybillId: string): Promise<ReturnTripSummary> {
  const result = await responseHandle<ReturnTripSummary>(
    () => supabase.rpc('tms_get_return_trip_summary_secure', { p_waybill_id: waybillId }),
    { showErrorMessage: true }
  )
  if (result.error || !result.data) throw result.error ?? new Error('返程收益预估不可用')
  return result.data
}
