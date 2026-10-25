import type { BusinessWorkspaceMetric } from '@/components/business/business-workspace-header/index.vue'
import type { ReportRow } from '../../../api/modules/management-reports'
import { reportNumber } from './report-cells'
export function reportMetric(
  label: string,
  value: unknown,
  description: string,
  icon: string,
  loading: boolean
): BusinessWorkspaceMetric {
  return { label, value: reportNumber(value), description, icon, loading }
}
export function financialMetrics(
  summary: ReportRow,
  loading: boolean,
  dimension: string
): BusinessWorkspaceMetric[] {
  return [
    reportMetric(
      dimension,
      summary.count,
      '当前筛选范围 · 全量统计',
      'ri:bar-chart-box-line',
      loading
    ),
    reportMetric('营收合计', summary.revenue, '元 · 订单收入去重统计', 'ri:funds-line', loading),
    reportMetric(
      '核算成本',
      summary.reconciled_cost,
      '元 · 费用与分摊去重',
      'ri:wallet-3-line',
      loading
    ),
    reportMetric(
      '核算毛利',
      summary.reconciled_profit,
      typeof summary.reconciliation_pending === 'number' && summary.reconciliation_pending > 0
        ? `${summary.reconciliation_pending} 项缺核算依据`
        : '元 · 不等同于净利润',
      'ri:line-chart-line',
      loading
    )
  ]
}
