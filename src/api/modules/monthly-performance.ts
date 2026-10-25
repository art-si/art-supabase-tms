import { round } from 'lodash-es'
import type { ReportRow } from './management-reports'
import type { MonthlyPlans } from './monthly-plan'

export interface MonthlyPerformanceInput {
  plans: MonthlyPlans
  actual: ReportRow
  year: ReportRow
  basis?: ReportRow
  tenantId: string | null
  closedMonth: boolean
}

/** Compare a natural month's plan only with the same tenant's unfiltered actuals. */
export function buildMonthlyPerformance(input: MonthlyPerformanceInput): ReportRow[] {
  return input.plans.metrics.map((metric) => {
    const plan = input.tenantId
      ? input.plans.records.find(
          (row) => row.metric_code === metric.code && row.tenant_id === input.tenantId
        )
      : undefined
    const actual = input.actual[metric.code]
    const budget = plan?.budget ?? null
    const target = plan?.target ?? null
    const comparable = typeof actual === 'number'
    let warning = '待核算'
    if (!input.tenantId) warning = '请按租户对比'
    else if (target === null) warning = '未设目标'
    else if (comparable) {
      const achieved = metric.lower_is_better ? actual <= target : actual >= target
      warning = achieved ? '达标' : input.closedMonth ? '未达标' : '跟踪中'
    }
    return {
      _key: metric.code,
      category: metric.category,
      label: metric.label,
      unit: metric.unit,
      actual: comparable ? actual : null,
      budget,
      difference: comparable && budget !== null ? round(actual - budget, 4) : null,
      year: input.year[metric.code] ?? null,
      target,
      direction: metric.lower_is_better ? '不高于' : '不低于',
      warning,
      remark: plan?.remark || '',
      basis:
        input.basis?.[metric.code] ??
        (comparable ? '同租户、月初至截止日，不含关键词筛选' : '实际值来源尚未完整接入或无权查看')
    }
  })
}
