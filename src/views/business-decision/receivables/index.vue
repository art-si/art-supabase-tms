<template>
  <ReportWorkspace
    title="应收账款跟踪表"
    eyebrow="经营决策"
    description="追踪运输业务财务应收，核对开票、净回款和到期未结余额。"
    icon="ri:wallet-3-line"
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
      <template #header-left
        ><ReportNote description="按财务应收业务日期筛选，余额截至所选结束日期。" :note="note"
      /></template>
    </ArtTableQuery>
    <CollectionCreateDialog ref="collectionDialog" @success="reload" />
    <CollectionHistoryDrawer ref="historyDrawer" />
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import CollectionCreateDialog from './modules/collection-create-dialog.vue'
  import CollectionHistoryDrawer from './modules/collection-history-drawer.vue'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import { textColumn, numberColumn } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportReceivables' })
  const collectionDialog = ref<InstanceType<typeof CollectionCreateDialog>>()
  const historyDrawer = ref<InstanceType<typeof CollectionHistoryDrawer>>()

  const {
    tableQueryRef,
    overview,
    search,
    searchItems: baseSearchItems,
    searchBarProps,
    tableProps,
    fetchRows,
    reload
  } = useReportQuery('receivables', 'month')
  const searchItems = baseSearchItems.map((item) =>
    item.key === 'keyword'
      ? { ...item, props: { ...item.props, placeholder: '应收单 / 订单 / 运单 / 客户' } }
      : item
  )
  const note =
    '仅统计由运输签收运单暂估下推的已审核财务应收，不重复计入暂估。净回款为已审核收款减退款；抵销、坏账等列为其他核销。逾期按应收到期日计算，贷项不计逾期。多币种不合并金额。催收摘要展示截至结束日期的最近一次联系；历史抽屉展示全部已登记记录，需单独的查看权限。应收风险采用默认账龄规则：逾期不足30天为低、30至89天为中、90天及以上为高；未逾期、无未结余额或贷项为低，缺到期日或金额权限时不评级。此分级仅用于跟进优先级，不代表坏账概率。'
  const currencyHint = computed(() =>
    Number(overview.summary.currency_count) > 1
      ? '多币种 · 请按明细币种核对'
      : `${overview.summary.currency || '原币'} · 截至结束日期`
  )
  const metrics = computed(() => [
    reportMetric(
      '财务应收单',
      overview.summary.count,
      '当前筛选范围',
      'ri:file-list-3-line',
      overview.loading
    ),
    reportMetric(
      '未核销余额',
      overview.summary.amount,
      currencyHint.value,
      'ri:wallet-3-line',
      overview.loading
    ),
    reportMetric(
      '逾期未结金额',
      overview.summary.overdue_amount,
      currencyHint.value,
      'ri:alarm-warning-line',
      overview.loading
    ),
    reportMetric(
      '最长逾期',
      overview.summary.oldest_days,
      '天 · 按未结应收到期日起算',
      'ri:calendar-line',
      overview.loading
    )
  ])
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    { ...textColumn('statement', '财务应收单号', 180), fixed: 'left' },
    textColumn('customer', '客户'),
    textColumn('currency', '币种', 80),
    numberColumn('total_amount', '应收金额'),
    numberColumn('invoiced_amount', '开票金额'),
    numberColumn('received_amount', '净回款'),
    numberColumn('other_applied_amount', '其他核销'),
    numberColumn('amount', '未核销余额'),
    numberColumn('overdue_amount', '逾期金额'),
    numberColumn('days', '逾期天数'),
    textColumn('due_date', '到期日'),
    textColumn('payment_term', '收款条件'),
    {
      ...numberColumn('payment_term_days', '约定账期（天）'),
      formatter: (row) =>
        typeof row.payment_term_days === 'number' ? row.payment_term_days : '未约定'
    },
    textColumn('period', '业务日期'),
    textColumn('order_no', '订单号'),
    textColumn('waybill_no', '运单号'),
    textColumn('document_type', '单据类型'),
    textColumn('collection_record', '催收记录'),
    {
      ...textColumn('risk_level', '风险等级'),
      formatter: (row) =>
        typeof row.risk_level === 'string' && row.risk_level ? row.risk_level : '未评级'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 104,
      fixed: 'right',
      formatter: (row) => {
        if (typeof row.statement_id !== 'string') return '—'
        const context = { documentId: row.statement_id, documentNo: String(row.statement ?? '') }
        return h(BusinessTableRowActions, { row }, () => [
          h(ArtButtonTable, {
            type: 'add',
            label: '登记催收',
            permission: 'TmsReportReceivables:AddCollection',
            onClick: () => void collectionDialog.value?.handleOpen(context)
          }),
          h(ArtButtonTable, {
            type: 'view',
            label: '催收历史',
            permission: 'TmsReportReceivables:ViewCollection',
            onClick: () => void historyDrawer.value?.handleOpen(context)
          })
        ])
      }
    }
  ]
</script>
