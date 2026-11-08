<template>
  <ArtDialog ref="dialogRef" size="lg">
    <ElAlert
      class="mb-4"
      type="info"
      :closable="false"
      title="请核对司机身份与所属组织，拉黑原因会与登记时间一同保留。"
    />
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="formItems"
      :rules="rules"
      :span="12"
      :gutter="20"
      label-width="100px"
      scroll-to-error
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { vehicleDriverColumns } from '@/components/business/vehicle-driver-select/columns'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import dayjs from 'dayjs'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import {
    addDriverBlacklist,
    fetchBlacklistDriverCandidates,
    type BlacklistDriverCandidate,
    type BlacklistInput
  } from '@tms/api'
  import { driverOwnershipLabel, driverTypeLabel } from './driver-label'

  defineOptions({ name: 'TmsDriverBlacklistDialog' })

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const selectedDrivers = ref<BlacklistDriverCandidate[]>([])
  const ownershipOptions = useDictionaryOptions('tmsDriverOwnership')
  const driverTypeOptions = useDictionaryOptions('tmsDriverType')
  interface BlacklistForm extends BlacklistInput {
    driverName: string
    phone: string
    organizationName: string
    driverOwnership: string
    driverType: string
    carrierName: string
    companyName: string
    plateNo: string
  }
  const initialForm = (): BlacklistForm => ({
    driverId: '',
    driverName: '',
    phone: '',
    organizationName: '',
    driverOwnership: '',
    driverType: '',
    carrierName: '',
    companyName: '',
    plateNo: '',
    blacklistedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    reason: '',
    remark: null
  })
  const form = ref<BlacklistForm>(initialForm())

  const columns = vehicleDriverColumns('driver')
  const fetchDrivers = async (params: DataSelectFetchParams) => {
    const result = await fetchBlacklistDriverCandidates({
      from: (params.page - 1) * params.pageSize,
      to: params.page * params.pageSize - 1,
      keyword: params.keyword
    })
    return {
      data: result.data,
      total: result.total,
      error: result.error
    }
  }
  function selectDriver(_value: unknown, rows: BlacklistDriverCandidate[]): void {
    const driver = rows[0]
    if (!driver) return
    selectedDrivers.value = rows
    Object.assign(form.value, {
      driverId: driver.id,
      driverName: driver.driverName,
      phone: driver.phone ?? '',
      organizationName: driver.organizationName ?? driver.companyName ?? '',
      driverOwnership: driver.driverOwnership ?? '',
      driverType: driver.driverType ?? '',
      carrierName: driver.carrierName ?? '',
      companyName: driver.companyName ?? '',
      plateNo: driver.plateNo ?? ''
    })
    formRef.value?.clearValidate()
  }

  const formItems = computed<FormItem[]>(() => [
    {
      label: '选择司机',
      key: 'driverId',
      type: 'dataSelect',
      span: 24,
      description: '从司机管理选择，姓名、手机号与所属组织会自动带入。',
      props: {
        mode: 'table',
        apiFn: fetchDrivers,
        selectedData: selectedDrivers.value,
        columns,
        rowKey: 'id',
        labelKey: 'driverName',
        descriptionKey: 'companyName',
        title: '选择司机',
        searchPlaceholder: '搜索司机姓名或手机号',
        placeholder: '从司机管理选择司机',
        emptyText: '没有可选司机',
        emptyDescription: '请先在司机管理中维护司机；已在黑名单中的司机不会重复显示。',
        dialogWidth: 'xl',
        showTableHeader: true,
        showSelectedPanel: false,
        clearable: false,
        onChange: selectDriver
      }
    },
    { label: '司机姓名', key: 'driverName', type: 'input', props: { readonly: true } },
    { label: '手机号', key: 'phone', type: 'input', props: { readonly: true } },
    {
      label: '所属组织',
      key: 'organizationName',
      type: 'input',
      props: { readonly: true }
    },
    {
      label: '司机归属',
      key: 'driverOwnership',
      type: 'text',
      props: {
        formatter: (value) =>
          driverOwnershipLabel(typeof value === 'string' ? value : null, ownershipOptions)
      }
    },
    {
      label: '司机类型',
      key: 'driverType',
      type: 'text',
      props: {
        formatter: (value) =>
          driverTypeLabel(typeof value === 'string' ? value : null, driverTypeOptions)
      }
    },
    { label: '所属承运商', key: 'carrierName', type: 'input', props: { readonly: true } },
    { label: '所属公司', key: 'companyName', type: 'input', props: { readonly: true } },
    { label: '车牌号', key: 'plateNo', type: 'input', props: { readonly: true } },
    {
      label: '拉黑时间',
      key: 'blacklistedAt',
      type: 'date',
      props: { type: 'datetime', valueFormat: 'YYYY-MM-DD HH:mm:ss', placeholder: '选择拉黑时间' }
    },
    {
      label: '拉黑原因',
      key: 'reason',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = computed<FormRules<BlacklistForm>>(() => ({
    driverId: [{ required: true, message: '请从司机管理选择司机', trigger: 'change' }],
    blacklistedAt: [{ required: true, message: '请选择拉黑时间', trigger: 'change' }],
    reason: [{ required: true, message: '请输入拉黑原因', trigger: 'blur' }]
  }))

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    try {
      await addDriverBlacklist({
        driverId: form.value.driverId,
        reason: form.value.reason.trim(),
        remark: normalizeNullableText(form.value.remark),
        blacklistedAt: new Date(form.value.blacklistedAt.replace(' ', 'T')).toISOString()
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '司机黑名单保存失败，请检查填写内容后重试')
      return false
    }
  }

  const handleOpen = async (): Promise<void> => {
    form.value = initialForm()
    selectedDrivers.value = []
    await dialogRef.value?.handleOpen(undefined, {
      title: '新增黑名单',
      subtitle: '登记后司机会暂停接单；解除黑名单时恢复登记前的启用状态。',
      onOpen: async () => {
        await nextTick()
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
