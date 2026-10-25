<template>
  <ReportWorkspace
    title="月度经营总览看板"
    eyebrow="经营决策"
    description="汇总经营收入与去重核算成本，按月比较盈亏并追溯到客户。"
    icon="ri:bar-chart-box-line"
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
      :header-actions="headerActions"
      header-actions-placement="workspace"
      focusable
    >
      <template #table-header-top><ReportViewTabs v-model="reportView" /></template>
      <template v-if="reportView === 'chart'" #content>
        <ReportTrend
          title="经营表现"
          subtitle="所选期间按月汇总 · 单位：元"
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
            reconciledCostNote +
            payrollAllocationNote +
            insuranceAllocationNote +
            depreciationAllocationNote
          "
        />
        <ElButton
          type="primary"
          link
          @click="performanceDialog?.handleOpen(appliedSearch.dates[1])"
        >
          预算执行对比
        </ElButton>
      </template>
    </ArtTableQuery>
    <MonthlyPlanDialog ref="planDialog" @success="reload" />
    <MonthlyPerformanceDialog ref="performanceDialog" />
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import MonthlyPlanDialog from './modules/monthly-plan-dialog.vue'
  import MonthlyPerformanceDialog from './modules/monthly-performance-dialog.vue'
  import type { ArtTableQueryHeaderAction } from '@/components/core/tables/art-table-query/index.vue'
  import { useRouter } from 'vue-router'
  import dayjs from 'dayjs'
  import type { ColumnOption } from '@/types'
  import { fetchMonthlyOverview, type ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'
  import ReportTrend from '../../components/management-reports/report-trend.vue'
  import ReportViewTabs from '../../components/management-reports/report-view-tabs.vue'
  const reportView = ref<'table' | 'chart'>('table')
  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import {
    linkColumn,
    numberColumn,
    profitMeasureColumns,
    reconciledCostColumns,
    reconciledCostNote,
    depreciationAllocationColumns,
    depreciationAllocationNote,
    insuranceAllocationColumns,
    insuranceAllocationNote,
    payrollAllocationColumns,
    payrollAllocationNote,
    reportNumber
  } from '../../components/management-reports/report-cells'
  import { financialMetrics } from '../../components/management-reports/report-metrics'
  import { financialComparison } from '../../components/management-reports/financial-comparison'
  defineOptions({ name: 'TmsReportMonthlyOverview' })
  const router = useRouter()
  const planDialog = ref<InstanceType<typeof MonthlyPlanDialog>>()
  const performanceDialog = ref<InstanceType<typeof MonthlyPerformanceDialog>>()
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '预算与目标',
      permission: 'TmsReportMonthlyOverview:MaintainBudget',
      onClick: () =>
        void planDialog.value?.handleOpen(
          dayjs(appliedSearch.dates[1]).startOf('month').format('YYYY-MM-DD')
        )
    }
  ]
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
  } = useReportQuery('monthly-overview', 'two-months', fetchMonthlyOverview)
  const chart = computed(() => financialComparison(overview.trend))
  const note =
    '按订单创建日期统计全部未取消订单，重量由千克换算为吨，订单收入、运量与方量按订单去重。本年累计从筛选结束日所在年份的1月1日统计至该结束日，沿用当前关键词及租户权限；图表和明细仍使用所选期间。未关联有效主运单的订单计入待归集订单；这些订单的运输成本及所在月份毛利保留待核算，不按零成本处理。已归集成本沿用已审核运单费用；核算成本在分类去重后加入薪酬、车辆保险和折旧分摊，任一来源缺失时待核算。未登记支出不在统计范围，核算毛利不等于净利润。'
  const metrics = computed(() => {
    const items = financialMetrics(overview.summary, overview.loading, '统计月份')
    const keys = ['ytd_revenue', 'ytd_cost', 'ytd_profit']
    keys.forEach((key, index) => {
      const value = overview.summary[key]
      items[index + 1].description = overview.loading
        ? '本年累计读取中…'
        : `本年累计 ${reportNumber(value)}${typeof value === 'number' ? ' 元' : ''}`
    })
    items[0].description = overview.summary.ytd_end
      ? `年累计截至 ${overview.summary.ytd_end}`
      : '当前筛选范围 · 全量统计'
    return items
  })
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('label', '统计月份', router, (row) => {
        const start = String(row.label) + '-01'
        const end = dayjs(start).endOf('month').format('YYYY-MM-DD')
        return {
          name: 'TmsReportCustomerProfit',
          query: {
            keyword: appliedSearch.keyword,
            start: start > appliedSearch.dates[0] ? start : appliedSearch.dates[0],
            end: end < appliedSearch.dates[1] ? end : appliedSearch.dates[1]
          }
        }
      }),
      fixed: 'left'
    },
    numberColumn('weight_tons', '订单运量（吨）'),
    numberColumn('volume', '订单方量（m³）'),
    numberColumn('undispatched', '待归集订单', 120),
    ...profitMeasureColumns,
    ...reconciledCostColumns,
    ...insuranceAllocationColumns,
    ...depreciationAllocationColumns,
    ...payrollAllocationColumns
  ]
</script>
