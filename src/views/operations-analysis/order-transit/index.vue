<template>
  <ReportWorkspace
    title="订单在途跟踪日报"
    eyebrow="运营管理分析"
    description="按所选期间核对执行情况，跟进待办与异常。"
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
      <template #header-left
        ><ReportNote description="按所选日期统计，明细保留业务追溯入口。" :note="note"
      /></template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import {
    linkColumn,
    textColumn,
    numberColumn,
    receiptStatusColumn
  } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportOrderTransit' })
  const router = useRouter()
  const { tableQueryRef, overview, search, searchItems, searchBarProps, tableProps, fetchRows } =
    useReportQuery('order-transit', 'day')
  const note =
    '按订单开单日期筛选未完成订单；执行车辆、司机与提货时间从运单和分配记录关联，签收时间取订单记录。异常标记覆盖超期未签收、人工运输工单和回单异常工单；已解决或已结案的工单保留历史说明，仍超期未签收的订单继续提示异常。未登记货损不推定为零。'
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
      '已上传回单',
      overview.summary.receipt,
      '票 · 上传不等于审核通过',
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
    textColumn('customer', '客户'),
    textColumn('origin', '起运地'),
    textColumn('destination', '目的地'),
    textColumn('created', '开单时间'),
    textColumn('planned_pickup', '计划提货'),
    textColumn('actual_pickup', '实际提货'),
    textColumn('planned', '计划到货'),
    textColumn('arrived', '实际到货'),
    textColumn('plate', '车牌'),
    textColumn('driver', '司机'),
    numberColumn('weight_tons', '装载吨数'),
    numberColumn('volume', '装载方量'),
    textColumn('carrier_type', '承运类型'),
    textColumn('status', '在途状态'),
    textColumn('exception_flag', '异常标记'),
    textColumn('description', '异常原因', 280),
    receiptStatusColumn,
    textColumn('signed', '签收时间')
  ]
</script>
