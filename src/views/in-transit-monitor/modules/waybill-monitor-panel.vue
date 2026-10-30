<template>
  <aside class="monitor-sidebar">
    <section class="monitor-panel monitor-panel--summary">
      <div class="monitor-panel__title">
        <strong>运单在线监控</strong>
        <span>实时 {{ orders.length }} 单</span>
      </div>
      <div class="summary-grid">
        <div>
          <strong>{{ overview.orderCount }}</strong>
          <span>监控运单</span>
        </div>
        <div>
          <strong>{{ formatPercentValue(overview.onTimeRate, { fractionDigits: 0 }) }}</strong>
          <span>准时到达率</span>
        </div>
        <div>
          <strong>{{ formatPercentValue(averageProgress, { fractionDigits: 0 }) }}</strong>
          <span>平均进度（含估算）</span>
        </div>
      </div>
      <ElInput
        v-model="keyword"
        :prefix-icon="Search"
        aria-label="搜索运单"
        clearable
        placeholder="请输入运单号、车牌号或司机"
      />
    </section>

    <section class="monitor-panel monitor-panel--list">
      <div class="monitor-panel__title">
        <strong>运单列表（{{ filteredOrders.length }}）</strong>
        <span v-if="overview.delayedCount" class="is-warning">
          {{ overview.delayedCount }} 单延误
        </span>
      </div>
      <ElScrollbar class="monitor-list">
        <ArtAsyncState
          :empty="filteredOrders.length === 0"
          empty-text="暂无匹配运单"
          empty-description="可调整运单状态、车牌号或关键字后重新筛选"
          :empty-image-size="72"
          :min-height="540"
        >
          <button
            v-for="item in filteredOrders"
            :key="item.id"
            type="button"
            class="waybill-card"
            :class="{ 'is-active': item.id === selectedId }"
            :aria-pressed="item.id === selectedId"
            @click="emit('select', item.id)"
          >
            <div class="waybill-card__heading">
              <span
                ><ElIcon><Tickets /></ElIcon
              ></span>
              <div>
                <strong>{{ item.orderNo }}</strong>
                <small>{{ item.source.order?.transportMode || '公路运输' }}</small>
              </div>
              <em
                :style="{
                  color: item.statusColor,
                  backgroundColor: withAlpha(item.statusColor, 0.18)
                }"
              >
                {{ item.statusLabel }}
              </em>
            </div>
            <dl class="waybill-card__details">
              <div>
                <dt>承运单位</dt>
                <dd>{{ item.source.vehicle?.companyName || '自营运输' }}</dd>
              </div>
              <div>
                <dt>运输车辆</dt>
                <dd>{{ item.plateNo }}</dd>
              </div>
              <div>
                <dt>司机姓名</dt>
                <dd>{{ item.driverName }}</dd>
              </div>
              <div v-if="item.driverPhoneVisible">
                <dt>手机号码</dt>
                <dd>{{ item.driverPhone }}</dd>
              </div>
            </dl>
            <MonitorRouteCard :order="item" />
          </button>
        </ArtAsyncState>
      </ElScrollbar>
    </section>
  </aside>
</template>

<script setup lang="ts">
  import { getAverageProgress, withAlpha } from './monitor-utils'
  import { formatPercentValue } from '@/utils/ui/format'
  import { Search, Tickets } from '@element-plus/icons-vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import MonitorRouteCard from './monitor-route-card.vue'
  import type { MonitorOrder, MonitorOverview } from './monitor-types'

  defineOptions({ name: 'TmsWaybillMonitorPanel' })

  const keyword = defineModel<string>('keyword', { required: true })

  const props = defineProps<{
    orders: MonitorOrder[]
    overview: MonitorOverview
    selectedId?: string
  }>()

  const emit = defineEmits<{
    select: [id: string]
  }>()

  const filteredOrders = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLowerCase()
    if (!normalizedKeyword) return props.orders

    return props.orders.filter((item) =>
      [
        item.orderNo,
        item.plateNo,
        item.driverName,
        item.driverPhoneVisible ? item.driverPhone : '',
        item.routeName
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword)
    )
  })

  const averageProgress = computed(() => getAverageProgress(props.orders))
</script>

<style scoped lang="scss">
  @use './monitor-panel-foundation' as monitor;

  @include monitor.panel-foundation;
  @include monitor.summary-grid(#32d99d, #6d91ff);

  .monitor-panel {
    &--summary {
      :deep(.el-input__wrapper) {
        min-height: 38px;
        margin-top: 14px;
        background: rgb(255 255 255 / 8%);
        border: 1px solid rgb(255 255 255 / 6%);
        box-shadow: none;

        &:hover {
          background: rgb(255 255 255 / 11%);
          border-color: rgb(126 159 255 / 26%);
        }
      }
    }
  }

  .monitor-list {
    flex: 1;
    min-height: 0;
  }

  .waybill-card {
    @include monitor.list-card-base;

    &__heading {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: center;

      > span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        font-size: 19px;
        color: #fff;
        background: #315cff;
        border-radius: 50%;
      }

      strong,
      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        color: #fff;
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: #86a9bc;
      }

      em {
        padding: 3px 8px;
        font-size: 11px;
        font-style: normal;
        border-radius: 999px;
      }
    }

    &__details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
      padding: 11px 0 0;
      margin: 0;

      div {
        min-width: 0;
      }

      dt,
      dd {
        display: inline;
        margin: 0;
        font-size: 11px;
      }

      dt {
        color: #7699ab;

        &::after {
          content: '：';
        }
      }

      dd {
        color: #d9e9f2;
      }
    }
  }
</style>
