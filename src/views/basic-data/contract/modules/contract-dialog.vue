<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div class="contract-dialog">
      <ArtForm
        ref="formRef"
        v-model:active-tab="activeTab"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :span="8"
        :gutter="20"
        label-width="124px"
        :validate-on-rule-change="false"
        scroll-to-error
      >
        <template #transportDetails>
          <ContractTransportDetails
            ref="transportDetailsRef"
            v-model="form.data.transportDetails"
            :unit-options="cargoUnitOptions"
            :pricing-access="transportDetailsPricingAccess"
            :editable="canEditTransportDetails"
          />
        </template>
        <template #contractAttachments>
          <ArtSectionCard
            v-if="canViewSensitiveField('attachments')"
            class="contract-dialog__section"
            preserve-content-structure
          >
            <template #header
              ><div class="contract-dialog__section-header">
                <ArtSectionTitle :show-line="false">合同附件</ArtSectionTitle>
                <div class="contract-dialog__section-actions" aria-label="合同附件操作">
                  <ArtUploadFile
                    title="上传附件"
                    :resource-tenant-id="form.data.tenantId || ''"
                    :disabled="!canEditSensitiveField('attachments')"
                    :show-file-list="false"
                    :show-tip="false"
                    inline
                    @resource-change="handleAttachmentUpload"
                  />
                </div> </div
            ></template>
            <ArtTable
              :data="form.data.attachments"
              :columns="attachmentColumns"
              :pagination="undefined"
              :show-table-header="false"
              empty-height="160px"
            />
          </ArtSectionCard>
        </template>
      </ArtForm>
    </div>

    <template #footer="{ loading, api }">
      <div class="contract-dialog__footer">
        <ElButton :disabled="loading" @click="api.handleClose()">取消</ElButton>
        <ElButton
          :loading="loading && submitMode === 'save'"
          @click="handleFooterConfirm(api, 'save')"
        >
          保存
        </ElButton>
        <ElButton
          v-if="
            !form.data.id ||
            form.data.contractStatus === 'draft' ||
            form.data.contractStatus === 'rejected'
          "
          v-auth="'TmsContract:Submit'"
          type="primary"
          :loading="loading && submitMode === 'submit'"
          @click="handleFooterConfirm(api, 'submit')"
        >
          提交审核
        </ElButton>
      </div>
    </template>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import BusinessAttachmentRowActions from '@/components/business/business-attachment-row-actions/index.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useDraftAttachmentRemoval } from '@/hooks/core/useDraftAttachmentRemoval'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import { cloneDeep, omit } from 'lodash-es'
  import type { FormRules } from 'element-plus'
  import { ElButton, ElMessage, ElMessageBox } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { attachmentTableLink } from '@/components/core/media/art-file-viewer/table-link'
  import type { ColumnOption } from '@/types'
  import { formatNameCodeOption } from '@/utils/form'
  import {
    addContract,
    editContract,
    fetchCarrierOptions,
    fetchContractDetail,
    fetchCustomerOptions,
    submitContractForApproval
  } from '@tms/api'
  import { useUserStore } from '@/store/modules/user'
  import { getFileExtension } from '@/utils/file'
  import { canEditField, canViewField, getFieldAccess } from '@/utils/field-permission'
  import { usesCarrierParty } from './contract-business-type'
  import ContractTransportDetails from './contract-transport-details.vue'
  import { carrierSelections } from '../../carrier/modules/carrier-selection'

  defineOptions({ name: 'TmsContractDialog' })

  type Contract = Api.Tms.BasicData.Contract
  type ContractAttachment = Api.Tms.BasicData.ContractAttachment
  type ContractTransportDetail = Api.Tms.BasicData.ContractTransportDetail
  type ContractFieldKey = Api.Tms.BasicData.ContractFieldKey
  type FieldAccessLevel = Api.Tms.BasicData.FieldAccessLevel
  type CarrierOption = Api.Tms.BasicData.CarrierOption
  type CustomerOption = Api.Tms.BasicData.CustomerOption
  type SubmitMode = 'save' | 'submit'
  type FooterApi = Pick<ArtDialogExpose<Contract | undefined>, 'handleConfirm'>

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: (props?: string | string[]) => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  interface FormGroup {
    data: Contract
    items: ComputedRef<FormItem[]>
    rules: FormRules<Contract>
    carrierOptions: CarrierOption[]
    customerOptions: CustomerOption[]
  }

  interface Emits {
    (event: 'success', type: 'add' | 'edit'): void
  }

  const emit = defineEmits<Emits>()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const contextCustomerId = ref<string>()
  const contextCustomerTenantId = ref<string>()
  const activeWriteTenantId = ref<string>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const activeTab = ref('baseSection')
  const dialogRef = ref<ArtDialogExpose<Contract | undefined>>()
  const formRef = ref<FormExpose>()
  const transportDetailsRef = ref<InstanceType<typeof ContractTransportDetails>>()
  const selectedCarrier = ref<CarrierOption[]>([])
  const contractNumber = useDocumentNumberRule('tms.contract')
  const submitMode = ref<SubmitMode>('save')

  const sensitiveFieldFallback = computed<FieldAccessLevel>(() =>
    form.data.id ? 'hidden' : 'edit'
  )
  const canViewSensitiveField = (field: ContractFieldKey): boolean =>
    canViewField(form.data.fieldAccess, field, sensitiveFieldFallback.value)
  const canEditSensitiveField = (field: ContractFieldKey): boolean =>
    canEditField(form.data.fieldAccess, field, sensitiveFieldFallback.value)
  const transportDetailsPricingAccess = computed(() =>
    getFieldAccess(form.data.fieldAccess, 'transportDetailsPricing', sensitiveFieldFallback.value)
  )
  const canEditTransportDetails = computed(() => canEditSensitiveField('transportDetailsPricing'))

  const billingMethodOptions = computed(() => getDictMap.value.tmsContractBillingMethod ?? [])
  const contractCategoryOptions = computed(() => getDictMap.value.tmsContractCategory ?? [])
  const businessTypeOptions = computed(() => getDictMap.value.tmsContractBusinessType ?? [])
  const transportModeOptions = computed(() => getDictMap.value.tmsContractTransportMode ?? [])
  const cargoUnitOptions = computed(() => getDictMap.value.tmsCargoUnit ?? [])
  const billingUnitOptions = computed(() =>
    cargoUnitOptions.value.filter((item) => {
      if (form.data.billingMethod === 'by_weight') return ['kg', 'ton'].includes(item.value)
      if (form.data.billingMethod === 'by_volume')
        return ['cubic_meter', 'liter'].includes(item.value)
      return (
        form.data.billingMethod === 'by_vehicle' &&
        !['kg', 'ton', 'cubic_meter', 'liter'].includes(item.value)
      )
    })
  )
  const carrierColumns: DataSelectColumn[] = [
    { prop: 'carrierCode', label: '承运商编码', minWidth: 140 },
    { prop: 'companyName', label: '公司名称', minWidth: 200 },
    {
      prop: 'carrierTypes',
      label: '承运商类型',
      minWidth: 140,
      formatter: (record) => {
        const row = record as CarrierOption
        return (
          carrierSelections(row.carrierTypes, row.carrierType)
            .map((value) => userStore.getDictLabelByValue('tmsCarrierType', value, value))
            .join('、') || '-'
        )
      }
    },
    {
      prop: 'dispatchChannels',
      label: '调度渠道',
      minWidth: 120,
      formatter: (record) => {
        const row = record as CarrierOption
        return (
          carrierSelections(row.dispatchChannels, row.dispatchChannel)
            .map((value) =>
              userStore.getDictLabelByValue('tmsCarrierDispatchChannel', value, value)
            )
            .join('、') || '-'
        )
      }
    },
    {
      prop: 'parentUnitName',
      label: '上级单位',
      minWidth: 180,
      formatter: (record) => (record as CarrierOption).parentUnitName || '-'
    }
  ]

  const fetchCarrierRows = async (params: DataSelectFetchParams) => {
    const result = await fetchCarrierOptions({
      tenantId: activeWriteTenantId.value,
      companyName: params.keyword,
      maxRows: 1000
    })
    const rows = result.data ?? []
    const from = (params.page - 1) * params.pageSize
    return {
      data: rows.slice(from, from + params.pageSize),
      total: rows.length,
      error: result.error
    }
  }
  const completionOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true'
    }))
  )

  const createInitialForm = (): Contract => ({
    id: undefined,
    contractNo: '',
    contractName: '',
    contractStatus: 'draft',
    paperContractNo: '',
    mnemonicCode: '',
    contractCategory: 'annual_framework',
    transportMode: 'road',
    businessContractType: 'customer',
    customerId: null,
    carrierId: null,
    contactName: '',
    waybillNo: '',
    customerSignatory: '',
    billingMethod: '',
    billingUnit: '',
    contractAmount: null,
    transportUnitPrice: null,
    roadConsumptionRate: null,
    lossDeductionPrice: null,
    signTime: '',
    effectiveDate: null,
    expiryDate: null,
    isCompleted: false,
    agreedTransportQuantity: null,
    transportRoute: '',
    shipperName: '',
    payerName: '',
    consigneeName: '',
    specialTransportRequirements: '',
    otherDeductionTerms: '',
    handler: '',
    contractDescription: '',
    transportDetails: [],
    attachments: []
  })

  const dateProps = {
    type: 'date',
    valueFormat: 'YYYY-MM-DD',
    class: '!w-full'
  }

  const moneyProps = (precision = 2) => ({
    min: 0,
    precision,
    controlsPosition: 'right',
    class: '!w-full'
  })

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createInitialForm(),
    carrierOptions: [],
    customerOptions: [],
    items: computed<FormItem[]>(() => [
      { label: '基础信息', key: 'baseSection', type: 'tab', span: 24 },
      {
        label: '合同编号',
        key: 'contractNo',
        type: 'input',
        props: {
          maxlength: 40,
          ...contractNumber.inputProps(Boolean(form.data.id), '请输入合同编号', true)
        },
        description: contractNumber.description.value
      },
      {
        label: '纸质合同编号',
        key: 'paperContractNo',
        type: 'input',
        props: { maxlength: 60, clearable: true, placeholder: '请输入纸质合同编号' }
      },
      {
        label: '助记码',
        key: 'mnemonicCode',
        type: 'input',
        props: { maxlength: 40, clearable: true, placeholder: '请输入助记码' }
      },
      {
        label: '合同名称',
        key: 'contractName',
        type: 'input',
        span: 16,
        props: { maxlength: 120, placeholder: '请输入合同名称' }
      },
      {
        label: '合同类别',
        key: 'contractCategory',
        type: 'select',
        props: { options: contractCategoryOptions.value, clearable: false, placeholder: '请选择' }
      },
      {
        label: '业务合同分类',
        key: 'businessContractType',
        type: 'radioGroup',
        span: 16,
        disabled: () => Boolean(contextCustomerId.value),
        props: {
          options: businessTypeOptions.value,
          onChange: handleBusinessTypeChange
        }
      },
      {
        label: '运输方式',
        key: 'transportMode',
        type: 'select',
        span: 8,
        props: {
          options: transportModeOptions.value,
          clearable: false,
          placeholder: '请选择运输方式'
        }
      },
      {
        label: '承运商',
        key: 'carrierId',
        type: 'dataSelect',
        description: '从承运商主档选择签约主体。',
        props: {
          mode: 'table',
          apiFn: fetchCarrierRows,
          selectedData: selectedCarrier.value,
          rowKey: 'id',
          labelKey: 'companyName',
          title: '选择承运商',
          subtitle: '按承运商编码或名称搜索，确认签约主体。',
          searchPlaceholder: '搜索承运商编码或名称',
          placeholder: '请选择承运商',
          showSelectedPanel: false,
          showPagination: true,
          pageSize: 10,
          columns: carrierColumns,
          onChange: handleCarrierSelection
        }
      },
      {
        label: '客户/货主',
        key: 'customerId',
        type: 'select',
        disabled: () => Boolean(contextCustomerId.value),
        api: () =>
          fetchCustomerOptions({
            tenantId: activeWriteTenantId.value
          }),
        immediate: false,
        resultField: 'data',
        labelField: 'customerName',
        valueField: 'id',
        labelFn: (option) => formatNameCodeOption(option, 'customerName', 'customerCode'),
        afterFetch: syncCustomerOptions,
        props: {
          clearable: true,
          filterable: true,
          placeholder: '请选择客户或货主',
          onChange: handleCustomerChange
        }
      },
      {
        label: '业务联系人',
        key: 'contactName',
        type: 'select',
        props: {
          options: contactNameOptions.value,
          clearable: true,
          filterable: true,
          allowCreate: true,
          defaultFirstOption: true,
          placeholder: '请选择或输入联系人'
        }
      },
      {
        label: '客户签约人',
        key: 'customerSignatory',
        type: 'input',
        props: { maxlength: 60, clearable: true, placeholder: '请输入客户签约人' }
      },
      {
        label: '经办人',
        key: 'handler',
        type: 'input',
        props: { maxlength: 40, placeholder: '请输入经办人' }
      },
      { label: '计费与履约', key: 'termsSection', type: 'tab', span: 24 },
      {
        label: '计费方式',
        key: 'billingMethod',
        type: 'select',
        props: {
          options: billingMethodOptions.value,
          clearable: true,
          placeholder: '请选择计费方式',
          onChange: () => (form.data.billingUnit = '')
        }
      },
      {
        label: '计费单位',
        key: 'billingUnit',
        type: 'select',
        props: {
          options: billingUnitOptions.value,
          disabled: !form.data.billingMethod,
          filterable: true,
          clearable: true,
          placeholder: '选择与计费方式对应的单位'
        }
      },
      {
        label: '合同金额',
        key: 'contractAmount',
        type: canEditSensitiveField('contractAmount') ? 'number' : 'input',
        hidden: !canViewSensitiveField('contractAmount'),
        props: canEditSensitiveField('contractAmount') ? moneyProps() : { disabled: true }
      },
      {
        label: '运输单价',
        key: 'transportUnitPrice',
        type: canEditSensitiveField('transportUnitPrice') ? 'number' : 'input',
        hidden: !canViewSensitiveField('transportUnitPrice'),
        props: canEditSensitiveField('transportUnitPrice')
          ? { ...moneyProps(4), placeholder: '请输入合同级默认单价' }
          : { disabled: true }
      },
      {
        label: '路耗标准%',
        key: 'roadConsumptionRate',
        type: canEditSensitiveField('roadConsumptionRate') ? 'number' : 'input',
        hidden: !canViewSensitiveField('roadConsumptionRate'),
        props: canEditSensitiveField('roadConsumptionRate')
          ? {
              min: 0,
              max: 100,
              precision: 4,
              controlsPosition: 'right',
              class: '!w-full'
            }
          : { disabled: true }
      },
      {
        label: '亏扣价',
        key: 'lossDeductionPrice',
        type: canEditSensitiveField('lossDeductionPrice') ? 'number' : 'input',
        hidden: !canViewSensitiveField('lossDeductionPrice'),
        props: canEditSensitiveField('lossDeductionPrice') ? moneyProps(4) : { disabled: true }
      },
      {
        label: '约定运输量',
        key: 'agreedTransportQuantity',
        type: 'number',
        props: { ...moneyProps(4), placeholder: '请输入合同约定运输总量' }
      },
      {
        label: '签约日期',
        key: 'signTime',
        type: 'date',
        props: dateProps
      },
      {
        label: '生效日期',
        key: 'effectiveDate',
        type: 'date',
        props: dateProps
      },
      {
        label: '到期日期',
        key: 'expiryDate',
        type: 'date',
        props: dateProps
      },
      {
        label: '是否完成',
        key: 'isCompleted',
        type: 'radioGroup',
        props: { options: completionOptions.value }
      },
      {
        label: '关联运单号',
        key: 'waybillNo',
        type: 'input',
        span: 16,
        props: { maxlength: 60, clearable: true, placeholder: '可选，填写关联运单号' }
      },
      { label: '运输与合同约定', key: 'routeSection', type: 'tab', span: 24 },
      {
        label: '运输路线',
        key: 'transportRoute',
        type: 'input',
        span: 16,
        props: { maxlength: 240, clearable: true, placeholder: '请输入合同约定运输路线' }
      },
      {
        label: '发货方',
        key: 'shipperName',
        type: 'input',
        props: { maxlength: 120, clearable: true, placeholder: '请输入发货方' }
      },
      {
        label: '付款方',
        key: 'payerName',
        type: 'input',
        props: { maxlength: 120, clearable: true, placeholder: '请输入付款方' }
      },
      {
        label: '收货方',
        key: 'consigneeName',
        type: 'input',
        props: { maxlength: 120, clearable: true, placeholder: '请输入收货方' }
      },
      {
        label: '运输特殊要求',
        key: 'specialTransportRequirements',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 1000,
          showWordLimit: true,
          placeholder: '请输入装卸、时效、温控、安全等特殊要求'
        }
      },
      {
        label: '其他扣款约定',
        key: 'otherDeductionTerms',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 1000,
          showWordLimit: true,
          placeholder: '请输入其他扣款或违约约定'
        }
      },
      {
        label: '合同说明摘要',
        key: 'contractDescription',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 1000,
          showWordLimit: true,
          placeholder: '请输入合同说明'
        }
      },
      { key: 'transportDetailsSection', label: '运输明细', type: 'tab', hidden: false },
      { key: 'transportDetails', label: '', type: 'slot', span: 24 },
      {
        key: 'contractAttachmentsSection',
        label: '合同附件',
        type: 'tab',
        hidden: !canViewSensitiveField('attachments')
      },
      { key: 'contractAttachments', label: '', type: 'slot', span: 24 }
    ]),
    rules: {
      contractNo: [
        {
          validator: (_rule, value, callback) => {
            if (contractNumber.manualRequired(Boolean(form.data.id)) && !value) {
              callback(new Error('请输入合同编号'))
              return
            }
            callback()
          },
          trigger: 'blur'
        }
      ],
      contractName: [
        { required: true, message: '请输入合同名称', trigger: 'blur' },
        { min: 2, max: 120, message: '长度应为 2 到 120 个字符', trigger: 'blur' }
      ],
      contractCategory: [{ required: true, message: '请选择合同类别', trigger: 'change' }],
      businessContractType: [{ required: true, message: '请选择业务合同分类', trigger: 'change' }],
      transportMode: [{ required: true, message: '请选择运输方式', trigger: 'change' }],
      carrierId: [
        {
          validator: (_rule, value, callback) => {
            if (usesCarrierParty(form.data.businessContractType) && !value) {
              callback(new Error('请选择承运商'))
              return
            }
            callback()
          },
          trigger: 'change'
        }
      ],
      customerId: [
        {
          validator: (_rule, value, callback) => {
            if (!usesCarrierParty(form.data.businessContractType) && !value) {
              callback(new Error('请选择客户或货主'))
              return
            }
            callback()
          },
          trigger: 'change'
        }
      ],
      billingMethod: [{ required: true, message: '请选择计费方式', trigger: 'change' }],
      signTime: [{ required: true, message: '请选择签约日期', trigger: 'change' }],
      expiryDate: [
        {
          validator: (_rule, value, callback) => {
            const effectiveDate = form.data.effectiveDate
            if (value && effectiveDate && String(value) < String(effectiveDate)) {
              callback(new Error('到期日期不能早于生效日期'))
              return
            }
            callback()
          },
          trigger: 'change'
        }
      ],
      handler: [{ required: true, message: '请输入经办人', trigger: 'blur' }],
      specialTransportRequirements: [
        { max: 1000, message: '运输特殊要求不能超过 1000 个字符', trigger: 'blur' }
      ],
      otherDeductionTerms: [
        { max: 1000, message: '其他扣款约定不能超过 1000 个字符', trigger: 'blur' }
      ],
      contractDescription: [
        { max: 1000, message: '合同说明摘要不能超过 1000 个字符', trigger: 'blur' }
      ]
    }
  })

  const contactNameOptions = computed(() => {
    const options = new Map<string, { label: string; value: string }>()
    const carrier = form.carrierOptions.find((item) => item.id === form.data.carrierId)
    const customer = form.customerOptions.find((item) => item.id === form.data.customerId)
    if (carrier?.contactName) {
      options.set(carrier.contactName, { label: carrier.contactName, value: carrier.contactName })
    }
    if (customer?.contactName) {
      options.set(customer.contactName, {
        label: customer.contactName,
        value: customer.contactName
      })
    }
    if (form.data.contactName) {
      options.set(form.data.contactName, {
        label: form.data.contactName,
        value: form.data.contactName
      })
    }
    return Array.from(options.values())
  })

  const attachmentColumns = computed<ColumnOption<ContractAttachment>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 72 },
    {
      prop: 'name',
      label: '附件名称',
      minWidth: 220,
      showOverflowTooltip: true,
      link: attachmentTableLink
    },
    {
      prop: 'fileType',
      label: '格式类型',
      width: 120,
      dict: { code: 'FILE_EXTENSION_LABEL_MAP', display: 'text' }
    },
    { prop: 'fileSize', label: '附件大小', width: 120 },
    {
      prop: 'operation',
      label: '操作',
      width: canEditSensitiveField('attachments') ? 144 : 104,
      fixed: 'right',
      formatter: (row) => (
        <BusinessAttachmentRowActions
          file={row}
          removable={canEditSensitiveField('attachments')}
          removeLabel="移除附件"
          onRemove={() => void removeAttachment(row)}
        />
      )
    }
  ])

  const getResponseData = <TRecord,>(result: unknown): TRecord[] => {
    if (!result || typeof result !== 'object') return []
    const data = (result as { data?: TRecord[] }).data
    return Array.isArray(data) ? data : []
  }

  const syncCustomerOptions = (result: unknown): unknown => {
    form.customerOptions = getResponseData<CustomerOption>(result)
    return result
  }

  const handleBusinessTypeChange = (): void => {
    if (contextCustomerId.value) return
    void nextTick(() => formRef.value?.clearValidate(['carrierId', 'customerId']))
  }

  const handleCarrierSelection = (_value: unknown, rows: DataSelectRecord[]): void => {
    const carrier = rows[0] as CarrierOption | undefined
    selectedCarrier.value = carrier ? [carrier] : []
    form.carrierOptions = carrier ? [carrier] : []
    form.data.carrierId = carrier?.id || null
    form.data.carrier = carrier || null
    form.data.contactName = carrier?.contactName || ''
    void nextTick(() => formRef.value?.clearValidate('carrierId'))
  }

  const handleCustomerChange = (customerId?: string): void => {
    const customer = form.customerOptions.find((item) => item.id === customerId)
    Object.assign(form.data, {
      contactName: customer?.contactName || '',
      customerSignatory: customer?.contactName || form.data.customerSignatory || ''
    })
  }

  const replaceForm = (data: Contract): void => {
    Object.assign(form.data, createInitialForm(), cloneDeep(toRaw(data)))
    selectedCarrier.value = data.carrier ? [data.carrier] : []
    form.carrierOptions = data.carrier ? [data.carrier] : []
    form.data.contractStatus ??= 'draft'
    form.data.businessContractType ??= 'customer'
    form.data.contractCategory ||= 'annual_framework'
    form.data.transportMode ||= 'road'
    form.data.isCompleted ??= false
    form.data.transportDetails ??= []
    form.data.attachments ??= []
  }

  const resetForm = async (): Promise<void> => {
    replaceForm(createInitialForm())
    submitMode.value = 'save'
    await nextTick()
    formRef.value?.clearValidate()
  }

  const normalizeNumber = (value?: number | string | null): number | null => {
    if (value === null || value === undefined || value === '') return null
    const numberValue = Number(value)
    return Number.isNaN(numberValue) ? null : numberValue
  }

  const normalizePayload = (): Contract => {
    const payload = omit(cloneDeep(toRaw(form.data)), [
      'tenantId',
      'carrier',
      'customer',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime'
    ]) as Contract

    if (!payload.contractNo) delete payload.contractNo
    const normalized: Contract = {
      ...payload,
      contractStatus: payload.contractStatus || 'draft',
      customerId: normalizeNullableText(payload.customerId),
      carrierId: normalizeNullableText(payload.carrierId),
      billingUnit: normalizeNullableText(payload.billingUnit),
      paperContractNo: normalizeNullableText(payload.paperContractNo),
      mnemonicCode: normalizeNullableText(payload.mnemonicCode),
      contactName: normalizeNullableText(payload.contactName),
      waybillNo: normalizeNullableText(payload.waybillNo),
      customerSignatory: normalizeNullableText(payload.customerSignatory),
      contractAmount: normalizeNumber(payload.contractAmount),
      transportUnitPrice: normalizeNumber(payload.transportUnitPrice),
      roadConsumptionRate: normalizeNumber(payload.roadConsumptionRate),
      lossDeductionPrice: normalizeNumber(payload.lossDeductionPrice),
      effectiveDate: normalizeNullableText(payload.effectiveDate),
      expiryDate: normalizeNullableText(payload.expiryDate),
      agreedTransportQuantity: normalizeNumber(payload.agreedTransportQuantity),
      transportRoute: normalizeNullableText(payload.transportRoute),
      shipperName: normalizeNullableText(payload.shipperName),
      payerName: normalizeNullableText(payload.payerName),
      consigneeName: normalizeNullableText(payload.consigneeName),
      specialTransportRequirements: normalizeNullableText(payload.specialTransportRequirements),
      otherDeductionTerms: normalizeNullableText(payload.otherDeductionTerms),
      contractDescription: normalizeNullableText(payload.contractDescription),
      transportDetails: (payload.transportDetails ?? []).map(normalizeTransportDetail),
      attachments: payload.attachments ?? []
    }

    if (form.data.id) {
      if (!canEditSensitiveField('contractAmount')) delete normalized.contractAmount
      if (!canEditSensitiveField('transportUnitPrice')) delete normalized.transportUnitPrice
      if (!canEditSensitiveField('roadConsumptionRate')) delete normalized.roadConsumptionRate
      if (!canEditSensitiveField('lossDeductionPrice')) delete normalized.lossDeductionPrice
      if (!canEditSensitiveField('transportDetailsPricing')) {
        delete (normalized as Partial<Contract>).transportDetails
      }
      if (!canEditSensitiveField('attachments')) delete normalized.attachments
    }
    return normalized
  }

  const normalizeTransportDetail = (detail: ContractTransportDetail): ContractTransportDetail => ({
    cargoId: normalizeNullableText(detail.cargoId),
    cargoDescription: String(detail.cargoDescription ?? '').trim(),
    cargoCode: String(detail.cargoCode ?? '').trim(),
    contractQuantity: Number(detail.contractQuantity ?? 0),
    unit: String(detail.unit ?? '').trim(),
    transportUnitPrice: Number(detail.transportUnitPrice ?? 0),
    freight: Number(detail.freight ?? 0)
  })

  const validateTransportDetails = async (): Promise<boolean> => {
    if (!canEditTransportDetails.value) return true
    activeTab.value = 'transportDetailsSection'
    await nextTick()
    const tableValidation = await transportDetailsRef.value?.validate()
    if (tableValidation?.firstError) ElMessage.warning(tableValidation.firstError.message)
    if (!tableValidation || tableValidation.valid) return true
    return false
  }

  const handleSubmit = async (): Promise<boolean> => {
    if (!form.data.id && form.data.tenantId !== activeWriteTenantId.value) {
      ElMessage.warning('租户范围已变化，请重新选择目标租户后新增合同')
      return false
    }
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    if (!(await validateTransportDetails())) return false

    try {
      const payload = normalizePayload()
      const type = form.data.id ? 'edit' : 'add'
      if (type === 'edit') {
        await editContract(payload)
      } else {
        const response = await addContract(payload)
        payload.id = response.data?.id
        form.data.id = response.data?.id
      }
      emit('success', type)
      if (submitMode.value === 'submit') {
        try {
          await submitContractForApproval(payload)
        } catch (error) {
          notifyFriendlyError(
            error,
            '合同已保存为草稿，但审批未发起。请检查运输合同审批流程是否已发布并启用后重试。'
          )
          if (hasAuth('WorkflowDefinition:Add')) {
            try {
              await ElMessageBox.confirm(
                '合同已保存为草稿。可前往流程管理，基于“运输合同审批”模板配置并发布审批流程。',
                '审批未发起',
                { confirmButtonText: '前往流程管理', cancelButtonText: '稍后处理', type: 'warning' }
              )
              await router.push({
                path: '/workflow/definition',
                query: { designer: 'new', template: 'transport-contract' }
              })
            } catch {
              // 用户选择稍后处理，草稿仍可重新提交。
            }
          }
          return false
        }
      }
      return true
    } catch (error) {
      notifyFriendlyError(error, '合同保存或提审失败，请检查状态和网络后重试')
      return false
    }
  }

  const handleFooterConfirm = async (api: FooterApi, mode: SubmitMode): Promise<void> => {
    submitMode.value = mode
    await api.handleConfirm()
  }

  const handleOpen = async (
    row?: Contract,
    options?: { customerId?: string; customerTenantId?: string }
  ): Promise<void> => {
    activeTab.value = 'baseSection'
    contextCustomerId.value = options?.customerId
    contextCustomerTenantId.value = options?.customerTenantId
    const targetTenantId =
      row?.tenantId || contextCustomerTenantId.value || defaultWriteTenantId.value
    activeWriteTenantId.value = targetTenantId || undefined
    if (!row?.id && !targetTenantId) {
      ElMessage.warning('无法确定新增合同的目标租户，请刷新后重试')
      return
    }
    await resetForm()
    if (!row?.id) form.data.tenantId = targetTenantId ?? undefined
    if (contextCustomerId.value && !row?.id) {
      form.data.businessContractType = 'customer'
      form.data.customerId = contextCustomerId.value
    }
    await dialogRef.value?.handleOpen(row, {
      title: row?.id ? '编辑合同' : '新增合同',
      subtitle: '维护合同相对方、履约条款、运输明细和附件',
      contentMaxHeight: '78vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await Promise.all([
            userStore.ensureDictLoaded('tmsCarrierType'),
            userStore.ensureDictLoaded('tmsCarrierDispatchChannel')
          ])
          if (row?.id) {
            const [, detailResponse] = await Promise.all([
              contractNumber.loadRule(),
              fetchContractDetail(row.id)
            ])
            if (!detailResponse.data) {
              ElMessage.warning('合同不存在或已无权访问')
              await api.handleClose(true)
              return
            }
            replaceForm(detailResponse.data)
            form.data.tenantId = targetTenantId ?? undefined
            if (contextCustomerId.value && form.data.customerId !== contextCustomerId.value) {
              ElMessage.warning('合同所属客户与当前客户不一致')
              await api.handleClose(true)
              return
            }
          } else {
            await contractNumber.loadRule()
          }

          await nextTick()
          await formRef.value?.reloadOptions()
        } catch {
          await api.handleClose(true)
        } finally {
          await nextTick()
          formRef.value?.clearValidate()
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  const handleAttachmentUpload = (resources: Api.DataCenter.Resources.ResourceListItem[]): void => {
    const resource = resources[0]
    if (!resource) return
    if (!canEditSensitiveField('attachments')) return
    if (!resource.url) return
    if ((form.data.attachments ?? []).some((attachment) => attachment.url === resource.url)) {
      ElMessage.info('该附件已在当前合同中，无需重复添加')
      return
    }

    const fileName = resource.originName || resource.objectName || '附件'
    form.data.attachments = [
      ...(form.data.attachments ?? []),
      {
        name: fileName,
        url: resource.url,
        fileType: getFileExtension(fileName, resource.suffix),
        fileSize: resource.sizeInfo
      }
    ]
    ElMessage.success('附件已添加')
  }

  const removeAttachment = useDraftAttachmentRemoval<ContractAttachment>({
    getAttachments: () => form.data.attachments,
    setAttachments: (rows) => {
      form.data.attachments = rows
    },
    canRemove: () => canEditSensitiveField('attachments'),
    getContext: () => [form.data.id, form.data.tenantId]
  })

  defineExpose({
    handleOpen,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .contract-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;

    &__section {
      min-width: 0;
      padding: 16px;
    }

    &__section-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;
      margin-bottom: var(--art-space-3);

      :deep(.art-section-title) {
        min-width: 0;
        margin: 0;
      }
    }

    &__section-actions {
      display: flex;
      flex: none;
      flex-wrap: nowrap;
      gap: var(--art-space-2);
      align-items: center;
      white-space: nowrap;
    }

    &__footer {
      display: flex;
      justify-content: flex-end;
      width: 100%;
    }

    @media (width <= 680px) {
      :deep(.art-form .el-col) {
        flex: 0 0 100%;
        max-width: 100%;
      }

      :deep(.art-form .el-form-item) {
        display: block;
      }

      :deep(.art-form .el-form-item__label) {
        justify-content: flex-start;
        width: 100% !important;
        height: auto;
        margin-bottom: 6px;
      }

      :deep(.art-form .el-form-item__content) {
        margin-left: 0 !important;
      }

      &__section-header {
        grid-template-columns: 1fr;
      }

      &__section-actions,
      &__footer {
        flex-wrap: wrap;
      }

      &__section-actions {
        justify-content: flex-start;
      }
    }
  }
</style>
