<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div
      class="mb-4 rounded-md bg-[var(--el-color-primary-light-9)] px-4 py-3 text-sm text-[var(--el-text-color-primary)]"
    >
      关联运单后自动带入运输信息；保存服务单后可继续评论与回复。
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
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { h } from 'vue'
  import { storeToRefs } from 'pinia'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import { useUserStore } from '@/store/modules/user'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    addServiceCase,
    editServiceCase,
    fetchServiceCaseWaybillOptions,
    type ServiceCaseWaybillOption,
    type ServiceCaseInput,
    type ServiceCaseRecord
  } from '@tms/api'
  import { useBasicRecordTenant } from '../../modules/basic-record-tenant'

  defineOptions({ name: 'TmsServiceCaseDialog' })

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dispatchModeOptions = useDictionaryOptions('tmsDispatchOperatorMode')
  const { needsTenantChoice, tenantField, selectedTenantId } = useBasicRecordTenant()
  const dialogRef = ref<ArtDialogExpose<ServiceCaseRecord | undefined>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const activeTab = ref('baseSection')
  const editId = ref<string>()
  type Waybill = ServiceCaseWaybillOption
  type ServiceCaseForm = ServiceCaseInput & {
    dispatchWaybillNo: string
    routeName: string
    dispatchMode: string
    plateNo: string
    driverName: string
    driverPhone: string
  }
  const selectedWaybill = ref<Waybill[]>([])
  const initialForm = (): ServiceCaseForm => ({
    tenantId: selectedTenantId.value,
    serviceType: 'complaint',
    complaintTypes: [],
    title: '',
    waybillNo: null,
    waybillId: null,
    dispatchWaybillNo: '',
    routeName: '',
    dispatchMode: '',
    plateNo: '',
    driverName: '',
    driverPhone: '',
    contactName: '',
    contactPhone: '',
    content: '',
    attachments: [],
    remark: null,
    status: 'pending'
  })
  const form = ref<ServiceCaseForm>(initialForm())
  const fetchWaybills = (params: DataSelectFetchParams) => {
    if (!form.value.tenantId) return Promise.resolve({ data: [], total: 0 })
    return fetchServiceCaseWaybillOptions(form.value.tenantId, params)
  }
  const applyWaybill = (_value: unknown, rows: Waybill[]): void => {
    selectedWaybill.value = rows
    const row = rows[0]
    form.value.waybillId = row?.id || null
    form.value.waybillNo = row?.orderNo || null
    form.value.dispatchWaybillNo = row?.waybillNo || ''
    form.value.routeName = row
      ? `${row.originStation || '起点未维护'} → ${row.destinationStation || '终点未维护'}`
      : ''
    form.value.dispatchMode = row?.dispatchMode || ''
    form.value.plateNo = row?.dispatchPlateNo || ''
    form.value.driverName = row?.dispatchDriverName || ''
    form.value.driverPhone = row?.dispatchDriverPhone || ''
  }
  const loadSelectedWaybill = async (): Promise<void> => {
    if (!form.value.waybillId || !form.value.tenantId) return
    const result = await fetchServiceCaseWaybillOptions(form.value.tenantId, {
      keyword: '',
      page: 1,
      pageSize: 1,
      filters: {},
      recordId: form.value.waybillId
    })
    if (result.data?.[0]) applyWaybill(form.value.waybillId, [result.data[0]])
  }
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
      key: 'waybillId',
      type: 'dataSelect',
      span: 16,
      props: {
        mode: 'table',
        apiFn: fetchWaybills,
        selectedData: selectedWaybill.value,
        rowKey: 'id',
        labelKey: 'orderNo',
        descriptionKey: 'waybillNo',
        title: '参选运单',
        subtitle: '来源：运单列表；选择后自动带出调度信息。',
        searchPlaceholder: '搜索运单号或调度运单号',
        placeholder: '选填关联运单',
        clearable: true,
        showSelectedPanel: false,
        showPagination: true,
        columns: [
          { prop: 'orderNo', label: '运单号', minWidth: 150 },
          { prop: 'waybillNo', label: '调度运单号', minWidth: 155 },
          {
            prop: 'dispatchMode',
            label: '调度方式',
            width: 110,
            formatter: (row: Waybill) =>
              h(ArtDictDisplay, {
                dictCode: 'tmsDispatchOperatorMode',
                value: row.dispatchMode,
                display: 'text',
                emptyText: '—'
              })
          },
          {
            prop: 'originStation',
            label: '线路',
            minWidth: 170,
            formatter: (row: Waybill) =>
              `${row.originStation || '—'} → ${row.destinationStation || '—'}`
          },
          { prop: 'dispatchPlateNo', label: '车牌号', width: 125 },
          { prop: 'dispatchDriverName', label: '司机', width: 120 },
          { prop: 'dispatchDriverPhone', label: '手机号', width: 145 }
        ],
        onChange: applyWaybill
      }
    },
    {
      label: '调度运单号',
      key: 'dispatchWaybillNo',
      type: 'text',
      content: () => form.value.dispatchWaybillNo || '—'
    },
    {
      label: '线路',
      key: 'routeName',
      type: 'text',
      span: 16,
      content: () => form.value.routeName || '—'
    },
    {
      label: '调度方式',
      key: 'dispatchMode',
      type: 'text',
      props: {
        emptyText: '—',
        formatter: (value) =>
          getDictionaryDisplayLabel(
            dispatchModeOptions.find((item) => item.value === value),
            value,
            { emptyText: '—' }
          )
      }
    },
    { label: '车牌号', key: 'plateNo', type: 'text', content: () => form.value.plateNo || '—' },
    { label: '司机', key: 'driverName', type: 'text', content: () => form.value.driverName || '—' },
    {
      label: '手机号',
      key: 'driverPhone',
      type: 'text',
      content: () => form.value.driverPhone || '—'
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
      tenantId: form.value.tenantId,
      serviceType: form.value.serviceType,
      complaintTypes: form.value.complaintTypes,
      title: form.value.title.trim(),
      waybillNo: normalizeNullableText(form.value.waybillNo),
      waybillId: form.value.waybillId || null,
      contactName: form.value.contactName.trim(),
      contactPhone: form.value.contactPhone.trim(),
      content: form.value.content.trim(),
      attachments: form.value.attachments,
      remark: normalizeNullableText(form.value.remark),
      status: form.value.status
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
    selectedWaybill.value = []
    Object.assign(form.value, initialForm())
    if (row) {
      Object.assign(form.value, {
        tenantId: row.tenantId,
        serviceType: row.serviceType,
        complaintTypes: [...row.complaintTypes],
        title: row.title,
        waybillNo: row.waybillNo,
        waybillId: row.waybillId || null,
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
      confirmText: row ? '保存修改' : '保存服务单',
      onOpen: async () => {
        await Promise.all(
          ['tmsServiceType', 'tmsComplaintType', 'tmsServiceCaseStatus'].map((code) =>
            userStore.ensureDictLoaded(code)
          )
        )
        await loadSelectedWaybill()
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  watch(
    () => form.value.tenantId,
    (tenantId, previous) => {
      if (tenantId !== previous && !editId.value) applyWaybill(undefined, [])
    }
  )

  defineExpose({ handleOpen })
</script>
