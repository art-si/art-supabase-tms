<template>
  <aside class="monitor-sidebar">
    <section class="monitor-panel monitor-panel--filters">
      <ElInput
        v-model="keyword"
        :prefix-icon="Search"
        aria-label="搜索车辆或运单"
        clearable
        placeholder="请输入车辆或运单号"
      />
      <ElSelect v-model="status" aria-label="筛选运输状态" clearable placeholder="所有状态">
        <ElOption
          v-for="item in statusOptions"
          :key="String(item.value)"
          :label="item.label"
          :value="String(item.value)"
        />
      </ElSelect>
      <ElSelect v-model="region" aria-label="筛选运输区域" clearable placeholder="所有区域">
        <ElOption
          v-for="item in regionOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </ElSelect>
      <div class="monitor-metrics">
        <div class="monitor-metric">
          <span>当前运单量</span>
          <strong>{{ overview.orderCount }}</strong>
          <em>当前查询范围</em>
        </div>
        <div class="monitor-metric">
          <span>准时到达率</span>
          <strong>{{ formatPercentValue(overview.onTimeRate, { fractionDigits: 0 }) }}</strong>
          <em title="根据实际卸货或签收时间，与计划到达时间比较">
            {{ overview.arrivalCount ? `${overview.arrivalCount} 条到达记录` : '暂无实际到达记录' }}
          </em>
        </div>
      </div>
    </section>

    <section class="monitor-panel monitor-panel--list">
      <div class="monitor-panel__title">
        <strong>在途记录（{{ orders.length }}/{{ totalCount }}）</strong>
        <span :class="{ 'is-warning': overview.delayedCount > 0 }">
          {{ overview.delayedCount ? `${overview.delayedCount} 单需关注` : '暂无超时记录' }}
        </span>
      </div>
      <ElScrollbar class="vehicle-list">
        <ArtAsyncState
          :empty="orders.length === 0"
          empty-text="暂无在途车辆"
          empty-description="车辆发车后，可在此查看实时位置与状态。"
          :empty-image-size="72"
          :min-height="460"
        >
          <button
            v-for="item in orders"
            :key="item.id"
            type="button"
            class="vehicle-card"
            :class="{ 'is-active': item.id === selectedId }"
            :aria-pressed="item.id === selectedId"
            @click="emit('select', item.id)"
          >
            <div class="vehicle-card__top">
              <span class="vehicle-card__vehicle-icon">
                <ElIcon><Van /></ElIcon>
              </span>
              <span class="vehicle-card__identity">
                <strong>{{ item.plateNo }}</strong>
                <small>
                  <ArtDictDisplay
                    dict-code="vehicleType"
                    :value="item.vehicleTypeCode || undefined"
                    display="text"
                    :empty-text="item.vehicleTypeLabel"
                  />
                </small>
              </span>
              <span
                class="vehicle-card__status"
                :style="{
                  color: item.statusColor,
                  backgroundColor: withAlpha(item.statusColor, 0.18)
                }"
              >
                {{ item.statusLabel }}
              </span>
            </div>

            <div class="vehicle-card__metrics">
              <span class="vehicle-card__driver">
                <ElIcon><UserFilled /></ElIcon>
                <span>
                  <small>承运司机</small>
                  <strong>{{ item.driverName }}</strong>
                </span>
              </span>
              <span class="vehicle-card__progress-value">
                <small>{{ item.progressLabel }}</small>
                <strong>{{ formatPercentValue(item.progress, { fractionDigits: 0 }) }}</strong>
              </span>
            </div>
            <div class="vehicle-card__progress-track" aria-hidden="true">
              <i :style="{ width: `${item.progress ?? 0}%` }" />
            </div>

            <div class="vehicle-card__geo">
              <span class="vehicle-card__poi">
                <ElIcon><Location /></ElIcon>
                <span>
                  <small>当前位置</small>
                  <span class="vehicle-card__poi-text" :title="getPoiText(item)">
                    {{ getPoiText(item) }}
                  </span>
                </span>
              </span>
              <button
                type="button"
                class="vehicle-card__poi-refresh"
                :class="{ 'is-loading': isPoiLoading(item) }"
                aria-label="刷新当前位置"
                title="刷新当前位置"
                @click.stop="emit('refresh-poi', item)"
                @keydown.enter.stop.prevent="emit('refresh-poi', item)"
              >
                <ElIcon><RefreshRight /></ElIcon>
              </button>
            </div>
            <div class="vehicle-card__order">
              <span>
                <small>当前运单</small>
                <strong :title="item.orderNo">{{ item.orderNo }}</strong>
              </span>
              <span
                v-if="item.status === 'arrived'"
                class="vehicle-card__arrival"
                :class="{
                  'is-delayed': item.arrivalDelayed,
                  'text-[var(--transit-text-muted)]! bg-transparent!': item.arrivalDelayed === null
                }"
              >
                <ElIcon>
                  <Clock v-if="item.arrivalDelayed !== false" />
                  <CircleCheckFilled v-else />
                </ElIcon>
                {{ item.arrivalText }}
              </span>
              <em v-else-if="item.delayed"
                ><ElIcon><Clock /></ElIcon>延误{{ item.delayText }}</em
              >
              <em
                v-else
                class="is-normal"
                :class="{
                  'text-[var(--transit-text-muted)]! bg-transparent!': item.progress === null
                }"
                ><ElIcon><Clock v-if="item.progress === null" /><CircleCheckFilled v-else /></ElIcon
                >{{ item.progress === null ? '暂无进度' : '未超时' }}</em
              >
            </div>
          </button>
        </ArtAsyncState>
      </ElScrollbar>
    </section>
  </aside>
</template>

<script setup lang="ts">
  import {
    CircleCheckFilled,
    Clock,
    Location,
    RefreshRight,
    Search,
    UserFilled,
    Van
  } from '@element-plus/icons-vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { formatPercentValue } from '@/utils/ui/format'
  import { withAlpha } from './monitor-utils'
  import type { MonitorOrder, MonitorOverview, RegionOption, TransitStatus } from './monitor-types'

  defineOptions({ name: 'TmsRealtimeMonitorPanel' })

  const keyword = defineModel<string>('keyword', { required: true })
  const status = defineModel<TransitStatus | ''>('status', { required: true })
  const region = defineModel<string>('region', { required: true })

  defineProps<{
    getPoiText: (order: MonitorOrder) => string
    isPoiLoading: (order: MonitorOrder) => boolean
    orders: MonitorOrder[]
    overview: MonitorOverview
    regionOptions: RegionOption[]
    selectedId?: string
    statusOptions: Api.DataCenter.DictListItem[]
    totalCount: number
  }>()

  const emit = defineEmits<{
    'refresh-poi': [order: MonitorOrder]
    select: [id: string]
  }>()
</script>

<style scoped lang="scss">
  @use './monitor-panel-foundation' as monitor;

  @include monitor.panel-foundation(
    $meta-color: #6edeb1,
    $warning-color: #ffb04f,
    $meta-size: 10px
  );

  .monitor-panel {
    &--filters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 16px;

      :deep(.el-input) {
        grid-column: 1 / -1;
      }

      :deep(.el-input__wrapper),
      :deep(.el-select__wrapper) {
        min-height: 38px;
        background: rgb(255 255 255 / 8%);
        border: 1px solid rgb(255 255 255 / 6%);
        box-shadow: none;

        &:hover {
          background: rgb(255 255 255 / 11%);
          border-color: rgb(126 159 255 / 26%);
        }

        &.is-focus {
          border-color: rgb(126 159 255 / 68%);
          box-shadow: 0 0 0 2px rgb(49 92 255 / 14%);
        }
      }
    }
  }

  .monitor-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-column: 1 / -1;
    gap: 10px;
  }

  .monitor-metric {
    min-width: 0;
    padding: 14px;
    background: rgb(7 16 25 / 60%);
    border: 1px solid rgb(255 255 255 / 4%);
    border-radius: var(--el-border-radius-base);

    span,
    em {
      display: block;
      font-size: 12px;
      font-style: normal;
      color: #8fb2c6;
    }

    strong {
      display: block;
      margin: 8px 0 4px;
      font-size: 28px;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    em {
      color: #23d18b;

      &.is-warning {
        color: #ffb04f;
      }
    }
  }

  .vehicle-list {
    flex: 1;
    min-height: 0;
  }

  .vehicle-card {
    position: relative;
    display: grid;
    gap: 11px;
    width: 100%;
    padding: 13px;
    margin-bottom: 10px;
    overflow: hidden;
    color: #dcecf6;
    text-align: left;
    cursor: pointer;
    background: rgb(7 16 25 / 44%);
    border: 1px solid transparent;
    border-radius: var(--el-border-radius-base);
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      transform 0.18s ease;

    &::before {
      position: absolute;
      top: 10px;
      bottom: 10px;
      left: 0;
      width: 3px;
      content: '';
      background: transparent;
      border-radius: 0 3px 3px 0;
      transition: background-color 0.18s ease;
    }

    &:hover {
      background: rgb(22 42 66 / 78%);
      border-color: rgb(76 125 255 / 28%);
      transform: translateY(-1px);
    }

    &.is-active {
      background: rgb(29 49 78 / 86%);
      border-color: rgb(76 125 255 / 72%);
      box-shadow: 0 10px 24px rgb(0 0 0 / 16%);

      &::before {
        background: #4c7dff;
      }
    }

    &:focus-visible {
      outline: 2px solid #7d9dff;
      outline-offset: -2px;
    }

    &__top {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }

    &__vehicle-icon {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      font-size: 18px;
      color: #a8bdff;
      background: rgb(49 92 255 / 15%);
      border: 1px solid rgb(126 159 255 / 18%);
      border-radius: var(--el-border-radius-small);
    }

    &__identity {
      min-width: 0;

      strong,
      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 15px;
        color: #fff;
      }

      small {
        margin-top: 3px;
        font-size: 10px;
        color: #789caf;
      }
    }

    &__metrics {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding-top: 1px;
    }

    &__driver {
      display: flex;
      gap: 7px;
      align-items: center;
      min-width: 0;

      .el-icon {
        flex: 0 0 auto;
        color: #96d8ff;
      }

      span {
        min-width: 0;
      }
    }

    &__driver,
    &__progress-value {
      small,
      strong {
        display: block;
      }

      small {
        margin-bottom: 2px;
        font-size: 9px;
        color: #668ca2;
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: #dcecf6;
        white-space: nowrap;
      }
    }

    &__progress-value {
      flex: none;
      text-align: right;

      strong {
        color: #8eabff;
      }
    }

    &__progress-track {
      height: 4px;
      overflow: hidden;
      background: rgb(255 255 255 / 8%);
      border-radius: 999px;

      i {
        display: block;
        height: 100%;
        background: linear-gradient(90deg, #315cff, #26e0a8);
        border-radius: inherit;
      }
    }

    &__order {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      justify-content: space-between;
      min-width: 0;
      padding-top: 10px;
      border-top: 1px solid rgb(255 255 255 / 6%);

      > span:first-child {
        min-width: 0;

        small,
        strong {
          display: block;
        }

        small {
          margin-bottom: 3px;
          font-size: 9px;
          color: #668ca2;
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: #dcecf6;
          white-space: nowrap;
        }
      }

      em {
        display: inline-flex;
        flex: none;
        gap: 4px;
        align-items: center;
        padding: 3px 6px;
        font-size: 10px;
        font-style: normal;
        color: #ffb04f;
        background: rgb(255 176 79 / 10%);
        border-radius: 999px;

        &.is-normal {
          color: #4bd6a1;
          background: rgb(75 214 161 / 9%);
        }
      }
    }

    &__arrival {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 4px;
      align-items: center;
      font-weight: 700;
      color: #2ecc71;

      &.is-delayed {
        color: #ff9f43;
      }
    }

    &__geo {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 9px 10px;
      font-size: 12px;
      color: #83a9bd;
      background: rgb(7 16 25 / 32%);
      border-radius: var(--el-border-radius-small);
    }

    &__poi {
      display: inline-flex;
      flex: 1;
      gap: 4px;
      align-items: center;
      min-width: 0;

      .el-icon {
        flex: 0 0 auto;
        color: #4cbbff;
      }

      > span {
        min-width: 0;

        > small {
          display: block;
          margin-bottom: 2px;
          font-size: 9px;
          color: #668ca2;
        }
      }
    }

    &__poi-text {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      line-height: 16px;
      white-space: nowrap;
    }

    &__poi-refresh {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      align-self: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      color: #9bc4d9;
      cursor: pointer;
      border-radius: var(--art-control-radius);

      &:hover,
      &:focus-visible {
        color: #fff;
        outline: 0;
        background: rgb(76 125 255 / 58%);
      }

      &.is-loading .el-icon {
        animation: monitorPoiRefresh 0.9s linear infinite;
      }
    }

    &__status {
      padding: 3px 7px;
      font-size: 10px;
      border-radius: 999px;
    }
  }

  @keyframes monitorPoiRefresh {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .vehicle-card__poi-action.is-loading .el-icon {
      animation: none;
    }
  }
</style>
