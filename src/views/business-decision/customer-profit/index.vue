<template>
  <ReportWorkspace
    title="客户毛利分析"
    eyebrow="经营决策"
    description="按客户汇总营收、核算毛利和应收风险，支持客户经营分析。"
    icon="ri:building-line"
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
    <OperatingReviewDialog ref="reviewDialog" @success="reload" />
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import { useRouter } from 'vue-router'

  import type { ColumnOption } from '@/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import OperatingReviewDialog from './modules/operating-review-dialog.vue'
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
  defineOptions({ name: 'TmsReportCustomerProfit' })
  const router = useRouter()
  const reviewDialog = ref<InstanceType<typeof OperatingReviewDialog>>()
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
  } = useReportQuery('customer-profit', 'month')
  const chart = computed(() => financialComparison(overview.trend))
  const note =
    '按订单创建日期汇总客户，取消订单及运单不计入。订单运量由公斤换算为吨，方量沿用订单立方米，一单多运单只计一次；未派车订单也纳入货量，缺失货量保留待核算。收入按订单去重，已归集成本来自已审核费用，未派车订单成本未知。核算成本另按分类去重加入薪酬、车辆保险和折旧分摊，缺少依据时待核算；未登记支出不在统计范围，核算毛利不等于净利润。已审核货损赔付按关联运单归集，已包含在原已归集成本中，不再重复加计；未审核费用不计，缺金额权限显示待核算。已关联投诉统计期间提交、同租户运单号唯一且归属单一客户的投诉，咨询及多客户合单不计入；无投诉来源查看权限时待核算，零不代表客户没有未关联投诉。应收按财务单业务日期及查询结束日核销余额统计，与应收跟踪表一致，不含期前单据；多币种不合计，缺失或无权查看的金额待核算。'
  const metrics = computed(() => financialMetrics(overview.summary, overview.loading, '分析客户'))
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('label', '客户', router, (row) => ({
        name: 'TmsReportOrderProfit',
        query: {
          keyword: String(row.label),
          start: appliedSearch.dates[0],
          end: appliedSearch.dates[1]
        }
      })),
      fixed: 'left'
    },
    {
      prop: 'customer_level',
      label: '客户等级',
      minWidth: 120,
      formatter: (row) =>
        h(ArtDictDisplay, {
          dictCode: 'tmsCustomerLevel',
          value: typeof row.customer_level === 'string' ? row.customer_level : null,
          display: 'tag',
          emptyText: '未维护'
        })
    },
    numberColumn('weight_tons', '订单运量（吨）'),
    numberColumn('volume', '订单方量（m³）'),
    ...profitMeasureColumns,
    ...reconciledCostColumns,
    numberColumn('damage', '已审核货损赔付（元）', 190),
    numberColumn('complaints', '已关联投诉次数', 170),
    textColumn('receivable_currency', '应收币种 / 范围', 180),
    textColumn('payment_term_range', '期间应收约定账期', 200),
    numberColumn('receivable_balance', '期间应收未核销余额', 190),
    numberColumn('overdue_amount', '期间应收逾期金额', 180),
    ...insuranceAllocationColumns,
    ...depreciationAllocationColumns,
    ...payrollAllocationColumns,
    textColumn('customer_strategy', '客户策略', 220),
    textColumn('customer_improvement', '改善措施', 260),
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => {
        if (typeof row.group_key !== 'string' || !row.group_key) return '—'
        const customerId = row.group_key
        return h(ArtButtonTable, {
          type: 'edit',
          label: '经营复盘',
          permission: 'TmsReportCustomerProfit:EditReview',
          onClick: () =>
            void reviewDialog.value?.handleOpen({
              customerId,
              customerName: String(row.label ?? ''),
              periodStart: appliedSearch.dates[0],
              periodEnd: appliedSearch.dates[1]
            })
        })
      }
    }
  ]
</script>
