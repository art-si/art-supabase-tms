import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import dayjs from 'dayjs'

export type ReportRow = Record<string, string | number | null>
export interface ReportTrendPoint {
  label: string
  revenue: number | null
  cost: number | null
  reconciled_cost?: number | null
  count: number | null
  completed: number | null
}
export interface ManagementReportResult {
  records: ReportRow[]
  total: number
  summary: ReportRow
  trend: ReportTrendPoint[]
}

const isReportRow = (value: unknown): value is ReportRow =>
  isPlainObjectRecord(value) &&
  Object.values(value).every(
    (item) =>
      item === null ||
      typeof item === 'string' ||
      (typeof item === 'number' && Number.isFinite(item))
  )

const isTrendPoint = (value: unknown): value is ReportTrendPoint =>
  isPlainObjectRecord(value) &&
  typeof value.label === 'string' &&
  (value.reconciled_cost === undefined ||
    value.reconciled_cost === null ||
    (typeof value.reconciled_cost === 'number' && Number.isFinite(value.reconciled_cost))) &&
  ['revenue', 'cost', 'count', 'completed'].every(
    (key) => value[key] === null || (typeof value[key] === 'number' && Number.isFinite(value[key]))
  )

function isReportResult(value: unknown): value is ManagementReportResult {
  return (
    isPlainObjectRecord(value) &&
    Array.isArray(value.records) &&
    value.records.every(isReportRow) &&
    typeof value.total === 'number' &&
    Number.isInteger(value.total) &&
    value.total >= 0 &&
    isReportRow(value.summary) &&
    Array.isArray(value.trend) &&
    value.trend.every(isTrendPoint)
  )
}

export interface ManagementReportParams {
  report: string
  start: string
  end: string
  keyword?: string
  current?: number
  size?: number
}

export async function fetchManagementReport(params: ManagementReportParams) {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_management_report', {
        p_report: params.report,
        p_start: params.start,
        p_end: params.end,
        p_keyword: params.keyword || null,
        p_offset: ((params.current ?? 1) - 1) * (params.size ?? 20),
        p_limit: params.size ?? 20
      }),
    { showErrorMessage: false, errorMessage: '报表读取失败，请稍后重试', convertToCamel: false }
  )
  if (result.error || !isReportResult(result.data))
    throw new Error('报表读取失败，请检查报表权限或稍后重试', { cause: result.error })
  return result.data
}

export async function fetchMonthlyOverview(params: ManagementReportParams) {
  const yearStart = dayjs(params.end).startOf('year').format('YYYY-MM-DD')
  const [period, year] = await Promise.all([
    fetchManagementReport(params),
    fetchManagementReport({ ...params, start: yearStart, current: 1, size: 1 })
  ])
  return {
    ...period,
    summary: {
      ...period.summary,
      ytd_revenue: year.summary.revenue,
      ytd_cost: year.summary.reconciled_cost ?? null,
      ytd_profit: year.summary.reconciled_profit ?? null,
      ytd_end: params.end
    }
  }
}
