<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="execution-dialog">
      <section class="execution-dialog__summary art-card-xs">
        <span class="execution-dialog__icon" :class="`is-${action}`">
          <ArtSvgIcon :icon="actionMeta.icon" />
        </span>
        <div>
          <small>{{ actionMeta.eyebrow }}</small>
          <strong>{{ currentRow?.waybillNo || currentRow?.orderNo || '运输运单' }}</strong>
          <p>{{ actionMeta.description }}</p>
        </div>
        <ElTag effect="light" round>{{ actionMeta.tag }}</ElTag>
      </section>

      <ElAlert
        class="execution-dialog__alert"
        :title="flowAlert"
        :type="
          context?.needsReturnCompletion && currentRow?.waybillStatus === 'completed'
            ? 'warning'
            : 'info'
        "
        :closable="false"
        show-icon
      />
      <ElAlert
        v-if="currentRow && !attachmentTenantId"
        type="warning"
        title="运单缺少租户归属，暂不能上传附件，请返回列表刷新后重试"
        :closable="false"
        show-icon
      />

      <ArtForm
        ref="formRef"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
        class="execution-dialog__form art-card-xs"
      >
        <template #photoUrls>
          <ArtUploadImage
            v-model="form.data.photoUrls"
            :resource-tenant-id="attachmentTenantId"
            :disabled="!attachmentTenantId"
            :title="action === 'completion' ? '收车照片' : '发车照片'"
            :size="92"
            :limit="5"
            multiple
          />
        </template>
        <template #receiptUrls>
          <ArtUploadImage
            v-model="form.data.receiptUrls"
            :resource-tenant-id="attachmentTenantId"
            :disabled="!attachmentTenantId"
            title="签收回单"
            :size="92"
            :limit="5"
            multiple
          />
        </template>
        <template #signatureUrls>
          <ArtUploadImage
            v-model="form.data.signatureUrls"
            :resource-tenant-id="attachmentTenantId"
            :disabled="!attachmentTenantId"
            title="签字确认照片"
            :size="92"
            :limit="3"
            multiple
          />
        </template>
      </ArtForm>
      <section v-if="action === 'signature'" class="execution-dialog__sources art-card-xs">
        <div class="execution-dialog__sources-heading">
          <div>
            <strong>原始运输单签收明细</strong>
            <p>逐单登记实收件数和异常件数；原始单仅在全部货量签收后完成。</p>
          </div>
          <ElTag type="info" size="small">{{ receiptAllocations.length }} 张原始单</ElTag>
        </div>
        <div
          v-for="item in receiptAllocations"
          :key="item.allocationId"
          class="execution-dialog__source"
        >
          <div class="execution-dialog__source-title">
            <strong>{{ item.orderNo }}</strong>
            <span>{{ item.customerName || '未关联客户' }} · 配载 {{ item.quantity }} 件</span>
          </div>
          <div class="execution-dialog__source-inputs">
            <label>
              <span>实收件数</span>
              <ElInputNumber
                v-model="item.signedQuantity"
                :min="0"
                :max="item.quantity"
                :precision="3"
                controls-position="right"
              />
            </label>
            <label>
              <span>异常件数</span>
              <ElInputNumber
                v-model="item.exceptionQuantity"
                :min="0"
                :max="item.quantity"
                :precision="3"
                controls-position="right"
              />
            </label>
          </div>
          <ElInput
            v-if="item.exceptionQuantity > 0"
            v-model="item.exceptionNote"
            type="textarea"
            :rows="2"
            :maxlength="300"
            show-word-limit
            placeholder="说明破损、短少等异常，便于按原始单追责"
          />
        </div>
      </section>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import dayjs from 'dayjs'
  import type { ComputedRef } from 'vue'
  import type { FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    completeWaybillExecution,
    fetchWaybillExecutionContext,
    recordWaybillDeparture,
    fetchExecutionSources,
    signExecutionAllocations
  } from '@tms/api'
  import type { WaybillRecord } from './waybill-shared'

  defineOptions({ name: 'TmsWaybillExecutionOperationDialog' })

  type ExecutionAction = Api.Tms.Waybill.ExecutionAction

  interface OpenData {
    row: WaybillRecord
    action: ExecutionAction
  }

  interface ExecutionForm {
    occurredAt: string
    odometerKm: number | null
    emptyMileageKm: number | null
    departureFuelLiters: number | null
    refueledLiters: number | null
    returnFuelLiters: number | null
    signerName: string
    photoUrls: string[]
    receiptUrls: string[]
    signatureUrls: string[]
    remark: string
  }

  interface ReceiptAllocationForm {
    allocationId: string
    orderNo: string
    customerName: string | null
    quantity: number
    signedQuantity: number
    exceptionQuantity: number
    exceptionNote: string
  }

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface FormGroup {
    data: ExecutionForm
    items: ComputedRef<FormItem[]>
    rules: FormRules<ExecutionForm>
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<FormExpose>()
  const currentRow = shallowRef<WaybillRecord>()
  const tenantScopeStore = useTenantScopeStore()
  const attachmentTenantId = computed(
    () => currentRow.value?.tenantId || tenantScopeStore.effectiveTenantId || ''
  )
  const action = ref<ExecutionAction>('departure')
  const context = shallowRef<Api.Tms.Waybill.ExecutionContext>()
  const receiptAllocations = ref<ReceiptAllocationForm[]>([])

  const actionMetaMap = {
    departure: {
      title: '确认发车',
      eyebrow: 'DEPARTURE RECORD',
      tag: '装货后发车',
      icon: 'ri:send-plane-line',
      description: '记录实际发车时间、出车里程与车辆现场照片。',
      alert: '发车时间必须晚于装货完成时间；出车里程将用于最终核算本次行驶里程。'
    },
    signature: {
      title: '签收',
      eyebrow: 'DELIVERY SIGNATURE',
      tag: '独立签收节点',
      icon: 'ri:quill-pen-line',
      description: '上传回单与签字确认照片，PC 和手机端实时同步。',
      alert: '签收后运单进入“已签收”，仍需确认收车时间和里程后才会完成。'
    },
    completion: {
      title: '确认完成运单',
      eyebrow: 'RETURN & CLOSE',
      tag: '运输闭环',
      icon: 'ri:checkbox-circle-line',
      description: '记录收车时间、收车里程与车辆照片，完成运输闭环。',
      alert: '收车里程不能小于出车里程；提交后将同步生成该车辆的运单里程记录。'
    }
  } as const

  const actionMeta = computed(() => actionMetaMap[action.value])
  const flowAlert = computed(() => {
    if (action.value === 'signature' && currentRow.value?.driverWaybillSignedAt) {
      return '复核会按原始单更新签收与异常件数并留下审计记录；车辆执行单的完成状态不变。'
    }
    if (
      action.value === 'completion' &&
      context.value?.needsReturnCompletion &&
      currentRow.value?.waybillStatus === 'completed'
    ) {
      return '检测到历史完成状态缺少回场档案。本次提交将补齐回场时间、里程、照片和车辆里程记录。'
    }
    if (action.value === 'completion' && context.value?.record?.departureOdometerKm != null) {
      return `${actionMeta.value.alert} 本次出车里程为 ${context.value.record.departureOdometerKm} 公里。`
    }
    return actionMeta.value.alert
  })

  const createInitialForm = (): ExecutionForm => ({
    occurredAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    odometerKm: null,
    emptyMileageKm: null,
    departureFuelLiters: null,
    refueledLiters: null,
    returnFuelLiters: null,
    signerName: '',
    photoUrls: [],
    receiptUrls: [],
    signatureUrls: [],
    remark: ''
  })

  const form = reactive<FormGroup>({
    data: createInitialForm(),
    rules: {
      occurredAt: [{ required: true, message: '请选择业务时间', trigger: 'change' }],
      odometerKm: [
        { required: true, message: '请输入车辆里程', trigger: 'blur' },
        { type: 'number', min: 0, message: '车辆里程不能小于 0', trigger: 'blur' }
      ],
      signerName: [{ required: true, message: '请填写签收人', trigger: 'blur' }],
      photoUrls: [{ type: 'array', required: true, min: 1, message: '请至少上传 1 张照片' }],
      receiptUrls: [{ type: 'array', required: true, min: 1, message: '请至少上传 1 张回单' }],
      signatureUrls: [
        { type: 'array', required: true, min: 1, message: '请至少上传 1 张签字确认照片' }
      ]
    },
    items: computed<FormItem[]>(() => {
      const commonTime: FormItem = {
        label:
          action.value === 'departure'
            ? '实际发车时间'
            : action.value === 'signature'
              ? '签收时间'
              : '收车时间',
        key: 'occurredAt',
        type: 'date',
        props: {
          type: 'datetime',
          valueFormat: 'YYYY-MM-DD HH:mm:ss',
          class: '!w-full',
          placeholder: '请选择时间'
        }
      }
      const remark: FormItem = {
        label: '备注',
        key: 'remark',
        type: 'textarea',
        span: 24,
        props: { rows: 3, maxlength: 300, showWordLimit: true, placeholder: '可填写现场说明' }
      }

      if (action.value === 'signature') {
        return [
          { label: '签收信息', key: 'section', type: 'divider', span: 24 },
          commonTime,
          {
            label: '签收人',
            key: 'signerName',
            type: 'input',
            props: { maxlength: 50, placeholder: '请输入实际签收人' }
          },
          { label: '签收回单', key: 'receiptUrls', span: 24 },
          { label: '签字确认照片', key: 'signatureUrls', span: 24 },
          remark
        ]
      }

      return [
        {
          label: action.value === 'departure' ? '发车信息' : '收车信息',
          key: 'section',
          type: 'divider',
          span: 24
        },
        commonTime,
        {
          label: action.value === 'departure' ? '出车里程（公里）' : '收车里程（公里）',
          key: 'odometerKm',
          type: 'number',
          props: { min: 0, precision: 1, step: 1, controlsPosition: 'right', class: '!w-full' }
        },
        ...(action.value === 'completion'
          ? [
              {
                label: '本次空驶里程（公里）',
                key: 'emptyMileageKm',
                type: 'number' as const,
                props: {
                  min: 0,
                  precision: 1,
                  controlsPosition: 'right',
                  class: '!w-full',
                  placeholder: '选填；未确认请留空'
                }
              },
              {
                label: '本次油量（选填，未核实请留空）',
                key: 'fuelSection',
                type: 'divider' as const,
                span: 24
              },
              ...[
                { label: '出车余油（升）', key: 'departureFuelLiters' },
                { label: '途中加油（升）', key: 'refueledLiters' },
                { label: '回场余油（升）', key: 'returnFuelLiters' }
              ].map((item) => ({
                ...item,
                type: 'number' as const,
                props: {
                  min: 0,
                  precision: 3,
                  controlsPosition: 'right',
                  class: '!w-full',
                  placeholder: '未核实请留空；无加油填 0'
                }
              }))
            ]
          : []),
        {
          label: action.value === 'departure' ? '发车照片' : '收车照片',
          key: 'photoUrls',
          span: 24
        },
        remark
      ]
    })
  })

  async function loadContext(): Promise<void> {
    const waybillId = currentRow.value?.driverWaybillId
    if (!waybillId) throw new Error('该订单尚未生成司机运单')
    const result = await fetchWaybillExecutionContext(waybillId)
    context.value = result.data ?? undefined
    if (action.value === 'signature') {
      const sources = await fetchExecutionSources(waybillId)
      if (sources.error) throw new Error('原始运输单签收明细加载失败')
      receiptAllocations.value = (sources.data ?? []).map((source) => ({
        allocationId: source.id,
        orderNo: source.orderNo,
        customerName: source.customerName ?? null,
        quantity: Number(source.quantity),
        signedQuantity: source.signedAt ? Number(source.signedQuantity) : Number(source.quantity),
        exceptionQuantity: Number(source.exceptionQuantity),
        exceptionNote: source.exceptionNote ?? ''
      }))
    }
    const record = result.data?.record
    Object.assign(form.data, createInitialForm(), {
      occurredAt:
        action.value === 'departure' && record?.departureTime
          ? dayjs(record.departureTime).format('YYYY-MM-DD HH:mm:ss')
          : action.value === 'signature' && record?.signedAt
            ? dayjs(record.signedAt).format('YYYY-MM-DD HH:mm:ss')
            : action.value === 'completion' && record?.returnTime
              ? dayjs(record.returnTime).format('YYYY-MM-DD HH:mm:ss')
              : dayjs().format('YYYY-MM-DD HH:mm:ss'),
      odometerKm:
        action.value === 'departure'
          ? (record?.departureOdometerKm ?? null)
          : (record?.returnOdometerKm ?? null),
      signerName: record?.signerName ?? currentRow.value?.receivingContactName ?? '',
      emptyMileageKm: record?.emptyMileageKm ?? null,
      departureFuelLiters: record?.departureFuelLiters ?? null,
      refueledLiters: record?.refueledLiters ?? null,
      returnFuelLiters: record?.returnFuelLiters ?? null,
      photoUrls:
        action.value === 'departure'
          ? (record?.departurePhotoUrls ?? [])
          : (record?.returnPhotoUrls ?? []),
      receiptUrls: record?.receiptUrls ?? [],
      signatureUrls: record?.signatureUrls ?? [],
      remark:
        action.value === 'departure'
          ? (record?.departureRemark ?? '')
          : action.value === 'signature'
            ? (record?.signatureRemark ?? '')
            : (record?.completionRemark ?? '')
    })
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    const waybillId = currentRow.value?.driverWaybillId
    if (!waybillId) return false

    const occurredAt = dayjs(form.data.occurredAt)
    if (!occurredAt.isValid()) {
      ElMessage.warning('业务时间格式无效，请重新选择')
      return false
    }
    const occurredAtIso = occurredAt.toISOString()

    if (action.value === 'completion') {
      const departureOdometer = Number(context.value?.record?.departureOdometerKm ?? 0)
      if (Number(form.data.odometerKm) < departureOdometer) {
        ElMessage.warning(`收车里程不能小于出车里程 ${departureOdometer} 公里`)
        return false
      }
      const signedAt = context.value?.record?.signedAt
      const { departureFuelLiters, refueledLiters, returnFuelLiters } = form.data
      if (
        [departureFuelLiters, refueledLiters, returnFuelLiters].some(
          (value) => value != null && (!Number.isFinite(value) || value < 0)
        )
      ) {
        ElMessage.warning('油量须为大于或等于零的有效升数')
        return false
      }
      if (
        departureFuelLiters != null &&
        refueledLiters != null &&
        returnFuelLiters != null &&
        returnFuelLiters > departureFuelLiters + refueledLiters
      ) {
        ElMessage.warning('回场余油不能大于出车余油与途中加油之和')
        return false
      }
      const emptyMileage = form.data.emptyMileageKm
      if (
        emptyMileage != null &&
        (!Number.isFinite(emptyMileage) ||
          emptyMileage < 0 ||
          emptyMileage > Number(form.data.odometerKm) - departureOdometer)
      ) {
        ElMessage.warning('空驶里程须在 0 与本次总里程之间')
        return false
      }
      if (signedAt && occurredAt.isBefore(dayjs(signedAt))) {
        ElMessage.warning('收车时间不能早于签收时间')
        return false
      }
    }

    try {
      if (action.value === 'departure') {
        await recordWaybillDeparture({
          waybillId,
          departureTime: occurredAtIso,
          odometerKm: Number(form.data.odometerKm),
          photoUrls: [...form.data.photoUrls],
          remark: normalizeNullableText(form.data.remark)
        })
      } else if (action.value === 'signature') {
        if (!receiptAllocations.value.length) {
          ElMessage.warning('没有可签收的原始运输单明细')
          return false
        }
        for (const item of receiptAllocations.value) {
          if (
            item.signedQuantity < 0 ||
            item.exceptionQuantity < 0 ||
            item.signedQuantity + item.exceptionQuantity <= 0 ||
            item.signedQuantity + item.exceptionQuantity > item.quantity + 0.000001
          ) {
            ElMessage.warning(`${item.orderNo} 的签收与异常件数超出配载货量`)
            return false
          }
          if (item.exceptionQuantity > 0 && !item.exceptionNote.trim()) {
            ElMessage.warning(`请填写 ${item.orderNo} 的异常说明`)
            return false
          }
        }
        await signExecutionAllocations({
          waybillId,
          signedAt: occurredAtIso,
          signerName: form.data.signerName.trim(),
          receiptUrls: [...form.data.receiptUrls],
          signatureUrls: [...form.data.signatureUrls],
          remark: normalizeNullableText(form.data.remark),
          allocations: receiptAllocations.value.map((item) => ({
            allocationId: item.allocationId,
            signedQuantity: item.signedQuantity,
            exceptionQuantity: item.exceptionQuantity,
            exceptionNote: normalizeNullableText(item.exceptionNote)
          }))
        })
      } else {
        await completeWaybillExecution({
          waybillId,
          returnTime: occurredAtIso,
          returnOdometerKm: Number(form.data.odometerKm),
          emptyMileageKm: form.data.emptyMileageKm ?? null,
          departureFuelLiters: form.data.departureFuelLiters ?? null,
          refueledLiters: form.data.refueledLiters ?? null,
          returnFuelLiters: form.data.returnFuelLiters ?? null,
          photoUrls: [...form.data.photoUrls],
          remark: normalizeNullableText(form.data.remark)
        })
      }
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '运输执行操作失败，请检查业务状态和网络后重试')
      return false
    }
  }

  async function resetForm(): Promise<void> {
    currentRow.value = undefined
    context.value = undefined
    receiptAllocations.value = []
    Object.assign(form.data, createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  async function handleOpen(data: OpenData): Promise<void> {
    await resetForm()
    currentRow.value = data.row
    action.value = data.action
    await dialogRef.value?.handleOpen(data, {
      title:
        data.action === 'signature' && data.row.driverWaybillSignedAt
          ? '复核签收'
          : actionMeta.value.title,
      subtitle: actionMeta.value.description,
      confirmText: action.value === 'completion' ? '确认回场并完成' : '确认提交',
      contentMaxHeight: '78vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await loadContext()
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm(),
      dialogProps: { appendToBody: true, closeOnClickModal: false }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .execution-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-width: 0;

    &__summary {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      padding: var(--art-space-4);

      small,
      strong,
      p {
        display: block;
      }

      small {
        font-size: 11px;
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.08em;
      }

      strong {
        margin-top: 3px;
        font-size: 17px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        color: var(--el-text-color-secondary);
      }
    }

    &__icon {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      font-size: 24px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-surface-radius);

      &.is-signature {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-completion {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
    }

    &__form {
      padding: var(--art-space-4);
    }

    &__sources {
      display: grid;
      gap: var(--art-space-3);
      padding: var(--art-space-4);
    }

    &__sources-heading,
    &__source-title {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: space-between;
    }

    &__sources-heading p {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__source {
      display: grid;
      gap: var(--art-space-3);
      padding: var(--art-space-3);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__source-title span,
    &__source-inputs label span {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__source-inputs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-3);

      label {
        display: grid;
        gap: var(--art-space-2);
        min-width: 0;
      }

      :deep(.el-input-number) {
        width: 100%;
      }
    }
  }

  @media (width <= 640px) {
    .execution-dialog__source-inputs {
      grid-template-columns: 1fr;
    }

    .execution-dialog__summary {
      grid-template-columns: 48px minmax(0, 1fr);

      :deep(.el-tag) {
        grid-column: 2;
        justify-self: start;
      }
    }
  }
</style>
