<template>
  <ReportWorkspace
    title="线路盈亏分析"
    eyebrow="经营决策"
    description="比较线路营收、核算毛利与单位收支，定位需要改善的运输线路。"
    icon="ri:route-line"
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
  defineOptions({ name: 'TmsReportRouteProfit' })
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
  } = useReportQuery('route-profit', 'month')
  const chart = computed(() => financialComparison(overview.trend))
  const note =
    '按订单创建日期汇总订单起讫线路，取消订单及运单不计入。订单运量由公斤换算为吨，方量沿用订单立方米，一单多运单只计一次；未派车订单也纳入货量，缺失货量保留待核算。收入按订单去重，已归集成本来自已审核费用，未派车订单成本未知。核算成本另按分类去重加入薪酬、车辆保险和折旧分摊，缺少依据时待核算；未登记支出不在统计范围，核算毛利不等于净利润。单位收入、已归集单位成本分别除以订单运量；运量非正数或分子缺失时待核算。'
  const metrics = computed(() => financialMetrics(overview.summary, overview.loading, '分析线路'))
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('label', '线路', router, (row) => ({
        name: 'TmsReportOrderProfit',
        query: {
          keyword: String(row.label),
          start: appliedSearch.dates[0],
          end: appliedSearch.dates[1]
        }
      })),
      fixed: 'left'
    },
    numberColumn('weight_tons', '订单运量（吨）'),
    numberColumn('volume', '订单方量（m³）'),
    ...profitMeasureColumns,
    ...reconciledCostColumns,
    numberColumn('unit_revenue', '单位收入（元/吨）', 170),
    numberColumn('unit_cost', '已归集单位成本（元/吨）', 210),
    ...insuranceAllocationColumns,
    ...depreciationAllocationColumns,
    ...payrollAllocationColumns
  ]
</script>
