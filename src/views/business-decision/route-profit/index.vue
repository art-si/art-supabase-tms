<template>
  <ReportWorkspace
    title="线路盈亏分析"
    eyebrow="经营决策"
    :description="
      reportMode === 'route'
        ? '比较线路营收、核算毛利与单位收支，定位需要改善的运输线路。'
        : '按同一趟主运输任务核对返程货预计毛利与财务已审核毛利。'
    "
    icon="ri:route-line"
    :metrics="reportMode === 'route' ? metrics : returnMetrics"
    :table="reportMode === 'route' ? tableQueryRef : returnTableQueryRef"
  >
    <ArtTableQuery
      v-if="reportMode === 'route'"
      ref="tableQueryRef"
      v-model="search"
      :search-items="searchItems"
      :search-bar-props="searchBarProps"
      :api-fn="fetchRows"
      :columns-factory="columnsFactory"
      :table-props="tableProps"
      focusable
    >
      <template #table-header-top>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <ElSegmented
            v-model="reportMode"
            class="w-fit max-w-full"
            :options="reportModeOptions"
            aria-label="选择线路或返程配货报表"
          />
          <ReportViewTabs v-model="reportView" />
        </div>
      </template>
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
    <ArtTableQuery
      v-else
      ref="returnTableQueryRef"
      v-model="search"
      :search-items="searchItems"
      :search-bar-props="searchBarProps"
      :api-fn="fetchReturnRows"
      :columns-factory="returnColumnsFactory"
      :table-props="returnTableProps"
      focusable
    >
      <template #table-header-top>
        <ElSegmented
          v-model="reportMode"
          class="w-fit max-w-full"
          :options="reportModeOptions"
          aria-label="选择线路或返程配货报表"
        />
      </template>
      <template #header-left>
        <ReportNote
          description="返程配货毛利按一张主运单的一条返程子单统计。"
          note="预计毛利已扣返程专属费用、共用路桥分摊及返程司机最终提成预估；正向司机提成不计入返程。已审核值仅汇总完成 FMS 财务应收审核的收入与已审核运单费用，未审批记录不按零元计入实际毛利。已审核毛利为截至当前口径，后续费用入账会变化；预计提成不重复进入已审核成本。"
        />
      </template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h, reactive, ref, watch } from 'vue'
  import { RouterLink, useRouter } from 'vue-router'
  import { ElTag } from 'element-plus'

  import type { ColumnOption } from '@/types'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { formatNumberValue } from '@/utils/ui/format'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import {
    fetchReturnProfitReport,
    type ReturnProfitReportResult,
    type ReturnProfitReportRow
  } from '../../../api/modules/return-trip'
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
  import {
    financialMetrics,
    reportMetric
  } from '../../components/management-reports/report-metrics'
  import { financialComparison } from '../../components/management-reports/financial-comparison'
  defineOptions({ name: 'TmsReportRouteProfit' })
  const router = useRouter()
  const tenantScope = useTenantScopeStore()
  const reportMode = ref<'route' | 'return'>('route')
  const reportModeOptions = [
    { label: '线路总览', value: 'route' },
    { label: '返程配货', value: 'return' }
  ]
  const returnTableQueryRef = ref<ArtTableQueryExpose>()
  const returnOverview = reactive<{
    loading: boolean
    summary: ReturnProfitReportResult['summary']
  }>({
    loading: false,
    summary: {
      returnCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      projectedRevenue: null,
      projectedCommission: null,
      projectedGrossProfit: null,
      approvedRevenueToDate: null,
      approvedCostToDate: null,
      approvedGrossProfitToDate: null,
      moneyVisible: true
    }
  })
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
  const returnMetrics = computed(() => [
    reportMetric(
      '返程货单',
      returnOverview.summary.returnCount,
      '当前筛选范围 · 每趟一条',
      'ri:route-line',
      returnOverview.loading
    ),
    reportMetric(
      '预计返程收入',
      returnOverview.summary.projectedRevenue,
      '元 · 业务预计',
      'ri:funds-line',
      returnOverview.loading
    ),
    reportMetric(
      '预计返程司机提成',
      returnOverview.summary.projectedCommission,
      '元 · 已计入预计成本',
      'ri:wallet-3-line',
      returnOverview.loading
    ),
    reportMetric(
      '预计返程毛利',
      returnOverview.summary.projectedGrossProfit,
      '元 · 尚未财务确认',
      'ri:line-chart-line',
      returnOverview.loading
    ),
    reportMetric(
      '已审核毛利',
      returnOverview.summary.approvedGrossProfitToDate,
      `${returnOverview.summary.approvedCount} 条已审 · ${returnOverview.summary.pendingCount} 条待核算 · 截至当前`,
      'ri:wallet-3-line',
      returnOverview.loading
    )
  ])
  const returnTableProps = {
    rowKey: 'legId',
    emptyText: '当前范围没有返程配货',
    emptyDescription: '请调整日期或关键词；返程配货会按主运输任务归集。'
  }
  let returnRequestVersion = 0
  async function fetchReturnRows(params: {
    current?: number
    size?: number
    dates?: string[]
    keyword?: string
  }) {
    const requestVersion = ++returnRequestVersion
    returnOverview.loading = true
    try {
      const result = await fetchReturnProfitReport({
        ...params,
        dates: params.dates ?? search.dates,
        keyword: params.keyword ?? search.keyword
      })
      if (requestVersion === returnRequestVersion) returnOverview.summary = result.summary
      return {
        records: result.records,
        total: result.total,
        current: params.current ?? 1,
        size: params.size ?? 20
      }
    } finally {
      if (requestVersion === returnRequestVersion) returnOverview.loading = false
    }
  }
  watch(
    () => tenantScope.effectiveTenantId,
    () => {
      returnRequestVersion++
      void returnTableQueryRef.value?.refreshContext()
    }
  )
  function returnMoney(value: unknown): string {
    if (value === '***') return '***'
    if (typeof value !== 'number') return '待核算'
    return formatNumberValue(value, 'zh-CN', { maximumFractionDigits: 2 })
  }
  function returnNumberColumn(
    prop: keyof ReturnProfitReportRow,
    label: string,
    width = 150
  ): ColumnOption<ReturnProfitReportRow> {
    return {
      prop,
      label,
      minWidth: width,
      align: 'right',
      formatter: (row) => returnMoney(row[prop])
    }
  }
  const returnColumnsFactory = (): ColumnOption<ReturnProfitReportRow>[] => [
    {
      prop: 'waybillNo',
      label: '主运输任务',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) =>
        h(
          RouterLink,
          {
            to: { name: 'TmsWaybillDetail', params: { id: row.waybillId } },
            class: 'font-medium text-theme focus-visible:outline-2'
          },
          () => row.waybillNo
        )
    },
    {
      prop: 'returnCustomerName',
      label: '返程货主',
      minWidth: 150,
      showOverflowTooltip: true,
      formatter: (row) => row.returnCustomerName || '资料待补充'
    },
    {
      prop: 'originStation',
      label: '返程线路',
      minWidth: 190,
      showOverflowTooltip: true,
      formatter: (row) => `${row.originStation} → ${row.destinationStation}`
    },
    { prop: 'plateNo', label: '车牌号', minWidth: 125, formatter: (row) => row.plateNo || '—' },
    returnNumberColumn('plannedRevenue', '预计收入（元）'),
    returnNumberColumn('plannedExpense', '专属预计费用（元）', 180),
    returnNumberColumn('allocatedSharedToll', '共用路桥分摊（元）', 190),
    returnNumberColumn('plannedCommission', '预计司机提成（元）', 180),
    returnNumberColumn('projectedGrossProfit', '预计毛利（元）', 165),
    returnNumberColumn('actualRevenue', '已审核收入（元）', 165),
    returnNumberColumn('actualCost', '已审核成本（元）', 165),
    returnNumberColumn('actualGrossProfit', '已审核毛利（元）', 180),
    {
      prop: 'accountingStatus',
      label: '财务核算',
      minWidth: 140,
      formatter: (row) => {
        const status = {
          pending_receivable: { text: '待应收审核', type: 'info' as const },
          partial_cost: { text: '费用待审核', type: 'warning' as const },
          approved_to_date: { text: '已审核 · 截至当前', type: 'success' as const },
          ambiguous_receivable: { text: '待财务核对', type: 'danger' as const }
        }[row.accountingStatus]
        return h(ElTag, { type: status.type, effect: 'plain' }, () => status.text)
      }
    }
  ]
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
