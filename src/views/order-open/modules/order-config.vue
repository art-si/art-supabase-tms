<template>
  <div class="order-config">
    <div class="order-config__intro">
      <div>
        <strong>运输配置</strong>
        <p>选择运输类型与计费口径，现场要求会随单传递给调度。</p>
      </div>
      <ElSegmented
        v-model="config.loadType"
        :options="loadTypeOptions"
        @change="handleLoadTypeChange"
      />
    </div>

    <ArtForm
      v-if="config.loadType === 'ftl'"
      ref="vehicleFormRef"
      v-model="config"
      :rules="vehicleRules"
      :validate-on-rule-change="false"
      label-position="top"
      custom-layout
      :show-reset="false"
      :show-submit="false"
      form-class="order-config__vehicle-form"
    >
      <ElFormItem prop="vehicleType" class="order-config__vehicle-validation">
        <div class="order-config__vehicle">
          <div class="order-config__section-heading">
            <div>
              <strong>选择车型</strong>
              <span>先选车型，再选该车型的车长；容积和载重会自动带出</span>
            </div>
            <ElButton v-if="vehicleError" link type="primary" @click="loadProfiles"
              >重试加载</ElButton
            >
          </div>
          <ArtAsyncState
            v-if="vehicleLoading"
            :loading="vehicleLoading"
            :min-height="160"
            size="compact"
          />
          <p v-else-if="vehicleError" class="order-config__hint is-error"
            >车型规格加载失败，请重试。</p
          >
          <template v-else-if="vehicleCategories.length">
            <div class="order-config__vehicle-grid" aria-label="车型">
              <button
                v-for="category in vehicleCategories"
                :key="category"
                type="button"
                class="order-config__vehicle-card"
                :class="{ 'is-selected': selectedVehicleCategory === category }"
                :aria-pressed="selectedVehicleCategory === category"
                @click="selectVehicleCategory(category)"
              >
                <VehicleTypeArt :category="category" />
                <strong>{{ category }}</strong>
              </button>
            </div>
            <div class="order-config__lengths">
              <div class="order-config__length-heading">
                <strong>车长</strong>
                <span>{{ selectedVehicleCategory }}可选规格</span>
              </div>
              <div class="order-config__length-options" aria-label="车长规格">
                <button
                  v-for="profile in selectedVehicleProfiles"
                  :key="profile.id"
                  type="button"
                  class="order-config__length-option"
                  :class="{ 'is-selected': isSelectedVehicle(profile) }"
                  :aria-pressed="isSelectedVehicle(profile)"
                  :title="profileDetails(profile)"
                  @click="selectVehicle(profile)"
                >
                  <span>{{ profileOptionLabel(profile) }}</span>
                </button>
              </div>
            </div>
          </template>
          <ArtEmptyState
            v-else
            title="暂无已启用的车型规格"
            description="请先在车辆档案维护车型。"
            size="compact"
            :visual-size="72"
          />
          <div v-if="config.vehicleType" class="order-config__metrics">
            <span>已选 {{ config.vehicleType }}</span>
            <span
              >车长 <strong>{{ metricText(config.vehicleLengthM, '米') }}</strong></span
            >
            <span
              >容积 <strong>{{ metricText(config.vehicleVolumeM3, '立方米') }}</strong></span
            >
            <span
              >载重 <strong>{{ metricText(config.vehicleLoadTons, '吨') }}</strong></span
            >
          </div>
        </div>
      </ElFormItem>
    </ArtForm>

    <ArtForm
      ref="settingsFormRef"
      v-model="config"
      :items="settingItems"
      :rules="settingRules"
      :span="6"
      :gutter="16"
      label-position="top"
      root-class="order-config__settings-form p-0!"
      :show-reset="false"
      :show-submit="false"
      :validate-on-rule-change="false"
    >
      <template #tempMinC>
        <div class="order-config__temperature">
          <ElInputNumber
            v-model="config.tempMinC"
            :controls="false"
            :min="-80"
            :max="80"
            placeholder="最低温"
            @change="validateTemperature"
          />
          <span>至</span>
          <ElInputNumber
            v-model="config.tempMaxC"
            :controls="false"
            :min="-80"
            :max="80"
            placeholder="最高温"
            @change="validateTemperature"
          />
        </div>
      </template>
    </ArtForm>

    <div class="order-config__bottom">
      <div class="order-config__remark">
        <label for="order-config-remark">备注</label>
        <ElInput
          id="order-config-remark"
          v-model="config.remark"
          type="textarea"
          :rows="4"
          maxlength="200"
          show-word-limit
          placeholder="补充包装、交接或特殊运输说明"
        />
      </div>
      <div class="order-config__attachments">
        <div class="order-config__section-heading">
          <div>
            <strong>业务附件</strong>
            <span>支持图片、文档及压缩包，最多 6 个，单个不超过 2 MB</span>
          </div>
        </div>
        <ArtUploadFile
          ref="attachmentUploadRef"
          v-model="config.attachmentUrls"
          title="上传附件"
          multiple
          :limit="6"
          :file-size="2 * 1024 * 1024"
          :resource-tenant-id="resourceTenantId"
          accept=".jpg,.jpeg,.png,.gif,.bmp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
          :readonly="!canEditAttachments"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { ElMessage, type FormRules } from 'element-plus'
  import { uniqBy } from 'lodash-es'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import { fetchTmsVehicleTypeProfiles, type TmsVehicleTypeProfile } from '@tms/api'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import VehicleTypeArt from '@/components/business/vehicle-type-profile-picker/vehicle-type-art.vue'

  const config = defineModel<Api.Tms.Order.OrderConfig>({ required: true })
  defineProps<{ canEditAttachments: boolean; resourceTenantId: string }>()
  const vehicleFormRef = ref<InstanceType<typeof ArtForm>>()
  const settingsFormRef = ref<InstanceType<typeof ArtForm>>()
  const attachmentUploadRef = ref<{ hasPendingUpload: () => boolean }>()
  const vehicleProfiles = ref<TmsVehicleTypeProfile[]>([])
  const vehicleLoading = ref(false)
  const vehicleError = ref(false)
  const selectedVehicleCategory = ref(config.value.vehicleType)
  const vehicleCategories = computed(() =>
    uniqBy(vehicleProfiles.value, 'category').map((profile) => profile.category)
  )
  const selectedVehicleProfiles = computed(() =>
    uniqBy(
      vehicleProfiles.value.filter((profile) => profile.category === selectedVehicleCategory.value),
      (profile) => `${profile.lengthM}:${profile.volumeM3}:${profile.loadTons}`
    )
  )
  const loadTypeOptions = useDictionaryOptions('tmsOrderLoadType')
  const billingModeOptions = useDictionaryOptions('tmsOrderBillingMode')
  const cargoCategoryOptions = useDictionaryOptions('tmsOrderCargoCategory')
  const packagingOptions = useDictionaryOptions('tmsOrderPackaging')
  const transportRequirementOptions = useDictionaryOptions('tmsOrderTransportRequirement')
  const trackingMethodOptions = useDictionaryOptions('tmsOrderTrackingMethod')
  const booleanOptions = useDictionaryOptions<boolean>('commonBoolean', (value) => value === 'true')
  const cargoUnitOptions = useDictionaryOptions('tmsCargoUnit')
  const billingUnitOptions = computed(() =>
    cargoUnitOptions.filter((item) => {
      if (config.value.billingMode === 'weight') return ['kg', 'ton'].includes(item.value)
      if (config.value.billingMode === 'volume')
        return ['cubic_meter', 'liter'].includes(item.value)
      return (
        config.value.billingMode === 'quantity' &&
        !['kg', 'ton', 'cubic_meter', 'liter'].includes(item.value)
      )
    })
  )
  const vehicleRules = computed<FormRules<Api.Tms.Order.OrderConfig>>(() => ({
    vehicleType: [
      {
        required: true,
        message: selectedVehicleCategory.value ? '请选择车长规格' : '请选择车型和车长规格',
        trigger: 'change'
      }
    ]
  }))
  const settingRules = computed<FormRules<Api.Tms.Order.OrderConfig>>(() => ({
    truckCount:
      config.value.loadType === 'ftl'
        ? [{ required: true, message: '请选择整车数量', trigger: 'change' }]
        : [],
    billingMode: [{ required: true, message: '请选择计费模式', trigger: 'change' }],
    billingUnit: [],
    cargoCategory: [{ required: true, message: '请选择货物分类', trigger: 'change' }],
    packaging: [{ required: true, message: '请选择包装方式', trigger: 'change' }],
    trackingNumber: config.value.trackingMethod
      ? [{ required: true, message: '请填写跟踪编号', trigger: 'blur' }]
      : [],
    tempMinC:
      config.value.cargoCategory === 'temperature'
        ? [
            {
              validator: (_rule, _value, callback) => {
                const { tempMinC, tempMaxC } = config.value
                callback(
                  tempMinC == null || tempMaxC == null || tempMinC > tempMaxC
                    ? new Error('请填写有效的最低与最高温度')
                    : undefined
                )
              },
              trigger: 'change'
            }
          ]
        : []
  }))
  const settingItems = computed<FormItem[]>(() => [
    ...(config.value.loadType === 'ftl'
      ? [
          {
            key: 'truckCount',
            label: '整车数量',
            type: 'select' as const,
            placeholder: '请选择整车数量',
            options: Array.from({ length: 10 }, (_, index) => ({
              label: `${index + 1} 车`,
              value: index + 1
            }))
          }
        ]
      : []),
    {
      key: 'billingMode',
      label: '计费模式',
      type: 'select',
      placeholder: '请选择计费模式',
      options: billingModeOptions,
      props: { onChange: () => (config.value.billingUnit = '') }
    },
    {
      key: 'billingUnit',
      label: '计费单位',
      type: 'select',
      placeholder: '选择与计费模式对应的单位',
      options: billingUnitOptions.value,
      props: { disabled: !config.value.billingMode, filterable: true }
    },
    {
      key: 'cargoCategory',
      label: '货物分类',
      type: 'select',
      placeholder: '请选择货物分类',
      options: cargoCategoryOptions,
      props: { onChange: handleCategoryChange }
    },
    ...(config.value.cargoCategory === 'temperature'
      ? [
          {
            key: 'tempMinC',
            label: '温度阈值（℃）',
            type: 'input' as const
          }
        ]
      : []),
    {
      key: 'packaging',
      label: '包装方式',
      type: 'select',
      placeholder: '请选择包装方式',
      options: packagingOptions
    },
    {
      key: 'selfPickup',
      label: '是否自提',
      type: 'radioGroup',
      options: booleanOptions,
      props: { optionType: 'button' }
    },
    {
      key: 'insured',
      label: '是否保价',
      type: 'radioGroup',
      options: booleanOptions.map((item) => ({
        label: item.value ? '保价' : '不保价',
        value: item.value
      })),
      props: { optionType: 'button' }
    },
    {
      key: 'allowConsolidation',
      label: '允许与其他客户单合车',
      type: 'radioGroup',
      options: booleanOptions.map((item) => ({
        label: item.value ? '允许合单' : '单独运输',
        value: item.value
      })),
      props: { optionType: 'button' },
      description: '客户明确允许后，调度才能与线路和货物条件相容的订单合车。'
    },
    {
      key: 'transportRequirements',
      label: '运输要求',
      type: 'checkboxGroup',
      span: config.value.trackingMethod ? 12 : 18,
      options: transportRequirementOptions
    },
    {
      key: 'trackingMethod',
      label: '跟踪方式',
      type: 'select',
      placeholder: '请选择跟踪方式',
      options: trackingMethodOptions,
      props: { clearable: true, onChange: () => (config.value.trackingNumber = '') }
    },
    ...(config.value.trackingMethod
      ? [
          {
            key: 'trackingNumber',
            label:
              config.value.trackingMethod === 'electronic_receipt' ? '电子回单编号' : '快递单号',
            type: 'input' as const,
            placeholder:
              config.value.trackingMethod === 'electronic_receipt'
                ? '请输入电子回单编号'
                : '请输入快递单号',
            props: { maxlength: 80 }
          }
        ]
      : [])
  ])

  async function loadProfiles(): Promise<void> {
    if (vehicleLoading.value) return
    vehicleLoading.value = true
    vehicleError.value = false
    try {
      const result = await fetchTmsVehicleTypeProfiles()
      if (result.error) throw result.error
      vehicleProfiles.value = (result.data ?? []).sort((a, b) => a.sort - b.sort)
    } catch {
      vehicleError.value = true
    } finally {
      vehicleLoading.value = false
    }
  }

  function selectVehicle(profile: TmsVehicleTypeProfile): void {
    Object.assign(config.value, {
      vehicleType: profile.category,
      vehicleLengthM: profile.lengthM,
      vehicleVolumeM3: profile.volumeM3,
      vehicleLoadTons: profile.loadTons
    })
    vehicleFormRef.value?.clearValidate('vehicleType')
  }

  function selectVehicleCategory(category: string): void {
    if (selectedVehicleCategory.value === category) return
    selectedVehicleCategory.value = category
    Object.assign(config.value, {
      vehicleType: '',
      vehicleLengthM: null,
      vehicleVolumeM3: null,
      vehicleLoadTons: null
    })
    vehicleFormRef.value?.clearValidate('vehicleType')
  }

  function isSelectedVehicle(profile: TmsVehicleTypeProfile): boolean {
    return (
      config.value.vehicleType === profile.category &&
      config.value.vehicleLengthM === profile.lengthM &&
      config.value.vehicleVolumeM3 === profile.volumeM3 &&
      config.value.vehicleLoadTons === profile.loadTons
    )
  }

  function profileLengthLabel(profile: TmsVehicleTypeProfile): string {
    if (profile.lengthM != null) return `${profile.lengthM} 米`
    return profile.loadTons != null ? `按载重 ${profile.loadTons} 吨` : '其他规格'
  }

  function profileOptionLabel(profile: TmsVehicleTypeProfile): string {
    const length = profileLengthLabel(profile)
    return hasDuplicateLength(profile)
      ? `${length} · ${metricText(profile.loadTons, '吨')} / ${metricText(profile.volumeM3, '方')}`
      : length
  }

  function profileDetails(profile: TmsVehicleTypeProfile): string {
    return `容积 ${metricText(profile.volumeM3, '方')} · 载重 ${metricText(profile.loadTons, '吨')}`
  }

  function hasDuplicateLength(profile: TmsVehicleTypeProfile): boolean {
    return selectedVehicleProfiles.value.some(
      (candidate) => candidate.id !== profile.id && candidate.lengthM === profile.lengthM
    )
  }

  watch(vehicleCategories, (categories) => {
    if (!categories.length) return
    if (!selectedVehicleCategory.value || !categories.includes(selectedVehicleCategory.value)) {
      selectedVehicleCategory.value = categories[0] ?? ''
    }
  })

  watch(
    () => config.value.vehicleType,
    (category) => {
      if (category) selectedVehicleCategory.value = category
    }
  )

  watch(
    () => config.value.loadType,
    (loadType) => {
      if (loadType === 'ftl' && !vehicleProfiles.value.length) void loadProfiles()
    },
    { immediate: true }
  )

  function handleLoadTypeChange(): void {
    if (config.value.loadType === 'ftl') {
      if (!vehicleProfiles.value.length) void loadProfiles()
      else selectedVehicleCategory.value = vehicleCategories.value[0] ?? ''
      return
    }
    Object.assign(config.value, {
      vehicleType: '',
      vehicleLengthM: null,
      vehicleVolumeM3: null,
      vehicleLoadTons: null,
      truckCount: null
    })
    selectedVehicleCategory.value = ''
  }

  function handleCategoryChange(): void {
    if (config.value.cargoCategory !== 'temperature') {
      config.value.tempMinC = null
      config.value.tempMaxC = null
    }
  }

  function validateTemperature(): void {
    void Promise.resolve(settingsFormRef.value?.validateField('tempMinC')).catch(() => undefined)
  }

  function metricText(value: number | null | undefined, unit: string): string {
    return value == null ? '待选择' : `${value} ${unit}`
  }

  async function validate(): Promise<boolean> {
    if (attachmentUploadRef.value?.hasPendingUpload()) {
      ElMessage.warning('请等待附件上传完成后再继续')
      return false
    }
    let valid = true
    if (config.value.loadType === 'ftl') {
      try {
        await vehicleFormRef.value?.validate()
      } catch {
        valid = false
      }
    }
    try {
      await settingsFormRef.value?.validate()
    } catch {
      valid = false
    }
    return valid
  }

  defineExpose({ validate })
</script>

<style scoped lang="scss">
  .order-config {
    display: grid;
    gap: var(--art-space-5);
    min-width: 0;

    &__intro,
    &__section-heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-3);
      align-items: center;
      justify-content: space-between;
    }

    &__intro strong {
      font-size: var(--art-font-size-section-title);
      color: var(--el-text-color-primary);
    }

    &__intro p,
    &__section-heading span {
      margin: 4px 0 0;
      font-size: var(--art-font-size-caption);
      color: var(--el-text-color-secondary);
    }

    &__section-heading strong,
    &__section-heading span {
      display: block;
    }

    &__section-heading strong {
      color: var(--el-text-color-primary);
    }

    &__vehicle-validation {
      margin-bottom: 0;
    }

    &__vehicle-validation :deep(.el-form-item__content) {
      display: block;
      width: 100%;
    }

    &__vehicle {
      display: grid;
      gap: var(--art-space-3);
      width: 100%;
      min-width: 0;
    }

    &__vehicle-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: var(--art-space-2);
      max-width: 1220px;
    }

    &__vehicle-card {
      display: grid;
      gap: 0;
      justify-items: center;
      min-width: 0;
      min-height: 100px;
      padding: var(--art-space-2) var(--art-space-1);
      color: var(--el-text-color-regular);
      cursor: pointer;
      background: var(--default-box-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);
      transition:
        background-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        border-color var(--art-motion-duration-fast) var(--art-motion-ease-out);
    }

    &__vehicle-card:hover,
    &__vehicle-card.is-selected {
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-color: var(--theme-color);
    }

    &__vehicle-card:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }

    &__vehicle-card strong {
      font-size: 13px;
      color: var(--el-text-color-primary);
    }

    &__vehicle-card :deep(.vehicle-type-art) {
      width: 116px;
      height: 58px;
    }

    &__lengths {
      display: grid;
      gap: var(--art-space-2);
      padding-top: var(--art-space-2);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__length-heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: baseline;
    }

    &__length-heading strong {
      color: var(--el-text-color-primary);
    }

    &__length-heading span {
      font-size: var(--art-font-size-caption);
      color: var(--el-text-color-secondary);
    }

    &__length-options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
    }

    &__length-option {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 58px;
      height: 32px;
      padding: 0 10px;
      font-size: 12px;
      line-height: 1;
      color: var(--el-text-color-regular);
      cursor: pointer;
      background: var(--default-box-color);
      border: 1px solid var(--el-border-color);
      border-radius: var(--art-control-radius);
      transition:
        background-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        border-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        color var(--art-motion-duration-fast) var(--art-motion-ease-out);
    }

    &__length-option:hover {
      color: var(--theme-color);
      border-color: var(--theme-color);
    }

    &__length-option.is-selected {
      font-weight: 600;
      color: var(--el-color-white);
      background: var(--theme-color);
      border-color: var(--theme-color);
    }

    &__length-option:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }

    &__length-option span {
      white-space: nowrap;
    }

    &__metrics {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2) var(--art-space-5);
      padding-top: var(--art-space-2);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__metrics span {
      color: var(--el-text-color-secondary);
    }

    &__metrics span:first-child {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    &__metrics strong {
      margin-left: 4px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-primary);
    }

    :deep(.order-config__settings-form .el-col) {
      min-width: 0;
    }

    :deep(.order-config__settings-form .el-form-item) {
      margin-bottom: var(--art-space-4);
    }

    :deep(.order-config__settings-form .el-form-item__content) {
      min-width: 0;
    }

    &__temperature {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      width: 100%;
    }

    &__temperature :deep(.el-input-number) {
      flex: 1;
      min-width: 0;
    }

    &__bottom {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--art-space-5);
      padding-top: var(--art-space-4);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__remark,
    &__attachments {
      min-width: 0;
    }

    &__remark label {
      display: block;
      margin-bottom: var(--art-space-2);
      color: var(--el-text-color-regular);
    }

    &__attachments {
      display: grid;
      gap: var(--art-space-2);
      align-content: start;
    }

    &__hint {
      margin: 0;
      color: var(--el-text-color-secondary);
    }

    &__hint.is-error {
      color: var(--el-color-danger);
    }

    :deep(.el-input-number) {
      width: 100%;
    }
  }

  @media (width <= 1200px) {
    .order-config__vehicle-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @media (width <= 900px) {
    .order-config__vehicle-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .order-config__bottom {
      grid-template-columns: 1fr;
    }
  }

  @media (width <= 640px) {
    .order-config__vehicle-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
