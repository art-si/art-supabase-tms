<template>
  <ReportWorkspace
    title="运营 KPI 看板台账"
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
        ><ReportNote description="对照六项运营目标，缺少核算依据的指标不判定为达标。" :note="note"
      /></template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, h } from 'vue'
  import { ElTag, type TagProps } from 'element-plus'

  import type { ColumnOption } from '@/types'
  import { formatNumberValue } from '@/utils/ui/format'
  import type { ReportRow } from '../../../api/modules/management-reports'
  import ReportWorkspace from '../../components/management-reports/workspace.vue'
  import ReportNote from '../../components/management-reports/report-note.vue'

  import { useReportQuery } from '../../components/management-reports/use-report-query'
  import { textColumn, numberColumn } from '../../components/management-reports/report-cells'
  import { reportMetric } from '../../components/management-reports/report-metrics'
  defineOptions({ name: 'TmsReportOperationsKpi' })

  const { tableQueryRef, overview, search, searchItems, searchBarProps, tableProps, fetchRows } =
    useReportQuery('operations-kpi', 'week')
  const note =
    '按所选期间计算六项运营指标。装载率使用运单重量 / 对应额定载重；准点率以已到货且计划时间完整的订单为分母。货损率为本期创建订单关联的已审核货损赔付 / 同批订单营收，订单营收去重；未审核损失不计，缺金额权限或营收为零时待核算。回单按签收后7天内回收计算，分母为截至筛选结束日已到期或已回收的签收订单，缺实际回收时间时待核算。空驶率按本期运单回场空驶里程合计 / 总里程合计，缺任一空驶或出回场记录、总里程为零时待核算。应收周转采用财务应收口径：（期初余额+期末余额）/2 ÷ 本期已审核运输财务应收净额 × 期间天数；贷项抵减，混币种或非正净额待核算；未知数据不按零或达标处理。'
  const metrics = computed(() => [
    reportMetric(
      '运营指标',
      overview.summary.count,
      '六项核心运营目标',
      'ri:dashboard-line',
      overview.loading
    ),
    reportMetric(
      '已核算',
      overview.summary.available,
      '项 · 原始数据与口径完整',
      'ri:calculator-line',
      overview.loading
    ),
    reportMetric(
      '已达标',
      overview.summary.achieved,
      '项 · 对照目标判定',
      'ri:checkbox-circle-line',
      overview.loading
    ),
    reportMetric(
      '待核算',
      overview.summary.pending,
      '项 · 缺少数据或规则',
      'ri:information-line',
      overview.loading
    )
  ])
  const warningTypes: Record<string, TagProps['type']> = {
    达标: 'success',
    预警: 'warning',
    未达标: 'danger',
    待核算: 'info'
  }
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    { ...textColumn('label', 'KPI 指标'), fixed: 'left' },
    textColumn('target', '目标值'),
    {
      ...numberColumn('actual', '实际值'),
      formatter: (row) =>
        typeof row.actual === 'number'
          ? formatNumberValue(row.actual, 'zh-CN', { maximumFractionDigits: 4 }) +
            String(row.unit ?? '')
          : '待核算'
    },
    numberColumn('completion', '完成率（%）'),
    {
      ...textColumn('warning', '预警'),
      formatter: (row) =>
        h(
          ElTag,
          {
            type: warningTypes[String(row.warning)] ?? 'info',
            effect: 'plain'
          },
          () => String(row.warning ?? '待核算')
        )
    },
    textColumn('note', '统计口径 / 备注', 280)
  ]
</script>
