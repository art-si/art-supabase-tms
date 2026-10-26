<template>
  <ArtDialog
    ref="dialogRef"
    size="xl"
    show-fullscreen-button
    :aria-label="form.id ? '编辑司机' : '新增司机'"
  >
    <div class="driver-dialog__summary">
      <span class="driver-dialog__avatar"><ArtSvgIcon icon="ri:steering-2-line" /></span>
      <div>
        <strong>{{ form.driverName || '新司机' }}</strong>
        <p
          >{{ form.phone || '待填写手机号码' }} ·
          {{ form.driverOwnership === 'carrier' ? '承运商司机' : '司机档案' }}</p
        >
      </div>
    </div>
    <ElTabs v-model="activeTab" class="driver-dialog__tabs">
      <ElTabPane v-for="tab in tabs" :key="tab.key" :name="tab.key" :label="tab.label" />
    </ElTabs>
    <section v-if="activeTab === 'certificates'" class="driver-dialog__records">
      <div class="driver-dialog__record-heading">
        <div><strong>司机证件</strong><p>与车辆证件共用到期预警和责任人处置。</p></div>
        <ElButton
          v-if="form.id && canManageCertificates"
          type="primary"
          @click="openCertificateCenter"
          >管理证件</ElButton
        >
      </div>
      <div v-if="certificateError" class="driver-dialog__record-error">
        <span>证件记录加载失败，请重试。</span>
        <ElButton link type="primary" @click="loadCertificates">重新加载</ElButton>
      </div>
      <ArtTable
        v-else-if="form.id && canViewCertificates"
        :data="certificateRows"
        :columns="certificateColumns"
        :loading="certificateLoading"
        :pagination="false"
        empty-text="暂无司机证件"
      />
      <p v-else class="driver-dialog__record-empty">{{
        form.id ? '暂无证件查看权限，请联系管理员授权。' : '保存司机档案后可登记和管理证件。'
      }}</p>
    </section>
    <section v-else-if="activeTab === 'commission'" class="driver-dialog__records">
      <DriverCommissionRules :driver-id="form.id" :selected-rule-id="selectedCommissionRuleId" />
    </section>
    <div
      v-else
      class="driver-dialog__workarea"
      :class="{ 'driver-dialog__workarea--form-only': !imageItems.length }"
    >
      <section v-if="imageItems.length" class="driver-dialog__images" aria-label="司机证件影像">
        <div class="driver-dialog__section-heading">
          <strong>证件影像</strong><span>选择照片后可上传或查看</span>
        </div>
        <div class="driver-dialog__image-options" role="tablist" aria-label="影像类型">
          <button
            v-for="image in imageItems"
            :key="image.key"
            type="button"
            role="tab"
            :aria-selected="activeImage === image.key"
            :class="{ 'is-active': activeImage === image.key }"
            @click="activeImage = image.key"
          >
            <ArtSvgIcon :icon="form[image.key] ? 'ri:image-2-line' : 'ri:upload-2-line'" />
            {{ image.label }}
          </button>
        </div>
        <ArtUploadImage
          v-if="activeImage"
          v-model="form[activeImage]"
          :resource-tenant-id="form.tenantId || ''"
          :title="activeImageLabel"
          width="100%"
          :height="196"
          :limit="1"
          :file-size="8 * 1024 * 1024"
          file-type="image/png,image/jpeg,image/webp"
          :upload-request="uploadDriverDocument"
          :show-resource-picker="false"
          :readonly="
            !form.tenantId ||
            !canEditDriverField('identityDocuments') ||
            !hasAuth('TmsDriver:UploadDocument')
          "
        />
        <ElAlert
          v-if="activeImage && hiddenLegacyImages.has(activeImage)"
          type="warning"
          title="历史影像未在此处展示；请上传到私有存储以替换。"
          :closable="false"
        />
        <ElButton
          v-if="activeImage !== 'portraitUrl'"
          v-auth="'TmsDriver:Ocr'"
          type="primary"
          plain
          :loading="ocrBusy"
          :disabled="!activeOcrImageUrl || !canRecognizeDocument"
          @click="recognizeDocument"
          >智能识别当前影像</ElButton
        >
        <p>影像保存在租户私有存储；识别结果需核对，字段也可手工填写。</p>
      </section>
      <div class="driver-dialog__form-area">
        <div class="driver-dialog__section-heading"
          ><strong>{{ activeTabLabel }}</strong
          ><span>请核对后保存</span></div
        >
        <ArtForm
          ref="formRef"
          :model-value="form"
          @update:model-value="replaceReactiveModel(form, $event)"
          :items="visibleItems"
          :rules="formRules"
          :span="12"
          :gutter="16"
          label-width="116px"
          :show-reset="false"
          :show-submit="false"
          tenant-scope-mode="manual"
        >
          <template #employeeId>
            <ArtTableSingleSelect
              :model-value="form.employeeId || undefined"
              :selected-data="employeeSelection.selectedRows"
              :api-fn="fetchEmployeeSelectorData"
              :columns="employeeSelection.columns"
              title="从员工花名册选择"
              subtitle="仅展示在职、试用且尚未建立司机档案的员工"
              row-key="id"
              :label-key="getEmployeeLabel"
              :description-key="getEmployeeDescription"
              placeholder="请选择员工，或直接填写司机资料"
              search-placeholder="员工工号、姓名、所属组织或岗位"
              empty-text="暂无可建档员工"
              dialog-width="xl"
              show-pagination
              :page-size="10"
              @update:model-value="handleEmployeeValueChange"
              @update:selected-data="handleEmployeeRowsChange"
              @confirm="handleEmployeeConfirm"
              @clear="handleEmployeeClear"
            >
              <template #empty><TmsDataSourceEmptyActions source="employee" /></template>
            </ArtTableSingleSelect>
          </template>
        </ArtForm>
      </div>
    </div>
  </ArtDialog>
  <ArtDialog ref="ocrReviewDialogRef" size="lg" aria-label="司机证件识别结果">
    <div class="driver-dialog__ocr-review">
      <p>{{ ocrResult?.summary }}</p>
      <ElAlert
        v-if="ocrResult?.warnings.length"
        type="warning"
        :title="ocrResult.warnings.join('；')"
        :closable="false"
        show-icon
      />
      <ArtTable
        :data="ocrReviewRows"
        :columns="ocrReviewColumns"
        :pagination="false"
        empty-text="当前照片没有可填入的字段"
      />
      <ElCheckbox v-model="ocrReplaceExisting">覆盖已填写内容</ElCheckbox>
      <p>识别结果仅用于辅助填表，证件号码、日期和姓名请对照原件复核。</p>
    </div>
    <template #footer>
      <ElButton @click="ocrReviewDialogRef?.handleClose()">取消</ElButton>
      <ElButton type="primary" @click="applyOcrResult">填入表单</ElButton>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import {
    ElAlert,
    ElButton,
    ElCheckbox,
    ElMessage,
    ElTabPane,
    ElTabs,
    ElTag,
    type FormRules
  } from 'element-plus'
  import { h } from 'vue'
  import type { ColumnOption } from '@/types'
  import { omit, pick } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import TmsDataSourceEmptyActions from '../../../components/tms-data-source-empty-actions.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectKey,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import {
    isPrivateAttachmentPath,
    privateAttachmentPathFromSignedUrl,
    signPrivateAttachmentPaths,
    uploadPrivateAttachment
  } from '@/utils/supabase/private-attachment'
  import {
    addDriver,
    editDriver,
    fetchCarrierOptions,
    fetchDriverAssignedVehicles,
    fetchDriverCertificates,
    fetchDriverDetail,
    fetchDriverEmployeeOptions,
    fetchDriverProfile,
    analyzeDriverDocumentByAi
  } from '@tms/api'
  import type {
    DriverCertificateRecord,
    DriverDocumentImageSide,
    DriverDocumentOcrResult
  } from '@tms/api'
  import DriverCommissionRules from './driver-commission-rules.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    isReadableFieldAccess,
    canEditField,
    canViewField,
    getFieldAccess
  } from '@/utils/field-permission'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'

  defineOptions({ name: 'TmsDriverDialog' })

  type Driver = Api.Tms.BasicData.Driver
  type DriverProfile = Api.Tms.BasicData.DriverProfile
  type DriverForm = Driver & DriverProfile & { carrierVehiclePlates: string[] }
  type DriverImageKey =
    | 'portraitUrl'
    | 'idCardFrontUrl'
    | 'idCardBackUrl'
    | 'driverLicenseFrontUrl'
    | 'driverLicenseBackUrl'
    | 'licenseBackExtraUrl'
    | 'qualificationFrontUrl'
    | 'qualificationAssessmentUrl'
  type DriverTab =
    | 'basic'
    | 'identity'
    | 'license'
    | 'qualification'
    | 'other'
    | 'finance'
    | 'certificates'
    | 'commission'
  type CarrierOption = Api.Tms.BasicData.CarrierOption
  type DriverEmployeeOption = Api.Tms.BasicData.DriverEmployeeOption

  interface DialogExposeForm {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface EmployeeSelectionGroup {
    selectedRows: DataSelectRecord[]
    columns: DataSelectColumn[]
    tenantLabel: string
  }

  const emit = defineEmits<{
    (event: 'success', type: 'add' | 'edit'): void
  }>()

  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap } = storeToRefs(userStore)
  const tenantOptions = computed(() => [
    {
      label: userStore.getUserInfo.tenant?.tenantName ?? '平台租户',
      value: userStore.getUserInfo.tenantId ?? ''
    },
    ...tenantScopeStore.tenantOptions
      .filter((tenant) => tenant.id !== userStore.getUserInfo.tenantId)
      .map((tenant) => ({ label: tenant.tenantName, value: tenant.id }))
  ])
  const dialogRef = ref<ArtDialogExpose<Driver | undefined>>()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const canViewCertificates = computed(
    () => hasAuth('TmsDriver:View') || hasAuth('TmsDriverQuery:View')
  )
  const canManageCertificates = computed(() => hasAuth('CertificateCenter:View'))
  const certificateRows = ref<DriverCertificateRecord[]>([])
  const certificateLoading = ref(false)
  const certificateError = ref(false)
  const formRef = ref<DialogExposeForm>()
  const activeTab = ref<DriverTab>('basic')
  const selectedCommissionRuleId = ref('')
  const activeImage = ref<DriverImageKey | ''>('')
  const tabs: { key: DriverTab; label: string }[] = [
    { key: 'basic', label: '基本信息' },
    { key: 'identity', label: '身份证信息' },
    { key: 'license', label: '驾驶证信息' },
    { key: 'qualification', label: '从业资格证' },
    { key: 'other', label: '其他信息' },
    { key: 'finance', label: '财务信息' },
    { key: 'certificates', label: '司机证件' },
    { key: 'commission', label: '提成配置' }
  ]
  const activeTabLabel = computed(
    () => tabs.find((tab) => tab.key === activeTab.value)?.label ?? ''
  )
  const imageByTab: Partial<Record<DriverTab, { key: DriverImageKey; label: string }[]>> = {
    identity: [
      { key: 'portraitUrl', label: '司机照片' },
      { key: 'idCardFrontUrl', label: '身份证人像面' },
      { key: 'idCardBackUrl', label: '身份证国徽面' }
    ],
    license: [
      { key: 'driverLicenseFrontUrl', label: '驾驶证主页' },
      { key: 'driverLicenseBackUrl', label: '驾驶证副页' },
      { key: 'licenseBackExtraUrl', label: '副页背面' }
    ],
    qualification: [
      { key: 'qualificationFrontUrl', label: '从业资格证' },
      { key: 'qualificationAssessmentUrl', label: '诚信考核记录' }
    ]
  }
  const imageItems = computed(() => imageByTab[activeTab.value] ?? [])
  const activeImageLabel = computed(
    () => imageItems.value.find((item) => item.key === activeImage.value)?.label ?? ''
  )
  const certificateTypeLabels: Record<string, string> = {
    driver_license: '驾驶证',
    professional_qualification: '从业资格证',
    identity_card: '身份证'
  }
  const certificateStatusLabels: Record<string, string> = {
    valid: '有效',
    due_30: '30 天内到期',
    due_15: '15 天内到期',
    due_today: '今天到期',
    expired: '已过期',
    handled: '已处理'
  }
  const certificateColumns: ColumnOption<DriverCertificateRecord>[] = [
    {
      prop: 'certificateType',
      label: '证件类型',
      minWidth: 140,
      formatter: (row) => certificateTypeLabels[row.certificateType] ?? row.certificateType
    },
    { prop: 'certificateNo', label: '证件编号', minWidth: 170 },
    { prop: 'expiresOn', label: '有效期截止', width: 135 },
    { prop: 'responsibleName', label: '责任人', minWidth: 115 },
    {
      prop: 'status',
      label: '到期状态',
      width: 125,
      formatter: (row) =>
        h(
          ElTag,
          {
            type:
              row.status === 'expired'
                ? 'danger'
                : ['due_30', 'due_15', 'due_today'].includes(row.status)
                  ? 'warning'
                  : row.status === 'handled'
                    ? 'info'
                    : 'success',
            effect: 'light'
          },
          () => certificateStatusLabels[row.status] ?? row.status
        )
    },
    {
      prop: 'attachments',
      label: '附件',
      width: 90,
      formatter: (row) => `${row.attachments.length} 份`
    }
  ]
  const loadCertificates = async (): Promise<void> => {
    if (!form.id || !canViewCertificates.value) return
    certificateLoading.value = true
    certificateError.value = false
    try {
      const result = await fetchDriverCertificates(form.id)
      if (result.error) {
        certificateError.value = true
        return
      }
      certificateRows.value = result.data
    } catch {
      certificateError.value = true
    } finally {
      certificateLoading.value = false
    }
  }
  watch(activeTab, (tab) => {
    if (tab === 'certificates') void loadCertificates()
  })
  const openCertificateCenter = (): void => {
    if (!form.id) return
    void router.push({
      path: '/vms/certificate-center',
      query: { subjectType: 'driver', subjectId: form.id }
    })
    dialogRef.value?.handleClose()
  }
  watch(
    imageItems,
    (items) => {
      activeImage.value = items[0]?.key ?? ''
    },
    { immediate: true }
  )
  const vehicleState = reactive({ loading: false, error: '', requestId: 0 })
  const employeeSelection = reactive<EmployeeSelectionGroup>({
    selectedRows: [],
    tenantLabel: '',
    columns: [
      { prop: 'tenant.tenantName', label: '所属租户', minWidth: 160 },
      { prop: 'employeeNo', label: '员工工号', width: 130 },
      { prop: 'employeeName', label: '员工姓名', minWidth: 130 },
      { prop: 'organization.organizationName', label: '所属组织', minWidth: 160 },
      { prop: 'jobTitle', label: '工作岗位', minWidth: 140 },
      { prop: 'phone', label: '手机号码', width: 140 },
      {
        prop: 'employmentStatus',
        label: '任职状态',
        width: 110,
        dict: { code: 'hrEmploymentStatus', display: 'tag' }
      }
    ]
  })

  const genderOptions = computed(() => getDictMap.value.sex ?? [])
  const licenseTypeOptions = computed(() => getDictMap.value.tmsDriverLicenseType ?? [])
  const driverTypeOptions = computed(() => getDictMap.value.tmsDriverType ?? [])
  const ownershipOptions = computed(() => getDictMap.value.tmsDriverOwnership ?? [])
  const driverStatusOptions = computed(() => getDictMap.value.tmsDriverStatus ?? [])
  const licenseClassOptions = computed(() => getDictMap.value.tmsDriverLicenseType ?? [])
  const qualificationTypeOptions = computed(() => getDictMap.value.tmsDriverQualificationType ?? [])
  const authStatusOptions = computed(() => getDictMap.value.tmsDriverAuthStatus ?? [])
  const registrationOptions = computed(() => getDictMap.value.tmsDriverRegistrationStatus ?? [])

  const profileKeys = [
    'driverOwnership',
    'driverStatus',
    'portraitUrl',
    'idCardIssuer',
    'birthDate',
    'ethnicity',
    'homeRegionCode',
    'homeAddressDetail',
    'idCardValidFrom',
    'idCardValidTo',
    'idCardLongTerm',
    'licenseArchiveNo',
    'licenseClasses',
    'licenseIssuer',
    'licenseValidFrom',
    'licenseLongTerm',
    'licenseBackExtraUrl',
    'qualificationType',
    'qualificationNo',
    'qualificationValidTo',
    'qualificationFrontUrl',
    'qualificationAssessmentUrl',
    'financeInvoiceName',
    'financeTaxNo',
    'financeBankName',
    'financeBankAccount',
    'financeBankBranch',
    'financeDefaultAccount'
  ] as const satisfies readonly (keyof DriverProfile)[]

  const createInitialForm = (): DriverForm => ({
    id: undefined,
    tenantId: tenantScopeStore.effectiveTenantId ?? userStore.getUserInfo.tenantId ?? '',
    employeeId: null,
    carrierId: '',
    driverName: '',
    phone: '',
    driverType: 'primary',
    gender: '',
    idCardNo: '',
    licenseType: '',
    licenseExpireDate: '',
    homeAddress: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    enabled: true,
    idCardFrontUrl: '',
    idCardBackUrl: '',
    driverLicenseFrontUrl: '',
    driverLicenseBackUrl: '',
    remark: '',
    driverOwnership: 'self',
    driverStatus: 'on_duty',
    portraitUrl: '',
    idCardIssuer: '',
    birthDate: null,
    ethnicity: '',
    homeRegionCode: '',
    homeAddressDetail: '',
    idCardValidFrom: null,
    idCardValidTo: null,
    idCardLongTerm: false,
    licenseArchiveNo: '',
    licenseClasses: [],
    licenseIssuer: '',
    licenseValidFrom: null,
    licenseLongTerm: false,
    licenseBackExtraUrl: '',
    qualificationType: '',
    qualificationNo: '',
    qualificationValidTo: null,
    qualificationFrontUrl: '',
    qualificationAssessmentUrl: '',
    registrationStatus: 'unregistered',
    identityAuthStatus: 'unverified',
    licenseAuthStatus: 'unverified',
    qualificationAuthStatus: 'unverified',
    financeInvoiceName: '',
    financeTaxNo: '',
    financeBankName: '',
    financeBankAccount: '',
    financeBankBranch: '',
    financeDefaultAccount: false,
    carrierVehiclePlates: [],
    fieldAccess: {
      contactPhone: 'edit',
      idCardNo: 'edit',
      homeAddress: 'edit',
      emergencyContact: 'edit',
      identityDocuments: 'edit'
    },
    isRecordOwner: true
  })

  const form = reactive<DriverForm>(createInitialForm())
  const privateBucket = 'tms-driver-private'
  const imageKeys: readonly DriverImageKey[] = [
    'portraitUrl', 'idCardFrontUrl', 'idCardBackUrl', 'driverLicenseFrontUrl',
    'driverLicenseBackUrl', 'licenseBackExtraUrl', 'qualificationFrontUrl',
    'qualificationAssessmentUrl'
  ]
  const originalImageReferences = reactive<Partial<Record<DriverImageKey, string>>>({})
  const hiddenLegacyImages = reactive(new Set<DriverImageKey>())
  const uploadDriverDocument = (file: File) => uploadPrivateAttachment(file, {
    bucket: privateBucket,
    tenantId: form.tenantId || '',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 8 * 1024 * 1024
  })
  const ocrReviewDialogRef = ref<ArtDialogExpose<DriverDocumentOcrResult>>()
  const ocrBusy = ref(false)
  const ocrResult = ref<DriverDocumentOcrResult | null>(null)
  const ocrReplaceExisting = ref(false)
  const activeOcrImageUrl = computed(() => activeImage.value ? form[activeImage.value] : '')
  const ocrFieldLabels: Record<string, string> = {
    driverName: '姓名',
    idCardNo: '身份证号',
    gender: '性别',
    birthDate: '出生日期',
    ethnicity: '民族',
    homeAddress: '住址',
    homeAddressDetail: '详细地址',
    idCardIssuer: '身份证发证机关',
    idCardValidFrom: '身份证起始日',
    idCardValidTo: '身份证有效期',
    licenseArchiveNo: '档案编号',
    licenseClasses: '准驾车型',
    licenseIssuer: '驾驶证发证机关',
    licenseValidFrom: '驾照起始日',
    licenseExpireDate: '驾照有效期',
    qualificationType: '资格证类型',
    qualificationNo: '资格证号',
    qualificationValidTo: '资格证有效期'
  }
  const ocrFieldsByTab: Record<'identity' | 'license' | 'qualification', string[]> = {
    identity: [
      'driverName',
      'idCardNo',
      'gender',
      'birthDate',
      'ethnicity',
      'homeAddress',
      'homeAddressDetail',
      'idCardIssuer',
      'idCardValidFrom',
      'idCardValidTo'
    ],
    license: [
      'licenseArchiveNo',
      'licenseClasses',
      'licenseIssuer',
      'licenseValidFrom',
      'licenseExpireDate'
    ],
    qualification: ['qualificationType', 'qualificationNo', 'qualificationValidTo']
  }
  interface OcrReviewRow {
    field: string
    label: string
    current: string
    recognized: string
    confidence: string
  }
  const canRecognizeDocument = computed(
    () =>
      hasAuth('TmsDriver:Ocr') &&
      hasAuth(form.id ? 'TmsDriver:Edit' : 'TmsDriver:Add') &&
      canEditDriverField('identityDocuments') &&
      (activeTab.value !== 'identity' || canEditDriverField('idCardNo'))
  )
  const ocrReviewRows = computed<OcrReviewRow[]>(() => {
    const result = ocrResult.value
    if (!result || !['identity', 'license', 'qualification'].includes(activeTab.value)) return []
    const tab = activeTab.value as 'identity' | 'license' | 'qualification'
    return ocrFieldsByTab[tab].flatMap((field) => {
      const recognized = result.document[field]
      if (!recognized || (Array.isArray(recognized) && !recognized.length)) return []
      const current = form[field as keyof DriverForm]
      const confidence = result.fieldConfidence[field]
      return [
        {
          field,
          label: ocrFieldLabels[field] ?? field,
          current: Array.isArray(current) ? current.join('、') : String(current ?? ''),
          recognized: Array.isArray(recognized) ? recognized.join('、') : recognized,
          confidence: confidence == null ? '—' : `${Math.round(confidence * 100)}%`
        }
      ]
    })
  })
  const ocrReviewColumns: ColumnOption<OcrReviewRow>[] = [
    { prop: 'label', label: '字段', width: 150 },
    { prop: 'current', label: '当前内容', minWidth: 170 },
    { prop: 'recognized', label: '识别内容', minWidth: 190 },
    { prop: 'confidence', label: '可信度', width: 90 }
  ]

  const recognizeDocument = async (): Promise<void> => {
    const imageSide = activeImage.value
    if (!imageSide || imageSide === 'portraitUrl' || !canRecognizeDocument.value || ocrBusy.value)
      return
    const imageUrl = form[imageSide]
    if (!imageUrl || !form.tenantId) return
    ocrBusy.value = true
    try {
      const imagePath = isPrivateAttachmentPath(imageUrl)
        ? imageUrl
        : privateAttachmentPathFromSignedUrl(imageUrl, privateBucket)
      const { data, error } = await analyzeDriverDocumentByAi({
        imagePath,
        imageSide: imageSide as DriverDocumentImageSide,
        driverId: form.id ? String(form.id) : undefined,
        tenantId: form.tenantId
      })
      if (error) throw error
      if (!data) throw new Error('未获取到证件识别结果')
      ocrResult.value = data
      ocrReplaceExisting.value = false
      await ocrReviewDialogRef.value?.handleOpen(data, { title: '司机证件识别结果' })
    } catch (error) {
      notifyFriendlyError(error, '证件识别失败，请核对图片并重试')
    } finally {
      ocrBusy.value = false
    }
  }

  const applyOcrResult = (): void => {
    if (!ocrResult.value || !canRecognizeDocument.value) return
    let applied = 0
    for (const row of ocrReviewRows.value) {
      const raw = ocrResult.value.document[row.field]
      if (!raw || (!ocrReplaceExisting.value && row.current)) continue
      let value: string | string[] = raw
      if (row.field === 'gender' && typeof raw === 'string') {
        const matched = genderOptions.value.find((item) => item.value === raw || item.label === raw)
        if (!matched) continue
        value = matched.value
      }
      if (row.field === 'qualificationType' && typeof raw === 'string') {
        const matched = qualificationTypeOptions.value.find(
          (item) => item.value === raw || item.label === raw
        )
        if (!matched) continue
        value = matched.value
      }
      if (row.field === 'licenseClasses') {
        if (!Array.isArray(raw)) continue
        value = raw.flatMap((className) => {
          const matched = licenseClassOptions.value.find(
            (item) => item.value === className || item.label === className
          )
          return matched ? [matched.value] : []
        })
        if (!value.length) continue
      }
      Object.assign(form, { [row.field]: value })
      applied += 1
    }
    ElMessage.success(
      applied ? `已填入 ${applied} 个字段，请对照原件核对` : '没有可填入的字段，请手工填写'
    )
    ocrReviewDialogRef.value?.handleClose()
  }

  const canViewDriverField = (field: Api.Tms.BasicData.DriverFieldKey): boolean =>
    canViewField(form.fieldAccess, field)

  const canEditDriverField = (field: Api.Tms.BasicData.DriverFieldKey): boolean =>
    canEditField(form.fieldAccess, field)

  const canViewIdentityDocuments = computed(() =>
    isReadableFieldAccess(getFieldAccess(form.fieldAccess, 'identityDocuments'))
  )

  const formRules = computed<FormRules<DriverForm>>(() => ({
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    driverName: [
      { required: true, message: '请输入姓名', trigger: 'blur' },
      { min: 2, max: 50, message: '长度应为 2 到 50 个字符', trigger: 'blur' }
    ],
    carrierId:
      form.driverOwnership === 'carrier'
        ? [{ required: true, message: '请选择所属承运商', trigger: 'change' }]
        : [],
    driverOwnership: [{ required: true, message: '请选择司机归属', trigger: 'change' }],
    driverType: [{ required: true, message: '请选择司机类型', trigger: 'change' }],
    phone: canEditDriverField('contactPhone')
      ? [
          { required: true, message: '请输入手机号码', trigger: 'blur' },
          {
            pattern: /^1[3-9]\d{9}$/,
            message: '请输入正确的手机号码',
            trigger: 'blur'
          }
        ]
      : [],
    idCardNo: canEditDriverField('idCardNo')
      ? [
          { required: true, message: '请输入身份证号', trigger: 'blur' },
          {
            pattern:
              /^(^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$)|(^[1-9]\d{7}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}$)$/,
            message: '请输入正确的身份证号',
            trigger: 'blur'
          }
        ]
      : [],
    gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
    licenseClasses: [
      { required: true, type: 'array', min: 1, message: '请选择准驾车型', trigger: 'change' }
    ],
    licenseExpireDate: form.licenseLongTerm
      ? []
      : [{ required: true, message: '请选择驾照有效期', trigger: 'change' }],
    idCardValidTo: form.idCardLongTerm
      ? []
      : [{ required: true, message: '请选择身份证有效期', trigger: 'change' }],
    emergencyContactPhone: canEditDriverField('emergencyContact')
      ? [
          {
            pattern: /^$|^1[3-9]\d{9}$/,
            message: '请输入正确的紧急联系人电话',
            trigger: 'blur'
          }
        ]
      : [],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }))

  const formItems = computed<FormItem[]>(() => [
    { label: '基础信息', key: 'baseSection', type: 'divider', span: 24 },
    {
      label: '所属租户',
      key: 'tenantId',
      type: 'select',
      span: 24,
      props: {
        options: tenantOptions.value,
        filterable: true,
        disabled: Boolean(form.id) || tenantOptions.value.length < 2
      }
    },
    {
      label: '花名册员工',
      key: 'employeeId',
      span: 24,
      hidden: Boolean(form.id),
      description:
        '选择后回填共有身份信息并将员工岗位同步为司机；证照、承运商和司机类型仍需单独维护。'
    },
    {
      label: '姓名',
      key: 'driverName',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入姓名' }
    },
    {
      label: '手机号码',
      key: 'phone',
      type: 'input',
      hidden: !canViewDriverField('contactPhone'),
      props: {
        maxlength: 11,
        placeholder: '请输入手机号码',
        disabled: !canEditDriverField('contactPhone')
      }
    },
    {
      label: '身份证号',
      key: 'idCardNo',
      type: 'input',
      hidden: !canViewDriverField('idCardNo'),
      props: {
        maxlength: 18,
        placeholder: '请输入身份证号',
        disabled: !canEditDriverField('idCardNo')
      }
    },
    {
      label: '司机类型',
      key: 'driverType',
      type: 'radioGroup',
      props: { options: driverTypeOptions.value }
    },
    {
      label: '性别',
      key: 'gender',
      type: 'select',
      props: {
        options: genderOptions.value,
        clearable: true,
        placeholder: '请选择性别'
      }
    },
    {
      label: '驾照类型',
      key: 'licenseType',
      type: 'select',
      props: {
        options: licenseTypeOptions.value,
        clearable: true,
        placeholder: '请选择驾照类型'
      }
    },
    {
      label: '驾照有效期',
      key: 'licenseExpireDate',
      type: 'date',
      props: {
        type: 'date',
        valueFormat: 'YYYY-MM-DD',
        class: '!w-full',
        placeholder: '请选择日期'
      }
    },
    {
      label: '所属承运商',
      key: 'carrierId',
      type: 'select',
      span: 16,
      description: employeeSelection.tenantLabel
        ? `所选员工属于${employeeSelection.tenantLabel}，承运商须来自同一租户。`
        : undefined,
      api: fetchCarrierOptions,
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      labelFn: (option) => {
        const carrier = option as CarrierOption
        return carrier.carrierCode
          ? `${carrier.companyName}（${carrier.carrierCode}）`
          : carrier.companyName
      },
      props: {
        filterable: true,
        clearable: true,
        placeholder: '公司名称/承运商编码',
        onChange: () => {
          form.carrierVehiclePlates = []
          void reloadAssignedVehicles()
        }
      }
    },
    {
      label: '车牌号',
      key: 'carrierVehiclePlates',
      type: 'inputTag',
      span: 16,
      hidden: () => !form.id,
      props: {
        disabled: true,
        tagType: 'primary',
        tagEffect: 'light',
        placeholder: vehicleState.loading
          ? '正在加载关联车辆'
          : vehicleState.error
            ? '关联车辆加载失败'
            : '暂无关联车辆'
      }
    },
    {
      label: '家庭住址',
      key: 'homeAddress',
      type: 'input',
      span: 16,
      hidden: !canViewDriverField('homeAddress'),
      props: {
        maxlength: 200,
        placeholder: '请输入家庭住址',
        disabled: !canEditDriverField('homeAddress')
      }
    },
    {
      label: '紧急联系人',
      key: 'emergencyContactName',
      type: 'input',
      hidden: !canViewDriverField('emergencyContact'),
      props: {
        maxlength: 50,
        placeholder: '请输入紧急联系人',
        disabled: !canEditDriverField('emergencyContact')
      }
    },
    {
      label: '紧急联系人电话',
      key: 'emergencyContactPhone',
      type: 'input',
      hidden: !canViewDriverField('emergencyContact'),
      props: {
        maxlength: 11,
        placeholder: '请输入紧急联系人电话',
        disabled: !canEditDriverField('emergencyContact')
      }
    },
    {
      label: '状态',
      key: 'enabled',
      type: 'switch',
      props: {
        activeText: '启用',
        inactiveText: '停用',
        inlinePrompt: true
      }
    },
    {
      label: '证件照',
      key: 'certificateSection',
      type: 'divider',
      span: 24,
      hidden: !canViewIdentityDocuments.value
    },
    {
      label: '身份证正面',
      key: 'idCardFrontUrl',
      hidden: !canViewIdentityDocuments.value
    },
    {
      label: '身份证反面',
      key: 'idCardBackUrl',
      hidden: !canViewIdentityDocuments.value
    },
    {
      label: '驾驶证正面',
      key: 'driverLicenseFrontUrl',
      hidden: !canViewIdentityDocuments.value
    },
    {
      label: '驾驶证反面',
      key: 'driverLicenseBackUrl',
      hidden: !canViewIdentityDocuments.value
    },
    {
      label: '备注信息',
      key: 'remark',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '请输入备注信息'
      }
    }
  ])

  const profileItems = computed<FormItem[]>(() => [
    {
      label: '司机归属',
      key: 'driverOwnership',
      type: 'select',
      props: { options: ownershipOptions.value, placeholder: '请选择司机归属' }
    },
    {
      label: '司机状态',
      key: 'driverStatus',
      type: 'select',
      props: { options: driverStatusOptions.value }
    },
    {
      label: '出生年月',
      key: 'birthDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    { label: '民族', key: 'ethnicity', type: 'input', props: { maxlength: 30 } },
    { label: '发证机关', key: 'idCardIssuer', type: 'input', span: 24, props: { maxlength: 100 } },
    {
      label: '身份证起始日',
      key: 'idCardValidFrom',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      label: '身份证有效期',
      key: 'idCardValidTo',
      type: 'date',
      hidden: Boolean(form.idCardLongTerm),
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    { label: '长期有效', key: 'idCardLongTerm', type: 'switch' },
    {
      label: '详细地址',
      key: 'homeAddressDetail',
      type: 'input',
      span: 24,
      props: { maxlength: 200 }
    },
    { label: '档案编号', key: 'licenseArchiveNo', type: 'input', props: { maxlength: 80 } },
    {
      label: '准驾车型',
      key: 'licenseClasses',
      type: 'select',
      span: 24,
      props: {
        options: licenseClassOptions.value,
        multiple: true,
        clearable: true,
        placeholder: '可多选'
      }
    },
    {
      label: '驾驶证发证机关',
      key: 'licenseIssuer',
      type: 'input',
      span: 24,
      props: { maxlength: 100 }
    },
    {
      label: '驾照起始日',
      key: 'licenseValidFrom',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    { label: '驾照长期有效', key: 'licenseLongTerm', type: 'switch' },
    {
      label: '资格证类型',
      key: 'qualificationType',
      type: 'select',
      span: 24,
      props: { options: qualificationTypeOptions.value, clearable: true }
    },
    { label: '资格证号', key: 'qualificationNo', type: 'input', props: { maxlength: 80 } },
    {
      label: '资格证有效期',
      key: 'qualificationValidTo',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      label: '注册状态',
      key: 'registrationStatus',
      type: 'select',
      props: { options: registrationOptions.value, disabled: true }
    },
    {
      label: '身份证状态',
      key: 'identityAuthStatus',
      type: 'select',
      props: { options: authStatusOptions.value, disabled: true }
    },
    {
      label: '驾驶证状态',
      key: 'licenseAuthStatus',
      type: 'select',
      props: { options: authStatusOptions.value, disabled: true }
    },
    {
      label: '资格证状态',
      key: 'qualificationAuthStatus',
      type: 'select',
      props: { options: authStatusOptions.value, disabled: true }
    },
    {
      label: '开票名称',
      key: 'financeInvoiceName',
      type: 'input',
      span: 24,
      props: { maxlength: 150 }
    },
    {
      label: '纳税人识别号',
      key: 'financeTaxNo',
      type: 'input',
      span: 24,
      props: { maxlength: 40 }
    },
    { label: '开户行', key: 'financeBankName', type: 'input', props: { maxlength: 100 } },
    { label: '银行账号', key: 'financeBankAccount', type: 'input', props: { maxlength: 80 } },
    { label: '支行', key: 'financeBankBranch', type: 'input', span: 24, props: { maxlength: 100 } },
    { label: '默认开票账户', key: 'financeDefaultAccount', type: 'switch' }
  ])

  const tabFields: Record<DriverTab, string[]> = {
    basic: [
      'tenantId',
      'employeeId',
      'driverName',
      'phone',
      'driverType',
      'driverOwnership',
      'driverStatus',
      'carrierId',
      'carrierVehiclePlates',
      'enabled'
    ],
    identity: [
      'idCardNo',
      'gender',
      'birthDate',
      'ethnicity',
      'homeAddress',
      'homeAddressDetail',
      'idCardIssuer',
      'idCardValidFrom',
      'idCardValidTo',
      'idCardLongTerm'
    ],
    license: [
      'licenseArchiveNo',
      'licenseClasses',
      'licenseValidFrom',
      'licenseExpireDate',
      'licenseLongTerm',
      'licenseIssuer'
    ],
    qualification: ['qualificationType', 'qualificationNo', 'qualificationValidTo'],
    other: [
      'registrationStatus',
      'identityAuthStatus',
      'licenseAuthStatus',
      'qualificationAuthStatus',
      'emergencyContactName',
      'emergencyContactPhone',
      'remark'
    ],
    finance: [
      'financeInvoiceName',
      'financeTaxNo',
      'financeBankName',
      'financeBankAccount',
      'financeBankBranch',
      'financeDefaultAccount'
    ],
    certificates: [],
    commission: []
  }
  const visibleItems = computed<FormItem[]>(() => {
    const fields = tabFields[activeTab.value]
    return [...formItems.value, ...profileItems.value].filter(
      (item) =>
        fields.includes(item.key) &&
        (item.key !== 'carrierId' || form.driverOwnership === 'carrier')
    )
  })

  watch(
    () => form.licenseClasses,
    (classes) => {
      form.licenseType = classes?.[0] || ''
    },
    { deep: true }
  )

  const replaceForm = (nextForm: DriverForm): void => {
    Object.keys(form).forEach((key) => delete form[key as keyof DriverForm])
    Object.assign(form, nextForm)
  }

  const resetForm = async (): Promise<void> => {
    vehicleState.requestId += 1
    vehicleState.loading = false
    vehicleState.error = ''
    employeeSelection.selectedRows = []
    employeeSelection.tenantLabel = ''
    replaceForm(createInitialForm())
    activeTab.value = 'basic'
    selectedCommissionRuleId.value = ''
    await nextTick()
    formRef.value?.clearValidate()
  }

  const fetchEmployeeSelectorData = async (params: DataSelectFetchParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    const { data, total } = await fetchDriverEmployeeOptions({
      keyword: params.keyword,
      from,
      to
    })
    return { data, total }
  }

  const getEmployeeLabel = (row: DataSelectRecord): string => {
    const employee = row as DriverEmployeeOption
    return `${employee.employeeName}（${employee.employeeNo}）`
  }

  const getEmployeeDescription = (row: DataSelectRecord): string => {
    const employee = row as DriverEmployeeOption
    return [
      employee.tenant.tenantName,
      employee.organization?.organizationName,
      employee.jobTitle,
      employee.phone
    ]
      .filter(Boolean)
      .join(' / ')
  }

  const handleEmployeeValueChange = (value: DataSelectKey | DataSelectKey[] | undefined): void => {
    form.employeeId = typeof value === 'string' ? value : null
  }

  const handleEmployeeRowsChange = (rows: DataSelectRecord[]): void => {
    employeeSelection.selectedRows = rows
  }

  const handleEmployeeConfirm = (_value: unknown, rows: DataSelectRecord[]): void => {
    const employee = rows[0] as DriverEmployeeOption | undefined
    if (!employee) return

    Object.assign(form, {
      employeeId: employee.id,
      driverName: employee.employeeName,
      phone: employee.phone ?? '',
      gender: employee.gender ?? '',
      idCardNo: employee.idCardNo ?? '',
      homeAddress: employee.homeAddress ?? '',
      emergencyContactName: employee.emergencyContactName ?? '',
      emergencyContactPhone: employee.emergencyContactPhone ?? ''
    } satisfies Partial<DriverForm>)
    employeeSelection.selectedRows = [employee]
    employeeSelection.tenantLabel = employee.tenant.tenantName
  }

  const handleEmployeeClear = (): void => {
    form.employeeId = null
    employeeSelection.selectedRows = []
    employeeSelection.tenantLabel = ''
  }

  const normalizePayload = (): Omit<Driver, 'carrierId'> & {
    carrierId: string | null
    profile: DriverProfile
  } => {
    const rawPayload = structuredClone(toRaw(form))
    for (const key of imageKeys) {
      const value = rawPayload[key]
      if (!value) {
        if (hiddenLegacyImages.has(key)) rawPayload[key] = originalImageReferences[key] || ''
      } else if (!isPrivateAttachmentPath(value)) {
        rawPayload[key] = privateAttachmentPathFromSignedUrl(value, privateBucket)
      }
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'contactPhone')) {
      delete rawPayload.phone
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'idCardNo')) {
      delete rawPayload.idCardNo
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'homeAddress')) {
      delete rawPayload.homeAddress
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'emergencyContact')) {
      delete rawPayload.emergencyContactName
      delete rawPayload.emergencyContactPhone
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'identityDocuments')) {
      delete rawPayload.idCardFrontUrl
      delete rawPayload.idCardBackUrl
      delete rawPayload.driverLicenseFrontUrl
      delete rawPayload.driverLicenseBackUrl
      delete rawPayload.portraitUrl
      delete rawPayload.licenseBackExtraUrl
      delete rawPayload.qualificationFrontUrl
      delete rawPayload.qualificationAssessmentUrl
    }

    const payload = omit(rawPayload, [
      'tenantId',
      'createdByUserId',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime',
      'carrier',
      'assignedVehicles',
      'carrierVehiclePlates',
      'fieldAccess',
      'isRecordOwner',
      ...profileKeys,
      'registrationStatus',
      'identityAuthStatus',
      'licenseAuthStatus',
      'qualificationAuthStatus',
      'inviterUserId',
      'wechatOpenId',
      'wechatAvatarUrl'
    ]) as Driver

    return {
      ...payload,
      ...(form.id ? {} : { tenantId: form.tenantId }),
      carrierId: form.driverOwnership === 'carrier' ? form.carrierId || null : null,
      profile: pick(rawPayload, profileKeys),
      licenseExpireDate: payload.licenseExpireDate || null,
      idCardFrontUrl: payload.idCardFrontUrl || null,
      idCardBackUrl: payload.idCardBackUrl || null,
      driverLicenseFrontUrl: payload.driverLicenseFrontUrl || null,
      driverLicenseBackUrl: payload.driverLicenseBackUrl || null
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      const previousTab = activeTab.value
      for (const tab of tabs) {
        if (tab.key === 'certificates' || tab.key === 'commission') continue
        activeTab.value = tab.key
        await nextTick()
        if (!(await validateArtFormForSubmit(formRef.value))) return false
      }
      activeTab.value = previousTab
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = normalizePayload()
      const type = form.id ? 'edit' : 'add'
      if (type === 'edit') await editDriver(payload)
      else await addDriver(payload)
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '司机档案保存失败，请检查填写内容后重试')
      return false
    }
  }

  const handleOpen = async (
    row?: Driver,
    initial?: { phone: string; driverOwnership: string; carrierId: string | null },
    initialTab?: DriverTab,
    commissionRuleId?: string
  ): Promise<void> => {
    await resetForm()
    hiddenLegacyImages.clear()
    for (const key of imageKeys) delete originalImageReferences[key]
    const isEdit = Boolean(row?.id)
    if (!isEdit) await tenantScopeStore.loadTenantOptions()
    if (initial && !row) {
      form.phone = initial.phone
      form.driverOwnership = initial.driverOwnership
      form.carrierId = initial.carrierId || ''
      activeTab.value = 'identity'
    }
    if (row) {
      const [detailResult, profileResult] = await Promise.all([
        fetchDriverDetail(String(row.id)),
        fetchDriverProfile(String(row.id))
      ])
      if (detailResult.error || profileResult.error || !detailResult.data?.tenantId) {
        notifyFriendlyError(
          detailResult.error ?? profileResult.error ?? new Error('缺少司机所属租户'),
          '司机资料加载失败，请稍后重试'
        )
        return
      }
      const editData = omit(structuredClone(detailResult.data), ['assignedVehicles'])
      const editForm: DriverForm = {
        ...createInitialForm(),
        ...editData,
        ...(profileResult.data ?? {}),
        licenseClasses: profileResult.data?.licenseClasses?.length
          ? profileResult.data.licenseClasses
          : detailResult.data.licenseType
            ? [detailResult.data.licenseType]
            : [],
        carrierVehiclePlates: (detailResult.data.assignedVehicles ?? []).map(
          (vehicle) => vehicle.plateNo
        )
      }
      const paths: string[] = []
      for (const key of imageKeys) {
        const reference = editForm[key] || ''
        originalImageReferences[key] = reference
        if (isPrivateAttachmentPath(reference)) paths.push(reference)
        else if (reference) {
          hiddenLegacyImages.add(key)
          editForm[key] = ''
        }
      }
      try {
        const signed = await signPrivateAttachmentPaths(privateBucket, paths)
        for (const key of imageKeys) {
          const reference = originalImageReferences[key]
          if (reference && isPrivateAttachmentPath(reference)) {
            const previewUrl = signed.get(reference)
            if (previewUrl) editForm[key] = previewUrl
            else {
              hiddenLegacyImages.add(key)
              editForm[key] = ''
            }
          }
        }
      } catch (error) {
        for (const key of imageKeys) {
          if (originalImageReferences[key]) {
            hiddenLegacyImages.add(key)
            editForm[key] = ''
          }
        }
        notifyFriendlyError(error, '证件影像预览失败，仍可修改其他资料')
      }
      replaceForm(editForm)
    }

    if (initialTab) activeTab.value = initialTab
    selectedCommissionRuleId.value = commissionRuleId ?? ''

    await dialogRef.value?.handleOpen(row, {
      title: isEdit ? '编辑司机' : '新增司机',
      subtitle: '维护司机基础资料与证件信息',
      contentMaxHeight: '72vh',
      onOpen: async () => {
        await reloadAssignedVehicles()
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  const reloadAssignedVehicles = async (): Promise<void> => {
    const driverId = form.id
    const carrierId = form.carrierId
    const requestId = ++vehicleState.requestId
    vehicleState.error = ''

    if (!driverId || !carrierId) {
      form.carrierVehiclePlates = []
      vehicleState.loading = false
      return
    }

    vehicleState.loading = true
    try {
      const result = await fetchDriverAssignedVehicles({ driverId, carrierId })
      if (requestId !== vehicleState.requestId) return
      if (result.error) {
        vehicleState.error = '关联车辆加载失败，请重试'
        return
      }
      form.carrierVehiclePlates = (result.data ?? []).map((vehicle) => vehicle.plateNo)
    } catch {
      if (requestId !== vehicleState.requestId) return
      form.carrierVehiclePlates = []
      vehicleState.error = '关联车辆加载失败，请重试'
    } finally {
      if (requestId === vehicleState.requestId) vehicleState.loading = false
    }
  }

  defineExpose({
    handleOpen,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .driver-dialog {
    &__summary {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 0 0 16px;

      strong {
        font-size: 16px;
        color: var(--art-gray-900);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--art-gray-700);
      }
    }

    &__avatar {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 20px;
      color: var(--theme-color);
      background: var(--art-gray-100);
      border-radius: var(--art-control-radius);
    }

    &__tabs {
      margin-bottom: 14px;
    }

    &__workarea {
      display: grid;
      grid-template-columns: minmax(230px, 32%) minmax(0, 1fr);
      gap: 20px;
      min-width: 0;

      &--form-only {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    &__images,
    &__form-area {
      min-width: 0;
    }

    &__images {
      padding: 16px;
      background: var(--art-gray-100);
      border-radius: var(--art-surface-radius);

      p {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--art-gray-700);
      }
    }

    &__section-heading {
      display: flex;
      gap: 12px;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 14px;

      strong {
        font-size: 14px;
        color: var(--art-gray-900);
      }

      span {
        font-size: 12px;
        color: var(--art-gray-700);
      }
    }

    &__image-options {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;

      button {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        min-height: 34px;
        padding: 6px 10px;
        color: var(--art-gray-800);
        cursor: pointer;
        background: var(--default-box-color);
        border: 1px solid var(--el-border-color);
        border-radius: var(--art-control-radius);

        &.is-active {
          color: var(--theme-color);
          border-color: var(--theme-color);
        }

        &:focus-visible {
          outline: 2px solid var(--theme-color);
          outline-offset: 2px;
        }
      }
    }

    &__records {
      min-width: 0;
    }

    &__record-heading {
      display: flex;
      gap: 16px;
      align-items: start;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    &__record-heading strong {
      font-size: 14px;
      color: var(--art-gray-900);
    }

    &__record-heading p,
    &__record-empty {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--art-gray-700);
    }

    &__record-error {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--el-color-danger);
    }
  }

  @media (width <= 900px) {
    .driver-dialog__workarea {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
