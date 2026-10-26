<template>
  <ArtPermissionGuard permission="TmsCapacityPlanning:View">
    <div class="capacity-planning-page business-workspace-page">
      <BusinessWorkspaceHeader
        eyebrow="CAPACITY PLANNING"
        title="运力容量中心"
        description="把未来运输需求、在营车辆承载与未配车任务放在同一时间轴，提前识别缺车和运力闲置。"
        icon="ri:truck-line"
        :tags="[
          { label: `${periodDays} 天滚动窗口`, type: 'primary' },
          { label: '需求 × 运力', type: 'warning' },
          { label: '租户安全', type: 'info' }
        ]"
        :metrics="metrics"
        refreshable
        refresh-label="刷新运力容量"
        :refresh-loading="loading"
        @refresh="loadOverview"
      >
        <template #actions>
          <ElRadioGroup v-model="periodDays" size="small" aria-label="运力规划周期">
            <ElRadioButton
              v-for="option in horizonOptions"
              :key="option.value"
              :value="option.value"
              >{{ option.label }}</ElRadioButton
            >
          </ElRadioGroup>
        </template>
      </BusinessWorkspaceHeader>

      <ArtAsyncState
        class="grid min-w-0 gap-4"
        :loading="loading"
        loading-mode="skeleton"
        :skeleton-rows="8"
        :error="errorMessage"
        error-title="运力容量加载失败"
        @retry="loadOverview"
      >
        <template v-if="overview">
          <ElAlert
            :type="decision.type"
            show-icon
            :closable="false"
            :title="decision.title"
            :description="decision.description"
          />

          <ArtSectionCard
            class="capacity-planning-page__timeline"
            title="每日需求与承载"
            :subtitle="`容量利用率按当日货重 ÷ 在营车辆核载总吨位估算，更新时间 ${generatedAt}`"
            :empty="!overview.daily.length"
            empty-title="当前周期暂无运输需求"
            empty-description="调整统计周期，或等待新订单进入计划。"
            :empty-visual-size="72"
            preserve-content-structure
          >
            <template #actions>
              <ElTag type="info" effect="plain" round>
                核载 {{ formatNumberValue(overview.fleetCapacityTon) }} 吨
              </ElTag>
            </template>
            <div class="capacity-planning-page__days">
              <article
                v-for="day in overview.daily"
                :key="day.date"
                :class="{ 'is-risk': day.unassignedTrips > 0 || (day.loadRate ?? 0) > 100 }"
              >
                <div class="capacity-planning-page__day-head">
                  <strong>{{ formatWithDayjs(day.date, 'MM-DD') }}</strong>
                  <span>{{ formatWithDayjs(day.date, 'ddd') }}</span>
                </div>
                <div class="capacity-planning-page__day-value">
                  <strong>{{ day.demandTrips }}</strong
                  ><span>车次</span>
                </div>
                <ElProgress
                  :percentage="Math.min(day.loadRate ?? 0, 100)"
                  :status="dayStatus(day)"
                  :stroke-width="7"
                  :show-text="false"
                />
                <div class="capacity-planning-page__day-meta">
                  <span>{{ formatNumberValue(day.demandTon) }} 吨</span>
                  <span>{{ day.loadRate == null ? '容量待补' : `${day.loadRate}%` }}</span>
                </div>
                <ElTag v-if="day.unassignedTrips" type="warning" effect="light" size="small">
                  {{ day.unassignedTrips }} 单待配车
                </ElTag>
              </article>
            </div>
          </ArtSectionCard>

          <ArtSectionCard
            class="capacity-planning-page__backlog"
            title="未配车任务"
            subtitle="按计划装货时间和创建时间排序，优先处理已等待较久的运单。"
            preserve-content-structure
          >
            <template #actions>
              <ElTag :type="overview.backlogCount ? 'warning' : 'success'" effect="plain" round>
                {{ overview.backlogCount }} 单待安排
              </ElTag>
            </template>
            <ElAlert
              v-if="overview.truncated"
              type="warning"
              show-icon
              :closable="false"
              :title="`待配车任务较多，当前展示 ${overview.returnedBacklogCount} / ${overview.backlogCount} 单`"
            />
            <ArtAsyncState
              :empty="!overview.backlog.length"
              empty-text="当前没有未配车任务"
              empty-description="新的待调度订单出现后，会在此显示。"
              size="compact"
              :empty-image-size="72"
            >
              <ol>
                <li v-for="item in overview.backlog.slice(0, 30)" :key="item.id">
                  <div class="capacity-planning-page__waybill">
                    <BusinessRecordLink
                      :label="item.waybillNo"
                      :description="routeLabel(item)"
                      :title="`查看运单 ${item.waybillNo} 详情`"
                      :to="canViewWaybill ? `/tms/waybill-management/detail/${item.id}` : undefined"
                      compact
                    />
                  </div>
                  <div>
                    <span>计划装货</span>
                    <strong>{{
                      item.plannedLoadTime ? formatWithDayjs(item.plannedLoadTime) : '尚未排期'
                    }}</strong>
                  </div>
                  <div>
                    <span>货重</span>
                    <strong>{{
                      item.cargoWeightTon == null
                        ? '--'
                        : `${formatNumberValue(item.cargoWeightTon)} 吨`
                    }}</strong>
                  </div>
                  <ElTag
                    :type="item.waitingHours >= 24 ? 'danger' : 'warning'"
                    effect="light"
                    round
                  >
                    已等待 {{ formatNumberValue(item.waitingHours) }}h
                  </ElTag>
                </li>
              </ol>
            </ArtAsyncState>
          </ArtSectionCard>
        </template>
      </ArtAsyncState>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { useAsyncState } from '@vueuse/core'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { formatWithDayjs } from '@/utils/time'
  import { formatNumberValue } from '@/utils/ui'
  import { fetchCapacityPlanning } from '@tms/api'

  defineOptions({ name: 'TmsCapacityPlanning' })

  type PeriodDays = Api.Tms.CapacityPlanning.PeriodDays
  type DailyCapacity = Api.Tms.CapacityPlanning.DailyCapacity
  type BacklogWaybill = Api.Tms.CapacityPlanning.BacklogWaybill

  const { hasAnyAuth } = useAuth()
  const periodDays = ref<PeriodDays>(14)
  const configuredHorizonOptions = useDictionaryOptions('tmsCapacityPlanningHorizonDays', Number)
  const horizonOptions = computed(() =>
    configuredHorizonOptions.filter((option) => [7, 14, 30].includes(option.value))
  )
  const request = useAsyncState(fetchCapacityPlanning, null, {
    immediate: false,
    // Recoverable failures are shown by the workspace state.
    onError: () => undefined
  })
  const overview = request.state
  const loading = request.isLoading
  const errorMessage = computed(() =>
    request.error.value
      ? getFriendlySupabaseErrorMessage(request.error.value, '运力容量数据加载失败，请稍后重试')
      : ''
  )
  const canViewWaybill = computed(() =>
    hasAnyAuth(['TmsPendingWaybillList:View', 'TmsLoadedWaybillList:View'])
  )

  const generatedAt = computed(() =>
    overview.value ? formatWithDayjs(overview.value.generatedAt) : '--'
  )
  const futureDemandTrips = computed(() =>
    (overview.value?.daily ?? []).reduce((sum, day) => sum + day.demandTrips, 0)
  )
  const peakLoadRate = computed(() =>
    Math.max(...(overview.value?.daily.map((day) => day.loadRate ?? 0) ?? [0]))
  )
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      key: 'fleet',
      label: '在营车辆',
      value: overview.value?.activeFleetCount ?? 0,
      description: `当前可调度 ${overview.value?.availableVehicleCount ?? 0} 辆`,
      icon: 'ri:truck-line',
      tone: 'primary',
      loading: loading.value
    },
    {
      key: 'active',
      label: '执行中运单',
      value: overview.value?.activeWaybillCount ?? 0,
      description: `${overview.value?.assignedVehicleCount ?? 0} 辆车已占用`,
      icon: 'ri:route-line',
      tone: 'info',
      loading: loading.value
    },
    {
      key: 'future',
      label: `${periodDays.value} 天需求`,
      value: futureDemandTrips.value,
      description: `峰值利用率 ${peakLoadRate.value ? `${peakLoadRate.value}%` : '--'}`,
      icon: 'ri:calendar-schedule-line',
      tone: 'success',
      loading: loading.value
    },
    {
      key: 'unassigned',
      label: '未配车任务',
      value: overview.value?.backlogCount ?? 0,
      description: `${overview.value?.unassignedActiveCount ?? 0} 单已进入执行队列`,
      icon: 'ri:alarm-warning-line',
      tone: overview.value?.backlogCount ? 'warning' : 'info',
      loading: loading.value
    }
  ])
  const decision = computed(() => {
    const backlog = overview.value?.backlogCount ?? 0
    if ((overview.value?.fleetCapacityTon ?? 0) <= 0) {
      return {
        type: 'warning' as const,
        title: '车辆核载资料尚未形成可用容量基线',
        description: '当前仍可按车辆数和未配车任务调度；补齐车辆核载质量后可启用吨位利用率预警。'
      }
    }
    if (peakLoadRate.value > 100) {
      return {
        type: 'error' as const,
        title: '预测运力存在超载窗口',
        description: `峰值利用率达到 ${peakLoadRate.value}%，建议提前外协或调整装货日期。`
      }
    }
    if (backlog > 0) {
      return {
        type: 'warning' as const,
        title: `存在 ${backlog} 个未配车任务`,
        description: '优先处理已等待超过 24 小时或计划装货时间临近的运单。'
      }
    }
    return {
      type: 'success' as const,
      title: '当前运力与需求基本匹配',
      description: '暂无未配车积压，可继续关注后续需求峰值和车辆承载变化。'
    }
  })

  function dayStatus(day: DailyCapacity): 'success' | 'warning' | 'exception' | undefined {
    if ((day.loadRate ?? 0) > 100) return 'exception'
    if (day.unassignedTrips > 0 || (day.loadRate ?? 0) >= 80) return 'warning'
    if (day.demandTrips > 0) return 'success'
    return undefined
  }
  function routeLabel(item: BacklogWaybill): string {
    return `${item.originCity || '未标注起点'} → ${item.destinationCity || '未标注终点'}`
  }
  async function loadOverview(): Promise<void> {
    await request.executeImmediate(periodDays.value)
  }

  watch(periodDays, () => void loadOverview())
  onMounted(() => void loadOverview())
</script>

<style scoped lang="scss">
  .capacity-planning-page {
    &__timeline,
    &__backlog {
      min-width: 0;
      padding: 18px;
    }

    &__days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 10px;

      article {
        min-width: 0;
        padding: 13px;
        background: var(--default-box-color);
        border: 1px solid var(--art-border-color);
        border-radius: var(--el-border-radius-base);

        &.is-risk {
          background: var(--el-color-warning-light-9);
          border-color: var(--el-color-warning-light-7);
        }
      }
    }

    &__day-head,
    &__day-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }

    &__day-head {
      span {
        font-size: 12px;
        color: var(--art-gray-500);
      }
    }

    &__day-value {
      display: flex;
      gap: 5px;
      align-items: baseline;
      margin: 13px 0 9px;

      strong {
        font-size: 22px;
        color: var(--el-text-color-primary);
      }

      span {
        font-size: 12px;
        color: var(--art-gray-500);
      }
    }

    &__day-meta {
      margin-top: 8px;
      font-size: 12px;
      color: var(--art-gray-600);
    }

    &__days .el-tag {
      margin-top: 9px;
    }

    &__backlog ol {
      display: grid;
      gap: 0;
      padding: 0;
      margin: 0;
      list-style: none;

      li {
        display: grid;
        grid-template-columns: minmax(220px, 1.6fr) minmax(170px, 1fr) minmax(100px, 0.6fr) auto;
        gap: 16px;
        align-items: center;
        padding: 13px 4px;
        border-bottom: 1px solid var(--art-border-color);

        > div:not(.capacity-planning-page__waybill) {
          span,
          strong {
            display: block;
          }

          span {
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--art-gray-500);
          }
        }
      }
    }

    &__waybill {
      min-width: 0;

      strong,
      span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        margin-top: 5px;
        font-size: 12px;
        color: var(--art-gray-500);
      }
    }
  }

  @media only screen and (width <= 1280px) {
    .capacity-planning-page__days {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media only screen and (width <= 900px) {
    .capacity-planning-page {
      &__days {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__backlog ol li {
        grid-template-columns: minmax(0, 1fr) auto;

        > div:not(.capacity-planning-page__waybill) {
          grid-column: 1;
        }

        > .el-tag {
          grid-row: 1;
          grid-column: 2;
        }
      }
    }
  }

  @media only screen and (width <= 560px) {
    .capacity-planning-page {
      &__days {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
