<template>
  <ReportWorkspace
    title="订单异常台账"
    eyebrow="运营管理分析"
    description="区分系统延误提示与已登记工单，跟进异常处理和结案。"
    icon="ri:alarm-warning-line"
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
      <template #header-left
        ><ReportNote
          description="按订单开单日期筛选；系统提示需核实，不代表已登记工单。"
          :note="note"
      /></template>
    </ArtTableQuery>
    <ExceptionTransitionDialog ref="transitionDialog" @success="reload" />
    <ExceptionHistoryDrawer ref="historyDrawer" />
    <ExceptionCreateDialog ref="createDialog" @success="reload" />
    <ExceptionOrderSelector ref="orderSelector" @select="createDialog?.handleOpen($event)" />
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import { useRouter } from 'vue-router'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ExceptionTransitionDialog from './modules/exception-transition-dialog.vue'
  import ExceptionHistoryDrawer from './modules/exception-history-drawer.vue'
  import ExceptionCreateDialog from './modules/exception-create-dialog.vue'
  import ExceptionOrderSelector from './modules/exception-order-selector.vue'
  import type { ArtTableQueryHeaderAction } from '@/components/core/tables/art-table-query/index.vue'
  import type {
    OrderExceptionAction,
    OrderExceptionStatus
  } from '@tms/api/modules/order-exceptions'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import {
    linkColumn,
    textColumn,
    numberColumn
  } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportOrderExceptions' })
  const router = useRouter()
  const transitionDialog = ref<InstanceType<typeof ExceptionTransitionDialog>>()
  const historyDrawer = ref<InstanceType<typeof ExceptionHistoryDrawer>>()
  const createDialog = ref<InstanceType<typeof ExceptionCreateDialog>>()
  const orderSelector = ref<InstanceType<typeof ExceptionOrderSelector>>()
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '登记异常',
      permission: 'TmsReportOrderExceptions:Add',
      onClick: () => void orderSelector.value?.handleOpen()
    }
  ]
  const {
    tableQueryRef,
    overview,
    search,
    searchItems,
    searchBarProps,
    tableProps,
    fetchRows,
    reload
  } = useReportQuery('order-exceptions', 'day')
  const note =
    '合并人工运输工单、回单异常工单与超期未签收提示；提示行不是已登记异常。人工工单按开始处理、登记结果、确认结案推进；未核实金额保留待核算。'
  function openTransition(
    row: ReportRow,
    status: OrderExceptionStatus,
    action: OrderExceptionAction
  ) {
    if (typeof row.exception_id !== 'string') return
    void transitionDialog.value?.handleOpen({
      id: row.exception_id,
      orderNo: String(row.order_no ?? ''),
      status,
      action
    })
  }
  const metrics = computed(() => [
    reportMetric(
      '异常记录',
      overview.summary.count,
      '条 · 工单与系统提示',
      'ri:bar-chart-box-line',
      overview.loading
    ),
    reportMetric(
      '待核实提示',
      overview.summary.unregistered,
      '条 · 尚未登记异常工单',
      'ri:information-line',
      overview.loading
    ),
    reportMetric(
      '待办工单',
      overview.summary.open_work_orders,
      '条 · 含处理中与待结案',
      'ri:alarm-warning-line',
      overview.loading
    ),
    reportMetric(
      '已结案',
      overview.summary.closed_work_orders,
      '条 · 已完成结案确认',
      'ri:checkbox-circle-line',
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
    {
      prop: 'exception_source',
      label: '来源',
      width: 130,
      formatter: (row) => {
        if (row.exception_source === 'manual') return '人工运输工单'
        if (row.exception_id) return '回单异常工单'
        return '系统提示'
      }
    },
    textColumn('driver', '司机'),
    textColumn('customer', '客户'),
    textColumn('origin', '起运地'),
    textColumn('destination', '目的地'),
    textColumn('created', '开单时间'),
    textColumn('planned', '计划到货'),
    textColumn('arrived', '实际到货'),
    textColumn('exception_type', '异常类型'),
    textColumn('stage', '发生节点'),
    textColumn('description', '异常描述', 280),
    numberColumn('estimated_loss', '损失预估（元）'),
    textColumn('responsible', '责任 / 跟进人'),
    textColumn('reported', '上报时间'),
    textColumn('actions', '处理措施'),
    numberColumn('damage', '货损金额（元）'),
    numberColumn('claim', '理赔金额（元）'),
    textColumn('status', '结案状态'),
    {
      prop: 'history',
      label: '处理记录',
      fixed: 'right',
      width: 88,
      formatter: (row) => {
        if (row.exception_source !== 'manual' || typeof row.exception_id !== 'string') return '—'
        const id = row.exception_id
        return h(BusinessTableRowActions, { row }, () =>
          h(ArtButtonTable, {
            type: 'view',
            label: '处理历史',
            permission: 'TmsReportOrderExceptions:ViewHistory',
            onClick: () =>
              void historyDrawer.value?.handleOpen({ id, orderNo: String(row.order_no ?? '') })
          })
        )
      }
    },
    {
      prop: 'operation',
      label: '操作',
      fixed: 'right',
      width: 104,
      formatter: (row) => {
        if (!row.exception_id && typeof row.order_id === 'string') {
          const orderId = row.order_id
          return h(BusinessTableRowActions, { row }, () =>
            h(ArtButtonTable, {
              type: 'add',
              label: '登记异常',
              permission: 'TmsReportOrderExceptions:Add',
              onClick: () =>
                void createDialog.value?.handleOpen({
                  orderId,
                  orderNo: String(row.order_no ?? '')
                })
            })
          )
        }
        if (row.exception_source !== 'manual') return '—'
        const actions: {
          label: string
          icon: string
          action: OrderExceptionAction
          permission: string
        }[] = []
        const status = row.status_code
        if (status === 'pending')
          actions.push({
            label: '开始处理',
            icon: 'ri:play-circle-line',
            action: 'start',
            permission: 'TmsReportOrderExceptions:Process'
          })
        if (status === 'in_progress')
          actions.push({
            label: '登记结果',
            icon: 'ri:edit-box-line',
            action: 'resolve',
            permission: 'TmsReportOrderExceptions:Process'
          })
        if (status === 'resolved')
          actions.push(
            {
              label: '确认结案',
              icon: 'ri:checkbox-circle-line',
              action: 'close',
              permission: 'TmsReportOrderExceptions:Close'
            },
            {
              label: '退回处理',
              icon: 'ri:arrow-go-back-line',
              action: 'reopen',
              permission: 'TmsReportOrderExceptions:Process'
            }
          )
        if (status !== 'pending' && status !== 'in_progress' && status !== 'resolved') return '—'
        return h(BusinessTableRowActions, { row }, () =>
          actions.map((item) =>
            h(ArtButtonTable, {
              type: 'sign',
              label: item.label,
              icon: item.icon,
              permission: item.permission,
              onClick: () => openTransition(row, status, item.action)
            })
          )
        )
      }
    }
  ]
</script>
