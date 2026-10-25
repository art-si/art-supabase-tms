import type { ReportTrendPoint } from '../../../api/modules/management-reports'
import { reportNumber } from './report-cells'
/** Keep each readable measure; unknown or restricted values remain gaps, never zero. */
export function financialComparison(trend: ReportTrendPoint[]) {
  const points = trend.filter(
    (point) => typeof point.revenue === 'number' || typeof point.reconciled_cost === 'number'
  )
  return {
    labels: points.map((point) => point.label),
    series: [
      { name: '营收', data: points.map((point) => point.revenue) },
      { name: '核算成本', data: points.map((point) => point.reconciled_cost ?? null) }
    ],
    unit: '元',
    axisUnit: '万元',
    divisor: 10000,
    description: points
      .map(
        (point) =>
          point.label +
          '：营收 ' +
          reportNumber(point.revenue) +
          ' 元，核算成本 ' +
          reportNumber(point.reconciled_cost) +
          ' 元'
      )
      .join('；')
  }
}
