<template>
  <ArtDialog ref="dialogRef" size="lg">
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="formItems"
      :rules="formRules"
      :span="12"
      :gutter="20"
      label-width="108px"
    >
      <template #routePreview>
        <section class="favorite-route-dialog__preview" aria-label="线路预览">
          <div class="favorite-route-dialog__endpoint is-origin">
            <span><ArtSvgIcon icon="ri:login-circle-line" /></span>
            <div>
              <small>装货地</small>
              <strong :title="getAddressCustomerName(originAddress, '请选择发货地址')">
                {{ getAddressCustomerName(originAddress, '请选择发货地址') }}
              </strong>
              <p v-if="originAddress" class="favorite-route-dialog__contact">
                <span>{{ originAddress.contactName || '未维护联系人' }}</span>
                <span>{{ originAddress.contactPhone || '未维护手机号' }}</span>
              </p>
              <p :title="getFullAddress(originAddress)">
                {{ originAddress ? getFullAddress(originAddress) : '从发货地址中选择' }}
              </p>
            </div>
          </div>
          <div class="favorite-route-dialog__path" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="favorite-route-dialog__endpoint is-destination">
            <span><ArtSvgIcon icon="ri:logout-circle-r-line" /></span>
            <div>
              <small>卸货地</small>
              <strong :title="getAddressCustomerName(destinationAddress, '请选择收货地址')">
                {{ getAddressCustomerName(destinationAddress, '请选择收货地址') }}
              </strong>
              <p v-if="destinationAddress" class="favorite-route-dialog__contact">
                <span>{{ destinationAddress.contactName || '未维护联系人' }}</span>
                <span>{{ destinationAddress.contactPhone || '未维护手机号' }}</span>
              </p>
              <p :title="getFullAddress(destinationAddress)">
                {{ destinationAddress ? getFullAddress(destinationAddress) : '从收货地址中选择' }}
              </p>
            </div>
          </div>
          <div v-if="form.waypointStationIds?.length" class="favorite-route-dialog__waypoints">
            <strong>途经 {{ form.waypointStationIds.length }} 站</strong>
            <ol aria-label="途经点顺序">
              <li
                v-for="(stationId, index) in form.waypointStationIds"
                :key="stationId"
                :title="getWaypointStationName(stationId)"
              >
                <span>{{ index + 1 }}</span>
                <span>{{ getWaypointStationName(stationId) }}</span>
              </li>
            </ol>
            <small v-if="form.returnTrip">返程按相反顺序经过这些站点</small>
          </div>
          <div
            v-if="estimateNote"
            class="favorite-route-dialog__estimate"
            :class="`is-${estimate.status}`"
            aria-live="polite"
          >
            <ArtSvgIcon :icon="estimateIcon" aria-hidden="true" />
            <span>{{ estimateNote }}</span>
            <ElButton
              v-if="canEstimate && estimate.status !== 'loading'"
              type="primary"
              link
              @click="calculateRouteEstimate"
            >
              重新估算
            </ElButton>
          </div>
        </section>
      </template>
      <template #waypointStationIds>
        <div class="w-full min-w-0 space-y-2">
          <div
            v-for="(stationId, index) in form.waypointStationIds"
            :key="index"
            class="flex min-w-0 items-center gap-2"
          >
            <span class="w-14 shrink-0 text-xs text-gray-500">第 {{ index + 1 }} 站</span>
            <ElSelect
              :model-value="stationId"
              filterable
              clearable
              class="min-w-0 flex-1"
              placeholder="请选择途经点站点"
              @change="(value: string) => setWaypoint(index, value)"
            >
              <ElOption
                v-for="station in stationOptions"
                :key="station.id"
                :label="`${station.stationName}（${station.stationCode}）`"
                :value="station.id"
                :disabled="
                  form.waypointStationIds?.includes(station.id) && station.id !== stationId
                "
              />
            </ElSelect>
            <ElButton
              :disabled="index === 0"
              :aria-label="`上移第 ${index + 1} 个途经点`"
              @click="moveWaypoint(index, -1)"
              >↑</ElButton
            >
            <ElButton
              :disabled="index === (form.waypointStationIds?.length ?? 0) - 1"
              :aria-label="`下移第 ${index + 1} 个途经点`"
              @click="moveWaypoint(index, 1)"
              >↓</ElButton
            >
            <ElButton
              type="danger"
              link
              :aria-label="`删除第 ${index + 1} 个途经点`"
              @click="removeWaypoint(index)"
              >删除</ElButton
            >
          </div>
          <ElButton
            v-if="(form.waypointStationIds?.length ?? 0) < 3"
            type="primary"
            plain
            @click="addWaypoint"
            >添加途经点</ElButton
          >
          <p class="text-xs text-gray-500">最多 3 个，路线按当前顺序估算；返程按相反顺序经过。</p>
        </div>
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { normalizeCoordinatePair } from '@/utils/geo'
  import { resolveTenantWriteTargetId } from '@/utils/tenant-scope-context'
  import type { FormRules } from 'element-plus'
  import { cloneDeep, omit, uniq } from 'lodash-es'
  import { storeToRefs } from 'pinia'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useAmapDrivingEstimate } from '@/hooks/core/useAmapDrivingEstimate'
  import { fetchStationOptions } from '@tms/api'
  import { ElButton, ElOption, ElSelect } from 'element-plus'
  import {
    addFavoriteRoute,
    editFavoriteRoute,
    fetchCustomerAddressOptions,
    fetchCustomerOptions
  } from '@tms/api'
  import { fetchTenantList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import FavoriteRouteAddressOption from './favorite-route-address-option.vue'

  defineOptions({ name: 'TmsFavoriteRouteDialog' })

  type FavoriteRoute = Api.Tms.BasicData.FavoriteRoute
  type CustomerAddress = Api.Tms.BasicData.CustomerAddress
  type CustomerOption = Api.Tms.BasicData.CustomerOption
  type StationOption = Api.Tms.Order.StationOption
  type TenantOption = Api.SystemManage.TenantListItem
  type FavoriteRouteForm = Omit<FavoriteRoute, 'distanceKm' | 'estimatedMinutes'> & {
    distanceKm: number | null
    estimatedMinutes: number | null
    routePreview?: undefined
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  type EstimateStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

  interface EstimateGroup {
    status: EstimateStatus
  }

  const emit = defineEmits<{
    (event: 'success', type: 'add' | 'edit'): void
  }>()

  const dialogRef = ref<ArtDialogExpose<FavoriteRoute | undefined>>()
  const formRef = ref<FormExpose>()
  const { estimateDrivingRoute } = useAmapDrivingEstimate()
  const { getUserInfo, isPlatformSuper } = storeToRefs(useUserStore())
  const tenantScopeStore = useTenantScopeStore()
  const addressOptions = reactive<{
    origin: CustomerAddress[]
    destination: CustomerAddress[]
  }>({ origin: [], destination: [] })
  const stationOptions = ref<StationOption[]>([])
  const getWaypointStationName = (stationId: string): string =>
    stationOptions.value.find((item) => item.id === stationId)?.stationName || '待选择站点'
  const estimate = reactive<EstimateGroup>({ status: 'idle' })
  let estimateRequestId = 0

  const createInitialForm = (): FavoriteRouteForm => ({
    id: undefined,
    tenantId: '',
    routeName: '',
    customerId: '',
    originAddressId: '',
    destinationAddressId: '',
    waypointStationIds: [],
    returnTrip: false,
    distanceKm: null,
    estimatedMinutes: null,
    enabled: true,
    remark: ''
  })

  const form = ref<FavoriteRouteForm>(createInitialForm())
  const originAddress = computed(() =>
    addressOptions.origin.find((item) => item.id === form.value.originAddressId)
  )
  const destinationAddress = computed(() =>
    addressOptions.destination.find((item) => item.id === form.value.destinationAddressId)
  )
  const canEstimate = computed(() =>
    Boolean(
      normalizeCoordinatePair(originAddress.value?.longitude, originAddress.value?.latitude) &&
      normalizeCoordinatePair(
        destinationAddress.value?.longitude,
        destinationAddress.value?.latitude
      ) &&
      form.value.waypointStationIds?.every((id) => {
        const station = stationOptions.value.find((item) => item.id === id)
        return station && normalizeCoordinatePair(station.longitude, station.latitude)
      })
    )
  )
  const estimateNote = computed(() => {
    if (!form.value.originAddressId || !form.value.destinationAddressId) return ''
    const notes: Record<EstimateStatus, string> = {
      idle: canEstimate.value
        ? '可按当前装卸地址估算驾车里程和正常路况时长。'
        : '所选地址缺少有效经纬度，请手动填写里程和预计时长。',
      loading: '正在根据当前装卸地址估算驾车路线…',
      ready: '已自动填入参考里程和预计时长，仍可按实际运营经验调整。',
      unavailable: '路线估算暂不可用，请稍后重试或手动填写。'
    }
    return notes[estimate.status]
  })
  const estimateIcon = computed(() => {
    const icons: Record<EstimateStatus, string> = {
      idle: 'ri:route-line',
      loading: 'ri:refresh-line',
      ready: 'ri:checkbox-circle-line',
      unavailable: 'ri:information-line'
    }
    return icons[estimate.status]
  })

  const formRules = computed<FormRules<FavoriteRouteForm>>(() => ({
    tenantId: isPlatformSuper.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    routeName: [{ required: true, message: '请输入线路名称', trigger: 'blur' }],
    customerId: [{ required: true, message: '请选择所属客户', trigger: 'change' }],
    originAddressId: [{ required: true, message: '请选择装货地址', trigger: 'change' }],
    destinationAddressId: [{ required: true, message: '请选择卸货地址', trigger: 'change' }],
    waypointStationIds: [
      {
        validator: (_rule, value, callback) => {
          const ids = Array.isArray(value) ? value : []
          callback(
            ids.length > 3 || ids.some((id) => !id) || uniq(ids).length !== ids.length
              ? new Error('请选择 0 至 3 个不同的途经点')
              : undefined
          )
        },
        trigger: 'change'
      }
    ],
    distanceKm: [{ type: 'number', min: 0.01, message: '线路里程应大于 0 公里' }],
    estimatedMinutes: [{ type: 'number', min: 1, message: '预计时长应大于 0 分钟' }],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }))

  const getAddressLabel = (option: unknown): string => {
    const address = option as CustomerAddress
    const ownership = address.customer?.customerName || '公共地址'
    const addressSummary = address.addressDetail || address.region || '未命名地址'
    return `${address.isDefault ? '默认 · ' : ''}${ownership} · ${addressSummary}`
  }

  const getAddressCustomerName = (
    address: CustomerAddress | undefined,
    emptyText: string
  ): string => address?.customer?.customerName || (address ? '公共地址' : emptyText)

  const getFullAddress = (address?: CustomerAddress): string =>
    [address?.region, address?.addressDetail].filter(Boolean).join(' ') || '未维护详细地址'

  const syncAddressOptions = (target: 'origin' | 'destination', result: unknown): unknown => {
    if (result && typeof result === 'object' && 'data' in result) {
      const data = (result as { data?: CustomerAddress[] }).data
      addressOptions[target] = Array.isArray(data) ? data : []
    }
    return result
  }

  const fetchTenantOptions = () => fetchTenantList({ from: 0, to: 999 })

  const formItems = computed<FormItem[]>(() => [
    ...(isPlatformSuper.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select' as const,
            span: 24,
            api: fetchTenantOptions,
            resultField: 'data',
            valueField: 'id',
            labelField: 'tenantName',
            labelFn: (option: unknown) => {
              const tenant = option as TenantOption
              return `${tenant.tenantName}（${tenant.tenantCode}）`
            },
            props: {
              disabled: Boolean(form.value.id),
              filterable: true,
              clearable: !form.value.id,
              onChange: handleTenantChange,
              placeholder: '请选择本次维护的数据租户'
            }
          }
        ]
      : []),
    {
      label: '线路名称',
      key: 'routeName',
      type: 'input',
      props: { maxlength: 60, showWordLimit: true, placeholder: '例如：杭州仓—上海浦东门店' }
    },
    {
      label: '所属客户',
      key: 'customerId',
      type: 'select',
      api: fetchCustomerOptions,
      resultField: 'data',
      labelField: 'customerName',
      valueField: 'id',
      labelFn: (option) => {
        const customer = option as CustomerOption
        return customer.customerCode
          ? `${customer.customerName}（${customer.customerCode}）`
          : customer.customerName
      },
      immediate: false,
      beforeFetch: () => ({ tenantId: form.value.tenantId }),
      props: {
        disabled: isPlatformSuper.value && !form.value.tenantId,
        filterable: true,
        clearable: true,
        placeholder: '请选择客户'
      }
    },
    {
      label: '',
      key: 'routePreview',
      type: 'slot',
      span: 24,
      labelWidth: 0
    },
    {
      label: '装货地址',
      key: 'originAddressId',
      type: 'select',
      api: fetchCustomerAddressOptions,
      resultField: 'data',
      valueField: 'id',
      labelFn: getAddressLabel,
      optionComponent: FavoriteRouteAddressOption,
      immediate: false,
      beforeFetch: () => ({ tenantId: form.value.tenantId, addressType: 'shipping' }),
      afterFetch: (result) => syncAddressOptions('origin', result),
      props: {
        disabled: isPlatformSuper.value && !form.value.tenantId,
        filterable: true,
        clearable: true,
        class: 'favorite-route-dialog__address-select',
        popperClass: 'favorite-route-address-popper art-select-rich-options',
        onChange: handleEndpointChange,
        noDataText: '暂无可用装货地址',
        placeholder: '请选择发货地址'
      }
    },
    {
      label: '卸货地址',
      key: 'destinationAddressId',
      type: 'select',
      api: fetchCustomerAddressOptions,
      resultField: 'data',
      valueField: 'id',
      labelFn: getAddressLabel,
      optionComponent: FavoriteRouteAddressOption,
      immediate: false,
      beforeFetch: () => ({ tenantId: form.value.tenantId, addressType: 'receiving' }),
      afterFetch: (result) => syncAddressOptions('destination', result),
      props: {
        disabled: isPlatformSuper.value && !form.value.tenantId,
        filterable: true,
        clearable: true,
        class: 'favorite-route-dialog__address-select',
        popperClass: 'favorite-route-address-popper art-select-rich-options',
        onChange: handleEndpointChange,
        noDataText: '暂无可用卸货地址',
        placeholder: '请选择收货地址'
      }
    },
    { label: '途经点', key: 'waypointStationIds', type: 'slot', span: 24 },
    {
      label: '含返程',
      key: 'returnTrip',
      type: 'switch',
      span: 12,
      description: '开启后按卸货地、途经点逆序、装货地计算完整往返路线。',
      props: { onChange: handleEndpointChange }
    },
    {
      label: '线路里程',
      key: 'distanceKm',
      type: 'number',
      description: '选择装卸地址后自动估算，可手动调整；不替代实际轨迹里程。',
      props: {
        disabled: estimate.status === 'loading',
        min: 0.01,
        max: 99999999,
        precision: 2,
        step: 1,
        controlsPosition: 'right'
      }
    },
    {
      label: '预计时长',
      key: 'estimatedMinutes',
      type: 'number',
      description: '按正常路况自动估算，以分钟记录并允许人工调整。',
      props: {
        disabled: estimate.status === 'loading',
        min: 1,
        max: 999999,
        step: 10,
        controlsPosition: 'right'
      }
    },
    {
      label: '启用线路',
      key: 'enabled',
      type: 'switch',
      props: { activeText: '启用', inactiveText: '停用', inlinePrompt: true }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '可填写通行限制、装卸时间窗或线路注意事项'
      }
    }
  ])

  const reloadTenantScopedOptions = async (): Promise<void> => {
    if (isPlatformSuper.value && !form.value.tenantId) {
      Object.assign(addressOptions, { origin: [], destination: [] })
      stationOptions.value = []
      return
    }
    const [, , , stations] = await Promise.all([
      formRef.value?.reloadOptions('customerId'),
      formRef.value?.reloadOptions('originAddressId'),
      formRef.value?.reloadOptions('destinationAddressId'),
      fetchStationOptions({ tenantId: form.value.tenantId, stationType: 'transfer' })
    ])
    stationOptions.value = stations.data ?? []
  }

  const resetEstimate = (): void => {
    estimateRequestId += 1
    estimate.status = 'idle'
  }

  const handleTenantChange = async (): Promise<void> => {
    Object.assign(form.value, {
      customerId: '',
      originAddressId: '',
      destinationAddressId: '',
      waypointStationIds: [],
      returnTrip: false,
      distanceKm: null,
      estimatedMinutes: null
    })
    Object.assign(addressOptions, { origin: [], destination: [] })
    resetEstimate()
    await nextTick()
    await reloadTenantScopedOptions()
  }

  const handleEndpointChange = async (): Promise<void> => {
    resetEstimate()
    if (!form.value.originAddressId || !form.value.destinationAddressId) return
    await nextTick()
    await calculateRouteEstimate()
  }

  const addWaypoint = (): void => {
    if ((form.value.waypointStationIds?.length ?? 0) >= 3) return
    form.value.waypointStationIds = [...(form.value.waypointStationIds ?? []), '']
    resetEstimate()
  }
  const setWaypoint = (index: number, id: string): void => {
    form.value.waypointStationIds ??= []
    form.value.waypointStationIds[index] = id
    void handleEndpointChange()
  }
  const moveWaypoint = (index: number, direction: -1 | 1): void => {
    const points = form.value.waypointStationIds ?? []
    const next = index + direction
    if (next < 0 || next >= points.length) return
    ;[points[index], points[next]] = [points[next], points[index]]
    void handleEndpointChange()
  }
  const removeWaypoint = (index: number): void => {
    form.value.waypointStationIds?.splice(index, 1)
    void handleEndpointChange()
  }

  const calculateRouteEstimate = async (): Promise<void> => {
    const origin = normalizeCoordinatePair(
      originAddress.value?.longitude,
      originAddress.value?.latitude
    )
    const destination = normalizeCoordinatePair(
      destinationAddress.value?.longitude,
      destinationAddress.value?.latitude
    )
    if (!origin || !destination) {
      estimate.status = 'idle'
      return
    }

    const requestId = ++estimateRequestId
    estimate.status = 'loading'
    try {
      const waypoints = (form.value.waypointStationIds ?? []).map((id) => {
        const station = stationOptions.value.find((item) => item.id === id)
        return normalizeCoordinatePair(station?.longitude, station?.latitude)
      })
      if (waypoints.some((point) => !point)) {
        estimate.status = 'idle'
        return
      }
      const outbound = [
        origin,
        ...waypoints.filter((point): point is NonNullable<typeof point> => point !== null),
        destination
      ]
      const routePoints = form.value.returnTrip
        ? [...outbound, ...outbound.slice(0, -1).reverse()]
        : outbound
      const segments = await Promise.all(
        routePoints
          .slice(0, -1)
          .map((point, index) => estimateDrivingRoute(point, routePoints[index + 1]))
      )
      if (requestId !== estimateRequestId) return
      Object.assign(form.value, {
        distanceKm:
          Math.round(segments.reduce((sum, segment) => sum + segment.distanceKm, 0) * 100) / 100,
        estimatedMinutes: segments.reduce((sum, segment) => sum + segment.estimatedMinutes, 0)
      })
      estimate.status = 'ready'
    } catch {
      if (requestId === estimateRequestId) estimate.status = 'unavailable'
    }
  }

  const buildPayload = (): FavoriteRoute => {
    const payload = omit(cloneDeep(toRaw(form.value)), [
      'routePreview',
      'tenant',
      'customer',
      'originAddress',
      'destinationAddress',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime'
    ]) as FavoriteRoute
    payload.routeName = payload.routeName.trim()
    payload.distanceKm = form.value.distanceKm || null
    payload.estimatedMinutes = form.value.estimatedMinutes || null
    payload.remark = normalizeNullableText(form.value.remark)
    if (!isPlatformSuper.value || payload.id) delete payload.tenantId
    return payload
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildPayload()
      const type = payload.id ? 'edit' : 'add'
      if (type === 'edit') await editFavoriteRoute(payload)
      else await addFavoriteRoute(payload)
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '常用线路保存失败，请检查线路信息后重试')
      return false
    }
  }

  const handleOpen = async (row?: FavoriteRoute, tenantId?: string): Promise<void> => {
    let targetTenantId: string
    try {
      targetTenantId =
        row?.tenantId ||
        resolveTenantWriteTargetId({
          explicitTenantId: tenantId,
          effectiveTenantId: tenantScopeStore.effectiveTenantId,
          actorTenantId: getUserInfo.value.tenantId,
          canWriteToOtherTenant: isPlatformSuper.value
        })
    } catch (error) {
      notifyFriendlyError(error, '目标租户不可用，请重新选择后重试')
      return
    }
    Object.assign(form.value, createInitialForm(), row ? cloneDeep(toRaw(row)) : {}, {
      tenantId: targetTenantId
    })
    Object.assign(addressOptions, { origin: [], destination: [] })
    resetEstimate()

    await dialogRef.value?.handleOpen(row, {
      title: row?.id ? '编辑常用线路' : '新增常用线路',
      subtitle: '常用线路引用地址簿，开单与调度可复用同一份标准路线',
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await reloadTenantScopedOptions()
          await nextTick()
          formRef.value?.clearValidate()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .favorite-route-dialog {
    &__preview {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 80px minmax(0, 1fr);
      gap: 16px;
      align-items: center;
      padding: 18px;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__endpoint {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 38px;
        place-items: center;
        width: 38px;
        height: 38px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: var(--el-border-radius-base);
      }

      &.is-destination > span {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      > div {
        min-width: 0;
      }

      small,
      strong,
      p {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small,
      p {
        color: var(--el-text-color-secondary);
      }

      strong {
        margin: 2px 0;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
      }

      p.favorite-route-dialog__contact {
        display: flex;
        gap: 8px;

        span {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        span + span::before {
          margin-right: 8px;
          color: var(--el-border-color);
          content: '·';
        }
      }
    }

    &__path {
      display: flex;
      gap: 7px;
      align-items: center;
      justify-content: center;

      span {
        width: 7px;
        height: 7px;
        background: var(--el-border-color);
        border-radius: 50%;

        &:last-child {
          width: 28px;
          height: 2px;
          border-radius: 999px;
        }
      }
    }

    &__waypoints {
      display: flex;
      flex-wrap: wrap;
      grid-column: 1 / -1;
      gap: 8px 12px;
      align-items: center;
      min-width: 0;
      padding-top: 12px;
      border-top: 1px dashed var(--el-border-color-lighter);

      > strong {
        flex: 0 0 auto;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      > ol {
        display: flex;
        flex: 1 1 360px;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
        padding: 0;
        margin: 0;
        list-style: none;

        > li {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          min-width: 0;
          max-width: 100%;
          padding: 4px 8px;
          font-size: 12px;
          color: var(--el-text-color-regular);
          background: var(--el-fill-color-light);
          border-radius: var(--el-border-radius-small);

          > span:first-child {
            flex: 0 0 auto;
            font-variant-numeric: tabular-nums;
            color: var(--el-color-primary);
          }

          > span:last-child {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      }

      > small {
        flex-basis: 100%;
        color: var(--el-text-color-secondary);
      }
    }

    &__estimate {
      display: flex;
      grid-column: 1 / -1;
      gap: 8px;
      align-items: center;
      min-width: 0;
      padding-top: 12px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
      border-top: 1px dashed var(--el-border-color-lighter);

      > svg {
        flex: 0 0 auto;
        color: var(--el-color-primary);
      }

      > span {
        min-width: 0;
      }

      .el-button {
        flex: 0 0 auto;
        margin-left: auto;
      }

      &.is-ready {
        color: var(--el-color-success);

        > svg {
          color: currentcolor;
        }
      }

      &.is-unavailable {
        color: var(--el-color-warning);

        > svg {
          color: currentcolor;
        }
      }
    }

    &__address-select {
      min-width: 0;

      :deep(.el-select__selected-item) {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  :global(.favorite-route-address-popper) {
    width: min(560px, calc(100vw - 32px)) !important;
    max-width: calc(100vw - 32px);
  }

  :global(.favorite-route-address-popper .el-select-dropdown__wrap) {
    max-height: 360px;
  }

  :global(.favorite-route-address-popper .el-select-dropdown__item) {
    height: auto !important;
    min-height: 72px;
    padding: 0 12px;
    line-height: 20px !important;
    white-space: normal;
  }

  :deep(.art-form-item__content > .el-input-number) {
    width: 100%;
  }

  @media (width <= 700px) {
    .favorite-route-dialog {
      &__preview {
        grid-template-columns: minmax(0, 1fr);
      }

      &__path {
        display: none;
      }
    }
  }
</style>
