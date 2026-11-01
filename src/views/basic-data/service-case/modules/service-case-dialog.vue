<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div
      class="mb-4 rounded-md bg-[var(--el-color-primary-light-9)] px-4 py-3 text-sm text-[var(--el-text-color-primary)]"
    >
      服务单号由系统保存时生成，每月重置，使用 3 位流水码。
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
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { storeToRefs } from 'pinia'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    addServiceCase,
    editServiceCase,
    type ServiceCaseInput,
    type ServiceCaseRecord
  } from '@tms/api'
  import { useBasicRecordTenant } from '../../modules/basic-record-tenant'

  defineOptions({ name: 'TmsServiceCaseDialog' })

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { needsTenantChoice, tenantField, selectedTenantId } = useBasicRecordTenant()
  const dialogRef = ref<ArtDialogExpose<ServiceCaseRecord | undefined>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('baseSection')
  const editId = ref<string>()
  const initialForm = (): ServiceCaseInput => ({
    tenantId: selectedTenantId.value,
    serviceType: 'complaint',
    complaintTypes: [],
    title: '',
    waybillNo: null,
    contactName: '',
    contactPhone: '',
    content: '',
    attachments: [],
    remark: null,
    status: 'pending'
  })
  const form = ref<ServiceCaseInput>(initialForm())
  const serviceTypeOptions = computed(() => getDictMap.value.tmsServiceType ?? [])
  const complaintTypeOptions = computed(() => getDictMap.value.tmsComplaintType ?? [])
  const statusOptions = computed(() => getDictMap.value.tmsServiceCaseStatus ?? [])

  const formItems = computed<FormItem[]>(() => [
    ...(!editId.value ? tenantField.value : []),
    { label: '基础信息', key: 'baseSection', type: 'tab' },
    {
      label: '服务类型',
      key: 'serviceType',
      type: 'segment',
      props: { options: serviceTypeOptions.value }
    },
    {
      label: '投诉类型',
      key: 'complaintTypes',
      type: 'select',
      span: 16,
      props: {
        options: complaintTypeOptions.value,
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        placeholder: '可选择多个问题类型'
      }
    },
    { label: '标题', key: 'title', type: 'input', span: 16, props: { maxlength: 120 } },
    {
      label: '运单号',
      key: 'waybillNo',
      type: 'input',
      props: { clearable: true, placeholder: '选填关联运单号' }
    },
    { label: '联系人', key: 'contactName', type: 'input', props: { maxlength: 80 } },
    { label: '联系人手机号', key: 'contactPhone', type: 'input', props: { maxlength: 11 } },
    { label: '内容与处理', key: 'contentSection', type: 'tab' },
    {
      label: '内容',
      key: 'content',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 5, maxlength: 3000, showWordLimit: true }
    },
    {
      label: '附件',
      key: 'attachments',
      span: 24,
      type: 'uploadFile',
      props: {
        resourceTenantId: form.value.tenantId || '',
        title: '选择或拖入附件',
        limit: 10,
        fileSize: 5 * 1024 * 1024,
        multiple: true
      }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    },
    {
      label: '处理状态',
      key: 'status',
      type: 'segment',
      span: 24,
      props: { options: statusOptions.value, disabled: !editId.value }
    }
  ])

  const rules = computed<FormRules<ServiceCaseInput>>(() => ({
    tenantId:
      needsTenantChoice.value && !editId.value
        ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
        : [],
    serviceType: [{ required: true, message: '请选择服务类型', trigger: 'change' }],
    complaintTypes:
      form.value.serviceType === 'complaint'
        ? [
            {
              type: 'array',
              required: true,
              min: 1,
              message: '请选择至少一个投诉类型',
              trigger: 'change'
            }
          ]
        : [],
    title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
    contactName: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
    contactPhone: [
      { required: true, message: '请输入联系人手机号', trigger: 'blur' },
      { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }
    ],
    content: [{ required: true, message: '请输入投诉或咨询内容', trigger: 'blur' }]
  }))

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    const payload: ServiceCaseInput = {
      ...form.value,
      title: form.value.title.trim(),
      waybillNo: normalizeNullableText(form.value.waybillNo),
      contactName: form.value.contactName.trim(),
      contactPhone: form.value.contactPhone.trim(),
      content: form.value.content.trim(),
      remark: normalizeNullableText(form.value.remark)
    }
    try {
      if (editId.value) await editServiceCase(editId.value, payload)
      else await addServiceCase(payload)
      emit('success', editId.value ? 'edit' : 'add')
      return true
    } catch (error) {
      notifyFriendlyError(error, '客诉咨询保存失败，请检查填写内容后重试')
      return false
    }
  }

  const handleOpen = async (row?: ServiceCaseRecord): Promise<void> => {
    activeTab.value = 'baseSection'
    editId.value = row?.id
    Object.assign(form.value, initialForm())
    if (row) {
      Object.assign(form.value, {
        tenantId: row.tenantId,
        serviceType: row.serviceType,
        complaintTypes: [...row.complaintTypes],
        title: row.title,
        waybillNo: row.waybillNo,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        content: row.content,
        attachments: [...row.attachments],
        remark: row.remark,
        status: row.status
      })
    }
    await dialogRef.value?.handleOpen(row, {
      title: row ? `编辑投诉咨询 · ${row.serviceNo}` : '新增投诉咨询',
      subtitle: row
        ? '补充内容并更新服务状态。'
        : '完成服务信息后，系统自动分配服务单号并设为待回复。',
      onOpen: async () => {
        await Promise.all(
          ['tmsServiceType', 'tmsComplaintType', 'tmsServiceCaseStatus'].map((code) =>
            userStore.ensureDictLoaded(code)
          )
        )
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
