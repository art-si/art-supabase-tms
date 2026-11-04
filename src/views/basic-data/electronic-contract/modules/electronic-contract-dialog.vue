<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div
      class="mb-4 rounded-md bg-[var(--el-color-primary-light-9)] px-4 py-3 text-sm text-[var(--el-text-color-primary)]"
    >
      {{
        editingRecord
          ? `编辑合同 ${editingRecord.contractNo}，保存后仍处于当前审批状态。`
          : '合同号保存时自动生成，按月重置为 3 位流水；新合同先保存为草稿。'
      }}
    </div>
    <ArtForm
      ref="formRef"
      v-model:active-tab="activeTab"
      v-model="form"
      :items="formItems"
      :rules="rules"
      :span="8"
      :gutter="20"
      label-width="112px"
      scroll-to-error
    >
      <template #contentHtml>
        <ArtTiptapEditor
          v-model="form.contentHtml"
          :resource-tenant-id="form.tenantId"
          height="280px"
          placeholder="请输入合同正文与约定条款…"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTiptapEditor from '@/components/core/forms/art-tiptap-editor/index.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    addElectronicContract,
    editElectronicContract,
    fetchCustomerOptions,
    fetchBasicRecordCarrierOptions,
    type ElectronicContractInput,
    type ElectronicContractRecord
  } from '@tms/api'
  import { useBasicRecordTenant } from '../../modules/basic-record-tenant'
  import { calculateSettlementDueDate } from './settlement-due-date'

  defineOptions({ name: 'TmsElectronicContractDialog' })
  const props = defineProps<{ customer?: Api.Tms.BasicData.Customer }>()

  type ContractForm = ElectronicContractInput & {
    dateRange: string[]
    partyBCompany: string
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  const emit = defineEmits<{ success: [action: 'create' | 'edit'] }>()
  const { needsTenantChoice, tenantField, selectedTenantId } = useBasicRecordTenant()
  const activeTab = ref('contractSection')
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const editingRecord = ref<ElectronicContractRecord | null>(null)
  const hydrating = ref(false)
  const settlementCycleOptions = useDictionaryOptions('tmsElectronicContractSettlementCycle')
  const taxRateOptions = useDictionaryOptions<number>('tmsElectronicContractTaxRate', Number)
  const dueDateExample = calculateSettlementDueDate('2026-09-09', 45)
  const initialForm = (): ContractForm => ({
    tenantId: props.customer?.tenantId ?? selectedTenantId.value,
    customerId: props.customer?.id ?? null,
    contractName: '',
    partyACompany: props.customer?.customerName ?? '',
    partyARepresentative: '',
    partyASubject: '',
    partyBCarrierId: '',
    partyBCompany: '',
    partyBRepresentative: '',
    partyBSubject: '',
    startsOn: '',
    endsOn: '',
    dateRange: [],
    settlementCycle: 'natural_month',
    cycleStartDay: null,
    paymentTermDays: 30,
    taxRate: 0.09,
    contentHtml: '',
    attachments: []
  })
  const form = ref<ContractForm>(initialForm())
  const carrierLoadVersion = ref(0)

  watch(
    () => form.value.tenantId,
    async () => {
      if (hydrating.value) return
      form.value.partyBCarrierId = ''
      form.value.partyBCompany = ''
      form.value.partyBRepresentative = ''
      if (needsTenantChoice.value) await formRef.value?.reloadOptions('partyBCarrierId')
    }
  )
  watch(
    () => form.value.partyBCarrierId,
    async (id) => {
      if (hydrating.value) return
      const version = ++carrierLoadVersion.value
      form.value.partyBCompany = ''
      form.value.partyBRepresentative = ''
      if (!id) return
      const { data } = await fetchBasicRecordCarrierOptions(form.value.tenantId)
      if (version !== carrierLoadVersion.value) return
      const carrier = (data ?? []).find((item) => item.id === id)
      form.value.partyBCompany = carrier?.companyName ?? ''
      form.value.partyBRepresentative = carrier?.legalRepresentative || carrier?.contactName || ''
    }
  )

  const formItems = computed<FormItem[]>(() => [
    ...(props.customer || editingRecord.value ? [] : tenantField.value),
    { label: '合同信息', key: 'contractSection', type: 'tab', span: 24 },
    {
      label: '客户/货主',
      key: 'customerId',
      type: 'select',
      api: () => fetchCustomerOptions({ tenantId: form.value.tenantId }),
      labelField: 'customerName',
      valueField: 'id',
      props: {
        filterable: true,
        clearable: true,
        disabled: Boolean(props.customer?.id),
        placeholder: '请选择关联客户'
      },
      description: '关联后可在客户档案中查询此合同。'
    },
    {
      label: '合同名称',
      key: 'contractName',
      type: 'input',
      span: 16,
      props: { maxlength: 120, placeholder: '请输入合同名称' }
    },
    {
      label: '合同有效期',
      key: 'dateRange',
      type: 'date',
      span: 24,
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '起始日期',
        endPlaceholder: '终止日期',
        rangeSeparator: '至'
      }
    },
    { label: '结算与账期', key: 'settlementSection', type: 'divider', span: 24 },
    {
      label: '结算周期',
      key: 'settlementCycle',
      type: 'radioGroup',
      span: 24,
      options: settlementCycleOptions,
      props: { optionType: 'button' },
      help: '自然月为每月 1 日至月末；按月可指定每期起始日；按季度为自然季度。',
      description: '结算周期内的运单应付款，按约定账期统一结算。'
    },
    {
      label: '每期起始日',
      key: 'cycleStartDay',
      type: 'number',
      span: 8,
      hidden: () => form.value.settlementCycle !== 'monthly',
      props: { min: 1, max: 31, step: 1, stepStrictly: true, controlsPosition: 'right' },
      description: '如选 10 日，本期为 10 日至下月 9 日；短月按月末起始，下期开始前一日结束。'
    },
    {
      label: '账期（天）',
      key: 'paymentTermDays',
      type: 'number',
      span: 8,
      props: { min: 1, max: 3600, step: 1, stepStrictly: true, controlsPosition: 'right' },
      help: '从结算周期结束日的下个月 1 日起算，每个月按 30 天；整 30 天落在该月最后一天。',
      description: `例如 8 月 10 日至 9 月 9 日，账期 45 天，应付日为 ${dueDateExample?.slice(5).replace('-', ' 月 ')} 日。`
    },
    {
      label: '税率',
      key: 'taxRate',
      type: 'select',
      span: 8,
      options: taxRateOptions,
      props: { placeholder: '请选择税率' }
    },
    { label: '合同内容', key: 'contentHtml', span: 24 },
    {
      label: '附件',
      key: 'attachments',
      span: 24,
      type: 'uploadFile',
      props: {
        title: '选择或拖入合同附件',
        resourceTenantId: form.value.tenantId,
        disabled: !form.value.tenantId,
        limit: 10,
        multiple: true
      }
    },
    { label: '签署双方', key: 'partySection', type: 'tab', span: 24 },
    { label: '甲方公司', key: 'partyACompany', type: 'input', props: { maxlength: 120 } },
    { label: '甲方代表人', key: 'partyARepresentative', type: 'input', props: { maxlength: 80 } },
    { label: '甲方主体', key: 'partyASubject', type: 'input', props: { maxlength: 120 } },
    {
      label: '乙方承运商',
      key: 'partyBCarrierId',
      type: 'select',
      api: () => fetchBasicRecordCarrierOptions(form.value.tenantId),
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      props: { filterable: true, clearable: true, placeholder: '从承运商管理选择' }
    },
    {
      label: '乙方公司',
      key: 'partyBCompany',
      type: 'input',
      props: { disabled: true, placeholder: '选择承运商后自动带入' }
    },
    { label: '乙方代表人', key: 'partyBRepresentative', type: 'input', props: { maxlength: 80 } },
    { label: '乙方主体', key: 'partyBSubject', type: 'input', props: { maxlength: 120 } }
  ])
  const rules = computed<FormRules<ContractForm>>(() => ({
    tenantId: needsTenantChoice.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    contractName: [{ required: true, message: '请输入合同名称', trigger: 'blur' }],
    dateRange: [
      { type: 'array', required: true, min: 2, message: '请选择合同有效期', trigger: 'change' }
    ],
    settlementCycle: [{ required: true, message: '请选择结算周期', trigger: 'change' }],
    cycleStartDay:
      form.value.settlementCycle === 'monthly'
        ? [
            {
              required: true,
              type: 'number',
              min: 1,
              max: 31,
              message: '每期起始日须为 1 至 31 日',
              trigger: 'change'
            }
          ]
        : [],
    paymentTermDays: [
      { required: true, type: 'number', min: 1, message: '账期须为正整数天', trigger: 'change' }
    ],
    taxRate: [{ required: true, type: 'number', message: '请选择税率', trigger: 'change' }],
    contentHtml: [{ required: true, message: '请输入合同内容', trigger: 'change' }],
    partyACompany: [{ required: true, message: '请输入甲方公司', trigger: 'blur' }],
    partyASubject: [{ required: true, message: '请输入甲方主体', trigger: 'blur' }],
    partyBCarrierId: [{ required: true, message: '请选择乙方承运商', trigger: 'change' }],
    partyBSubject: [{ required: true, message: '请输入乙方主体', trigger: 'blur' }]
  }))

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    if (
      !form.value.dateRange[0] ||
      !form.value.dateRange[1] ||
      form.value.dateRange[1] < form.value.dateRange[0]
    ) {
      return false
    }
    if (!Number.isInteger(form.value.paymentTermDays) || form.value.paymentTermDays < 1) {
      return false
    }
    if (
      form.value.settlementCycle === 'monthly' &&
      (!Number.isInteger(form.value.cycleStartDay) ||
        !form.value.cycleStartDay ||
        form.value.cycleStartDay > 31)
    ) {
      return false
    }
    const payload: ElectronicContractInput = {
      tenantId: form.value.tenantId,
      customerId: form.value.customerId,
      contractName: form.value.contractName.trim(),
      partyACompany: form.value.partyACompany.trim(),
      partyARepresentative: normalizeNullableText(form.value.partyARepresentative),
      partyASubject: form.value.partyASubject.trim(),
      partyBCarrierId: form.value.partyBCarrierId,
      partyBRepresentative: normalizeNullableText(form.value.partyBRepresentative),
      partyBSubject: form.value.partyBSubject.trim(),
      startsOn: form.value.dateRange[0],
      endsOn: form.value.dateRange[1],
      settlementCycle: form.value.settlementCycle,
      cycleStartDay: form.value.settlementCycle === 'monthly' ? form.value.cycleStartDay : null,
      paymentTermDays: form.value.paymentTermDays,
      taxRate: form.value.taxRate,
      contentHtml: form.value.contentHtml,
      attachments: form.value.attachments
    }
    try {
      if (editingRecord.value) {
        await editElectronicContract(editingRecord.value.id, payload)
      } else {
        await addElectronicContract(payload)
      }
      emit('success', editingRecord.value ? 'edit' : 'create')
      return true
    } catch (error) {
      notifyFriendlyError(error, '电子合同保存失败，请检查签约信息与审批状态后重试')
      return false
    }
  }

  const handleOpen = async (record?: ElectronicContractRecord): Promise<void> => {
    editingRecord.value = record ?? null
    activeTab.value = 'contractSection'
    hydrating.value = true
    Object.assign(
      form.value,
      initialForm(),
      record
        ? {
            tenantId: record.tenantId,
            customerId: record.customerId ?? null,
            contractName: record.contractName,
            partyACompany: record.partyACompany,
            partyARepresentative: record.partyARepresentative ?? '',
            partyASubject: record.partyASubject,
            partyBCarrierId: record.partyBCarrierId,
            partyBCompany: record.partyBCompany,
            partyBRepresentative: record.partyBRepresentative ?? '',
            partyBSubject: record.partyBSubject,
            startsOn: record.startsOn,
            endsOn: record.endsOn,
            dateRange: [record.startsOn, record.endsOn],
            settlementCycle: record.settlementCycle,
            cycleStartDay: record.cycleStartDay,
            paymentTermDays: record.paymentTermDays,
            taxRate: record.taxRate,
            contentHtml: record.contentHtml,
            attachments: [...record.attachments]
          }
        : {}
    )
    await nextTick()
    hydrating.value = false
    await dialogRef.value?.handleOpen(undefined, {
      title: record ? '编辑电子合同' : '创建电子合同',
      subtitle: '按合同信息、结算约定、正文与签署双方完成登记。',
      contentMaxHeight: 'calc(100vh - 160px)',
      onOpen: async () => {
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
