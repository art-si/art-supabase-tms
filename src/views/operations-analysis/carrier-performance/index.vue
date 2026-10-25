<template>
  <ReportWorkspace
    title="外包运力考核"
    eyebrow="运营管理分析"
    description="对照承运商准点、异常、回单与投诉表现，为合作与结算审核提供依据。"
    icon="ri:truck-line"
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
          title="承运商履约对比"
          :subtitle="`本期 ${chart.labels.length} 家承运商 · 单位：票`"
          v-bind="chart"
          :loading="overview.loading"
          :error="overview.error"
          @retry="reload"
        />
      </template>
      <template #header-left
        ><ReportNote description="按运单创建日期统计，评分依据不完整时不评级。" :note="note"
      /></template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'

  import type { ColumnOption } from '@/types'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'
  import ReportTrend from '../../components/management-reports/report-trend.vue'
  import ReportViewTabs from '../../components/management-reports/report-view-tabs.vue'
  const reportView = ref<'table' | 'chart'>('table')
  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import { textColumn, numberColumn } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportCarrierPerformance' })

  const {
    tableQueryRef,
    overview,
    search,
    searchItems,
    searchBarProps,
    tableProps,
    fetchRows,
    reload
  } = useReportQuery('carrier-performance', 'day')
  const chart = computed(() => {
    const points = overview.trend.filter(
      (point) => typeof point.count === 'number' && typeof point.completed === 'number'
    )
    return {
      labels: points.map((point) => point.label),
      series: [
        { name: '承运票数', data: points.map((point) => Number(point.count)) },
        { name: '签收 / 完成', data: points.map((point) => Number(point.completed)) }
      ],
      unit: '票',
      axisUnit: '票',
      divisor: 1,
      description: points
        .map(
          (point) =>
            point.label + '：承运 ' + point.count + ' 票，签收 / 完成 ' + point.completed + ' 票'
        )
        .join('；')
    }
  })
  const note =
    '按运单创建日期汇总外协承运商。准点率分母为实际到达和计划到达均完整的运单；延误票数覆盖已迟到与超期未到达。回单按关联订单去重，签收后7天内回收为及时，未到期未回收不计入分母。投诉仅统计期间提交且同租户运单号唯一匹配的投诉，咨询不计入；无来源查看权限时待核算。综合分=准点率×40%+回单及时率×30%+(100−异常率)×20%+无投诉得分×10%；无投诉得分=max(0,100−投诉次数/承运票数×100)。A≥90、B≥80、C≥70、D<70，任一评分项缺数据则不评级。货损金额取本期运单关联的已审核货损赔付费用，未审核不计，缺费用来源或金额权限时待核算；异常票数为延误或存在已审核货损的运单并集，同一运单只计一票，异常率分母为本期承运票数；缺计划到达且无已确认货损、或缺费用来源权限时不完整评级。丢货、扣货等尚缺可靠分类来源，未纳入当前异常口径。结算建议仅供业务审核，不自动扣款或改变付款状态。'
  const metrics = computed(() => [
    reportMetric(
      '合作承运商',
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
    { ...textColumn('label', '承运商'), fixed: 'left' },
    textColumn('plate', '外协车辆'),
    textColumn('driver', '司机'),
    textColumn('route', '合作线路'),
    numberColumn('count', '承运票数'),
    numberColumn('on_time_count', '准时到达票数'),
    numberColumn('on_time_rate', '准点率（%）'),
    numberColumn('exception_count', '异常票数'),
    numberColumn('exception_rate', '异常率（%）'),
    textColumn('exception_orders', '异常运单', 280),
    numberColumn('damage', '已审核货损赔付（元）', 190),
    numberColumn('receipt_rate', '回单及时率（%）'),
    numberColumn('complaints', '已关联投诉次数', 170),
    numberColumn('score', '综合得分'),
    textColumn('rating', '考核等级'),
    textColumn('settlement_advice', '结算建议')
  ]
</script>
