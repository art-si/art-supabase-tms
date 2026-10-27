<template>
  <ArtPermissionGuard permission="TmsRoutePerformance:View">
    <div class="route-performance-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="ROUTE PERFORMANCE"
        title="线路效能"
        description="按起讫城市聚合完成趟次、准点率、运输时长与当前延误，快速识别稳定线路和需要优化的运输走廊。"
        icon="ri:road-map-line"
        :tags="[
          { label: `${periodDays} 天窗口`, type: 'primary' },
          { label: '准点与时长', type: 'success' },
          { label: '在途延误', type: 'warning' }
        ]"
        :metrics="metrics"
        refreshable
        refresh-label="刷新线路效能"
        :refresh-loading="loading"
        @refresh="loadOverview"
      />
      <ArtSectionCard
        class="route-performance-page__workspace"
        title="线路排行榜"
        :subtitle="`按完成趟次排序，更新时间 ${generatedAt}`"
        :loading="loading"
        :skeleton-rows="7"
        :error="errorMessage"
        error-title="线路效能加载失败"
        :empty="!overview?.records.length"
        empty-title="当前周期暂无可分析的线路数据"
        empty-description="调整统计周期，或等待线路产生新的运单数据。"
        preserve-content-structure
        @retry="loadOverview"
      >
        <template #actions>
          <ElRadioGroup
            v-model="periodDays"
            size="small"
            aria-label="线路统计周期"
            @change="loadOverview"
          >
            <ElRadioButton
              v-for="option in analysisWindowOptions"
              :key="option.value"
              :value="option.value"
              >{{ option.label }}</ElRadioButton
            >
          </ElRadioGroup>
        </template>
        <ElAlert
          v-if="overview?.truncated"
          class="route-performance-page__capacity-alert"
          type="warning"
          show-icon
          :closable="false"
          :title="`线路数量较大，当前展示 ${overview.returnedRecords} / ${overview.totalRecords} 条`"
          description="排行榜和汇总指标基于当前返回的高频线路。"
        />
        <ol v-if="overview" class="route-performance-page__list">
          <li v-for="(record, index) in overview.records" :key="record.id">
            <span class="route-performance-page__rank">{{ index + 1 }}</span>
            <div class="route-performance-page__route">
              <strong
                >{{ record.originCity }} <ArtSvgIcon icon="ri:arrow-right-line" />
                {{ record.destinationCity }}</strong
              >
              <small
                >{{ record.completedTrips }} 趟完成 · {{ record.activeTrips }} 趟在途 ·
                {{ formatNumberValue(record.cargoWeightTon) }} 吨</small
              >
            </div>
            <div class="route-performance-page__rate">
              <span
                >准点率 <strong>{{ formatRate(record.onTimeRate) }}</strong></span
              >
              <ElProgress
                :percentage="record.onTimeRate ?? 0"
                :stroke-width="7"
                :show-text="false"
                :status="(record.onTimeRate ?? 0) >= 90 ? 'success' : undefined"
              />
            </div>
            <dl>
              <div
                ><dt>平均时长</dt><dd>{{ formatHours(record.averageDurationHours) }}</dd></div
              >
              <div
                ><dt>平均延误</dt><dd>{{ formatHours(record.averageDelayHours) }}</dd></div
              >
            </dl>
            <ElTag :type="record.delayedActiveTrips ? 'danger' : 'success'" effect="light" round>
              {{ record.delayedActiveTrips ? `${record.delayedActiveTrips} 趟延误` : '在途正常' }}
            </ElTag>
          </li>
        </ol>
      </ArtSectionCard>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useAsyncState } from '@vueuse/core'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { formatNumberValue } from '@/utils/ui'
  import { formatWithDayjs } from '@/utils/time'
  import { fetchRoutePerformance } from '@tms/api'

  defineOptions({ name: 'TmsRoutePerformance' })
  const periodDays = ref(90)
  const configuredAnalysisWindowOptions = useDictionaryOptions(
    'tmsRoutePerformanceWindowDays',
    Number
  )
  const analysisWindowOptions = computed(() =>
    configuredAnalysisWindowOptions.filter((option) => [30, 90, 180].includes(option.value))
  )
  const request = useAsyncState(fetchRoutePerformance, null, {
    immediate: false,
    // Recoverable failures are shown by the section card.
    onError: () => undefined
  })
  const overview = request.state
  const loading = request.isLoading
  const errorMessage = computed(() =>
    request.error.value
      ? getFriendlySupabaseErrorMessage(request.error.value, '线路效能加载失败')
      : ''
  )
  const generatedAt = computed(() =>
    overview.value ? formatWithDayjs(overview.value.generatedAt) : '--'
  )
  const formatRate = (value?: number | null) => (value == null ? '--' : `${value}%`)
  const formatHours = (value?: number | null) => (value == null ? '--' : `${value} 小时`)
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      key: 'routes',
      label: '分析线路',
      value: overview.value?.routeCount ?? 0,
      description: `${periodDays.value} 天运输走廊`,
      icon: 'ri:road-map-line',
      tone: 'primary',
      loading: loading.value
    },
    {
      key: 'completed',
      label: '完成趟次',
      value: overview.value?.completedTrips ?? 0,
      description: `${formatNumberValue(overview.value?.cargoWeightTon ?? 0)} 吨货量`,
      icon: 'ri:truck-line',
      tone: 'success',
      loading: loading.value
    },
    {
      key: 'ontime',
      label: '整体准点率',
      value: formatRate(overview.value?.onTimeRate),
      description: '仅统计有计划时限的运单',
      icon: 'ri:timer-line',
      tone: (overview.value?.onTimeRate ?? 100) < 90 ? 'warning' : 'success',
      loading: loading.value
    },
    {
      key: 'delayed',
      label: '当前延误',
      value: overview.value?.delayedActiveTrips ?? 0,
      description: `${overview.value?.activeTrips ?? 0} 趟在途`,
      icon: 'ri:alarm-warning-line',
      tone: overview.value?.delayedActiveTrips ? 'danger' : 'info',
      loading: loading.value
    }
  ])
  async function loadOverview(): Promise<void> {
    await request.executeImmediate(periodDays.value)
  }
  onMounted(() => void loadOverview())
</script>

<style scoped lang="scss">
  .route-performance-page {
    &__workspace {
      min-width: 0;
      padding: 18px;
    }

    &__list {
      display: grid;
      gap: 9px;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    &__capacity-alert {
      margin-bottom: 16px;
    }

    &__list li {
      display: grid;
      grid-template-columns:
        34px minmax(200px, 1.35fr) minmax(150px, 1fr) minmax(180px, 0.8fr)
        auto;
      gap: 14px;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--art-border-color);
      border-radius: var(--art-surface-radius);
    }

    &__rank {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);
    }

    &__route strong {
      display: flex;
      gap: 7px;
      align-items: center;
      color: var(--el-text-color-primary);
    }

    &__route small {
      display: block;
      margin-top: 6px;
      color: var(--art-gray-500);
    }

    &__rate span {
      display: flex;
      justify-content: space-between;
      margin-bottom: 7px;
      font-size: 12px;
      color: var(--art-gray-500);
    }

    &__rate strong {
      color: var(--el-text-color-primary);
    }

    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 0;
    }

    dt,
    dd {
      margin: 0;
      font-size: 12px;
    }

    dt {
      color: var(--art-gray-500);
    }

    dd {
      margin-top: 4px;
      color: var(--el-text-color-primary);
    }
  }

  @media only screen and (width <= 1100px) {
    .route-performance-page__list li {
      grid-template-columns: 34px minmax(0, 1fr) minmax(150px, 0.8fr);
    }

    .route-performance-page__list li dl,
    .route-performance-page__list li > .el-tag {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }

  @media only screen and (width <= 767px) {
    .route-performance-page {
      &__list li {
        grid-template-columns: 34px minmax(0, 1fr);
      }

      &__list li > :not(.route-performance-page__rank, .route-performance-page__route) {
        grid-column: 2;
      }
    }
  }
</style>
