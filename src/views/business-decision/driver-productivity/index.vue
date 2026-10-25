<template>
  <ReportWorkspace
    title="司机投产出分析"
    eyebrow="经营决策"
    description="对照司机承运产值、薪酬投入和核算毛利，追溯车辆与订单。"
    icon="ri:user-star-line"
    :metrics="metrics"
    :table="tableQueryRef"
  >
    <ArtTableQuery
      ref="tableQueryRef"
      v-model="search"
      :search-items="searchItems"
      :search-bar-props="searchBarProps"
      :api-fn="fetchRows"
      :columns-factory="columnsFactory"
      :table-props="tableProps"
      focusable
    >
      <template #table-header-top><ReportViewTabs v-model="reportView" /></template>
      <template v-if="reportView === 'chart'" #content>
        <ReportTrend
          title="经营表现"
          :subtitle="`按营收排序 · ${chart.labels.length} 个对象 · 单位：元`"
          v-bind="chart"
          :loading="overview.loading"
          :error="overview.error"
          @retry="reload"
        />
      </template>
      <template #header-left
        ><ReportNote
          description="核算口径含薪酬、车辆保险和折旧，缺少依据时待核算。"
          :note="
            note +
            classificationNote +
            attendanceNote +
            reconciledCostNote +
            payrollAllocationNote +
            insuranceAllocationNote +
            depreciationAllocationNote
          "
      /></template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'
  import ReportTrend from '../../components/management-reports/report-trend.vue'
  import ReportViewTabs from '../../components/management-reports/report-view-tabs.vue'
  const reportView = ref<'table' | 'chart'>('table')
  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import {
    linkColumn,
    textColumn,
    numberColumn,
    profitMeasureColumns,
    reconciledCostColumns,
    reconciledCostNote,
    depreciationAllocationColumns,
    depreciationAllocationNote,
    insuranceAllocationColumns,
    insuranceAllocationNote,
    payrollAllocationColumns,
    payrollAllocationNote
  } from '../../components/management-reports/report-cells'
  import { financialMetrics } from '../../components/management-reports/report-metrics'
  import { financialComparison } from '../../components/management-reports/financial-comparison'
  defineOptions({ name: 'TmsReportDriverProductivity' })
  const router = useRouter()
  const {
    tableQueryRef,
    overview,
    search,
    appliedSearch,
    searchItems,
    searchBarProps,
    tableProps,
    fetchRows,
    reload
  } = useReportQuery('driver-productivity', 'month')
  const chart = computed(() => financialComparison(overview.trend))
  const note =
    '承运吨数与方量按有效执行运单逐笔归集，缺失值待核算。运输周转量按各运单载重×重驶里程求和；重驶里程为回场表显减出车表显再减空驶里程，假设重驶全程保持运单载重，未细分中途装卸。任一运单缺少载重或里程依据时待核算。营收与已归集成本按订单创建日期统计，取消运单不计入；一单多执行运单缺少收入分摊时，营收与毛利留空。薪酬通过同租户员工档案关联，读取筛选日期所覆盖月份中当前已审核或已发放的整月工资，实际月份及币种单列，不按查询天数折算；草稿、未审核及跨账套重复核算不合计，缺记录或权限时待核算。扣减包含税费等，不能全部当作违章扣款；雇主承担费用不等于工资。薪酬分摊单列用于追溯，不修改原始运单费用；核算成本已按分类去重加入薪酬、车辆保险和折旧分摊，缺少依据时待核算。未登记支出不在统计范围，核算毛利并非完整人力损益。'
  const metrics = computed(() => financialMetrics(overview.summary, overview.loading, '分析司机'))
  const classificationNote =
    '提成、违章扣款和事故扣款仅取已审核薪酬中同名项目。提成包含在应发工资内，两类扣款包含在薪酬扣减内，不重复计入成本；任一月份缺少同名项目则待核算，确认为零时需在薪酬中明确登记零金额。'
  const attendanceNote =
    '考勤按筛选日期内工作日期去重。已核算出勤天数仅计实际工时大于零且当日全部考勤异常状态为已清除的日期，不折算标准工日；仍有异常的日期单列待处理。记录日期数用于判断覆盖情况，不代表完整月份或已封账；无记录或无查看权限时待核算。'
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('label', '司机', router, (row) => ({
        name: 'TmsReportOrderProfit',
        query: {
          keyword: String(row.label),
          start: appliedSearch.dates[0],
          end: appliedSearch.dates[1]
        }
      })),
      fixed: 'left'
    },
    textColumn('plate', '承运车辆'),
    numberColumn('attendance_days', '已核算出勤（天）', 180),
    numberColumn('attendance_pending_days', '待处理考勤（天）', 180),
    numberColumn('attendance_recorded_days', '考勤记录日期数', 180),
    numberColumn('weight_tons', '承运运量（吨）'),
    numberColumn('volume', '承运方量（m³）'),
    numberColumn('total_mileage', '行驶里程（km）', 160),
    numberColumn('loaded_mileage', '重驶里程（km）', 160),
    numberColumn('tonne_km', '运输周转量（吨公里）', 190),
    ...profitMeasureColumns,
    ...reconciledCostColumns,
    textColumn('payroll_months', '已审核薪酬月份', 180),
    textColumn('payroll_currency', '薪酬币种', 130),
    numberColumn('payroll_gross', '应发工资', 140),
    numberColumn('payroll_commission', '提成（含在应发内）', 190),
    numberColumn('payroll_traffic_deductions', '违章扣款', 140),
    numberColumn('payroll_accident_deductions', '事故扣款', 140),
    numberColumn('payroll_deductions', '薪酬扣减', 140),
    numberColumn('payroll_employer', '雇主承担费用', 160),
    numberColumn('payroll_net', '实发工资', 140),
    ...insuranceAllocationColumns,
    ...depreciationAllocationColumns,
    ...payrollAllocationColumns
  ]
</script>
