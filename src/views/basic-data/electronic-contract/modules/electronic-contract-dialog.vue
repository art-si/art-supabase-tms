<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div
      class="mb-4 rounded-md bg-[var(--el-color-primary-light-9)] px-4 py-3 text-sm text-[var(--el-text-color-primary)]"
    >
      合同号保存时自动生成，按月重置为 3 位流水；新合同默认待签署。
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
      <template #attachments>
        <ArtUploadFile
          v-model="form.attachments"
          title="选择或拖入合同附件"
          :resource-tenant-id="form.tenantId"
          :disabled="!form.tenantId"
          :limit="10"
          multiple
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
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import {
    addElectronicContract,
    fetchBasicRecordCarrierOptions,
    type ElectronicContractInput
  } from '@tms/api'
  import { useBasicRecordTenant } from '../../modules/basic-record-tenant'

  defineOptions({ name: 'TmsElectronicContractDialog' })

  type ContractForm = ElectronicContractInput & {
    dateRange: string[]
    partyBCompany: string
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const { needsTenantChoice, tenantField, selectedTenantId } = useBasicRecordTenant()
  const activeTab = ref('contractSection')
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const initialForm = (): ContractForm => ({
    tenantId: selectedTenantId.value,
    contractName: '',
    partyACompany: '',
    partyARepresentative: '',
    partyASubject: '',
    partyBCarrierId: '',
    partyBCompany: '',
    partyBRepresentative: '',
    partyBSubject: '',
    startsOn: '',
    endsOn: '',
    dateRange: [],
    contentHtml: '',
    attachments: []
  })
  const form = ref<ContractForm>(initialForm())
  const carrierLoadVersion = ref(0)

  watch(
    () => form.value.tenantId,
    async () => {
      form.value.partyBCarrierId = ''
      form.value.partyBCompany = ''
      form.value.partyBRepresentative = ''
      if (needsTenantChoice.value) await formRef.value?.reloadOptions('partyBCarrierId')
    }
  )
  watch(
    () => form.value.partyBCarrierId,
    async (id) => {
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
    ...tenantField.value,
    { label: '合同信息', key: 'contractSection', type: 'tab', span: 24 },
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
    { label: '合同内容', key: 'contentHtml', span: 24 },
    { label: '附件', key: 'attachments', span: 24 },
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
    const payload: ElectronicContractInput = {
      tenantId: form.value.tenantId,
      contractName: form.value.contractName.trim(),
      partyACompany: form.value.partyACompany.trim(),
      partyARepresentative: normalizeNullableText(form.value.partyARepresentative),
      partyASubject: form.value.partyASubject.trim(),
      partyBCarrierId: form.value.partyBCarrierId,
      partyBRepresentative: normalizeNullableText(form.value.partyBRepresentative),
      partyBSubject: form.value.partyBSubject.trim(),
      startsOn: form.value.dateRange[0],
      endsOn: form.value.dateRange[1],
      contentHtml: form.value.contentHtml,
      attachments: form.value.attachments
    }
    try {
      await addElectronicContract(payload)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '电子合同创建失败，请检查签约信息后重试')
      return false
    }
  }

  const handleOpen = async (): Promise<void> => {
    activeTab.value = 'contractSection'
    Object.assign(form.value, initialForm())
    await dialogRef.value?.handleOpen(undefined, {
      title: '创建电子合同',
      subtitle: '按合同信息、内容与签署双方完成登记。',
      contentMaxHeight: 'calc(100vh - 160px)',
      onOpen: async () => {
        await userStore.ensureDictLoaded('tmsElectronicContractStatus')
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
