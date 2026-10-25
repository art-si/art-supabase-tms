<template>
  <ReportWorkspace
    title="回单跟踪管理"
    eyebrow="运营管理分析"
    description="核对回单应收与实收日期，跟进逾期回收、缺失和扫描归档。"
    icon="ri:file-check-line"
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
        ><ReportNote description="按开单日期筛选，点击订单号查看业务详情。" :note="note"
      /></template>
    </ArtTableQuery>
    <ReceiptFollowupDialog ref="followupDialog" @success="tableQueryRef?.refreshData()" />
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ReceiptFollowupDialog from './modules/receipt-followup-dialog.vue'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import {
    linkColumn,
    textColumn,
    receiptStatusColumn
  } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportReceiptTracking' })
  const router = useRouter()
  const followupDialog = ref<InstanceType<typeof ReceiptFollowupDialog>>()
  const { tableQueryRef, overview, search, searchItems, searchBarProps, tableProps, fetchRows } =
    useReportQuery('receipt-tracking', 'day')
  const note =
    '按订单开单日期筛选；默认签收后7天内回收为及时，截止日采用筛选结束日。回收时间取订单、执行运单和执行记录中的实际回收时间，不以签名时间替代；纸质回单登记不等于扫描归档，上传不等于审核通过。历史附件缺回收时间时待核实。'
  const metrics = computed(() => [
    reportMetric(
      '分析订单',
      overview.summary.count,
      '当前筛选范围',
      'ri:bar-chart-box-line',
      overview.loading
    ),
    reportMetric(
      '已签收 / 完成',
      overview.summary.completed,
      '票 · 当前执行结果',
      'ri:checkbox-circle-line',
      overview.loading
    ),
    reportMetric(
      '超期未签收',
      overview.summary.late,
      '票 · 已超过计划到达时间',
      'ri:alarm-warning-line',
      overview.loading
    ),
    reportMetric(
      '已回收 / 上传',
      overview.summary.receipt,
      '票 · 回收不等于审核通过',
      'ri:file-check-line',
      overview.loading
    )
  ])
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('order_no', '订单号', router, (row) =>
        row.order_id ? { name: 'TmsOrderDetail', params: { id: String(row.order_id) } } : null
      ),
      fixed: 'left'
    },
    textColumn('plate', '车牌'),
    textColumn('driver', '司机'),
    textColumn('customer', '客户'),
    textColumn('receipt_type', '回单类型'),
    textColumn('receipt_due', '应回收日期'),
    textColumn('collected', '实际回收日期'),
    receiptStatusColumn,
    textColumn('receipt_timeliness', '回收及时性', 140),
    textColumn('archived', '扫描归档'),
    textColumn('missing_reason', '缺失原因'),
    textColumn('receipt_followup_note', '跟进措施', 240),
    textColumn('note', '备注', 280),
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => {
        if (typeof row.order_id !== 'string') return '—'
        const orderId = row.order_id
        return h(ArtButtonTable, {
          type: 'edit',
          label: '登记回单跟进',
          permission: 'TmsReportReceiptTracking:EditFollowup',
          onClick: () =>
            void followupDialog.value?.handleOpen({
              orderId,
              orderNo: String(row.order_no ?? '')
            })
        })
      }
    }
  ]
</script>
