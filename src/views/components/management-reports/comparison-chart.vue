<template>
  <div ref="chartRef" class="w-full" :style="{ height: props.height }" aria-hidden="true" />
</template>

<script setup lang="ts">
  import { useChartComponent } from '@/hooks/core/useChart'
  import type { BaseChartProps } from '@/types/component/chart'
  import type { EChartsOption } from '@/plugins/echarts'
  import { getCssVar } from '@/utils/ui'
  import { formatNumberValue, formatCompactNumberValue } from '@/utils/ui/format'

  interface Props extends BaseChartProps {
    labels: string[]
    series: { name: string; data: (number | null)[] }[]
    unit: string
    axisUnit: string
    divisor: number
    axisRange: [number, number]
  }
  const props = withDefaults(defineProps<Props>(), { height: '142px' })
  const { chartRef } = useChartComponent({
    props,
    checkEmpty: () => !props.labels.length,
    watchSources: [
      () => props.labels,
      () => props.series,
      () => props.unit,
      () => props.axisUnit,
      () => props.divisor,
      () => props.axisRange
    ],
    generateOptions: (): EChartsOption => {
      const text = getCssVar('--el-text-color-secondary')
      const strong = getCssVar('--el-text-color-primary')
      const colors = [getCssVar('--theme-color'), getCssVar('--el-color-info-light-3')]
      const scale = props.divisor
      return {
        animation: false,
        color: colors,
        grid: { left: 152, right: 70, top: 28, bottom: 20 },
        legend: {
          top: 0,
          right: 0,
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 7,
          textStyle: { color: text, fontSize: 11 }
        },
        tooltip: {
          trigger: 'axis',
          renderMode: 'richText',
          confine: true,
          axisPointer: { type: 'shadow' },
          valueFormatter: (value) =>
            typeof value === 'number' ? `${formatNumberValue(value)} ${props.unit}` : '待核算'
        },
        xAxis: {
          type: 'value',
          min: props.axisRange[0],
          max: props.axisRange[1],
          name: props.axisUnit,
          nameTextStyle: { color: text, fontSize: 10 },
          splitNumber: 4,
          minInterval: props.unit === '票' ? 1 : undefined,
          axisLabel: {
            color: text,
            fontSize: 10,
            formatter: (value) => formatCompactNumberValue(Number(value) / scale, 1)
          },
          splitLine: {
            lineStyle: { color: getCssVar('--el-border-color-lighter'), type: 'dashed' }
          }
        },
        yAxis: {
          type: 'category',
          inverse: true,
          data: props.labels,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: strong, fontSize: 12, width: 140, overflow: 'truncate' }
        },
        series: props.series.map((series) => ({
          name: series.name,
          // Keep unknown measures in the legend/tooltip without reserving a bar slot.
          type: series.data.some((value) => typeof value === 'number') ? 'bar' : 'line',
          symbol: 'none',
          data: series.data,
          barMaxWidth: 18,
          barGap: '35%',
          itemStyle: { borderRadius: [0, 3, 3, 0] },
          label: {
            show: true,
            position: 'right',
            color: text,
            fontSize: 10,
            formatter: (params: { value: unknown }) => formatNumberValue(params.value)
          }
        }))
      }
    }
  })
</script>
