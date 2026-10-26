<template>
  <div class="transit-screen" aria-label="TMS 运输在途监控工作台">
    <ArtAsyncState
      class="transit-screen__state"
      :loading="screen.loading"
      :error="screen.error"
      :min-height="0"
      full-height
      @retry="loadMonitorData"
    >
      <div
        ref="viewportRef"
        class="transit-screen__viewport"
        :class="{ 'is-compact': isCompactScreen }"
        @wheel.capture="handleScreenWheelCapture"
      >
        <ElScrollbar class="transit-screen__scrollbar">
          <div
            class="transit-screen__stage"
            :class="{ 'is-compact': isCompactScreen }"
            :style="screenStageStyle"
          >
            <header class="transit-screen__header">
              <div class="transit-screen__title">
                <button
                  type="button"
                  aria-label="返回运营工作台"
                  title="返回运营工作台"
                  @click="exitMonitor"
                >
                  <ArtSvgIcon icon="ri:arrow-left-line" />
                </button>
                <div class="transit-screen__title-copy">
                  <span>FLEET CONTROL TOWER</span>
                  <h1>运输在途控制塔</h1>
                  <p>TMS · 车辆、运单与异常统一态势</p>
                </div>
              </div>
              <ElScrollbar class="screen-tabs-scrollbar">
                <nav class="screen-tabs" aria-label="监控模式">
                  <button
                    v-for="item in monitorTabs"
                    :key="item.value"
                    type="button"
                    :class="{ 'is-active': activeMode === item.value }"
                    :aria-current="activeMode === item.value ? 'page' : undefined"
                    @click="activeMode = item.value"
                  >
                    {{ item.label }}
                  </button>
                </nav>
              </ElScrollbar>
              <div class="header-status">
                <div class="header-kpis" aria-label="实时运输指标">
                  <span
                    ><b>{{ overview.transporting }}</b
                    >在途</span
                  >
                  <span
                    ><b>{{ formatPercentValue(overview.onTimeRate, { fractionDigits: 0 }) }}</b
                    >到达准时率</span
                  >
                  <span :class="{ 'is-alert': alertItems.length }"
                    ><b>{{ alertItems.length }}</b
                    >异常</span
                  >
                </div>
                <time :datetime="currentTime">{{ headerTimeText }}</time>
                <span><i />数据已加载</span>
              </div>
            </header>

            <main class="transit-screen__body">
              <section class="monitor-map isolate" :class="`monitor-map--${activeMode}`">
                <div ref="chartRef" class="monitor-map__chart" />
                <ArtAsyncState
                  v-if="mapLoading || mapError"
                  class="transit-screen__state z-20 flex! items-center justify-center bg-(--transit-canvas)"
                  :loading="mapLoading"
                  :error="
                    mapError ? '地图加载失败，请重新加载或联系管理员检查地图服务配置。' : null
                  "
                  error-title="地图暂不可用"
                  :min-height="0"
                  full-height
                  @retry="reloadMap"
                />
                <div class="monitor-map__heading">
                  <strong>{{ monitorHeadingTitle }}</strong>
                  <span :title="activeOrder?.routeName || '暂无线路'">{{
                    activeOrder?.routeName || '暂无线路'
                  }}</span>
                </div>
                <div v-if="activeOrder" class="monitor-map__track-chip">
                  <strong :title="`${activeOrder.plateNo} · ${activeOrder.orderNo}`"
                    >{{ activeOrder.plateNo }} · {{ activeOrder.orderNo }}</strong
                  >
                  <span :class="`is-${activeOrder.trackSource}`">
                    {{ activeOrder.trackSourceLabel }}
                  </span>
                </div>
                <div class="monitor-map__tools" :class="{ 'is-wide': activeMode !== 'realtime' }">
                  <ArtIconButton
                    icon="ri:zoom-in-line"
                    label="放大地图"
                    :disabled="!amapReady"
                    @click="zoomMap('in')"
                  />
                  <ArtIconButton
                    icon="ri:zoom-out-line"
                    label="缩小地图"
                    :disabled="!amapReady"
                    @click="zoomMap('out')"
                  />
                  <ArtIconButton
                    icon="ri:focus-3-line"
                    label="定位当前车辆"
                    :disabled="!amapReady"
                    @click="resetMapView"
                  />
                </div>

                <section
                  v-if="activeMode === 'realtime'"
                  class="screen-panel map-float map-float--overview"
                >
                  <div class="screen-panel__title">
                    <strong>运输概况</strong>
                    <span>{{ formatRefreshTime(screen.lastRefreshTime) }}</span>
                  </div>
                  <div class="progress-lines">
                    <div v-for="item in overviewBars" :key="item.label" class="progress-line">
                      <div>
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                      <i>
                        <b :style="{ width: `${item.percent}%`, background: item.color }" />
                      </i>
                    </div>
                  </div>
                </section>

                <section
                  v-if="activeMode === 'realtime' && alertItems.length > 0"
                  class="screen-panel map-float map-float--alerts"
                >
                  <div class="screen-panel__title">
                    <strong>实时报警</strong>
                    <span>{{ alertItems.length }} 条</span>
                  </div>
                  <ElScrollbar class="alert-list">
                    <div v-for="item in alertItems" :key="item.key" class="alert-item">
                      <i :class="`alert-item__level alert-item__level--${item.level}`" />
                      <div>
                        <strong>{{ item.title }}</strong>
                        <p>{{ item.content }}</p>
                      </div>
                      <span>{{ item.time }}</span>
                    </div>
                  </ElScrollbar>
                </section>
              </section>

              <RealtimeMonitorPanel
                v-if="activeMode === 'realtime'"
                v-model:keyword="screen.keyword"
                v-model:region="screen.region"
                v-model:status="screen.status"
                class="transit-screen__left"
                :get-poi-text="getVehiclePoiText"
                :is-poi-loading="isVehiclePoiLoading"
                :orders="filteredOrders"
                :overview="overview"
                :region-options="regionOptions"
                :selected-id="screen.selectedOrderId"
                :status-options="monitorStatusOptions"
                :total-count="realtimeOrders.length"
                @refresh-poi="handleVehiclePoiRefresh"
                @select="selectOrder"
              />
              <WaybillMonitorPanel
                v-else-if="activeMode === 'waybill'"
                v-model:keyword="monitorKeywords.waybill"
                class="transit-screen__left"
                :orders="modeOrders"
                :overview="overview"
                :selected-id="screen.selectedOrderId"
                @select="selectOrder"
              />
              <VehicleMonitorPanel
                v-else
                v-model:keyword="monitorKeywords.vehicle"
                class="transit-screen__left"
                :orders="modeOrders"
                :overview="overview"
                :selected-id="screen.selectedOrderId"
                @select="selectOrder"
              />

              <MonitorDetailPanel
                v-if="activeMode === 'realtime'"
                class="transit-screen__right"
                :order="activeOrder"
                @analyze-anomaly="openTransportAnomalyAdvisor"
                @contact-driver="contactDriver"
                @open-detail="openOrderDetail"
                @send-reminder="sendReminder"
              />
            </main>
          </div>
        </ElScrollbar>
      </div>
    </ArtAsyncState>

    <TransportAnomalyAdvisorDrawer ref="transportAnomalyAdvisorRef" />
  </div>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import type { UnwrapNestedRefs } from 'vue'
  import { storeToRefs } from 'pinia'
  import { ElMessage } from 'element-plus'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { fetchInTransitMonitorList } from '@tms/api'
  import { useAmapSdk } from '@/hooks/core/useAmapSdk'
  import { useUserStore } from '@/store/modules/user'
  import { formatWithDayjs } from '@/utils/time'
  import { formatPercentValue } from '@/utils/ui/format'
  import { mapWithConcurrency, withTimeout } from '@/utils/async'
  import { readAmapDrivingPath } from '@/utils/amap'
  import { useAsyncState, useEventListener, useIntervalFn, useResizeObserver } from '@vueuse/core'
  import { escape, noop } from 'lodash-es'
  import MonitorDetailPanel from './modules/monitor-detail-panel.vue'
  import RealtimeMonitorPanel from './modules/realtime-monitor-panel.vue'
  import TransportAnomalyAdvisorDrawer from './modules/transport-anomaly-advisor-drawer.vue'
  import VehicleMonitorPanel from './modules/vehicle-monitor-panel.vue'
  import WaybillMonitorPanel from './modules/waybill-monitor-panel.vue'
  import {
    AMAP_PLUGINS,
    DEFAULT_SCREEN_DESIGN_HEIGHT,
    DEFAULT_SCREEN_DESIGN_WIDTH,
    INITIAL_MAP_ZOOM,
    INITIAL_POI_CONCURRENCY,
    MAP_MAX_ZOOM,
    MAP_MIN_ZOOM,
    MONITOR_STATUS_DICT_CODE,
    monitorTabs,
    regionOptions,
    VEHICLE_TYPE_DICT_CODE
  } from './modules/monitor-config'
  import { INITIAL_MAP_CENTER } from './modules/monitor-geo-config'
  import type {
    GeoCoord,
    MonitorMode,
    MonitorKeywordState,
    MonitorOrder,
    ReverseGeocodeResult,
    ScreenScaleState,
    ScreenState,
    InTransitRecord,
    VehiclePoiState
  } from './modules/monitor-types'
  import type {
    MonitorAmapMapInstance,
    MonitorAmapMarkerInstance,
    MonitorAmapNamespace,
    MonitorAmapOverlay,
    MonitorAmapPolylineInstance
  } from './modules/monitor-amap-types'
  import {
    dedupeGeoPath,
    getDrivingRouteKey,
    formatRefreshTime,
    getMonitorRecordId,
    isRouteVisibleStatus,
    toGeoCoord
  } from './modules/monitor-utils'
  import { useMonitorOrders } from './modules/use-monitor-orders'

  defineOptions({ name: 'TmsInTransitMonitor' })

  interface TransportAnomalyAdvisorExpose {
    handleOpen: (data: { orderId: string; orderNo: string }) => Promise<void>
  }

  const router = useRouter()
  const userStore = useUserStore()
  const { loadAmap } = useAmapSdk<MonitorAmapNamespace>({
    key: import.meta.env.VITE_AMAP_KEY,
    plugins: AMAP_PLUGINS,
    securityJsCode: import.meta.env.VITE_AMAP_SECURITY_JS_CODE
  })
  const { getDictMap } = storeToRefs(userStore)
  const viewportRef = ref<HTMLDivElement>()
  const chartRef = ref<HTMLDivElement>()
  const transportAnomalyAdvisorRef = ref<TransportAnomalyAdvisorExpose>()
  const amapSdk = shallowRef<MonitorAmapNamespace>()
  const amapInstance = shallowRef<MonitorAmapMapInstance>()
  const amapReady = ref(false)
  const mapSetupError = shallowRef<Error>()
  const {
    state: mapSdkState,
    error: mapLoadError,
    isLoading: mapLoading,
    executeImmediate: loadMapSdk
  } = useAsyncState<MonitorAmapNamespace | undefined>(loadAmap, undefined, {
    immediate: false,
    onError: noop
  })
  const mapError = computed(() => mapSetupError.value ?? mapLoadError.value)
  const currentTime = ref(new Date().toISOString())
  const activeMode = ref<MonitorMode>('realtime')
  const monitorKeywords = reactive<MonitorKeywordState>({
    vehicle: '',
    waybill: ''
  })
  const mapZoom = ref(INITIAL_MAP_ZOOM)
  const screenScale: UnwrapNestedRefs<ScreenScaleState> = reactive<ScreenScaleState>({
    viewportHeight: DEFAULT_SCREEN_DESIGN_HEIGHT,
    viewportWidth: DEFAULT_SCREEN_DESIGN_WIDTH
  })
  const vehicleMarkers = new Map<string, MonitorAmapMarkerInstance>()
  const vehiclePois = reactive(new Map<string, VehiclePoiState>())
  const drivingRoutePaths = reactive(new Map<string, GeoCoord[]>())
  const drivingRouteRequests = new Set<string>()
  let originMarker: MonitorAmapMarkerInstance | undefined
  let destinationMarker: MonitorAmapMarkerInstance | undefined
  let routeBasePolyline: MonitorAmapPolylineInstance | undefined
  let passedPolyline: MonitorAmapPolylineInstance | undefined
  let remainingPolyline: MonitorAmapPolylineInstance | undefined

  const screen: UnwrapNestedRefs<ScreenState> = reactive<ScreenState>({
    keyword: '',
    loading: false,
    loaded: false,
    error: null,
    orders: [],
    region: '',
    selectedOrderId: undefined,
    status: ''
  })
  const requestShowsLoading = ref(true)
  const monitorRequest = useAsyncState<{ orders: InTransitRecord[]; refreshedAt: string }>(
    async () => {
      try {
        const { data, error } = await fetchInTransitMonitorList(
          { from: 0, to: 199 },
          { showErrorMessage: false }
        )
        if (error) throw error
        return { orders: data ?? [], refreshedAt: new Date().toISOString() }
      } catch (error) {
        throw new Error(getFriendlySupabaseErrorMessage(error, '在途监控数据加载失败，请重试'), {
          cause: error
        })
      }
    },
    { orders: [], refreshedAt: '' },
    { immediate: false, resetOnExecute: false, onError: noop }
  )
  watch([monitorRequest.isLoading, requestShowsLoading], ([loading, foreground]) => {
    screen.loading = loading && foreground
  })
  watch(monitorRequest.error, (error) => {
    screen.error = error instanceof Error ? error : null
  })
  watch(monitorRequest.state, (result) => {
    screen.orders = result.orders
    screen.loaded = true
    screen.lastRefreshTime = result.refreshedAt
    if (!screen.orders.some((row) => getMonitorRecordId(row) === screen.selectedOrderId))
      screen.selectedOrderId = getPreferredMonitorRecordId(screen.orders)
    void loadVehiclePois()
    if (amapReady.value)
      void nextTick(() => {
        updateChinaMap()
        fitSelectedMapView(true)
      })
  })
  watch(chartRef, (element) => {
    if (element && !mapSdkState.value && !mapLoading.value) void reloadMap()
  })
  watch([mapSdkState, chartRef], ([sdk, element]) => {
    destroyMonitorMap()
    mapSetupError.value = undefined
    if (sdk && element) initializeMap(sdk, element)
  })

  const screenBaseScale = computed(() => {
    const scale = Math.min(
      screenScale.viewportWidth / DEFAULT_SCREEN_DESIGN_WIDTH,
      screenScale.viewportHeight / DEFAULT_SCREEN_DESIGN_HEIGHT
    )

    return Number.isFinite(scale) && scale > 0 ? scale : 1
  })

  const isCompactScreen = computed(() => screenScale.viewportWidth <= 1100)

  const screenStageStyle = computed(() => {
    if (isCompactScreen.value) {
      return {
        width: '100%',
        height: 'auto',
        minHeight: `${screenScale.viewportHeight}px`,
        transform: 'none'
      }
    }

    const scale = screenBaseScale.value
    const width = DEFAULT_SCREEN_DESIGN_WIDTH * scale
    const height = DEFAULT_SCREEN_DESIGN_HEIGHT * scale
    const offsetX = (screenScale.viewportWidth - width) / 2
    const offsetY = (screenScale.viewportHeight - height) / 2

    return {
      width: `${DEFAULT_SCREEN_DESIGN_WIDTH}px`,
      height: `${DEFAULT_SCREEN_DESIGN_HEIGHT}px`,
      transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
    }
  })

  const headerTimeText = computed(() =>
    formatWithDayjs(currentTime.value, 'YYYY年MM月DD日 HH:mm:ss')
  )
  const monitorHeadingTitle = computed(
    () =>
      ({
        realtime: '单车轨迹监控',
        vehicle: '车辆实时位置',
        waybill: '运单运输轨迹'
      })[activeMode.value]
  )

  const {
    activeOrder,
    alertItems,
    filteredOrders,
    getPreferredMonitorRecordId,
    mapRouteOrder,
    modeOrders,
    monitorStatusOptions,
    overview,
    overviewBars,
    realtimeOrders
  } = useMonitorOrders({
    activeMode,
    drivingRoutePaths,
    getDictOptions: (dictCode) => getDictMap.value[dictCode] ?? [],
    screen
  })

  watch([activeMode, activeOrder], () => {
    const routeOrder = mapRouteOrder.value
    if (routeOrder) void ensureDrivingRoute(routeOrder)
    updateChinaMap()
  })

  onMounted(() => {
    updateScreenViewportSize()
    void Promise.allSettled([
      userStore.ensureDictLoaded(VEHICLE_TYPE_DICT_CODE),
      userStore.ensureDictLoaded(MONITOR_STATUS_DICT_CODE)
    ])
    void loadMonitorData()
  })

  onBeforeUnmount(() => {
    destroyMonitorMap()
  })

  useEventListener(window, 'resize', resizeScaledScreen)
  if (window.visualViewport) {
    useEventListener(window.visualViewport, 'resize', resizeScaledScreen)
  }

  useResizeObserver(viewportRef, () => {
    resizeScaledScreen()
  })

  useResizeObserver(chartRef, () => {
    resizeChinaMap()
  })

  useIntervalFn(() => {
    void loadMonitorData(false)
  }, 60000)

  useIntervalFn(() => {
    currentTime.value = new Date().toISOString()
  }, 1000)

  async function loadMonitorData(showLoading = true): Promise<void> {
    requestShowsLoading.value = showLoading
    await monitorRequest.executeImmediate()
  }

  async function reloadMap(): Promise<void> {
    mapSetupError.value = undefined
    await loadMapSdk()
  }

  function initializeMap(AMap: MonitorAmapNamespace, element: HTMLElement): void {
    try {
      amapSdk.value = AMap
      amapInstance.value = new AMap.Map(element, {
        center: INITIAL_MAP_CENTER,
        doubleClickZoom: true,
        dragEnable: true,
        features: ['bg', 'road', 'point'],
        mapStyle: 'amap://styles/darkblue',
        resizeEnable: true,
        scrollWheel: true,
        viewMode: '2D',
        zoom: INITIAL_MAP_ZOOM,
        zoomEnable: true,
        zooms: [MAP_MIN_ZOOM, MAP_MAX_ZOOM]
      })
      amapInstance.value.setStatus?.({
        doubleClickZoom: true,
        dragEnable: true,
        scrollWheel: true,
        zoomEnable: true
      })
      amapInstance.value.addControl(new AMap.Scale())
      amapInstance.value.on('zoomchange', syncMapViewState)
      amapInstance.value.on('mapmove', syncMapViewState)
      amapReady.value = true
      const routeOrder = mapRouteOrder.value
      if (routeOrder) void ensureDrivingRoute(routeOrder)
    } catch (error) {
      destroyMonitorMap()
      mapSetupError.value = new Error('地图初始化失败', { cause: error })
    }

    updateChinaMap()
    fitSelectedMapView(true)
  }

  function updateChinaMap(): void {
    const map = amapInstance.value
    if (!map || !amapSdk.value || !amapReady.value) return

    syncOnlineVehicleMarkers()

    const active = mapRouteOrder.value
    if (!active) {
      clearRouteObjects()
      return
    }

    const origin = active.originGeo
    const destination = active.destinationGeo

    originMarker = origin
      ? upsertMarker(originMarker, origin, '发', active.origin, '#23d18b')
      : removeMapObject(originMarker)
    destinationMarker = destination
      ? upsertMarker(destinationMarker, destination, '收', active.destination, '#ff9f43')
      : removeMapObject(destinationMarker)

    if (active.routePath.length < 2 && active.actualTrackPath.length < 2) {
      clearRouteLines()
      return
    }

    routeBasePolyline = upsertPolyline(
      routeBasePolyline,
      buildVisibleRoutePath(active),
      '#6ec8ff',
      12,
      false,
      150,
      0.34
    )
    passedPolyline = upsertPolyline(passedPolyline, active.passedPath, '#315cff', 8, false, 180)
    remainingPolyline = upsertPolyline(
      remainingPolyline,
      active.remainingPath,
      '#8ed3ff',
      7,
      false,
      170,
      0.82
    )
  }

  function syncOnlineVehicleMarkers(): void {
    const activeIds = new Set<string>()

    modeOrders.value.forEach((item) => {
      if (!item.currentGeo) return
      activeIds.add(item.id)
      const position = item.currentGeo
      const marker = upsertMarker(
        vehicleMarkers.get(item.id),
        position,
        '车',
        item.plateNo,
        isRouteVisibleStatus(item.status) ? '#315cff' : '#d69b12',
        {
          image: item.vehicleImage,
          selected: item.id === activeOrder.value?.id,
          subtitle: item.statusLabel
        }
      )
      if (marker) vehicleMarkers.set(item.id, marker)
    })

    vehicleMarkers.forEach((marker, id) => {
      if (activeIds.has(id)) return
      removeMapObject(marker)
      vehicleMarkers.delete(id)
    })
  }

  function clearRouteObjects(): void {
    originMarker = removeMapObject(originMarker)
    destinationMarker = removeMapObject(destinationMarker)
    clearRouteLines()
  }

  function clearRouteLines(): void {
    routeBasePolyline = removeMapObject(routeBasePolyline)
    passedPolyline = removeMapObject(passedPolyline)
    remainingPolyline = removeMapObject(remainingPolyline)
  }

  function removeMapObject(object: MonitorAmapOverlay | undefined): undefined {
    if (object) amapInstance.value?.remove?.(object)
    return undefined
  }

  function updateScreenViewportSize(): void {
    const viewport = viewportRef.value
    screenScale.viewportWidth =
      viewport?.clientWidth || window.innerWidth || DEFAULT_SCREEN_DESIGN_WIDTH
    screenScale.viewportHeight =
      viewport?.clientHeight || window.innerHeight || DEFAULT_SCREEN_DESIGN_HEIGHT
  }

  function resizeScaledScreen(): void {
    updateScreenViewportSize()
    resizeChinaMap()
  }

  function handleScreenWheelCapture(event: WheelEvent): void {
    if (!event.ctrlKey) return

    event.stopPropagation()
  }

  function syncMapViewState(): void {
    const map = amapInstance.value
    if (!map) return
    const zoom = map.getZoom?.()
    if (typeof zoom === 'number') mapZoom.value = Math.round(zoom)
  }

  function resizeChinaMap(): void {
    const applyResize = () => {
      amapInstance.value?.resize?.()
    }

    window.requestAnimationFrame(() => {
      applyResize()
      window.setTimeout(applyResize, 120)
    })
  }

  async function loadVehiclePois(): Promise<void> {
    const orders = [...realtimeOrders.value]
    const activeIds = new Set(orders.map((item) => item.id))
    vehiclePois.forEach((_, id) => {
      if (!activeIds.has(id)) vehiclePois.delete(id)
    })

    await mapWithConcurrency(orders, INITIAL_POI_CONCURRENCY, (order) => refreshVehiclePoi(order))
  }

  function getVehiclePoiText(order: MonitorOrder): string {
    if (!order.currentGeo) return '暂无 GPS 位置'
    const poi = vehiclePois.get(order.id)
    return poi?.coordinateKey === getVehicleCoordinateKey(order) ? poi.label : '正在获取位置...'
  }

  function isVehiclePoiLoading(order: MonitorOrder): boolean {
    if (!order.currentGeo) return false
    const poi = vehiclePois.get(order.id)
    return poi?.coordinateKey === getVehicleCoordinateKey(order) && poi.loading
  }

  async function handleVehiclePoiRefresh(order: MonitorOrder): Promise<void> {
    if (!order.currentGeo) {
      ElMessage.warning('当前车辆暂无有效 GPS 坐标，请检查定位数据后重试')
      return
    }
    const success = await refreshVehiclePoi(order, true)
    if (success === false) ElMessage.warning('当前坐标暂无 POI 信息，请稍后重试')
  }

  async function refreshVehiclePoi(order: MonitorOrder, force = false): Promise<boolean | null> {
    if (!order.currentGeo) return false
    const coordinateKey = getVehicleCoordinateKey(order)
    const current = vehiclePois.get(order.id)
    if (!force && current?.coordinateKey === coordinateKey)
      return current.label !== '暂未获取到 POI'

    const state = reactive<VehiclePoiState>({
      coordinateKey,
      label: current?.coordinateKey === coordinateKey ? current.label : '正在获取位置...',
      loading: true
    })
    vehiclePois.set(order.id, state)

    try {
      const label = await reverseGeocode(...order.currentGeo)
      if (vehiclePois.get(order.id) !== state) return null
      state.label = label
      return true
    } catch {
      if (vehiclePois.get(order.id) !== state) return null
      state.label = '暂未获取到 POI'
      return false
    } finally {
      if (vehiclePois.get(order.id) === state) state.loading = false
    }
  }

  async function reverseGeocode(longitude: number, latitude: number): Promise<string> {
    const AMap = await loadAmap()

    return withTimeout(
      new Promise<string>((resolve, reject) => {
        const geocoder = new AMap.Geocoder({ extensions: 'all', radius: 1000 })
        geocoder.getAddress(
          [longitude, latitude],
          (status: string, result: ReverseGeocodeResult) => {
            if (status !== 'complete') {
              reject(new Error('高德逆地理编码失败'))
              return
            }

            const regeocode = result?.regeocode
            const poiName = regeocode?.pois?.[0]?.name
            const address = String(
              regeocode?.formattedAddress || regeocode?.formatted_address || poiName || ''
            ).trim()
            if (!address) {
              reject(new Error('未查询到 POI'))
              return
            }
            resolve(address)
          }
        )
      }),
      10_000,
      '位置查询超时，请稍后重试'
    )
  }

  function getVehicleCoordinateKey(order: MonitorOrder): string {
    return order.currentGeo?.map((value) => value.toFixed(6)).join(',') ?? ''
  }

  async function ensureDrivingRoute(order: MonitorOrder): Promise<void> {
    if (!order.originGeo || !order.destinationGeo) return
    const routeKey = getDrivingRouteKey(order)
    if (!routeKey || drivingRoutePaths.has(routeKey) || drivingRouteRequests.has(routeKey)) return
    if (!amapReady.value) return
    drivingRouteRequests.add(routeKey)

    try {
      const AMap = await loadAmap()
      const path = await searchDrivingRoute(AMap, order.originGeo, order.destinationGeo)
      if (path.length > 1) {
        drivingRoutePaths.set(routeKey, path)
        await nextTick()
        updateChinaMap()
        if (activeOrder.value?.id === order.id) fitSelectedMapView(true)
      }
    } catch {
      // 高德路线不可用时保持无线状态。
    } finally {
      drivingRouteRequests.delete(routeKey)
    }
  }

  function searchDrivingRoute(
    AMap: MonitorAmapNamespace,
    origin: GeoCoord,
    destination: GeoCoord
  ): Promise<GeoCoord[]> {
    return withTimeout(
      new Promise<GeoCoord[]>((resolve, reject) => {
        const driving = new AMap.Driving({
          hideMarkers: true,
          policy: AMap.DrivingPolicy?.LEAST_TIME,
          showTraffic: false
        })
        driving.search(
          new AMap.LngLat(origin[0], origin[1]),
          new AMap.LngLat(destination[0], destination[1]),
          (status: string, result) => {
            if (status !== 'complete') {
              reject(new Error('驾车路线规划失败'))
              return
            }

            const path = readAmapDrivingPath(result).flatMap(([lng, lat]) => {
              const coordinate = toGeoCoord(lng, lat)
              return coordinate ? [coordinate] : []
            })
            if (path.length < 2) {
              reject(new Error('驾车路线缺少有效道路轨迹'))
              return
            }
            resolve(dedupeGeoPath([origin, ...path, destination]))
          }
        )
      }),
      10_000,
      '路线查询超时，请稍后重试'
    )
  }

  function upsertMarker(
    marker: MonitorAmapMarkerInstance | undefined,
    position: GeoCoord,
    label: string,
    title: string,
    color: string,
    options: { image?: string; selected?: boolean; subtitle?: string } = {}
  ): MonitorAmapMarkerInstance | undefined {
    const map = amapInstance.value
    const AMap = amapSdk.value
    if (!map || !AMap) return marker

    const markerClass = options.selected ? ' is-selected' : ''
    const content = options.image
      ? `<div class="transit-vehicle-marker${markerClass}" style="--marker-color:${color}"><i></i><img src="${options.image}" alt="${escape(options.subtitle || title)}" width="42" height="28" /><span>${escape(title)}</span></div>`
      : `<div class="transit-amap-marker" style="--marker-color:${color}"><b>${escape(label)}</b><span>${escape(title)}</span>${options.subtitle ? `<em>${escape(options.subtitle)}</em>` : ''}</div>`
    if (!marker) {
      const nextMarker = new AMap.Marker({
        anchor: 'center',
        content,
        offset: new AMap.Pixel(0, 0),
        position,
        zIndex: options.selected ? 1500 : label === '车' ? 1200 : 1100
      })
      map.add(nextMarker)
      return nextMarker
    }

    marker.setPosition(position)
    marker.setContent(content)
    marker.setzIndex?.(options.selected ? 1500 : label === '车' ? 1200 : 1100)
    return marker
  }

  function upsertPolyline(
    polyline: MonitorAmapPolylineInstance | undefined,
    path: GeoCoord[],
    color: string,
    weight: number,
    dashed = false,
    zIndex = dashed ? 155 : 165,
    opacity = dashed ? 0.78 : 0.96
  ): MonitorAmapPolylineInstance | undefined {
    const map = amapInstance.value
    const AMap = amapSdk.value
    if (!map || !AMap) return polyline
    const visiblePath: GeoCoord[] = path.length > 1 ? path : path[0] ? [path[0], path[0]] : []
    const amapPath = visiblePath.map((point) => new AMap.LngLat(point[0], point[1]))

    if (!polyline) {
      const nextPolyline = new AMap.Polyline({
        borderWeight: 1,
        bubble: false,
        isOutline: true,
        lineCap: 'round',
        lineJoin: 'round',
        outlineColor: 'rgba(0,0,0,.55)',
        path: amapPath,
        showDir: !dashed,
        strokeColor: color,
        strokeOpacity: opacity,
        strokeStyle: dashed ? 'dashed' : 'solid',
        strokeWeight: weight,
        zIndex
      })
      map.add(nextPolyline)
      return nextPolyline
    }

    polyline.setOptions?.({
      showDir: !dashed,
      strokeColor: color,
      strokeOpacity: opacity,
      strokeStyle: dashed ? 'dashed' : 'solid',
      strokeWeight: weight,
      zIndex
    })
    polyline.setPath(amapPath)
    return polyline
  }

  function fitActiveTrack(force = false): void {
    const map = amapInstance.value
    const active = mapRouteOrder.value
    if (!map) return
    if (!active) {
      const selected = activeOrder.value
      if (selected) fitPendingVehicle(selected.originGeo)
      return
    }
    if (!force && mapZoom.value >= 11) return

    const selectedMarker = vehicleMarkers.get(active.id)
    const overlays = [
      routeBasePolyline,
      passedPolyline,
      remainingPolyline,
      originMarker,
      destinationMarker,
      selectedMarker
    ].filter((overlay): overlay is MonitorAmapOverlay => Boolean(overlay))
    if (overlays.length && map.setFitView) {
      map.setFitView(overlays, false, [96, 96, 96, 380])
    } else {
      const current = active.currentGeo
      if (!current) return
      if (map.setZoomAndCenter) map.setZoomAndCenter(INITIAL_MAP_ZOOM, current)
      else {
        map.setZoom?.(INITIAL_MAP_ZOOM)
        map.setCenter?.(current)
      }
    }
    syncMapViewState()
  }

  function fitPendingVehicle(origin?: GeoCoord): void {
    const map = amapInstance.value
    if (!map || !origin) return
    map.setCenter?.(origin)
    if (mapZoom.value !== INITIAL_MAP_ZOOM) map.setZoom?.(INITIAL_MAP_ZOOM)
    syncMapViewState()
  }

  function fitSelectedMapView(force = false): void {
    const selected = activeOrder.value
    if (selected?.status === 'pending') {
      fitPendingVehicle(selected.originGeo)
      return
    }
    fitActiveTrack(force)
  }

  function zoomMap(direction: 'in' | 'out'): void {
    const map = amapInstance.value
    if (!map) return
    if (direction === 'in') map.zoomIn?.()
    else map.zoomOut?.()
    syncMapViewState()
  }

  function resetMapView(): void {
    fitSelectedMapView(true)
  }

  function buildVisibleRoutePath(active: MonitorOrder): GeoCoord[] {
    return active.routePath.length > 1 ? active.routePath : active.actualTrackPath
  }

  function destroyMonitorMap(): void {
    amapInstance.value?.destroy?.()
    amapInstance.value = undefined
    amapSdk.value = undefined
    amapReady.value = false
    vehicleMarkers.clear()
    originMarker = undefined
    destinationMarker = undefined
    routeBasePolyline = undefined
    passedPolyline = undefined
    remainingPolyline = undefined
  }

  function selectOrder(id: string): void {
    screen.selectedOrderId = id
    void nextTick(() => {
      updateChinaMap()
      fitSelectedMapView(true)
    })
  }

  function openOrderDetail(): void {}

  function openTransportAnomalyAdvisor(): void {
    const order = activeOrder.value
    const orderId = String(order?.source.order?.id || '')
    if (!order || !orderId) {
      ElMessage.warning('当前运输记录缺少订单 ID，暂时无法进行异常研判')
      return
    }

    void transportAnomalyAdvisorRef.value?.handleOpen({
      orderId,
      orderNo: order.orderNo
    })
  }

  function contactDriver(): void {
    if (!activeOrder.value) return
    ElMessage.success(`已打开 ${activeOrder.value.driverName} 的联系流程`)
  }

  function exitMonitor(): void {
    void router.push('/dashboard/console')
  }

  function sendReminder(): void {
    if (!activeOrder.value) return
    ElMessage.success(`已向 ${activeOrder.value.plateNo} 发送在途提醒`)
  }
</script>

<style scoped lang="scss" src="./modules/in-transit-monitor.scss"></style>
