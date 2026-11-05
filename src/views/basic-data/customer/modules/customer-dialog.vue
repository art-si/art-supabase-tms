<template>
  <ArtDialog ref="dialogRef" class="tms-customer-dialog" size="xl">
    <ArtEntitySummary
      icon="ri:building-line"
      eyebrow="客户主档"
      :title="form.customerName || '新增客户'"
      :description="form.customerCode || '保存后可维护联系人、财务账户与关联业务'"
    >
      <template #aside
        ><ElTag :type="form.enabled ? 'success' : 'info'">{{
          form.enabled ? '启用' : '停用'
        }}</ElTag></template
      >
    </ArtEntitySummary>
    <ArtForm
      ref="formRef"
      v-model:active-tab="activeTab"
      v-model="form"
      :items="formItems"
      :rules="formRules"
      :span="8"
      :gutter="20"
      label-width="108px"
    >
      <template #addressPicker>
        <ArtAddressPicker
          v-if="canViewCustomerField('addressDetail')"
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
          :disabled="readonly || !canEditCustomerField('addressDetail')"
          label-width="108px"
        />
      </template>
      <template #contacts>
        <CustomerChildRecords
          v-if="form.id && activeTab === 'contactSection'"
          kind="contact"
          :customer-id="form.id"
          :tenant-id="form.tenantId"
          :field-access="form.fieldAccess"
          @changed="handleChildChanged"
        />
      </template>
      <template #finances>
        <CustomerChildRecords
          v-if="form.id && activeTab === 'financeSection'"
          kind="finance"
          :customer-id="form.id"
          :tenant-id="form.tenantId"
          :field-access="form.fieldAccess"
          @changed="handleChildChanged"
        />
      </template>
      <template #relatedContracts
        ><ContractPage
          v-if="form.id && activeTab === 'contractsSection'"
          :customer-id="form.id"
          :customer-tenant-id="form.tenantId"
          embedded
      /></template>
      <template #relatedPrices
        ><CustomerPricePage
          v-if="form.id && activeTab === 'pricesSection'"
          :customer-id="form.id"
          embedded
      /></template>
      <template #relatedWaybills
        ><CustomerBusinessRecords
          v-if="form.id && activeTab === 'waybillsSection'"
          kind="waybill"
          :customer-id="form.id"
      /></template>
      <template #relatedElectronic
        ><ElectronicContractPage
          v-if="form.id && activeTab === 'electronicSection'"
          :customer="form"
          embedded
      /></template>
      <template #relatedAgreements
        ><TransportAgreementPage
          v-if="form.id && activeTab === 'agreementsSection'"
          :customer="form"
          embedded
      /></template>
      <template #relatedStatements
        ><CustomerBusinessRecords
          v-if="form.id && activeTab === 'statementsSection'"
          kind="statement"
          :customer-id="form.id"
      /></template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toTenantSelectOptions } from '@/utils/tenant-display'

  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNullableNumber, normalizeNullableText } from '@/utils/form/normalize'
  import { normalizeCoordinatePair } from '@/utils/geo'

  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import CustomerChildRecords from '@/components/business/customer-child-records/index.vue'
  import CustomerBusinessRecords from './customer-business-records.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { omit } from 'lodash-es'
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { addCustomer, editCustomer, fetchCustomerList } from '@tms/api'
  import type { MasterGroup } from '@/api/master-groups'
  import { fetchRegionOptions } from '@/api/region-options'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { canEditField, canViewField } from '@/utils/field-permission'
  import TreeUtils from '@/utils/tree'
  import { loadAllDocumentPages } from '@/utils/business/document-detail-list'

  defineOptions({ name: 'TmsCustomerDialog' })
  // Shared child editor binds these exact permissions for this page.
  const customerChildPermissions = [
    'TmsCustomer:ContactAdd',
    'TmsCustomer:ContactEdit',
    'TmsCustomer:ContactCopy',
    'TmsCustomer:ContactDelete',
    'TmsCustomer:FinanceAdd',
    'TmsCustomer:FinanceEdit',
    'TmsCustomer:FinanceCopy',
    'TmsCustomer:FinanceDelete'
  ] as const
  void customerChildPermissions
  const ContractPage = defineAsyncComponent(() => import('../../contract/index.vue'))
  const CustomerPricePage = defineAsyncComponent(() => import('../../customer-price/index.vue'))
  const ElectronicContractPage = defineAsyncComponent(
    () => import('../../electronic-contract/index.vue')
  )
  const TransportAgreementPage = defineAsyncComponent(
    () => import('../../transport-agreement/index.vue')
  )
  const { hasAuth } = useAuth()
  const readonly = ref(false)

  type Customer = Api.Tms.BasicData.Customer
  type CustomerForm = Customer & { addressPicker?: undefined; regionPath: string[] }

  export interface CustomerDialogOpenData {
    row?: Customer
    groups: MasterGroup[]
    initialGroupId?: string
    readonly?: boolean
  }

  interface DialogExposeForm {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  const emit = defineEmits<{
    (event: 'success', type: 'add' | 'edit'): void
  }>()

  const { getDictMap } = storeToRefs(useUserStore())
  const tenantScopeStore = useTenantScopeStore()
  const { tenantOptions } = storeToRefs(tenantScopeStore)
  const { defaultWriteTenantId, shouldExposeTenantField } = useTenantScopeFormPolicy()
  const activeTab = ref('baseSection')
  const dialogRef = ref<ArtDialogExpose<CustomerDialogOpenData>>()
  const formRef = ref<DialogExposeForm>()
  const groups = ref<MasterGroup[]>([])
  const groupTree = new TreeUtils({ parentKey: 'parentId' })
  const groupOptions = computed(() =>
    groupTree.listToTree(
      groups.value
        .filter((group) => group.tenantId === form.value.tenantId)
        .map((group) => ({
          id: group.id,
          parentId: group.parentId,
          label: `${group.name} · ${group.code}`,
          value: group.id
        }))
    )
  )
  const tenantChoices = computed(() => toTenantSelectOptions(tenantOptions.value))

  const customerLevelOptions = computed(() => getDictMap.value.tmsCustomerLevel ?? [])
  const customerIndustryOptions = computed(() => getDictMap.value.tmsCustomerIndustry ?? [])
  const customerTagOptions = computed(() => getDictMap.value.tmsCustomerTag ?? [])

  const createInitialForm = (): CustomerForm => ({
    id: undefined,
    tenantId: defaultWriteTenantId.value || undefined,
    parentUnitId: null,
    groupId: null,
    customerCode: '',
    customerName: '',
    industry: '',
    customerLevel: '',
    tags: [],
    region: '',
    regionAdcode: '',
    addressPicker: undefined,
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
    enabled: true,
    contactName: '',
    contactPhone: '',
    contactDepartment: '',
    contactPosition: '',
    contactEmail: '',
    contactQq: '',
    invoiceTitle: '',
    taxNo: '',
    bankName: '',
    bankAccount: '',
    remark: '',
    fieldAccess: {
      contactPhone: 'edit',
      addressDetail: 'edit',
      taxNo: 'edit',
      bankAccount: 'edit'
    },
    isRecordOwner: true
  })

  const form = ref<CustomerForm>(createInitialForm())
  const customerNumber = useDocumentNumberRule('master.customer', () => form.value.tenantId)

  const canViewCustomerField = (field: Api.Tms.BasicData.CustomerFieldKey): boolean =>
    canViewField(form.value.fieldAccess, field)

  const canEditCustomerField = (field: Api.Tms.BasicData.CustomerFieldKey): boolean =>
    canEditField(form.value.fieldAccess, field)

  const formRules = computed<FormRules<CustomerForm>>(() => ({
    tenantId: shouldExposeTenantField.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    customerName: [
      { required: true, message: '请输入客户名称', trigger: 'blur' },
      { min: 2, max: 100, message: '长度应为 2 到 100 个字符', trigger: 'blur' }
    ],
    customerCode: [
      {
        validator: (_rule, value, callback) =>
          customerNumber.manualRequired(Boolean(form.value.id)) && !String(value || '').trim()
            ? callback(new Error('请输入客户编号'))
            : callback(),
        trigger: 'blur'
      },
      { max: 30, message: '客户编号不能超过 30 个字符', trigger: 'blur' }
    ],
    contactPhone: [
      {
        validator: (_rule, value, callback) => {
          if (!canEditCustomerField('contactPhone') || !value) return callback()
          return /^(?:1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/.test(String(value))
            ? callback()
            : callback(new Error('请输入正确的手机号或座机号'))
        },
        trigger: 'blur'
      }
    ],
    contactEmail: [{ type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }],
    postalCode: [{ pattern: /^\d{6}$/, message: '邮编应为 6 位数字', trigger: 'blur' }],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }))

  const parentUnitTree = new TreeUtils({ parentKey: 'parentUnitId' })
  const loadParentUnitOptions = async () => {
    const tenantId = form.value.tenantId
    const currentId = form.value.id ?? ''
    const customers = await loadAllDocumentPages(fetchCustomerList, {})
    const tree = parentUnitTree.listToTree(customers.filter((item) => item.tenantId === tenantId))
    return parentUnitTree.removeNode(tree, currentId).tree
  }
  const baseFormItems = computed<FormItem[]>(() => [
    { label: '客户识别', key: 'baseSection', type: 'tab', span: 24 },
    ...(shouldExposeTenantField.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select' as const,
            options: tenantChoices.value,
            props: {
              disabled: Boolean(form.value.id),
              filterable: true,
              placeholder: '请选择客户所属租户',
              onChange: () => {
                form.value.groupId = null
                form.value.parentUnitId = null
                void formRef.value?.reloadOptions('parentUnitId')
              }
            }
          }
        ]
      : []),
    {
      label: '客户编号',
      key: 'customerCode',
      type: 'input',
      props: {
        maxlength: 30,
        ...customerNumber.inputProps(Boolean(form.value.id), '请输入客户编号')
      },
      description: customerNumber.description.value
    },
    {
      label: '客户名称',
      key: 'customerName',
      type: 'input',
      props: { maxlength: 100, placeholder: '请输入客户名称' }
    },
    {
      label: '客户分组',
      key: 'groupId',
      type: 'treeSelect',
      options: groupOptions.value,
      props: {
        clearable: true,
        filterable: true,
        placeholder: form.value.tenantId ? '请选择客户分组' : '请先选择所属租户'
      },
      description: '选填；分组与左侧导航保持一致。'
    },
    {
      label: '所属行业',
      key: 'industry',
      type: 'select',
      props: {
        options: customerIndustryOptions.value,
        clearable: true,
        placeholder: '请选择所属行业'
      }
    },
    {
      label: '上级单位',
      key: 'parentUnitId',
      type: 'treeSelect',
      api: loadParentUnitOptions,
      immediate: false,
      labelField: 'customerName',
      valueField: 'id',
      labelFn: (option) => {
        const customer = option as Customer
        const code = customer.customerCode ? `（${customer.customerCode}）` : ''
        const status = customer.enabled === false ? ' · 已停用' : ''
        return `${customer.customerName}${code}${status}`
      },
      props: {
        clearable: true,
        filterable: true,
        checkStrictly: true,
        placeholder: '请选择上级客户单位'
      },
      description: '选填；不选择则作为一级客户单位。'
    },
    {
      label: '客户级别',
      key: 'customerLevel',
      type: 'select',
      props: {
        options: customerLevelOptions.value,
        clearable: true,
        placeholder: '请选择客户级别'
      }
    },
    {
      label: '客户标签',
      key: 'tags',
      type: 'select',
      span: 16,
      props: {
        options: customerTagOptions.value,
        multiple: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        maxCollapseTags: 3,
        clearable: true,
        placeholder: '请选择客户标签'
      }
    },
    {
      label: '客户状态',
      key: 'enabled',
      type: 'switch',
      props: { activeText: '启用', inactiveText: '停用', inlinePrompt: true }
    },
    {
      label: '',
      key: 'addressPicker',
      type: 'input',
      span: 24,
      labelWidth: 0,
      hidden: !canViewCustomerField('addressDetail')
    },
    {
      label: '邮编',
      key: 'postalCode',
      type: 'input',
      props: { maxlength: 6, placeholder: '请输入邮编' }
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
    },
    ...relatedItems.value
  ])

  const relatedItems = computed<FormItem[]>(() => {
    if (!form.value.id) return []
    const sections = [
      ['联系人', 'contactSection', 'contacts', true],
      ['财务信息', 'financeSection', 'finances', true],
      ['运输合同', 'contractsSection', 'relatedContracts', hasAuth('TmsContract:View')],
      ['客户协议价', 'pricesSection', 'relatedPrices', hasAuth('TmsCustomerPrice:View')],
      ['运单列表', 'waybillsSection', 'relatedWaybills', hasAuth('TmsLoadedWaybillList:View')],
      ['电子合同', 'electronicSection', 'relatedElectronic', hasAuth('TmsElectronicContract:View')],
      ['运输协议', 'agreementsSection', 'relatedAgreements', hasAuth('TmsTransportAgreement:View')],
      [
        '客户对账',
        'statementsSection',
        'relatedStatements',
        hasAuth('FinanceCustomerSettlement:View')
      ]
    ] as const
    return sections
      .filter((section) => section[3])
      .flatMap(([label, key, contentKey]) => [
        { label, key, type: 'tab', span: 24 },
        { label: '', key: contentKey, span: 24, labelWidth: 0 }
      ])
  })
  const formItems = computed<FormItem[]>(() =>
    baseFormItems.value.map((item) =>
      item.type && item.type !== 'tab' && item.key !== 'addressPicker'
        ? { ...item, props: { ...item.props, disabled: readonly.value || item.props?.disabled } }
        : item
    )
  )
  const handleChildChanged = async (): Promise<void> => {
    if (!form.value.id) return
    const result = await fetchCustomerList({ customerId: form.value.id, from: 0, to: 0 })
    const customer = result.data?.[0]
    if (customer)
      Object.assign(form.value, {
        contactName: customer.contactName,
        contactPhone: customer.contactPhone,
        contactDepartment: customer.contactDepartment,
        contactPosition: customer.contactPosition,
        contactEmail: customer.contactEmail,
        contactQq: customer.contactQq
      })
    emit('success', 'edit')
  }

  const replaceForm = (nextForm: CustomerForm): void => {
    Object.keys(form.value).forEach((key) => delete form.value[key as keyof CustomerForm])
    Object.assign(form.value, nextForm)
  }

  const buildSubmitPayload = (data: CustomerForm): Customer => {
    const { regionPath, ...rawData } = data
    const rawPayload = omit(rawData, [
      'contactName',
      'contactPhone',
      'contactDepartment',
      'contactPosition',
      'contactEmail',
      'contactQq',
      'invoiceTitle',
      'taxNo',
      'bankName',
      'bankAccount'
    ])
    delete rawPayload.addressPicker

    if (data.id && !canEditField(data.fieldAccess, 'addressDetail')) {
      delete rawPayload.region
      delete rawPayload.regionAdcode
      delete rawPayload.addressDetail
      delete rawPayload.longitude
      delete rawPayload.latitude
      delete rawPayload.coordinateSystem
      delete rawPayload.coordinateSource
      delete rawPayload.coordinateStatus
      delete rawPayload.geocodeProvider
      delete rawPayload.geocodedAt
      delete rawPayload.postalCode
    }

    const longitude = normalizeNullableNumber(rawPayload.longitude)
    const latitude = normalizeNullableNumber(rawPayload.latitude)
    const hasCoordinate = normalizeCoordinatePair(longitude, latitude) !== null

    const payload: Customer = {
      ...rawPayload,
      parentUnitId: rawPayload.parentUnitId || null,
      groupId: rawPayload.groupId || null,
      ...(rawPayload.region === undefined ? {} : { region: regionPath.join('/') }),
      regionAdcode: normalizeNullableText(rawPayload.regionAdcode),
      longitude,
      latitude,
      coordinateSystem: hasCoordinate
        ? rawPayload.coordinateSystem || 'gcj02'
        : normalizeNullableText(rawPayload.coordinateSystem),
      coordinateSource: normalizeNullableText(rawPayload.coordinateSource),
      coordinateStatus:
        !hasCoordinate && rawPayload.coordinateStatus === 'located'
          ? 'unconfirmed'
          : hasCoordinate &&
              (!rawPayload.coordinateStatus || rawPayload.coordinateStatus === 'pending')
            ? 'located'
            : rawPayload.coordinateStatus || 'pending',
      geocodeProvider: normalizeNullableText(rawPayload.geocodeProvider),
      geocodedAt: normalizeNullableText(rawPayload.geocodedAt)
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
    }

    if (!payload.customerCode) delete payload.customerCode
    return payload
  }

  const resetForm = async (): Promise<void> => {
    replaceForm(createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    if (readonly.value || !hasAuth(form.value.id ? 'TmsCustomer:Edit' : 'TmsCustomer:Add'))
      return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildSubmitPayload(structuredClone(toRaw(form.value)))
      const type = form.value.id ? 'edit' : 'add'
      if (type === 'edit') await editCustomer(payload, { showErrorMessage: false })
      else await addCustomer(payload, { showErrorMessage: false })
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '客户档案保存失败，请检查填写内容后重试')
      return false
    }
  }

  const handleOpen = async (data: CustomerDialogOpenData): Promise<void> => {
    readonly.value = data.readonly === true || Boolean(data.row?.id && !hasAuth('TmsCustomer:Edit'))
    activeTab.value = 'baseSection'
    await resetForm()
    groups.value = data.groups
    const row = data.row
    const isEdit = Boolean(row?.id)
    if (row) {
      replaceForm({
        ...createInitialForm(),
        ...structuredClone(toRaw(row)),
        tags: [...(row.tags ?? [])],
        regionPath: row.region?.split('/').filter(Boolean) ?? []
      })
    } else if (data.initialGroupId) {
      const selectedGroup = groups.value.find((group) => group.id === data.initialGroupId)
      if (selectedGroup) {
        form.value.tenantId = selectedGroup.tenantId
        form.value.groupId = selectedGroup.id
      }
    }

    await dialogRef.value?.handleOpen(data, {
      title: isEdit ? (readonly.value ? '客户档案' : '编辑客户') : '新增客户',
      subtitle: isEdit
        ? `当前客户：${row?.customerName ?? ''}`
        : '保存客户后，可维护联系人、财务账户和关联业务。',
      showConfirmButton: !readonly.value,
      confirmText: '保存客户',
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await Promise.all([
            tenantScopeStore.loadTenantOptions(),
            customerNumber.loadRule(),
            formRef.value?.reloadOptions('parentUnitId')
          ])
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

  defineExpose({
    handleOpen,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style lang="scss">
  .tms-customer-dialog.is-fullscreen {
    .art-dialog__content > .art-form,
    .art-dialog__content > .art-form > .el-form,
    .art-form__tabs {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
    }

    .art-form__tabs > .el-tabs__header {
      flex: none;
    }

    .art-form__tabs > .el-tabs__content {
      flex: 1 1 auto;
      min-height: 0;
    }

    [data-art-form-tab]:not([data-art-form-tab='baseSection']) {
      height: 100%;

      > .el-row,
      > .el-row > .el-col,
      .el-form-item {
        height: 100%;
        min-height: 0;
      }

      .el-form-item {
        display: flex;
        flex-direction: column;
        margin-bottom: 0;
      }

      .el-form-item__content,
      .art-form-item__content {
        display: flex;
        flex: 1 1 auto;
        width: 100%;
        min-height: 0;
      }

      .art-form-item__content {
        align-self: stretch;
        height: 100%;
      }

      .art-form-item__content > * {
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
      }
    }
  }
</style>
