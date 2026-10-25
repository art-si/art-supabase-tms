import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { normalizeNonNullableText } from '@/utils/form/normalize'

export interface VehicleDispatchPlan {
  vehicleId: string
  waybillId: string | null
  waybillNo: string | null
  expectedReturnAt: string | null
  maintenanceAt: string | null
  maintenanceNote: string
  updatedAt: string | null
}

export interface VehicleDispatchPlanInput {
  vehicleId: string
  waybillId: string | null
  expectedReturnAt: string | null
  maintenanceAt: string | null
  maintenanceNote: string
  expectedUpdatedAt: string | null
}

function parsePlan(value: unknown): VehicleDispatchPlan {
  if (
    !isPlainObjectRecord(value) ||
    typeof value.vehicleId !== 'string' ||
    typeof value.maintenanceNote !== 'string' ||
    !(value.waybillId === null || typeof value.waybillId === 'string') ||
    !(value.waybillNo === null || typeof value.waybillNo === 'string') ||
    !(value.expectedReturnAt === null || typeof value.expectedReturnAt === 'string') ||
    !(value.maintenanceAt === null || typeof value.maintenanceAt === 'string') ||
    !(value.updatedAt === null || typeof value.updatedAt === 'string')
  ) {
    throw new Error('调度计划数据不完整，请重新加载')
  }
  return {
    vehicleId: value.vehicleId,
    waybillId: value.waybillId,
    waybillNo: value.waybillNo,
    expectedReturnAt: value.expectedReturnAt,
    maintenanceAt: value.maintenanceAt,
    maintenanceNote: value.maintenanceNote,
    updatedAt: value.updatedAt
  }
}

export async function getVehicleDispatchPlan(vehicleId: string): Promise<VehicleDispatchPlan> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_get_vehicle_dispatch_plan_secure', { p_vehicle_id: vehicleId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '调度计划加载失败，请重试' }
  )
  return parsePlan(result.data)
}

export async function saveVehicleDispatchPlan(
  input: VehicleDispatchPlanInput
): Promise<VehicleDispatchPlan> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_save_vehicle_dispatch_plan_secure', {
        p_vehicle_id: input.vehicleId,
        p_waybill_id: input.waybillId,
        p_expected_return_at: input.expectedReturnAt || null,
        p_maintenance_at: input.maintenanceAt || null,
        p_maintenance_note: normalizeNonNullableText(input.maintenanceNote),
        p_expected_updated_at: input.expectedUpdatedAt
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '调度计划保存失败，请重试' }
  )
  return parsePlan(result.data)
}
