import { h } from 'vue'
import { RouterLink, type RouteLocationRaw, type Router } from 'vue-router'
import { ElTag } from 'element-plus'
import type { ColumnOption } from '@/types'
import { formatNumberValue } from '@/utils/ui/format'
import type { ReportRow } from '../../../api/modules/management-reports'
export const reportNumber = (value: unknown) =>
  value === '***'
    ? '***'
    : typeof value === 'number'
      ? formatNumberValue(value, 'zh-CN', { maximumFractionDigits: 2 })
      : '待核算'
export function textColumn(prop: string, label: string, width = 160): ColumnOption<ReportRow> {
  return {
    prop,
    label,
    minWidth: width,
    showOverflowTooltip: true,
    formatter: (row) => String(row[prop] ?? '—')
  }
}
export function numberColumn(prop: string, label: string, width = 145): ColumnOption<ReportRow> {
  return {
    ...textColumn(prop, label, width),
    align: 'right',
    formatter: (row) => reportNumber(row[prop])
  }
}
export function linkColumn(
  prop: string,
  label: string,
  router: Router,
  target: (row: ReportRow) => RouteLocationRaw | null,
  width = 210
): ColumnOption<ReportRow> {
  return {
    ...textColumn(prop, label, width),
    formatter: (row) => {
      const value = String(row[prop] ?? '未关联'),
        to = target(row)
      const resolved = to ? router.resolve(to) : null
      return to && resolved?.matched.length
        ? h(
            RouterLink,
            { to, class: 'font-medium text-theme focus-visible:outline-2' },
            () => value
          )
        : value
    }
  }
}
export const profitResultColumn: ColumnOption<ReportRow> = {
  prop: 'result',
  label: '核算结果',
  minWidth: 110,
  formatter: (row) => {
    if (typeof row.reconciled_profit !== 'number') return '待核算'
    const result =
      row.reconciled_profit < 0
        ? { type: 'danger' as const, label: '亏损' }
        : row.reconciled_profit === 0
          ? { type: 'info' as const, label: '保本' }
          : { type: 'success' as const, label: '盈利' }
    return h(ElTag, { type: result.type, effect: 'plain' }, () => result.label)
  }
}
export const receiptStatusColumn: ColumnOption<ReportRow> = {
  ...textColumn('receipt_status', '回单状态', 110),
  formatter: (row) =>
    h(
      ElTag,
      {
        type: ['已上传', '已回收'].includes(String(row.receipt_status)) ? 'success' : 'warning',
        effect: 'plain'
      },
      () => String(row.receipt_status ?? '待核实')
    )
}
export const profitMeasureColumns: ColumnOption<ReportRow>[] = [
  numberColumn('count', '订单数', 100),
  numberColumn('revenue', '营收（元）'),
  numberColumn('cost', '已归集成本（元）'),
  numberColumn('profit', '已归集毛利（元）'),
  numberColumn('margin', '已归集毛利率（%）', 160),
  profitResultColumn
]

export const payrollAllocationColumns: ColumnOption<ReportRow>[] = [
  numberColumn('allocated_payroll', '分摊薪酬（元）', 160),
  textColumn('allocation_basis', '薪酬分摊依据', 150),
  numberColumn('cost_with_payroll', '含薪酬成本（元）', 180),
  numberColumn('profit_after_payroll', '含薪酬毛利（元）', 180)
]

export const reconciledCostColumns: ColumnOption<ReportRow>[] = [
  numberColumn('reconciled_cost', '去重后核算成本（元）', 200),
  numberColumn('reconciled_profit', '去重后核算毛利（元）', 200),
  textColumn('reconciliation_status', '核算状态', 170)
]

export const reconciledCostNote =
  ' 去重核算以已审核运单费用为基础，剔除明确分类的司机薪酬、车辆保险、车辆折旧，再加入对应系统分摊金额。司机费用、其他费用、其他在途费尚未核清分类时，或分摊来源与权限不完整时，显示待核算。维修、罚款等已归集费用保留；尚未归集的车辆支出和无订单车辆成本不在其中，核算毛利不等于净利润。'

export const payrollAllocationNote =
  ' 薪酬按司机与订单创建月份固定分摊，应发工资加雇主承担费用作为基数；全部运单里程完整且合计大于零时按里程，否则按不同订单数分摊，同单多运单均分。先按整月分摊再筛选，尾差归最后一张运单。含薪酬成本与毛利先剔除明确分类的已归集司机薪酬，再加入薪酬分摊，不修改运单费用；仅支持人民币单账套薪酬，缺工资、金额权限或关联、费用分类未核清时待核算。'

export const insuranceAllocationColumns: ColumnOption<ReportRow>[] = [
  numberColumn('allocated_insurance', '分摊保险（元）', 160),
  textColumn('insurance_allocation_basis', '保险分摊依据', 150)
]

export const depreciationAllocationColumns: ColumnOption<ReportRow>[] = [
  numberColumn('allocated_depreciation', '分摊折旧（元）', 160),
  textColumn('depreciation_allocation_basis', '折旧分摊依据', 150)
]

export const depreciationAllocationNote =
  ' 分摊折旧取车辆关联资产的已入账月度折旧，按车辆与订单创建月份固定分配；里程完整且合计大于零时按里程，否则按不同订单数，同单多运单均分。先分摊再筛选，尾差归固定排序最后运单。缺已入账折旧或金额权限时待核算；仅人民币单账套，分摊单列，尚未去重合并为完整成本。无承运订单的车辆折旧未分配。'

export const insuranceAllocationNote =
  ' 分摊保险按车辆和订单创建月份计算：整月保费摊销优先按完整执行里程分配，缺里程或合计为零时按不同订单数分配，同单多运单均分，尾差归固定排序最后一单。先分摊再筛选，部分日期查询只取对应订单份额，可能不同于车辆自然日期的期间保险摊销。缺保单、有效日期或保费权限时待核算。分摊保险单列，不直接叠加到已归集成本，以免与已有保险费用重复；无承运订单的车辆成本尚未分配。'
