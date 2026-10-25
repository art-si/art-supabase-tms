<template>
  <ReportWorkspace
    title="单车盈亏分析"
    eyebrow="经营决策"
    description="核对单车营收、里程和分摊成本，识别亏损车辆与待核算项目。"
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
            depreciationAllocationNote +
            fuelNote +
            depreciationNote
          "
      /></template>
    </ArtTableQuery>
  </ReportWorkspace>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'

  import type { ColumnOption } from '@/types'
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
  defineOptions({ name: 'TmsReportVehicleProfit' })
  const router = useRouter()
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
  } = useReportQuery('vehicle-profit', 'month')
  const chart = computed(() => financialComparison(overview.trend))
  const note =
    '承运吨数与方量按有效执行运单逐笔归集，缺失值待核算，不按整单货量分配给车辆或司机。里程沿用本表订单创建日期范围，按运单去重读取出回场表数及录入空驶；重驶=总里程−空驶，空驶率按里程加权，任一缺记录或总里程为零时对应指标待核算。按订单创建日期统计有效执行运单，已归集成本只含已审核费用。油费、路费为该范围已归集的对应费用，零表示没有已审核记录，不表示车辆没有发生该项开支；充电、燃气等不混入油费。明细与总额均遵循字段权限。期间保险摊销按保单投保日至到期日（含首尾日）平均分摊，取与查询日期重叠的天数，商业险与交强险相加；无期间保单、日期或保费缺失时待核算。期间保险列按车辆和自然日期计算，用于对照；分摊保险列按车辆月份分配到订单，两者不直接相加。核算成本在已归集费用基础上去重加入薪酬、车辆保险和折旧分摊，缺少依据时待核算。尚未关联的维修、违章及其他未登记支出不在统计范围，核算毛利不等于净利润。一单多执行运单且缺少收入分摊时，营收与毛利留空。'
  const metrics = computed(() => financialMetrics(overview.summary, overview.loading, '分析车辆'))
  const fuelNote =
    ' 耗油量按完成运单的出车余油＋途中加油－回场余油计算，单位为升；百公里油耗＝总耗油量÷对应总里程×100，不对各单油耗率取平均。沿用订单创建日期范围，按执行运单去重；油量缺失、里程非正、未完成、同车表显区间重叠或无执行来源权限时待核算。加油费用金额不参与油耗换算。'
  const depreciationNote =
    ' 已入账折旧来自明确关联车辆的固定资产，只统计与查询日期重叠会计期间的已入账整期金额，入账月份单列。未入账、缺来源权限或金额权限时待核算；仅汇总人民币单账套，不代表所有查询月份均已入账，也未重复加入运单成本。'
  const columnsFactory = (): ColumnOption<ReportRow>[] => [
    {
      ...linkColumn('label', '车牌', router, (row) => ({
        name: 'TmsReportOrderProfit',
        query: {
          keyword: String(row.label),
          start: appliedSearch.dates[0],
          end: appliedSearch.dates[1]
        }
      })),
      fixed: 'left'
    },
    textColumn('driver', '所属司机'),
    numberColumn('weight_tons', '承运运量（吨）'),
    numberColumn('volume', '承运方量（m³）'),
    ...profitMeasureColumns,
    ...reconciledCostColumns,
    numberColumn('fuel_cost', '已归集油费（元）', 170),
    numberColumn('toll_cost', '已归集路费（元）', 170),
    numberColumn('vehicle_maintenance_cost', '已归集维修保养（元）', 190),
    numberColumn('traffic_fine_cost', '已归集违章罚款（元）', 190),
    ...insuranceAllocationColumns,
    ...depreciationAllocationColumns,
    ...payrollAllocationColumns,
    numberColumn('insurance_period_cost', '期间保险摊销（元）', 190),
    numberColumn('total_mileage', '总里程（公里）', 160),
    numberColumn('loaded_mileage', '重驶里程（公里）', 170),
    numberColumn('empty_mileage', '空驶里程（公里）', 170),
    numberColumn('empty_rate', '空驶率（%）', 140),
    numberColumn('consumed_fuel_liters', '耗油量（升）', 160),
    numberColumn('fuel_per_100km', '百公里油耗（L/100km）', 220),
    numberColumn('depreciation_posted', '已入账折旧（元）', 180),
    textColumn('depreciation_months', '折旧入账月份', 170)
  ]
</script>
