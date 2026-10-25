import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNonNullableText, normalizeNullableNumber } from '@/utils/form/normalize'
import { isPlainObjectRecord } from '@/utils/type-guards'
import dayjs from 'dayjs'
import { fetchManagementReport, type ReportRow } from './management-reports'
import { buildMonthlyPerformance } from './monthly-performance'

export interface MonthlyMetric {
  code: string
  label: string
  category: string
  unit: string
  lower_is_better: boolean
  minimum: number | null
  maximum: number | null
  sort: number
}

export interface MonthlyPlan {
  id: string
  tenant_id: string
  month: string
  metric_code: string
  budget: number | null
  target: number | null
  remark: string
  revision: number
}

export interface MonthlyPlans {
  metrics: MonthlyMetric[]
  records: MonthlyPlan[]
}

export interface MonthlyPlanInput {
  month: string
  metricCode: string
  budget: number | null
  target: number | null
  remark: string
  tenantId: string
  expectedRevision: number
}

const isNullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

function isMonthlyMetric(value: unknown): value is MonthlyMetric {
  return (
    isPlainObjectRecord(value) &&
    ['code', 'label', 'category', 'unit'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0
    ) &&
    typeof value.lower_is_better === 'boolean' &&
    isNullableNumber(value.minimum) &&
    isNullableNumber(value.maximum) &&
    typeof value.sort === 'number' &&
    Number.isInteger(value.sort)
  )
}

function isMonthlyPlan(value: unknown): value is MonthlyPlan {
  return (
    isPlainObjectRecord(value) &&
    ['id', 'tenant_id', 'month', 'metric_code'].every(
      (key) => typeof value[key] === 'string' && value[key].length > 0
    ) &&
    isNullableNumber(value.budget) &&
    isNullableNumber(value.target) &&
    typeof value.remark === 'string' &&
    typeof value.revision === 'number' &&
    Number.isInteger(value.revision) &&
    value.revision > 0
  )
}

export async function fetchMonthlyPlans(month: string): Promise<MonthlyPlans> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_get_monthly_plans_secure', { p_month: month }),
    {
      breakReturn: true,
      showErrorMessage: false,
      convertToCamel: false,
      errorMessage: '预算读取失败，请稍后重试'
    }
  )
  const data = result.data
  if (
    !isPlainObjectRecord(data) ||
    !Array.isArray(data.metrics) ||
    !data.metrics.every(isMonthlyMetric) ||
    !Array.isArray(data.records) ||
    !data.records.every(isMonthlyPlan)
  ) {
    throw new Error('预算数据不完整，请刷新后重试')
  }
  return { metrics: data.metrics, records: data.records }
}

export async function saveMonthlyPlan(input: MonthlyPlanInput): Promise<MonthlyPlan> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_save_monthly_plan_secure', {
        p_month: input.month,
        p_metric_code: input.metricCode,
        p_budget: normalizeNullableNumber(input.budget),
        p_target: normalizeNullableNumber(input.target),
        p_remark: normalizeNonNullableText(input.remark),
        p_tenant_id: input.tenantId,
        p_expected_revision: input.expectedRevision
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      convertToCamel: false,
      errorMessage: '预算保存失败，请刷新后重试'
    }
  )
  if (!isMonthlyPlan(result.data)) {
    throw new Error('未能确认预算保存结果，请刷新核实后再操作')
  }
  return result.data
}

export async function fetchMonthlyPerformance(end: string, tenantId: string | null) {
  const month = dayjs(end).startOf('month').format('YYYY-MM-DD')
  const yearStart = dayjs(end).startOf('year').format('YYYY-MM-DD')
  // Keep annual accounting queries out of the same concurrent burst as KPI queries.
  const [plans, period] = await Promise.all([
    fetchMonthlyPlans(month),
    fetchManagementReport({ report: 'monthly-overview', start: month, end, size: 12 })
  ])
  const year = await fetchManagementReport({
    report: 'monthly-overview',
    start: yearStart,
    end,
    size: 12
  })
  const [operations, yearOperations] = await Promise.all([
    fetchManagementReport({ report: 'monthly-operations', start: month, end, size: 20 }),
    fetchManagementReport({ report: 'monthly-operations', start: yearStart, end, size: 20 })
  ])
  function measures(records: ReportRow[]): ReportRow {
    const total = (key: string): number | null => {
      if (!records.length || records.some((row) => typeof row[key] !== 'number')) return null
      return records.reduce((sum, row) => sum + Number(row[key]), 0)
    }
    const revenue = total('revenue')
    const profit = total('reconciled_profit')
    return {
      orders: total('count'),
      weight_tons: total('weight_tons'),
      volume: total('volume'),
      revenue,
      profit,
      margin: revenue !== null && revenue > 0 && profit !== null ? (profit / revenue) * 100 : null
    }
  }
  const actual = measures(period.records)
  const yearActual = measures(year.records)
  actual.damage = period.summary.damage ?? null
  yearActual.damage = year.summary.damage ?? null
  actual.payroll = period.summary.payroll ?? null
  yearActual.payroll = year.summary.payroll ?? null
  actual.driver_revenue = period.summary.driver_revenue ?? null
  yearActual.driver_revenue = year.summary.driver_revenue ?? null
  actual.outsourced_cost = period.summary.outsourced_cost ?? null
  yearActual.outsourced_cost = year.summary.outsourced_cost ?? null
  actual.own_vehicle_cost = period.summary.own_vehicle_cost ?? null
  yearActual.own_vehicle_cost = year.summary.own_vehicle_cost ?? null
  for (const code of ['receivable', 'overdue']) {
    actual[code] = period.summary[code] ?? null
    yearActual[code] = period.summary[code] ?? null
  }
  const basis: ReportRow = {
    own_vehicle_cost: `${period.summary.own_vehicle_cost_basis ?? '自营车辆期间成本'}；当期来源完整 ${period.summary.own_vehicle_covered ?? '—'} / ${period.summary.own_vehicle_expected ?? '—'} 辆`,
    outsourced_cost: period.summary.outsourced_cost_basis ?? '本期订单关联的已审核承运商运费',
    receivable: period.summary.receivable_basis ?? '截至统计日应收余额，不按月份累加',
    overdue: period.summary.receivable_basis ?? '截至统计日逾期余额，不按月份累加',
    payroll: `按员工归集已审/已付工资应发额；当期完整工资覆盖 ${period.summary.payroll_covered ?? '—'} / ${period.summary.payroll_expected ?? '—'} 名员工。范围含当前启用司机和本期有工资的司机，任一月份缺工资或非人民币时待核算，不含雇主社保成本`,
    driver_revenue: `本期已派车订单营收按订单去重 ÷ 实际承运司机数（${period.summary.driver_count ?? '—'}人）；未派车订单不计，存在未指定司机的有效运单时待核算`,
    damage:
      '本期创建订单关联的已审核货损费用，按费用记录去重；不叠加异常估损与理赔登记，审核不代表已付款'
  }
  for (const code of ['loading', 'empty', 'punctual']) {
    const current = operations.records.find((row) => row.code === code)
    const annual = yearOperations.records.find((row) => row.code === code)
    actual[code] = current?.actual ?? null
    yearActual[code] = annual?.actual ?? null
    basis[code] =
      typeof current?.note === 'string'
        ? current.note.split('；默认黄色预警区间：')[0]
        : '沿用运营KPI统计口径'
  }
  return buildMonthlyPerformance({
    plans,
    actual,
    year: yearActual,
    basis,
    tenantId,
    closedMonth:
      dayjs(end).isSame(dayjs(end).endOf('month'), 'day') && dayjs(end).isBefore(dayjs(), 'day')
  })
}
