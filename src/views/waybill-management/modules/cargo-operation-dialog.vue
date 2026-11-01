<template>
  <ArtDialog ref="dialogRef" size="lg" @close="() => void invalidateSession()">
    <ArtAsyncState
      :error="state.contextError"
      :min-height="260"
      @retry="() => loadContext(formSession)"
    >
      <div class="cargo-operation-dialog">
        <section class="cargo-operation-dialog__summary art-card-xs">
          <div class="cargo-operation-dialog__summary-icon" :class="`is-${operationType}`">
            <ArtSvgIcon
              :icon="
                operationType === 'loading' ? 'ri:upload-cloud-2-line' : 'ri:download-cloud-2-line'
              "
            />
          </div>
          <div class="cargo-operation-dialog__summary-copy">
            <span>{{ operationTitle }}作业</span>
            <strong>{{ currentRow?.orderNo || '运单' }}</strong>
            <small>{{ operationAddress }}</small>
          </div>
          <ElTag :type="statusTag.type" effect="light" round>{{ statusTag.label }}</ElTag>
        </section>

        <ElAlert
          v-if="currentRow && !canOperate"
          type="warning"
          title="当前运单不在所选租户范围内或操作权限已变化，请刷新后重试"
          :closable="false"
          show-icon
        />
        <ElAlert
          v-if="context"
          class="cargo-operation-dialog__policy"
          :type="context.allowOutsideCheckIn ? 'warning' : 'info'"
          :closable="false"
          show-icon
          :title="policyTitle"
          :description="policyDescription"
        />
        <ElAlert
          v-if="currentRow && !attachmentTenantId"
          type="warning"
          title="运单缺少租户归属，暂不能上传附件，请返回列表刷新后重试"
          :closable="false"
          show-icon
        />

        <ArtSectionCard
          class="cargo-operation-dialog__checkin"
          preserve-content-structure
          title="定位打卡"
        >
          <div v-if="context?.operation" class="cargo-operation-dialog__checkin-grid">
            <div
              ><span>打卡时间</span><strong>{{ checkinTimeText }}</strong></div
            >
            <div
              ><span>打卡方式</span><strong>{{ checkinModeText }}</strong></div
            >
            <div
              ><span>围栏判定</span><strong>{{ geofenceResultText }}</strong></div
            >
            <div
              ><span>定位精度</span><strong>{{ accuracyText }}</strong></div
            >
          </div>
          <div v-else class="cargo-operation-dialog__locate">
            <div>
              <strong>请先获取当前定位并完成打卡</strong>
              <p>系统会在服务端计算与{{ operationTitle }}地的距离，并保存坐标、精度和围栏快照。</p>
            </div>
            <ElButton
              type="primary"
              :disabled="!canOperate"
              :loading="state.locating"
              @click="handleCheckIn"
            >
              <ArtSvgIcon icon="ri:map-pin-user-line" />
              获取定位并打卡
            </ElButton>
          </div>
        </ArtSectionCard>

        <ArtForm
          v-if="!checkinOnly"
          ref="formRef"
          v-model="form.data"
          :items="form.items"
          :rules="form.rules"
          :disabled="!context?.operation || context.operation.operationStatus === 'completed'"
          :span="12"
          :gutter="20"
          label-position="top"
          class="cargo-operation-dialog__form art-card-xs"
        >
        </ArtForm>
      </div>
    </ArtAsyncState>

    <template #footer="{ loading, api }">
      <ElButton @click="api.handleClose()">关闭</ElButton>
      <ElButton
        v-if="!checkinOnly && context?.operation?.operationStatus !== 'completed'"
        type="primary"
        :loading="loading"
        :disabled="!context?.operation || !canOperate"
        @click="api.handleConfirm()"
      >
        提交{{ operationTitle }}信息
      </ElButton>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatSensitiveCountValue } from '@/utils/ui/format'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type { ComputedRef } from 'vue'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    checkInWaybillCargoOperation,
    completeWaybillCargoOperation,
    fetchWaybillCargoOperationContext
  } from '@tms/api'
  import { formatWithDayjs } from '@/utils/time'
  import { useAmapGeolocation } from '@/hooks/core/useAmapGeolocation'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantReadTarget } from '@/hooks/core/useTenantReadTarget'
  import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ElMessage } from 'element-plus'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import type { WaybillRecord } from './waybill-shared'

  defineOptions({ name: 'TmsWaybillCargoOperationDialog' })

  type OperationType = Api.Tms.Waybill.CargoOperationType
  type OperationContext = Api.Tms.Waybill.CargoOperationContext

  interface OpenData {
    row: WaybillRecord
    operationType: OperationType
    checkinOnly?: boolean
  }

  interface OperationForm {
    weightTon: number | null
    checkinTimeDisplay: string
    photoUrls: string[]
    weighbridgeTicketUrls: string[]
    remark: string
  }

  interface FormGroup {
    data: OperationForm
    items: ComputedRef<FormItem[]>
    rules: FormRules<OperationForm>
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface LocationResult {
    longitude: number
    latitude: number
    accuracy: number | null
    locationText?: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<FormExpose>()
  const currentRow = shallowRef<WaybillRecord>()
  const tenantScopeStore = useTenantScopeStore()
  const attachmentTenantId = computed(
    () => currentRow.value?.tenantId || tenantScopeStore.effectiveTenantId || ''
  )
  const operationType = ref<OperationType>('loading')
  const checkinOnly = ref(false)
  const context = shallowRef<OperationContext>()
  const state = reactive<{ locating: boolean; contextError: Error | null }>({
    locating: false,
    contextError: null
  })
  const { getCurrentLocation } = useAmapGeolocation({ timeoutMs: 15_000 })
  const { hasAuth } = useAuth()
  const {
    version: formSession,
    invalidate,
    isCurrent
  } = useArtOverlaySession(() => Boolean(unref(dialogRef.value?.visible)))
  let locationRequest: AbortController | undefined
  const readTenantId = useTenantReadTarget(() => currentRow.value?.tenantId)
  const canOperate = computed(
    () =>
      readTenantId.value !== undefined &&
      hasAuth(
        checkinOnly.value
          ? 'TmsWaybill:Arrive'
          : operationType.value === 'loading'
            ? 'TmsWaybill:Loading'
            : 'TmsWaybill:Unloading'
      )
  )
  function invalidateSession(): number {
    invalidate()
    locationRequest?.abort()
    locationRequest = undefined
    state.locating = false
    return formSession.value
  }
  onBeforeUnmount(invalidateSession)
  watch([() => tenantScopeStore.effectiveTenantId, canOperate], () => locationRequest?.abort(), {
    flush: 'sync'
  })
  const { promptReason } = useArtFeedback()

  const createInitialForm = (): OperationForm => ({
    weightTon: null,
    checkinTimeDisplay: '',
    photoUrls: [],
    weighbridgeTicketUrls: [],
    remark: ''
  })

  const operationTitle = computed(() => (operationType.value === 'loading' ? '装货' : '卸货'))
  const operationAddress = computed(() =>
    operationType.value === 'loading'
      ? currentRow.value?.shippingAddressDetail || '未维护装货地址'
      : currentRow.value?.receivingAddressDetail || '未维护卸货地址'
  )
  const statusTag = computed(() => {
    const status = context.value?.operation?.operationStatus
    if (status === 'completed')
      return { label: `${operationTitle.value}已完成`, type: 'success' as const }
    if (status === 'checked_in') return { label: '已打卡，待补资料', type: 'warning' as const }
    return { label: '待打卡', type: 'info' as const }
  })
  const policyTitle = computed(() => {
    if (!context.value?.geofenceEnabled) return '电子围栏校验已停用'
    return context.value.allowOutsideCheckIn ? '可围栏外手动打卡' : '仅支持围栏内打卡'
  })
  const policyDescription = computed(() => {
    if (!context.value) return ''
    const automatic = context.value.autoCheckIn ? '围栏内支持自动打卡' : '围栏内仍需手动打卡'
    return `围栏半径 ${formatSensitiveCountValue(context.value.radiusM)} 米；${automatic}。围栏外打卡会记录异常原因。`
  })
  const checkinTimeText = computed(
    () => formatWithDayjs(context.value?.operation?.checkinTime) || '--'
  )
  const checkinModeText = computed(() => {
    const labels: Record<string, string> = {
      manual: '司机手动',
      automatic: '围栏自动',
      admin: 'PC 端操作'
    }
    return labels[context.value?.operation?.checkinMode || ''] || '--'
  })
  const geofenceResultText = computed(() => {
    const operation = context.value?.operation
    if (!operation) return '--'
    return `${operation.insideGeofence ? '围栏内' : '围栏外'} · 距中心 ${Math.round(operation.distanceM)} 米`
  })
  const accuracyText = computed(() => {
    const accuracy = context.value?.operation?.locationAccuracyM
    return accuracy === null || accuracy === undefined ? '--' : `约 ${Math.round(accuracy)} 米`
  })

  const form = reactive<FormGroup>({
    data: createInitialForm(),
    rules: {
      weightTon: [
        { required: true, message: '请输入实际重量', trigger: 'blur' },
        { type: 'number', min: 0.001, message: '重量必须大于 0 吨', trigger: 'blur' }
      ],
      photoUrls: [{ type: 'array', required: true, min: 1, message: '请至少上传 1 张现场照片' }],
      weighbridgeTicketUrls: [
        { type: 'array', required: true, min: 1, message: '请至少上传 1 张磅单' }
      ]
    },
    items: computed<FormItem[]>(() => [
      { label: `${operationTitle.value}资料`, key: 'operationSection', type: 'divider', span: 24 },
      {
        label: `${operationTitle.value}重量（吨）`,
        key: 'weightTon',
        type: 'number',
        props: { min: 0.001, precision: 3, step: 0.1, controlsPosition: 'right', class: '!w-full' },
        description: '以现场实际磅重为准，最多保留 3 位小数。'
      },
      {
        label: `${operationTitle.value}时间`,
        key: 'checkinTimeDisplay',
        type: 'text',
        props: { emptyText: '--', class: 'font-medium text-theme' },
        description: '以服务端首次打卡时间为准，提交资料不会覆盖。'
      },
      {
        label: `${operationTitle.value}照片`,
        key: 'photoUrls',
        span: 24,
        type: 'uploadImage',
        props: {
          resourceTenantId: attachmentTenantId.value,
          disabled:
            !attachmentTenantId.value ||
            !context.value?.operation ||
            context.value.operation.operationStatus === 'completed',
          title: `${operationTitle.value}照片`,
          size: 92,
          limit: 5,
          multiple: true
        }
      },
      {
        label: `${operationTitle.value}磅单`,
        key: 'weighbridgeTicketUrls',
        span: 24,
        type: 'uploadImage',
        props: {
          resourceTenantId: attachmentTenantId.value,
          disabled:
            !attachmentTenantId.value ||
            !context.value?.operation ||
            context.value.operation.operationStatus === 'completed',
          title: `${operationTitle.value}磅单`,
          size: 92,
          limit: 3,
          multiple: true
        }
      },
      {
        label: '备注',
        key: 'remark',
        type: 'textarea',
        span: 24,
        props: {
          rows: 3,
          maxlength: 300,
          showWordLimit: true,
          placeholder: '可填写货损、磅差或现场说明'
        }
      }
    ])
  })

  function distanceMeters(location: LocationResult, target: OperationContext): number | null {
    if (target.centerLongitude == null || target.centerLatitude == null) return null
    const radians = (value: number) => (value * Math.PI) / 180
    const latitudeDelta = radians(target.centerLatitude - location.latitude)
    const longitudeDelta = radians(target.centerLongitude - location.longitude)
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(location.latitude)) *
        Math.cos(radians(target.centerLatitude)) *
        Math.sin(longitudeDelta / 2) ** 2
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  async function resolveOutsideReason(
    location: LocationResult,
    target: OperationContext,
    title: string
  ): Promise<string | null> {
    if (!target.geofenceEnabled) return null
    const distance = distanceMeters(location, target)
    if (distance === null || distance <= target.radiusM) return null
    if (!target.allowOutsideCheckIn) {
      throw new Error(`当前不在${title}地围栏内，请到达现场后重新打卡`)
    }
    return await promptReason(
      `当前距${title}地约 ${formatSensitiveCountValue(Math.round(distance))} 米，请说明围栏外打卡原因。`,
      '围栏外打卡确认',
      {
        confirmButtonText: '确认打卡',
        cancelButtonText: '取消',
        placeholder: '例如：园区入口封闭，车辆在指定临时作业区',
        minLength: 4,
        minLengthMessage: '请至少填写 4 个字'
      }
    )
  }

  async function handleCheckIn(): Promise<void> {
    if (!currentRow.value?.driverWaybillId || !context.value || state.locating || !canOperate.value)
      return
    const session = formSession.value
    const waybillId = currentRow.value.driverWaybillId
    const type = operationType.value
    const closeOnSuccess = checkinOnly.value
    const target = context.value
    const title = operationTitle.value
    const address = operationAddress.value
    const ensureScope = createTenantScopeReadGuard()
    const request = new AbortController()
    locationRequest = request
    state.locating = true
    try {
      const result = await getCurrentLocation(request.signal)
      if (!isCurrent(session) || request.signal.aborted || !canOperate.value) return
      ensureScope()
      const location: LocationResult = {
        longitude: result.longitude,
        latitude: result.latitude,
        accuracy: result.accuracy,
        locationText: result.formattedAddress || address
      }
      const outsideReason = await resolveOutsideReason(location, target, title)
      if (!isCurrent(session) || request.signal.aborted || !canOperate.value) return
      ensureScope()
      const response = await checkInWaybillCargoOperation(
        {
          waybillId,
          operationType: type,
          longitude: location.longitude,
          latitude: location.latitude,
          accuracyM: location.accuracy,
          locationText: location.locationText,
          outsideReason
        },
        { showMessage: false, showErrorMessage: false }
      )
      if (closeOnSuccess) emit('success')
      if (!isCurrent(session) || request.signal.aborted || !canOperate.value) return
      if (response.data) applyContext(response.data)
      ElMessage.success(`${title}打卡已记录`)
      if (closeOnSuccess) {
        await dialogRef.value?.handleClose()
      }
    } catch (error) {
      if (!isCurrent(session) || request.signal.aborted) return
      if (isMessageBoxCancelled(error)) return
      notifyFriendlyError(error, '到场签到失败，请检查定位和网络后重试')
    } finally {
      if (locationRequest === request) {
        locationRequest = undefined
        state.locating = false
      }
    }
  }

  async function handleSubmit(): Promise<boolean> {
    if (!currentRow.value?.driverWaybillId || !context.value?.operation || !canOperate.value)
      return false
    const session = formSession.value
    const waybillId = currentRow.value.driverWaybillId
    const type = operationType.value
    const ensureScope = createTenantScopeReadGuard()
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!isCurrent(session) || !canOperate.value) return false
      ensureScope()
    } catch (error) {
      if (!isCurrent(session)) return false
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    try {
      await completeWaybillCargoOperation(
        {
          waybillId,
          operationType: type,
          weightTon: Number(form.data.weightTon),
          photoUrls: [...form.data.photoUrls],
          weighbridgeTicketUrls: [...form.data.weighbridgeTicketUrls],
          remark: normalizeNullableText(form.data.remark)
        },
        { showMessage: false, showErrorMessage: false }
      )
      emit('success')
      if (isCurrent(session)) ElMessage.success('装卸货资料已提交')
      return true
    } catch (error) {
      if (!isCurrent(session)) return false
      notifyFriendlyError(error, '货物作业提交失败，请检查称重数据和网络后重试')
      return false
    }
  }

  async function loadContext(session: number): Promise<void> {
    const waybillId = currentRow.value?.driverWaybillId
    if (!isCurrent(session)) return
    state.contextError = null
    dialogRef.value?.setLoading(true)
    const ensureScope = createTenantScopeReadGuard()
    try {
      if (!waybillId) throw new Error('该订单尚未生成司机运单，请先完成配载')
      if (!canOperate.value) throw new Error('运单超出当前租户范围或操作权限已变化，请刷新后重试')
      const result = await fetchWaybillCargoOperationContext(waybillId, operationType.value, {
        showErrorMessage: false
      })
      if (!isCurrent(session)) return
      ensureScope()
      if (result.error) throw result.error
      applyContext(result.data ?? undefined)
    } catch (error) {
      if (isCurrent(session))
        state.contextError = new Error(
          getFriendlySupabaseErrorMessage(error, '装卸货信息加载失败，请重新加载后重试'),
          { cause: error }
        )
    } finally {
      if (isCurrent(session)) dialogRef.value?.setLoading(false)
    }
  }

  function applyContext(value: OperationContext | undefined): void {
    context.value = value
    const operation = value?.operation
    Object.assign(form.data, createInitialForm(), {
      weightTon: operation?.weightTon ?? null,
      checkinTimeDisplay: operation?.checkinTime ? formatWithDayjs(operation.checkinTime) : '',
      photoUrls: operation?.photoUrls ?? [],
      weighbridgeTicketUrls: operation?.weighbridgeTicketUrls ?? [],
      remark: operation?.remark ?? ''
    })
  }

  function isMessageBoxCancelled(error: unknown): boolean {
    const action =
      typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'action' in error
          ? String(error.action)
          : ''
    return action === 'cancel' || action === 'close'
  }

  async function resetForm(): Promise<number> {
    const session = invalidateSession()
    state.contextError = null
    context.value = undefined
    currentRow.value = undefined
    Object.assign(form.data, createInitialForm())
    await nextTick()
    if (session === formSession.value) formRef.value?.clearValidate()
    return session
  }

  async function handleOpen(data: OpenData): Promise<void> {
    const session = await resetForm()
    if (session !== formSession.value) return
    currentRow.value = data.row
    operationType.value = data.operationType
    checkinOnly.value = data.checkinOnly === true
    await dialogRef.value?.handleOpen(data, {
      title: checkinOnly.value ? '确认到达目的地' : `${operationTitle.value}打卡与资料`,
      subtitle: checkinOnly.value
        ? '获取当前地址与经纬度，服务端校验卸货地围栏后进入卸货节点。'
        : '打卡时间和位置由服务端留痕，现场照片与磅单用于履约核验',
      confirmText: `提交${operationTitle.value}信息`,
      contentMaxHeight: '78vh',
      loading: true,
      onOpen: () => loadContext(session),
      onConfirm: handleSubmit,
      onReset: () => void resetForm(),
      dialogProps: { appendToBody: true, closeOnClickModal: false }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .cargo-operation-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;

    &__summary {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-4);
    }

    &__summary-icon {
      display: grid;
      flex: 0 0 48px;
      place-items: center;
      width: 48px;
      height: 48px;
      font-size: 24px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--custom-radius);

      &.is-unloading {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }
    }

    &__summary-copy {
      min-width: 0;
      margin-right: auto;

      span,
      small {
        display: block;
        color: var(--el-text-color-secondary);
      }

      strong {
        display: block;
        margin: 3px 0;
        font-size: 18px;
        color: var(--el-text-color-primary);
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__checkin,
    &__form {
      padding: var(--art-space-4);
    }

    &__checkin-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--art-space-3);
      margin-top: var(--art-space-3);

      > div {
        min-width: 0;
        padding: 12px;
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);

        span,
        strong {
          display: block;
        }

        span {
          margin-bottom: 6px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }
      }
    }

    &__locate {
      display: flex;
      gap: var(--art-space-4);
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      margin-top: var(--art-space-3);
      background: var(--el-fill-color-lighter);
      border: 1px dashed var(--el-border-color);
      border-radius: var(--el-border-radius-base);

      p {
        margin: 5px 0 0;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }

    @media (width <= 767px) {
      &__summary {
        flex-wrap: wrap;
        align-items: flex-start;
      }

      &__checkin-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__locate {
        flex-direction: column;
        align-items: stretch;
      }
    }
  }
</style>
