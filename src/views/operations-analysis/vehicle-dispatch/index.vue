<template>
  <ReportWorkspace
    title="车辆调度状态台账"
    eyebrow="运营管理分析"
    description="查看车辆当前任务、运力与证照到期情况，跟进待派和维修车辆。"
    icon="ri:truck-line"
    :metrics="metrics"
    :table="tableQueryRef"
  >
    <ArtTableQuery
      ref="tableQueryRef"
      v-model="search"
      :search-items="currentStateSearchItems"
      :search-bar-props="searchBarProps"
      :api-fn="fetchRows"
      :columns-factory="columnsFactory"
      :table-props="tableProps"
      focusable
    >
      <template #header-left
        ><ReportNote
          description="当前调度状态，一车一行；额定载量不代表剩余可装载量。"
          :note="note"
      /></template>
    </ArtTableQuery>
    <DispatchPlanDialog ref="planDialog" @success="tableQueryRef?.refreshData()" />
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import DispatchPlanDialog from './modules/dispatch-plan-dialog.vue'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import { textColumn, numberColumn } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportVehicleDispatch' })
  const planDialog = ref<InstanceType<typeof DispatchPlanDialog>>()

  const { tableQueryRef, overview, search, searchItems, searchBarProps, tableProps, fetchRows } =
    useReportQuery('vehicle-dispatch', 'day')
  const currentStateSearchItems = searchItems.filter((item) => item.key === 'keyword')
  const note =
    '一车一行，列出当前租户范围内车辆档案；当前任务取最近一张未签收 / 未完成运单，维修状态取有效维修记录。此页为当前状态快照，统计日期不用于隐藏车辆档案。最近上报位置取该车辆未取消运单中带有效经纬度及地址的最新运输事件，同时显示上报时间，不代表实时定位；未来时间、纯线路描述和无运输事件查看权限的记录不展示。预计回场取已登记且仍绑定当前运单的调度计划；维修计划展示预约时间和事项，不等于已开始维修，过期计划仍保留供跟进；额定载重不是剩余可装载量。年检取最近记录，保险取最近保单到期日，含已过期保单。'
  const metrics = computed(() => [
    reportMetric(
      '车辆总数',
      overview.summary.count,
      '辆 · 当前车辆档案',
      'ri:truck-line',
      overview.loading
    ),
    reportMetric(
      '在途车辆',
      overview.summary.in_transit,
      '辆 · 当前执行任务',
      'ri:route-line',
      overview.loading
    ),
    reportMetric(
      '待派车辆',
      overview.summary.dispatch_ready,
      '辆 · 当前可跟进',
      'ri:calendar-line',
      overview.loading
    ),
    reportMetric(
      '维修车辆',
      overview.summary.repair,
      '辆 · 有效维修记录',
      'ri:tools-line',
      overview.loading
    )
  ])
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    { ...textColumn('plate', '车牌'), fixed: 'left' },
    textColumn('vehicle_no', '车辆编号'),
    textColumn('vehicle_type', '车型'),
    textColumn('driver', '当前司机'),
    textColumn('location', '最近上报位置', 240),
    textColumn('location_reported_at', '位置上报时间', 180),
    textColumn('status', '当前状态'),
    numberColumn('capacity_tons', '额定吨位（吨）'),
    numberColumn('capacity_volume', '额定体积（m³）'),
    textColumn('orders', '当前绑定订单', 280),
    textColumn('planned_departure', '计划出车'),
    textColumn('expected_return', '预计回场'),
    textColumn('maintenance_plan', '维修计划', 280),
    textColumn('inspection_due', '年检到期'),
    textColumn('insurance_due', '保险到期'),
    textColumn('note', '备注', 280),
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => {
        if (typeof row.vehicle_id !== 'string') return '—'
        const vehicleId = row.vehicle_id
        return h(ArtButtonTable, {
          type: 'edit',
          label: '维护调度计划',
          permission: 'TmsReportVehicleDispatch:EditPlan',
          onClick: () =>
            void planDialog.value?.handleOpen({ vehicleId, plate: String(row.plate ?? '') })
        })
      }
    }
  ]
</script>
