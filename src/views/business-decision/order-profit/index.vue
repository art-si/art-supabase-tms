<template>
  <ReportWorkspace
    title="订单毛利分析"
    eyebrow="经营决策"
    description="逐单核对收入与去重成本，追溯车辆、司机和已归集费用。"
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
  defineOptions({ name: 'TmsReportOrderProfit' })
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
  } = useReportQuery('order-profit', 'month')
  const chart = computed(() => financialComparison(overview.trend))
  const note =
    '按订单创建日期统计未取消订单，收入按订单去重，成本合并该订单有效运单的已审核费用。未派车或金额不可读时，对应成本、毛利保留待核算。核算成本在已审核费用基础上去重加入薪酬、车辆保险和折旧分摊，缺少依据时待核算；未登记支出不在统计范围，订单核算毛利不等于净利润；多执行运单在本页按订单合并，不重复计算整单收入。'
  const metrics = computed(() => financialMetrics(overview.summary, overview.loading, '分析订单'))
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('label', '订单号', router, (row) =>
        row.order_id ? { name: 'TmsOrderDetail', params: { id: String(row.order_id) } } : null
      ),
      fixed: 'left'
    },
    textColumn('customer', '客户'),
    {
      ...linkColumn('plate', '承运车牌', router, (row) =>
        row.plate && !/[、,]/.test(String(row.plate))
          ? {
              name: 'TmsReportVehicleProfit',
              query: {
                keyword: String(row.plate),
                start: appliedSearch.dates[0],
                end: appliedSearch.dates[1]
              }
            }
          : null
      ),
      fixed: undefined
    },
    {
      ...linkColumn('driver', '司机', router, (row) =>
        row.driver && !/[、,]/.test(String(row.driver))
          ? {
              name: 'TmsReportDriverProductivity',
              query: {
                keyword: String(row.driver),
                start: appliedSearch.dates[0],
                end: appliedSearch.dates[1]
              }
            }
          : null
      ),
      fixed: undefined
    },
    textColumn('route', '线路'),
    ...profitMeasureColumns,
    ...reconciledCostColumns,
    ...insuranceAllocationColumns,
    ...depreciationAllocationColumns,
    ...payrollAllocationColumns
  ]
</script>
