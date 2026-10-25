<template>
  <ReportWorkspace
    title="司机日常运营台账"
    eyebrow="运营管理分析"
    description="核对司机期间任务、出回场里程和考勤，跟进签收与回单回收。"
    icon="ri:user-location-line"
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
        ><ReportNote description="一名司机一行，任务按运单创建日期统计。" :note="note"
      /></template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h } from 'vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import { textColumn, numberColumn } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportDriverOperations' })

  const { tableQueryRef, overview, search, searchItems, searchBarProps, tableProps, fetchRows } =
    useReportQuery('driver-operations', 'day')
  const note =
    '一名司机一行；期间任务按运单创建日期，出回场与里程来自执行记录；未完整记录出回场里程则不汇总。考勤通过司机员工关联读取，事故和违章通过司机 ID 关联。违章按发生日期统计；本租户期间存在未关联或无权读取司机身份的违章时，违章数待核实，可在车辆违章中核实关联，不按同名匹配。任务数量为运单数，不将多订单运单重复计算。'
  const metrics = computed(() => [
    reportMetric(
      '分析司机',
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
      '票 · 回收不等于扫描归档',
      'ri:file-check-line',
      overview.loading
    )
  ])
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    { ...textColumn('label', '司机姓名'), fixed: 'left' },
    textColumn('driver_no', '司机编号 / 工号'),
    textColumn('plate', '绑定车牌'),
    textColumn('orders', '承运任务', 280),
    textColumn('departure', '出车时间'),
    textColumn('return_time', '回场时间'),
    numberColumn('mileage', '行驶里程（km）'),
    numberColumn('pickups', '提货完成数'),
    numberColumn('completed', '签收完成数'),
    numberColumn('violation', '违章记录数'),
    numberColumn('accident', '事故记录数'),
    numberColumn('receipt', '回单回收数'),
    {
      ...textColumn('attendance', '出勤状态'),
      formatter: (row) =>
        typeof row.attendance === 'string' && row.attendance
          ? h(
              'span',
              { class: 'flex flex-wrap gap-1' },
              row.attendance.split('、').map((status) =>
                h(ArtDictDisplay, {
                  dictCode: 'hrAttendanceStatus',
                  value: status,
                  unknownText: '待核实'
                })
              )
            )
          : '待核实'
    },
    textColumn('note', '备注', 280)
  ]
</script>
