import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { fetchDispatchWorkbench } from '@tms/api/modules/dispatch-execution'

export type AppointmentKind = 'pickup' | 'delivery'
export type AppointmentStatus = 'pending' | 'confirming' | 'confirmed' | 'completed'

export interface AppointmentRecord {
  id: string
  appointmentNo: string
  kind: AppointmentKind
  anchorWaybillId: string
  selectedWaybillIds: string[]
  driverName: string
  driverPhone: string | null
  plateNo: string
  vehicleType: string | null
  loadCapacityTon: number | null
  vehicleLengthM: number | null
  scheduledAt: string
  status: Exclude<AppointmentStatus, 'pending'>
  remark: string | null
  arrivalPlateNo: string | null
  arrivedAt: string | null
  dockName: string | null
  loadingStartedAt: string | null
  loadingFinishedAt: string | null
  departedAt: string | null
  updateTime: string
}

export interface AppointmentCandidate {
  id: string
  waybillNo: string
  sourceOrderNos: string[]
  shipperAddress: string | null
  status: string
}

export interface AppointmentListRow extends Api.Tms.Waybill.WaybillRecord {
  appointments: AppointmentRecord[]
  appointmentStatus: AppointmentStatus
}

export type AppointmentSearchParams = Api.Tms.Waybill.WaybillSearchParams & {
  appointmentStatus?: AppointmentStatus | ''
}

export interface AppointmentSavePayload {
  id?: string
  kind: AppointmentKind
  anchorWaybillId: string
  selectedWaybillIds: string[]
  driverName: string
  driverPhone: string
  plateNo: string
  loadCapacityTon: number | null
  vehicleLengthM: number | null
  scheduledAt: string
  remark: string
}

export interface AppointmentDispatchSnapshot {
  driverName: string
  driverPhone: string
  plateNo: string
  vehicleType: string
  loadCapacityTon: number | null
  vehicleLengthM: number | null
}

export interface AppointmentArrivalPayload {
  arrivalPlateNo: string
  arrivedAt: string | null
  dockName: string
  loadingStartedAt: string | null
  loadingFinishedAt: string | null
  departedAt: string | null
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '预约信息加载失败，请稍后重试'
} as const

const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  errorMessage: '预约操作失败，请检查内容和权限后重试'
} as const

export function deriveAppointmentStatus(records: AppointmentRecord[]): AppointmentStatus {
  if (!records.length) return 'pending'
  if (records.every((record) => record.status === 'completed')) return 'completed'
  if (records.some((record) => record.status === 'confirming')) return 'confirming'
  return 'confirmed'
}

export async function fetchAppointmentList(
  kind: AppointmentKind,
  params: AppointmentSearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>
) {
  let ids: string[] | undefined
  if (params.appointmentStatus) {
    const filtered = await responseHandle<string[]>(
      () =>
        supabase.rpc('tms_filter_appointment_waybill_ids_secure', {
          p_kind: kind,
          p_status: params.appointmentStatus
        }),
      readOptions
    )
    if (filtered.error) throw filtered.error
    ids = filtered.data ?? []
    if (!ids.length) return { data: [] as AppointmentListRow[], total: 0, error: null }
  }

  const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
  const result = await fetchDispatchWorkbench({ ...params, ids, from, to }, 'loaded', false)
  if (result.error) throw result.error
  const waybills = result.data ?? []
  if (!waybills.length) return { ...result, data: [] as AppointmentListRow[] }

  const appointmentResult = await responseHandle<AppointmentRecord[]>(
    () =>
      supabase.rpc('tms_list_waybill_appointments_secure', {
        p_kind: kind,
        p_waybill_ids: waybills.flatMap((row) => (row.id ? [row.id] : []))
      }),
    readOptions
  )
  if (appointmentResult.error) throw appointmentResult.error
  const appointments = appointmentResult.data ?? []
  const data: AppointmentListRow[] = waybills.map((waybill) => {
    const matched = appointments.filter((appointment) =>
      Boolean(waybill.id && appointment.selectedWaybillIds.includes(waybill.id))
    )
    return {
      ...waybill,
      appointments: matched,
      appointmentStatus: deriveAppointmentStatus(matched)
    }
  })
  return { ...result, data }
}

export async function fetchAppointmentCandidates(waybillId: string) {
  const result = await responseHandle<AppointmentCandidate[]>(
    () =>
      supabase.rpc('tms_list_appointment_candidates_secure', {
        p_waybill_id: waybillId
      }),
    readOptions
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export async function fetchAppointmentWorkspace(kind: AppointmentKind, waybillId: string) {
  const result = await responseHandle<AppointmentRecord[]>(
    () =>
      supabase.rpc('tms_list_waybill_appointments_secure', {
        p_kind: kind,
        p_waybill_ids: [waybillId]
      }),
    readOptions
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export async function fetchAppointmentDispatchSnapshot(kind: AppointmentKind, waybillId: string) {
  const result = await responseHandle<AppointmentDispatchSnapshot>(
    () =>
      supabase.rpc('tms_get_appointment_dispatch_snapshot_secure', {
        p_kind: kind,
        p_waybill_id: waybillId
      }),
    readOptions
  )
  if (result.error || !result.data) throw result.error ?? new Error('调度车辆资料读取失败')
  return result.data
}

export async function saveAppointment(payload: AppointmentSavePayload) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('tms_save_waybill_appointment_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: payload.id ? '预约已更新' : '预约已新增' }
  )
}

export async function deleteAppointment(id: string) {
  return await responseHandle(
    () => supabase.rpc('tms_delete_waybill_appointment_secure', { p_id: id }),
    {
      ...writeOptions,
      showMessage: true,
      message: '预约已删除',
      showErrorMessage: false,
      showReferenceFeedback: false
    }
  )
}

export async function changeAppointmentStatus(id: string, action: 'confirm' | 'complete') {
  return await responseHandle(
    () =>
      supabase.rpc('tms_change_waybill_appointment_status_secure', { p_id: id, p_action: action }),
    {
      ...writeOptions,
      showMessage: true,
      message: action === 'confirm' ? '预约已确认' : '预约已完结'
    }
  )
}

export async function recordAppointmentArrival(id: string, payload: AppointmentArrivalPayload) {
  return await responseHandle(
    () =>
      supabase.rpc('tms_record_waybill_appointment_arrival_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep(payload)
      }),
    { ...writeOptions, showMessage: true, message: '到场信息已保存' }
  )
}
