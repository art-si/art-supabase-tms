<template>
  <ArtDialog ref="dialogRef" size="lg" @close="closeRecognition">
    <div class="address-recognition">
      <div class="address-recognition__heading">
        <span class="address-recognition__icon"><ArtSvgIcon icon="ri:magic-line" /></span>
        <div
          ><strong>智能填写地址</strong
          ><small>粘贴或说出联系人、电话、地址和单位，识别后可逐项核对。</small></div
        >
      </div>
      <div class="address-recognition__composer">
        <ElInput
          v-model="recognitionText"
          class="address-recognition__input"
          type="textarea"
          :rows="5"
          resize="none"
          maxlength="500"
          :placeholder="'粘贴地址文本，或点击右下角麦克风说出地址…\n例如：张三，13800138000，北京市朝阳区酒仙桥路14号院5号，某某物流有限公司'"
          aria-label="待识别的地址信息"
          @paste="handlePaste"
        />
        <div class="address-recognition__toolbar">
          <span role="status">{{ recognitionHint }}</span>
          <div class="address-recognition__tools">
            <ArtTooltip
              v-if="isSupported"
              :content="isListening ? '结束录音并识别' : '语音输入'"
              placement="top"
            >
              <ArtIconButton
                :icon="isListening ? 'ri:stop-circle-line' : 'ri:mic-line'"
                :tone="isListening ? 'danger' : 'theme'"
                :label="isListening ? '结束录音并识别' : '语音输入'"
                @click="toggleSpeech"
              />
            </ArtTooltip>
            <ArtTooltip content="识别信息" placement="top">
              <ArtIconButton
                :icon="recognizing ? 'ri:loader-4-line' : 'ri:sparkling-2-line'"
                variant="solid"
                :loading="recognizing"
                label="识别信息"
                @click="recognizeInput"
              />
            </ArtTooltip>
          </div>
        </div>
      </div>
    </div>
    <ArtForm
      ref="formRef"
      :model-value="form"
      @update:model-value="replaceReactiveModel(form, $event)"
      :items="formItems"
      :rules="formRules"
      :span="8"
      :gutter="20"
      label-width="100px"
      :show-reset="false"
      :show-submit="false"
    >
      <template #addressPicker>
        <ArtAddressPicker
          v-if="canViewAddressField('addressDetail')"
          v-model:region-path="form.regionPath"
          v-model:address-detail="form.addressDetail"
          v-model:region-adcode="form.regionAdcode"
          v-model:longitude="form.longitude"
          v-model:latitude="form.latitude"
          v-model:coordinate-system="form.coordinateSystem"
          v-model:coordinate-source="form.coordinateSource"
          v-model:coordinate-status="form.coordinateStatus"
          v-model:geocode-provider="form.geocodeProvider"
          v-model:geocoded-at="form.geocodedAt"
          :region-api="fetchRegionOptions"
          :disabled="!canEditAddressField('addressDetail')"
          region-label="省市区"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableNumber, normalizeNullableText } from '@/utils/form/normalize'
  import { normalizeCoordinatePair } from '@/utils/geo'

  import type { FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import { useSpeechRecognition } from '@vueuse/core'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTooltip from '@/components/core/feedback/art-tooltip/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { fetchRegionOptions } from '@/api/region-options'
  import { addCustomerAddress, editCustomerAddress } from '@tms/api'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { canEditField, canViewField } from '@/utils/field-permission'
  import { recognizeAddressText } from './recognize-address'
  import { addressTypeOptions } from '../address-type'

  defineOptions({ name: 'TmsCustomerAddressDialog' })

  type CustomerAddress = Api.Tms.BasicData.CustomerAddress
  type CustomerAddressForm = CustomerAddress & {
    addressPicker?: undefined
    regionPath: string[]
    businessHours: string[]
  }

  interface CustomerContext {
    customerId?: string
    customerName?: string
  }

  interface DialogFormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{
    (event: 'success', type: 'add' | 'edit'): void
  }>()

  const { tenantOptions } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId, shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<CustomerAddress | undefined>>()
  const formRef = ref<DialogFormExpose>()
  const customerContext = reactive<CustomerContext>({})
  const recognitionText = ref('')
  const recognitionActive = ref(false)
  const recognizing = ref(false)
  const recognitionHint = ref('识别结果只填入表单，保存前请核对。')
  const {
    isSupported,
    isListening,
    result: spokenText,
    start,
    stop
  } = useSpeechRecognition({
    lang: 'zh-CN',
    continuous: false
  })

  const createInitialForm = (): CustomerAddressForm => ({
    id: undefined,
    tenantId: defaultWriteTenantId.value || undefined,
    customerId: null,
    addressType: 'shipping',
    partyName: '',
    addressShortName: '',
    businessHoursStart: null,
    businessHoursEnd: null,
    businessHours: [],
    contactName: '',
    contactPhone: '',
    region: '',
    regionAdcode: '',
    regionPath: [],
    addressDetail: '',
    longitude: null,
    latitude: null,
    coordinateSystem: 'gcj02',
    coordinateSource: '',
    coordinateStatus: 'pending',
    geocodeProvider: '',
    geocodedAt: '',
    postalCode: '',
    isDefault: false,
    remark: '',
    fieldAccess: {
      contactPhone: 'edit',
      addressDetail: 'edit'
    },
    isRecordOwner: true
  })

  const form = reactive<CustomerAddressForm>(createInitialForm())

  const canViewAddressField = (field: Api.Tms.BasicData.CustomerAddressFieldKey): boolean =>
    canViewField(form.fieldAccess, field)

  const canEditAddressField = (field: Api.Tms.BasicData.CustomerAddressFieldKey): boolean =>
    canEditField(form.fieldAccess, field)

  const formRules = computed<FormRules<CustomerAddressForm>>(() => ({
    tenantId: shouldExposeTenantField.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    addressType: [{ required: true, message: '请选择地址类型', trigger: 'change' }],
    contactName: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
    contactPhone: [
      {
        validator: (_rule, value, callback) => {
          if (!canEditAddressField('contactPhone')) return callback()
          if (!value) return callback(new Error('请输入联系电话'))
          return /^(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(String(value))
            ? callback()
            : callback(new Error('请输入正确的手机号或座机号'))
        },
        trigger: 'blur'
      }
    ],
    regionPath: [
      {
        validator: (_rule, value, callback) =>
          !canEditAddressField('addressDetail') || (Array.isArray(value) && value.length)
            ? callback()
            : callback(new Error('请选择区域')),
        trigger: 'change'
      }
    ],
    addressDetail: [
      {
        validator: (_rule, value, callback) =>
          !canEditAddressField('addressDetail') || value
            ? callback()
            : callback(new Error('请输入详细地址')),
        trigger: 'blur'
      }
    ],
    addressShortName: canEditAddressField('addressDetail')
      ? [
          { required: true, message: '请输入地址简称', trigger: 'blur' },
          { max: 20, message: '地址简称最多 20 个字符', trigger: 'blur' }
        ]
      : [],
    postalCode: [{ pattern: /^\d{6}$/, message: '邮编应为 6 位数字', trigger: 'blur' }],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }))

  const formItems = computed<FormItem[]>(() => [
    { label: '基础信息', key: 'baseSection', type: 'divider', span: 24 },
    ...(shouldExposeTenantField.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select' as const,
            props: {
              options: tenantOptions.value.map((tenant) => ({
                label: tenant.tenantName || tenant.tenantCode,
                value: tenant.id
              })),
              filterable: true,
              disabled: Boolean(form.id),
              placeholder: '请选择地址所属租户'
            }
          }
        ]
      : []),
    {
      label: '地址类型',
      key: 'addressType',
      type: 'select',
      props: {
        options: addressTypeOptions,
        placeholder: '请选择地址类型'
      }
    },
    {
      label: '收/发货方',
      key: 'partyName',
      type: 'input',
      span: 16,
      props: { maxlength: 100, placeholder: '选填，填写单位或收发货方名称' }
    },
    {
      label: '联系人',
      key: 'contactName',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入联系人' }
    },
    {
      label: '联系电话',
      key: 'contactPhone',
      type: 'input',
      hidden: !canViewAddressField('contactPhone'),
      props: {
        maxlength: 20,
        placeholder: '请输入联系电话',
        disabled: !canEditAddressField('contactPhone')
      }
    },
    {
      label: '邮编',
      key: 'postalCode',
      type: 'input',
      hidden: !canViewAddressField('addressDetail'),
      props: {
        maxlength: 6,
        placeholder: '请输入邮编',
        disabled: !canEditAddressField('addressDetail')
      }
    },
    {
      label: '',
      key: 'addressPicker',
      type: 'input',
      span: 24,
      labelWidth: 0,
      hidden: !canViewAddressField('addressDetail')
    },
    {
      label: '地址简称',
      key: 'addressShortName',
      type: 'input',
      span: 8,
      hidden: !canViewAddressField('addressDetail'),
      props: {
        maxlength: 20,
        showWordLimit: true,
        placeholder: '如：酒仙桥仓库',
        disabled: !canEditAddressField('addressDetail')
      }
    },
    {
      label: '营业时间',
      key: 'businessHours',
      type: 'timePicker',
      span: 16,
      props: {
        isRange: true,
        format: 'HH:mm',
        valueFormat: 'HH:mm',
        startPlaceholder: '开始时间',
        endPlaceholder: '结束时间',
        rangeSeparator: '至',
        clearable: true,
        class: '!w-full'
      }
    },
    {
      label: '默认地址',
      key: 'isDefault',
      type: 'switch',
      props: { activeText: '是', inactiveText: '否', inlinePrompt: true }
    },
    {
      label: '备注信息',
      key: 'remark',
      type: 'input',
      span: 16,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '请输入备注信息'
      }
    }
  ])

  const replaceForm = (nextForm: CustomerAddressForm): void => {
    Object.assign(form, createInitialForm(), nextForm)
  }

  const recognizeInput = async (): Promise<void> => {
    if (!recognitionText.value.trim()) {
      ElMessage.warning('请先粘贴或说出地址信息')
      return
    }
    recognizing.value = true
    try {
      const regions = await fetchRegionOptions()
      const recognized = recognizeAddressText(recognitionText.value, regions)
      const fields = Object.entries(recognized).filter(([, value]) => Boolean(value))
      if (!fields.length) {
        recognitionHint.value = '未识别到有效信息，请检查文本后重试。'
        return
      }
      Object.assign(form, recognized)
      if (recognized.regionPath) form.region = recognized.regionPath.join('/')
      recognitionHint.value = `已识别 ${fields.length} 项，请核对后保存。`
      ElMessage.success('识别结果已填入表单')
    } catch {
      recognitionHint.value = '行政区划加载失败，请手动填写或稍后重试。'
      ElMessage.error(recognitionHint.value)
    } finally {
      recognizing.value = false
    }
  }

  const handlePaste = (): void => {
    void nextTick().then(recognizeInput)
  }
  const toggleSpeech = (): void => {
    if (isListening.value) {
      stop()
    } else {
      start()
      recognitionHint.value = '正在聆听，结束后会自动识别。'
    }
  }
  const closeRecognition = (): void => {
    recognitionActive.value = false
    if (isListening.value) stop()
  }
  watch(isListening, (listening, previous) => {
    if (!listening && previous && recognitionActive.value && spokenText.value) {
      recognitionText.value = spokenText.value
      void recognizeInput()
    }
  })

  const buildSubmitPayload = (data: CustomerAddressForm): CustomerAddress => {
    const { regionPath, businessHours, ...rawRest } = data
    const rest: Partial<CustomerAddressForm> = rawRest
    delete rest.addressPicker
    delete rest.customer
    delete rest.createBy
    delete rest.createTime
    delete rest.updateBy
    delete rest.updateTime

    if (data.id && !canEditField(data.fieldAccess, 'contactPhone')) delete rest.contactPhone
    if (data.id && !canEditField(data.fieldAccess, 'addressDetail')) {
      delete rest.region
      delete rest.regionAdcode
      delete rest.addressDetail
      delete rest.longitude
      delete rest.latitude
      delete rest.coordinateSystem
      delete rest.coordinateSource
      delete rest.coordinateStatus
      delete rest.geocodeProvider
      delete rest.geocodedAt
      delete rest.postalCode
      delete rest.addressShortName
    }

    const longitude = normalizeNullableNumber(rest.longitude)
    const latitude = normalizeNullableNumber(rest.latitude)
    const hasCoordinate = normalizeCoordinatePair(longitude, latitude) !== null

    const payload: Partial<CustomerAddress> = {
      ...rest,
      customerId: normalizeNullableText(rest.customerId),
      partyName: normalizeNullableText(rest.partyName),
      addressShortName: normalizeNullableText(rest.addressShortName),
      businessHoursStart: businessHours?.[0] || null,
      businessHoursEnd: businessHours?.[1] || null,
      ...(rest.region === undefined ? {} : { region: regionPath.join('/') }),
      regionAdcode: normalizeNullableText(rest.regionAdcode),
      longitude,
      latitude,
      coordinateSystem: hasCoordinate
        ? rest.coordinateSystem || 'gcj02'
        : normalizeNullableText(rest.coordinateSystem),
      coordinateSource: normalizeNullableText(rest.coordinateSource),
      coordinateStatus:
        !hasCoordinate && rest.coordinateStatus === 'located'
          ? 'unconfirmed'
          : hasCoordinate && (!rest.coordinateStatus || rest.coordinateStatus === 'pending')
            ? 'located'
            : rest.coordinateStatus || 'pending',
      geocodeProvider: normalizeNullableText(rest.geocodeProvider),
      geocodedAt: normalizeNullableText(rest.geocodedAt)
    }

    if (data.id && !canEditField(data.fieldAccess, 'addressDetail')) {
      delete payload.region
      delete payload.regionAdcode
      delete payload.addressDetail
      delete payload.longitude
      delete payload.latitude
      delete payload.coordinateSystem
      delete payload.coordinateSource
      delete payload.coordinateStatus
      delete payload.geocodeProvider
      delete payload.geocodedAt
      delete payload.postalCode
      delete payload.addressShortName
    }
    return payload as CustomerAddress
  }

  const resetForm = async (): Promise<void> => {
    replaceForm({
      ...createInitialForm(),
      customerId: customerContext.customerId ?? null
    })
    recognitionText.value = ''
    recognitionHint.value = '识别结果只填入表单，保存前请核对。'
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildSubmitPayload(structuredClone(toRaw(form)))
      const type = form.id ? 'edit' : 'add'
      if (type === 'edit') await editCustomerAddress(payload)
      else await addCustomerAddress(payload)
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '客户地址保存失败，请检查地址和网络后重试')
      return false
    }
  }

  const handleOpen = async (
    row?: CustomerAddress,
    context: CustomerContext = {}
  ): Promise<void> => {
    recognitionActive.value = true
    Object.assign(customerContext, context)
    await resetForm()
    const isEdit = Boolean(row?.id)
    if (row) {
      replaceForm({
        ...createInitialForm(),
        ...structuredClone(toRaw(row)),
        customerId: row.customerId ?? null,
        businessHours: [row.businessHoursStart, row.businessHoursEnd]
          .filter(Boolean)
          .map((time) => String(time).slice(0, 5)),
        regionPath: row.region?.split('/').filter(Boolean) ?? []
      })
    }

    await dialogRef.value?.handleOpen(row, {
      title: isEdit ? '编辑常用地址' : '新增常用地址',
      subtitle: customerContext.customerName
        ? `当前客户：${customerContext.customerName}`
        : '维护常用发货与收货地址',
      contentMaxHeight: '64vh',
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({
    handleOpen,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .address-recognition {
    display: grid;
    gap: 14px;
    padding: 16px 18px 18px;
    margin-bottom: 20px;
    background: color-mix(in srgb, var(--el-color-primary) 8%, var(--el-bg-color-overlay));
    border: 1px solid color-mix(in srgb, var(--el-color-primary) 24%, var(--el-border-color));
    border-radius: var(--el-border-radius-base);

    &__heading {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      small {
        line-height: 1.45;
        color: var(--el-text-color-secondary);
      }
    }

    &__icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--el-color-primary);
      background: var(--el-bg-color-overlay);
      border-radius: var(--art-surface-radius);
    }

    &__composer {
      position: relative;
      min-width: 0;
    }

    &__input {
      width: 100%;

      :deep(.el-textarea__inner) {
        min-height: 148px;
        padding: 12px 13px 52px;
        line-height: 1.65;
        border-radius: var(--art-surface-radius);
      }
    }

    &__toolbar {
      position: absolute;
      right: 10px;
      bottom: 9px;
      left: 13px;
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      pointer-events: none;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        line-height: 1.4;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__tools {
      display: flex;
      flex: none;
      gap: 6px;
      padding: 2px;
      pointer-events: auto;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 999px;
      box-shadow: var(--el-box-shadow-light);

      :deep(.el-button) {
        width: 32px;
        height: 32px;
        padding: 0;
        margin: 0;
      }
    }

    @media (width <= 640px) {
      padding: 14px;

      &__input :deep(.el-textarea__inner) {
        min-height: 164px;
      }

      &__toolbar > span {
        max-width: calc(100% - 90px);
      }
    }
  }
</style>
