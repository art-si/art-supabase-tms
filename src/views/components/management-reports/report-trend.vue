<template>
  <ArtSectionCard
    root-class="management-report-chart border-0! shadow-none!"
    body-class="flex min-h-0 flex-1 flex-col"
    :show-scrollbar="false"
    :min-height="100"
    :skeleton-rows="2"
    :loading="loading"
    :error="error"
    :empty="!labels.length"
    empty-title="暂无可展示的统计"
    empty-description="请调整日期或关键词；未核算和受限金额不参与图表。"
    @retry="$emit('retry')"
  >
    <template #header>
      <div class="mb-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <ArtSectionTitle class="w-auto! shrink-0" :title="title" :show-line="false" />
        <p class="text-xs text-g-600">{{ subtitle }}</p>
      </div>
    </template>
    <div class="min-h-48 flex-1" role="img" :aria-label="description"
      ><ReportComparisonChart
        :labels="visibleLabels"
        :series="visibleSeries"
        :unit="unit"
        :axis-unit="axisUnit"
        :divisor="divisor"
        :axis-range="axisRange"
        height="100%"
    /></div>
    <div
      v-if="labels.length > pageSize"
      class="mt-2 flex items-center justify-between gap-3 text-xs text-g-600"
    >
      <span
        >当前 {{ start + 1 }}–{{ Math.min(start + pageSize, labels.length) }} /
        {{ labels.length }} 项 · 完整明细见表格页签</span
      >
      <ElPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="labels.length"
        layout="prev, next"
        size="small"
      />
    </div>
    <p
      v-if="series.some((item) => item.data.some((value) => value === null))"
      class="mt-1 text-xs text-g-600"
    >
      部分数值尚未核算或无权查看，图中保留空缺，不按零值计算。
    </p>
  </ArtSectionCard>
</template>
<script setup lang="ts">
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ReportComparisonChart from './comparison-chart.vue'
  import { computed, ref, watch } from 'vue'
  const props = defineProps<{
    title: string
    subtitle: string
    labels: string[]
    series: { name: string; data: (number | null)[] }[]
    description: string
    unit: string
    axisUnit: string
    divisor: number
    loading: boolean
    error: string
  }>()
  const pageSize = 4
  const axisRange = computed<[number, number]>(() => {
    const values = props.series.flatMap((item) =>
      item.data.filter((value): value is number => typeof value === 'number')
    )
    return [Math.min(0, ...values), Math.max(1, ...values)]
  })
  const page = ref(1)
  const start = computed(() => (page.value - 1) * pageSize)
  const visibleLabels = computed(() => props.labels.slice(start.value, start.value + pageSize))
  const visibleSeries = computed(() =>
    props.series.map((item) => ({
      ...item,
      data: item.data.slice(start.value, start.value + pageSize)
    }))
  )
  watch(
    () => props.labels,
    () => {
      page.value = 1
    }
  )
  defineEmits<{ retry: [] }>()
</script>
<style scoped lang="scss">
  .management-report-chart {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    padding: var(--art-space-4);
    border: 0;
    box-shadow: none;

    @media (width <= 640px) {
      min-height: 360px;
    }
  }
</style>
