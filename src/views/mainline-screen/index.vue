<template>
  <div ref="screenRef" class="mainline-screen" aria-label="运输主线运营大屏">
    <header class="screen-header">
      <div class="screen-header__identity">
        <button
          type="button"
          class="icon-control"
          aria-label="返回上一页"
          title="返回上一页"
          @click="router.back()"
        >
          <ArtSvgIcon icon="ri:arrow-left-line" />
        </button>
        <div>
          <span class="eyebrow">TMS · OPERATIONS</span>
          <h1>运输主线运营大屏</h1>
          <p>订单、车辆、司机三条主线的实时关联态势</p>
        </div>
      </div>
      <div class="screen-header__meta">
        <span class="update-label"
          ><i />{{
            !canViewScreen ? '暂无查看权限' : refreshing ? '正在同步' : `更新于 ${updateText}`
          }}</span
        >
        <button
          type="button"
          class="icon-control"
          :disabled="refreshing || !canViewScreen"
          aria-label="刷新大屏"
          title="刷新大屏"
          @click="loadOverview"
        >
          <ArtSvgIcon icon="ri:refresh-line" />
        </button>
        <button
          type="button"
          class="icon-control"
          :aria-label="isFullscreen ? '退出全屏' : '进入全屏'"
          :title="isFullscreen ? '退出全屏' : '进入全屏'"
          @click="toggleFullscreen"
        >
          <ArtSvgIcon :icon="isFullscreen ? 'ri:fullscreen-exit-line' : 'ri:fullscreen-line'" />
        </button>
      </div>
    </header>

    <ArtAsyncState
      class="screen-state"
      :loading="loading"
      :error="canViewScreen ? error : '暂无运营大屏查看权限，请联系管理员开通。'"
      :retryable="canViewScreen"
      :empty="canViewScreen && !loading && !error && overview?.totals.orders === 0"
      empty-text="当前范围暂无运输订单"
      empty-description="建立订单与车辆、司机的执行关系后，这里会显示主线态势。"
      full-height
      :min-height="0"
      @retry="loadOverview"
    >
      <ElScrollbar class="screen-scroll">
        <main v-if="overview" class="screen-content">
          <section class="decision-band" aria-label="关键运营指标">
            <div class="decision-band__lead">
              <span class="section-kicker">订单主线</span>
              <strong>{{ overview.totals.orders }}</strong>
              <span>当前范围订单</span>
            </div>
            <div class="decision-band__metric">
              <span>正常推进</span>
              <strong>{{ overview.totals.active }}</strong>
              <small>关联完整且未逾期</small>
            </div>
            <div class="decision-band__metric is-warning">
              <span>待关联</span>
              <strong>{{ overview.totals.pending }}</strong>
              <small>缺少车辆或司机</small>
            </div>
            <div class="decision-band__metric is-danger">
              <span>逾期关注</span>
              <strong>{{ overview.totals.exception }}</strong>
              <small>计划到达时间已过</small>
            </div>
            <div class="decision-band__metric is-muted">
              <span>已结束</span>
              <strong>{{ overview.totals.closed }}</strong>
              <small>签收 / 完成 / 取消</small>
            </div>
          </section>

          <section class="screen-grid">
            <aside class="side-stack" aria-label="主线资源概况">
              <div class="screen-panel resource-panel">
                <div class="panel-heading"
                  ><div><span class="section-kicker">资源主线</span><h2>车辆与司机</h2></div
                  ><ArtSvgIcon icon="ri:node-tree"
                /></div>
                <div class="resource-pair">
                  <div
                    ><span>车辆档案</span><strong>{{ overview.totals.vehicles }}</strong
                    ><small>其中 {{ overview.totals.linkedVehicles }} 台关联订单</small></div
                  >
                  <div
                    ><span>司机档案</span><strong>{{ overview.totals.drivers }}</strong
                    ><small>其中 {{ overview.totals.linkedDrivers }} 人关联订单</small></div
                  >
                </div>
                <div class="resource-line"
                  ><span>执行运单关联</span
                  ><strong>{{ overview.totals.executions }} <small>条</small></strong></div
                >
                <div class="resource-path" aria-label="三条主线互相关联">
                  <span>订单</span><i /><span>车辆</span><i /><span>司机</span>
                </div>
              </div>
              <div class="screen-panel status-panel">
                <div class="panel-heading"
                  ><div><span class="section-kicker">运营结构</span><h2>订单状态分布</h2></div></div
                >
                <div v-for="item in statusRows" :key="item.label" class="status-row">
                  <div
                    ><span>{{ item.label }}</span
                    ><strong>{{ item.value }}</strong></div
                  >
                  <div class="status-track"
                    ><i :class="item.tone" :style="{ width: `${item.percent}%` }"
                  /></div>
                </div>
              </div>
            </aside>

            <section class="screen-panel flow-panel" aria-labelledby="flow-title">
              <div class="panel-heading flow-panel__heading">
                <div
                  ><span class="section-kicker">ORDER ↔ VEHICLE ↔ DRIVER</span
                  ><h2 id="flow-title">主线联动追踪</h2></div
                >
                <span>优先展示逾期与进行中的订单 · 最近 {{ overview.orders.length }} 条</span>
              </div>
              <div class="flow-columns" aria-hidden="true"
                ><span>运输订单 / 线路</span><span>关联车辆</span><span>承运司机</span
                ><span>态势</span></div
              >
              <div class="flow-list">
                <article v-for="order in overview.orders" :key="order.id" class="flow-row">
                  <div class="flow-order">
                    <RouterLink
                      v-if="hasAuth('TmsOrderQuery:View')"
                      :to="`/tms/order-query/detail/${order.id}`"
                      :title="order.orderNo"
                      >{{ order.orderNo }}</RouterLink
                    >
                    <strong v-else :title="order.orderNo">{{ order.orderNo }}</strong>
                    <span
                      :title="`${order.origin || '起点待补充'} → ${order.destination || '终点待补充'}`"
                      >{{ order.origin || '起点待补充' }} <b>→</b>
                      {{ order.destination || '终点待补充' }}</span
                    >
                    <small>{{ order.executionCount }} 条执行运单</small>
                  </div>
                  <div class="flow-entities">
                    <template v-if="order.vehicles.length">
                      <component
                        :is="hasAuth('VehicleQuery:View') ? 'RouterLink' : 'span'"
                        v-for="vehicle in order.vehicles.slice(0, 2)"
                        :key="vehicle.id"
                        :to="
                          hasAuth('VehicleQuery:View')
                            ? `/vms/vehicle-query/detail/${vehicle.id}`
                            : undefined
                        "
                        class="entity-link"
                        :title="vehicle.label"
                        ><ArtSvgIcon icon="ri:truck-line" />{{ vehicle.label }}</component
                      >
                      <small v-if="order.vehicleCount > 2"
                        >另有 {{ order.vehicleCount - 2 }} 台</small
                      >
                    </template>
                    <span v-else class="missing-link">待关联车辆</span>
                  </div>
                  <div class="flow-entities">
                    <template v-if="order.drivers.length">
                      <component
                        :is="hasAuth('TmsDriverQuery:View') ? 'RouterLink' : 'span'"
                        v-for="driver in order.drivers.slice(0, 2)"
                        :key="driver.id"
                        :to="
                          hasAuth('TmsDriverQuery:View')
                            ? `/tms/driver-query/detail/${driver.id}`
                            : undefined
                        "
                        class="entity-link"
                        :title="driver.label"
                        ><ArtSvgIcon icon="ri:steering-2-line" />{{ driver.label }}</component
                      >
                      <small v-if="order.driverCount > 2"
                        >另有 {{ order.driverCount - 2 }} 人</small
                      >
                    </template>
                    <span v-else class="missing-link">待关联司机</span>
                  </div>
                  <div class="flow-signal"
                    ><span :class="`signal signal--${order.signal}`">{{
                      signalLabel[order.signal]
                    }}</span
                    ><small>{{ formatUpdate(order.updatedAt) }}</small></div
                  >
                </article>
              </div>
            </section>

            <aside class="side-stack" aria-label="综合查询入口">
              <div class="screen-panel navigate-panel">
                <div class="panel-heading"
                  ><div
                    ><span class="section-kicker">一站式穿透</span><h2>综合查询入口</h2></div
                  ></div
                >
                <RouterLink
                  v-if="hasAuth('TmsOrderQuery:View')"
                  to="/tms/order-query"
                  class="navigate-item"
                  ><ArtSvgIcon icon="ri:file-search-line" /><span
                    ><strong>运输订单</strong><small>进度、执行、回单与费用</small></span
                  ><ArtSvgIcon icon="ri:arrow-right-up-line"
                /></RouterLink>
                <RouterLink
                  v-if="hasAuth('VehicleQuery:View')"
                  to="/vms/vehicle-query"
                  class="navigate-item"
                  ><ArtSvgIcon icon="ri:truck-line" /><span
                    ><strong>车辆综合查询</strong><small>车辆档案与承运历史</small></span
                  ><ArtSvgIcon icon="ri:arrow-right-up-line"
                /></RouterLink>
                <RouterLink
                  v-if="hasAuth('TmsDriverQuery:View')"
                  to="/tms/driver-query"
                  class="navigate-item"
                  ><ArtSvgIcon icon="ri:steering-2-line" /><span
                    ><strong>司机综合查询</strong><small>司机档案与承运记录</small></span
                  ><ArtSvgIcon icon="ri:arrow-right-up-line"
                /></RouterLink>
                <p v-if="!hasAnyQueryPermission" class="restricted-copy"
                  >暂无综合查询权限，请联系管理员开通。</p
                >
              </div>
              <div class="screen-panel note-panel"
                ><span class="section-kicker">口径说明</span
                ><p
                  >顶部指标按当前租户范围内的全部订单汇总。中间仅显示最近且需要关注的 10
                  条订单；多车、多司机按执行运单关系合并展示。</p
                ></div
              >
            </aside>
          </section>
        </main>
      </ElScrollbar>
    </ArtAsyncState>
  </div>
</template>

<script setup lang="ts">
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import {
    fetchMainlineScreenOverview,
    type MainlineScreenOverview
  } from '@/api/transport-mainline-screen'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ElMessage } from 'element-plus'

  defineOptions({ name: 'TmsMainlineScreen' })

  const router = useRouter()
  const { hasAuth } = useAuth()
  const canViewScreen = computed(() => hasAuth('TmsMainlineScreen:View'))
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const screenRef = ref<HTMLElement | null>(null)
  const overview = ref<MainlineScreenOverview | null>(null)
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<string | null>(null)
  const isFullscreen = ref(false)
  let requestVersion = 0
  let refreshTimer: number | undefined

  const signalLabel = {
    active: '正常推进',
    pending: '待关联',
    exception: '逾期关注',
    closed: '已结束'
  } as const
  const hasAnyQueryPermission = computed(
    () =>
      hasAuth('TmsOrderQuery:View') ||
      hasAuth('VehicleQuery:View') ||
      hasAuth('TmsDriverQuery:View')
  )
  const updateText = computed(() => (overview.value ? formatUpdate(overview.value.asOf) : '—'))
  const statusRows = computed(() => {
    const totals = overview.value?.totals
    if (!totals) return []
    const whole = Math.max(totals.orders, 1)
    return [
      {
        label: '正常推进',
        value: totals.active,
        tone: 'is-active',
        percent: (totals.active / whole) * 100
      },
      {
        label: '待关联',
        value: totals.pending,
        tone: 'is-pending',
        percent: (totals.pending / whole) * 100
      },
      {
        label: '逾期关注',
        value: totals.exception,
        tone: 'is-exception',
        percent: (totals.exception / whole) * 100
      },
      {
        label: '已结束',
        value: totals.closed,
        tone: 'is-closed',
        percent: (totals.closed / whole) * 100
      }
    ]
  })

  function formatUpdate(value: string | null): string {
    if (!value) return '暂无时间'
    const time = new Date(value)
    if (Number.isNaN(time.getTime())) return '暂无时间'
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(time)
  }

  async function loadOverview(): Promise<void> {
    const version = ++requestVersion
    if (!canViewScreen.value) {
      overview.value = null
      loading.value = false
      refreshing.value = false
      error.value = null
      return
    }
    refreshing.value = true
    if (!overview.value) loading.value = true
    error.value = null
    try {
      const result = await fetchMainlineScreenOverview()
      if (version === requestVersion) overview.value = result
    } catch (cause) {
      if (version === requestVersion)
        error.value = getFriendlySupabaseErrorMessage(cause, '运营大屏加载失败，请刷新后重试')
    } finally {
      if (version === requestVersion) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  function syncFullscreen(): void {
    isFullscreen.value = document.fullscreenElement === screenRef.value
  }

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement === screenRef.value) await document.exitFullscreen()
      else await screenRef.value?.requestFullscreen()
    } catch {
      ElMessage.warning('无法切换全屏，请检查浏览器权限后重试。')
    }
  }

  watch(effectiveTenantId, () => {
    overview.value = null
    void loadOverview()
  })
  watch(canViewScreen, () => {
    overview.value = null
    void loadOverview()
  })
  onMounted(() => {
    void loadOverview()
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) void loadOverview()
    }, 60_000)
    document.addEventListener('fullscreenchange', syncFullscreen)
  })
  onBeforeUnmount(() => {
    requestVersion += 1
    if (refreshTimer) window.clearInterval(refreshTimer)
    document.removeEventListener('fullscreenchange', syncFullscreen)
  })
</script>

<style scoped lang="scss" src="./mainline-screen.scss"></style>
