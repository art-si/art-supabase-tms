<template>
  <ArtDialog ref="dialogRef" size="xl">
    <ArtForm
      ref="formRef"
      v-model:active-tab="activeTab"
      v-model="form"
      :items="formItems"
      :rules="formRules"
      :span="8"
      :gutter="20"
      label-width="118px"
    >
      <template #businessLicenseUrl>
        <ArtUploadImage
          v-if="canViewCarrierAttachments"
          v-model="form.businessLicenseUrl"
          title="营业执照"
          :size="104"
          :limit="1"
          :resource-tenant-id="form.tenantId || ''"
          :readonly="!canEditCarrierField('attachments')"
        />
      </template>
      <template #addressPicker>
        <ArtAddressPicker
          v-if="canViewCarrierField('addressDetail')"
          v-model:region-path="form.regionPath"
          v-model:address-detail="form.addressDetail"
          :region-api="fetchRegionOptions"
          :show-coordinate-hint="false"
          :disabled="!canEditCarrierField('addressDetail')"
          label-width="118px"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type { FormRules } from 'element-plus'
  import { omit } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import { addCarrier, editCarrier, fetchCarrierParentOptions } from '@tms/api'
  import { fetchRegionOptions } from '@/api/region-options'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import TreeUtils from '@/utils/tree'
  import { carrierSelections } from '@tms/views/basic-data/carrier/modules/carrier-selection'
  import {
    isReadableFieldAccess,
    canEditField,
    canViewField,
    getFieldAccess
  } from '@/utils/field-permission'

  defineOptions({ name: 'TmsCarrierDialog' })

  type Carrier = Api.Tms.BasicData.Carrier
  type CarrierForm = Carrier & { addressPicker?: undefined; regionPath: string[] }

  interface DialogExposeForm {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  const emit = defineEmits<{
    (event: 'success', type: 'add' | 'edit'): void
  }>()

  const { getDictMap } = storeToRefs(useUserStore())
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const activeTab = ref('baseSection')
  const dialogRef = ref<ArtDialogExpose<Carrier | undefined>>()
  const formRef = ref<DialogExposeForm>()

  const carrierTypeOptions = computed(() => getDictMap.value.tmsCarrierType ?? [])
  const dispatchChannelOptions = computed(() => getDictMap.value.tmsCarrierDispatchChannel ?? [])

  const createInitialForm = (): CarrierForm => ({
    id: undefined,
    parentUnitId: null,
    carrierCode: '',
    companyName: '',
    carrierType: '',
    carrierTypes: [],
    dispatchChannel: 'offline',
    dispatchChannels: ['offline'],
    businessLicenseNo: '',
    taxRegistrationNo: '',
    legalRepresentative: '',
    region: '',
    addressPicker: undefined,
    regionPath: [],
    addressDetail: '',
    postalCode: '',
    enabled: true,
    businessLicenseUrl: '',
    contactName: '',
    contactPhone: '',
    contactDepartment: '',
    contactPosition: '',
    contactEmail: '',
    contactQq: '',
    invoiceTitle: '',
    taxNo: '',
    bankName: '',
    bankAccountName: '',
    bankAccount: '',
    remark: '',
    fieldAccess: {
      contactPhone: 'edit',
      addressDetail: 'edit',
      taxNo: 'edit',
      bankAccount: 'edit',
      attachments: 'edit'
    },
    isRecordOwner: true
  })

  const form = ref<CarrierForm>(createInitialForm())
  const carrierNumber = useDocumentNumberRule('master.carrier', () => form.value.tenantId)

  const canViewCarrierField = (field: Api.Tms.BasicData.CarrierFieldKey): boolean =>
    canViewField(form.value.fieldAccess, field)

  const canEditCarrierField = (field: Api.Tms.BasicData.CarrierFieldKey): boolean =>
    canEditField(form.value.fieldAccess, field)

  const canViewCarrierAttachments = computed(() =>
    isReadableFieldAccess(getFieldAccess(form.value.fieldAccess, 'attachments'))
  )

  const formRules: FormRules<CarrierForm> = {
    companyName: [
      { required: true, message: '请输入公司名称', trigger: 'blur' },
      { min: 2, max: 100, message: '长度应为 2 到 100 个字符', trigger: 'blur' }
    ],
    carrierTypes: [
      { type: 'array', required: true, min: 1, message: '请选择承运商类型', trigger: 'change' }
    ],
    dispatchChannels: [
      { type: 'array', required: true, min: 1, message: '请选择调度渠道', trigger: 'change' }
    ],
    carrierCode: [
      {
        validator: (_rule, value, callback) =>
          carrierNumber.manualRequired(Boolean(form.value.id)) && !String(value || '').trim()
            ? callback(new Error('请输入承运商编码'))
            : callback(),
        trigger: 'blur'
      },
      { max: 30, message: '承运商编码不能超过 30 个字符', trigger: 'blur' }
    ],
    businessLicenseNo: [{ max: 50, message: '营业执照号码不能超过 50 个字符', trigger: 'blur' }],
    taxRegistrationNo: [{ max: 50, message: '税务登记号码不能超过 50 个字符', trigger: 'blur' }],
    legalRepresentative: [{ max: 50, message: '法人代表不能超过 50 个字符', trigger: 'blur' }],
    contactPhone: [
      {
        validator: (_rule, value, callback) => {
          if (!canEditCarrierField('contactPhone') || !value) return callback()
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
  }

  const parentUnitTree = new TreeUtils({ parentKey: 'parentUnitId' })
  const loadParentUnitOptions = async () => {
    const tenantId = form.value.tenantId || defaultWriteTenantId.value
    const currentId = form.value.id ?? ''
    const carriers = await fetchCarrierParentOptions({ tenantId, recordId: currentId || undefined })
    const tree = parentUnitTree.listToTree(carriers)
    return parentUnitTree.removeNode(tree, currentId).tree
  }
  const formItems = computed<FormItem[]>(() => [
    { label: '基础信息', key: 'baseSection', type: 'tab', span: 24 },
    {
      label: '承运商编码',
      key: 'carrierCode',
      type: 'input',
      props: {
        maxlength: 30,
        ...carrierNumber.inputProps(Boolean(form.value.id), '请输入承运商编码')
      },
      description: carrierNumber.description.value
    },
    {
      label: '公司名称',
      key: 'companyName',
      type: 'input',
      props: { maxlength: 100, placeholder: '请输入公司名称' }
    },
    {
      label: '承运商类型',
      key: 'carrierTypes',
      type: 'select',
      props: {
        options: carrierTypeOptions.value,
        multiple: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        clearable: true,
        placeholder: '请选择承运商类型'
      }
    },
    {
      label: '调度渠道',
      key: 'dispatchChannels',
      type: 'select',
      props: {
        options: dispatchChannelOptions.value,
        multiple: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        placeholder: '请选择线上或线下'
      }
    },
    {
      label: '上级单位',
      key: 'parentUnitId',
      type: 'treeSelect',
      api: loadParentUnitOptions,
      immediate: false,
      labelField: 'companyName',
      valueField: 'id',
      labelFn: (option) => {
        const carrier = option as Carrier
        const code = carrier.carrierCode ? `（${carrier.carrierCode}）` : ''
        const status = carrier.enabled === false ? ' · 已停用' : ''
        return `${carrier.companyName}${code}${status}`
      },
      props: {
        clearable: true,
        filterable: true,
        checkStrictly: true,
        placeholder: '请选择上级承运商单位'
      },
      description: '选填；不选择则作为一级承运商单位。'
    },
    {
      label: '营业执照号码',
      key: 'businessLicenseNo',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入营业执照号码' }
    },
    {
      label: '税务登记号码',
      key: 'taxRegistrationNo',
      type: 'input',
      hidden: !canViewCarrierField('taxNo'),
      props: {
        maxlength: 50,
        placeholder: '请输入税务登记号码',
        disabled: !canEditCarrierField('taxNo')
      }
    },
    {
      label: '法人代表',
      key: 'legalRepresentative',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入法人代表' }
    },
    {
      label: '',
      key: 'addressPicker',
      type: 'input',
      span: 24,
      labelWidth: 0,
      hidden: !canViewCarrierField('addressDetail')
    },
    {
      label: '邮编',
      key: 'postalCode',
      type: 'input',
      hidden: !canViewCarrierField('addressDetail'),
      props: {
        maxlength: 6,
        placeholder: '请输入邮编',
        disabled: !canEditCarrierField('addressDetail')
      }
    },
    {
      label: '承运商状态',
      key: 'enabled',
      type: 'switch',
      props: { activeText: '启用', inactiveText: '停用', inlinePrompt: true }
    },
    {
      label: '营业执照',
      key: 'businessLicenseUrl',
      span: 24,
      hidden: !canViewCarrierAttachments.value
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
    { label: '联系人信息', key: 'contactSection', type: 'tab', span: 24 },
    {
      label: '姓名',
      key: 'contactName',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入联系人姓名' }
    },
    {
      label: '手机号码',
      key: 'contactPhone',
      type: 'input',
      hidden: !canViewCarrierField('contactPhone'),
      props: {
        maxlength: 20,
        placeholder: '请输入联系电话',
        disabled: !canEditCarrierField('contactPhone')
      }
    },
    {
      label: '部门',
      key: 'contactDepartment',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入部门' }
    },
    {
      label: '职位',
      key: 'contactPosition',
      type: 'input',
      props: { maxlength: 50, placeholder: '请输入职位' }
    },
    {
      label: 'E-mail',
      key: 'contactEmail',
      type: 'input',
      props: { maxlength: 100, placeholder: '请输入邮箱地址' }
    },
    {
      label: 'QQ',
      key: 'contactQq',
      type: 'input',
      props: { maxlength: 20, placeholder: '请输入 QQ' }
    },
    ...(canViewCarrierField('taxNo') || canViewCarrierField('bankAccount')
      ? [{ label: '财务信息', key: 'financeSection', type: 'tab', span: 24 } satisfies FormItem]
      : []),
    {
      label: '发票抬头',
      key: 'invoiceTitle',
      type: 'input',
      props: { maxlength: 100, placeholder: '请输入发票抬头' }
    },
    {
      label: '纳税人识别号',
      key: 'taxNo',
      type: 'input',
      hidden: !canViewCarrierField('taxNo'),
      props: {
        maxlength: 40,
        placeholder: '请输入纳税人识别号',
        disabled: !canEditCarrierField('taxNo')
      }
    },
    {
      label: '开户行',
      key: 'bankName',
      type: 'input',
      hidden: !canViewCarrierField('bankAccount'),
      props: {
        maxlength: 100,
        placeholder: '请输入开户行',
        disabled: !canEditCarrierField('bankAccount')
      }
    },
    {
      label: '开户名称',
      key: 'bankAccountName',
      type: 'input',
      hidden: !canViewCarrierField('bankAccount'),
      props: {
        maxlength: 100,
        placeholder: '请输入开户名称',
        disabled: !canEditCarrierField('bankAccount')
      }
    },
    {
      label: '银行账号',
      key: 'bankAccount',
      type: 'input',
      span: 16,
      hidden: !canViewCarrierField('bankAccount'),
      props: {
        maxlength: 50,
        placeholder: '请输入银行账号',
        disabled: !canEditCarrierField('bankAccount')
      }
    }
  ])

  const replaceForm = (nextForm: CarrierForm): void => {
    Object.keys(form.value).forEach((key) => delete form.value[key as keyof CarrierForm])
    Object.assign(form.value, nextForm)
  }

  const resetForm = async (): Promise<void> => {
    replaceForm(createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const normalizePayload = (): Carrier => {
    const { regionPath, ...rawPayload } = structuredClone(toRaw(form.value))
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'contactPhone')) {
      delete rawPayload.contactPhone
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'addressDetail')) {
      delete rawPayload.region
      delete rawPayload.addressDetail
      delete rawPayload.postalCode
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'taxNo')) {
      delete rawPayload.taxRegistrationNo
      delete rawPayload.taxNo
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'bankAccount')) {
      delete rawPayload.bankName
      delete rawPayload.bankAccountName
      delete rawPayload.bankAccount
    }
    if (rawPayload.id && !canEditField(rawPayload.fieldAccess, 'attachments')) {
      delete rawPayload.businessLicenseUrl
      delete rawPayload.contractAttachmentUrl
    }
    const payload = omit(rawPayload, [
      'tenantId',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime',
      'driverCount',
      'vehicleCount',
      'signedContract',
      'contractAttachmentUrl',
      'addressPicker',
      'fieldAccess',
      'isRecordOwner'
    ]) as Carrier
    payload.parentUnitId = payload.parentUnitId || null
    payload.carrierType = payload.carrierTypes?.[0] ?? ''
    payload.dispatchChannel = payload.dispatchChannels?.[0] ?? 'offline'
    if (rawPayload.region !== undefined) payload.region = regionPath.join('/')
    if (!payload.carrierCode) delete payload.carrierCode
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
      const payload = normalizePayload()
      const type = form.value.id ? 'edit' : 'add'
      if (type === 'edit') await editCarrier(payload)
      else await addCarrier(payload)
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '承运商保存失败，请检查填写内容后重试')
      return false
    }
  }

  const handleOpen = async (row?: Carrier): Promise<void> => {
    activeTab.value = 'baseSection'
    await resetForm()
    const isEdit = Boolean(row?.id)
    if (row) {
      replaceForm({
        ...createInitialForm(),
        ...structuredClone(toRaw(row)),
        carrierTypes: carrierSelections(row.carrierTypes, row.carrierType),
        dispatchChannels: carrierSelections(row.dispatchChannels, row.dispatchChannel) as (
          'online' | 'offline'
        )[],
        regionPath: row.region?.split('/').filter(Boolean) ?? []
      })
    }

    await dialogRef.value?.handleOpen(row, {
      title: isEdit ? '编辑承运商' : '新增承运商',
      subtitle: '维护承运商基础、联系人和财务信息',
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await Promise.all([
            carrierNumber.loadRule(),
            formRef.value?.reloadOptions('parentUnitId')
          ])
        } finally {
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
