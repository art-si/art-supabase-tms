<template>
  <ArtDialog
    ref="dialogRef"
    size="xl"
    :loading="detailLoading"
    loading-text="正在读取运输协议…"
    :confirm-disabled="Boolean(editingId) && !detailReady"
    @close="invalidateDetailLoad"
  >
    <ArtAsyncState
      v-if="detailError"
      :error="detailError"
      error-title="运输协议读取失败"
      retryable
      @retry="loadEditDetail"
    />
    <template v-else-if="!editingId || detailReady">
      <div
        class="mb-4 rounded-md bg-[var(--el-color-primary-light-9)] px-4 py-3 text-sm text-[var(--el-text-color-primary)]"
      >
        协议号保存时自动生成；选择司机后，可复用其已认证的证件图片。
      </div>
      <ElAlert
        v-if="driverEvidenceError"
        class="mb-4"
        type="error"
        :closable="false"
        title="司机证件读取失败，暂不能保存协议。请重试，或清除司机后手动补充证件。"
        show-icon
      >
        <ElButton type="primary" link :loading="driverEvidenceLoading" @click="retryDriverEvidence">
          重试读取证件
        </ElButton>
      </ElAlert>
      <ArtForm
        ref="formRef"
        v-model:active-tab="activeTab"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :span="8"
        :gutter="20"
        label-width="118px"
        scroll-to-error
      >
        <template #contentHtml>
          <ArtTiptapEditor
            v-model="form.contentHtml"
            :resource-tenant-id="form.tenantId"
            height="280px"
            placeholder="请输入运输责任、费用及履约约定…"
          />
        </template>
      </ArtForm>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTiptapEditor from '@/components/core/forms/art-tiptap-editor/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { formatVehicleTypeDisplay } from '@/utils/business/vehicle-type-display'
  import {
    addTransportAgreement,
    fetchCustomerOptions,
    editTransportAgreement,
    fetchBasicRecordCarrierOptions,
    fetchTransportAgreementDriverOptions,
    fetchTransportAgreementDriverEvidence,
    fetchTransportAgreementDetail,
    fetchTmsVehicleOptions,
    type TransportAgreementInput,
    type TransportAgreementRecord
  } from '@tms/api'
  import { useBasicRecordTenant } from '../../modules/basic-record-tenant'

  defineOptions({ name: 'TmsTransportAgreementDialog' })
  const props = defineProps<{ customer?: Api.Tms.BasicData.Customer }>()

  type AgreementForm = TransportAgreementInput & {
    carrierName: string
    plateNo: string
    vehicleType: string
    vehicleLengthText: string
    driverName: string
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  onMounted(() => {
    void Promise.all([
      userStore.ensureDictLoaded('tmsTransportAgreementStatus'),
      userStore.ensureDictLoaded('vehicleType')
    ]).catch((error: unknown) => notifyFriendlyError(error, '协议字典加载失败，请刷新页面后重试'))
  })
  const { needsTenantChoice, tenantField, selectedTenantId } = useBasicRecordTenant()
  const activeTab = ref('transportSection')
  const dialogRef = ref<ArtDialogExpose<TransportAgreementRecord | undefined>>()
  const formRef = ref<FormExpose>()
  const editingId = ref('')
  const hydrating = ref(false)
  const carrierLoadVersion = ref(0)
  const vehicleLoadVersion = ref(0)
  const driverLoadVersion = ref(0)
  const driverEvidenceLoading = ref(false)
  const driverEvidenceError = ref(false)
  const detailLoading = ref(false)
  const detailReady = ref(false)
  const detailError = ref('')
  let detailLoadVersion = 0
  let editRow: TransportAgreementRecord | undefined
  const initialForm = (): AgreementForm => ({
    tenantId: props.customer?.tenantId ?? selectedTenantId.value,
    customerId: props.customer?.id ?? null,
    shipperName: props.customer?.customerName ?? '',
    carrierId: '',
    carrierName: '',
    contactPhone: '',
    vehicleId: '',
    plateNo: '',
    vehicleType: '',
    vehicleLengthText: '',
    driverId: null,
    driverName: '',
    startsOn: '',
    endsOn: '',
    contentHtml: '',
    attachments: [],
    idCardImages: [],
    registrationImages: [],
    driverLicenseImages: [],
    roadPermitImages: [],
    partyBRepresentative: null
  })
  const form = ref<AgreementForm>(initialForm())

  watch(
    () => form.value.tenantId,
    async () => {
      if (hydrating.value) return
      ++driverLoadVersion.value
      driverEvidenceLoading.value = false
      driverEvidenceError.value = false
      form.value.carrierId = ''
      if (needsTenantChoice.value) await formRef.value?.reloadOptions('carrierId')
    }
  )
  watch(
    () => form.value.carrierId,
    async (id) => {
      if (hydrating.value) return
      const version = ++carrierLoadVersion.value
      ++driverLoadVersion.value
      driverEvidenceLoading.value = false
      driverEvidenceError.value = false
      Object.assign(form.value, {
        carrierName: '',
        vehicleId: '',
        driverId: null,
        driverName: '',
        idCardImages: [],
        registrationImages: [],
        driverLicenseImages: [],
        roadPermitImages: []
      })
      if (id) {
        const { data } = await fetchBasicRecordCarrierOptions(form.value.tenantId)
        if (version !== carrierLoadVersion.value) return
        const carrier = (data ?? []).find((item) => item.id === id)
        form.value.carrierName = carrier?.companyName ?? ''
      }
      await formRef.value?.reloadOptions('vehicleId')
      if (id) await formRef.value?.reloadOptions('driverId')
    }
  )
  watch(
    () => form.value.vehicleId,
    async (id) => {
      if (hydrating.value) return
      const version = ++vehicleLoadVersion.value
      ++driverLoadVersion.value
      driverEvidenceLoading.value = false
      driverEvidenceError.value = false
      Object.assign(form.value, {
        plateNo: '',
        vehicleType: '',
        vehicleLengthText: '',
        driverId: null,
        driverName: '',
        idCardImages: [],
        registrationImages: [],
        driverLicenseImages: [],
        roadPermitImages: []
      })
      if (!id || !form.value.carrierId) return
      const { data } = await fetchTmsVehicleOptions({ carrierId: form.value.carrierId })
      if (version !== vehicleLoadVersion.value) return
      const vehicle = (data ?? []).find((item) => item.id === id)
      form.value.plateNo = vehicle?.plateNo ?? ''
      form.value.vehicleType = vehicle?.vehicleType ?? ''
      form.value.vehicleLengthText = '保存后按车辆档案读取'
      await formRef.value?.reloadOptions('driverId')
    }
  )
  watch(
    () => form.value.driverId,
    (id) => {
      if (hydrating.value) return
      const version = ++driverLoadVersion.value
      if (form.value.partyBRepresentative === form.value.driverName)
        form.value.partyBRepresentative = null
      Object.assign(form.value, {
        driverName: '',
        idCardImages: [],
        registrationImages: [],
        driverLicenseImages: [],
        roadPermitImages: []
      })
      driverEvidenceError.value = false
      driverEvidenceLoading.value = false
      if (!id) return
      void loadDriverEvidence(id, version)
    }
  )
  const loadDriverEvidence = async (id: string, version: number): Promise<void> => {
    driverEvidenceLoading.value = true
    driverEvidenceError.value = false
    try {
      const { data } = await fetchTransportAgreementDriverEvidence(
        id,
        form.value.vehicleId || undefined
      )
      if (version !== driverLoadVersion.value) return
      if (!data) throw new Error('Driver evidence is empty')
      Object.assign(form.value, {
        driverName: data.driverName,
        partyBRepresentative: data.driverName,
        idCardImages: data.idCardImages.slice(0, 5),
        registrationImages: data.registrationImages.slice(0, 5),
        driverLicenseImages: data.driverLicenseImages.slice(0, 5),
        roadPermitImages: data.roadPermitImages.slice(0, 5)
      })
    } catch {
      if (version === driverLoadVersion.value) driverEvidenceError.value = true
    } finally {
      if (version === driverLoadVersion.value) driverEvidenceLoading.value = false
    }
  }
  const retryDriverEvidence = (): void => {
    if (form.value.driverId && !driverEvidenceLoading.value)
      void loadDriverEvidence(form.value.driverId, ++driverLoadVersion.value)
  }

  const formItems = computed<FormItem[]>(() => [
    ...(props.customer ? [] : tenantField.value),
    { label: '运输信息', key: 'transportSection', type: 'tab', span: 24 },
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
        disabled: Boolean(props.customer?.id) || Boolean(editingId.value),
        placeholder: '请选择关联客户'
      }
    },
    { label: '托运方', key: 'shipperName', type: 'input', span: 12, props: { maxlength: 120 } },
    {
      label: '承运方',
      key: 'carrierId',
      type: 'select',
      span: 12,
      api: () => fetchBasicRecordCarrierOptions(form.value.tenantId),
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      props: { filterable: true, clearable: true, placeholder: '从承运商管理选择' }
    },
    { label: '联系电话', key: 'contactPhone', type: 'input', props: { maxlength: 30 } },
    {
      label: '车牌号',
      key: 'vehicleId',
      type: 'select',
      api: () => fetchTmsVehicleOptions({ carrierId: form.value.carrierId }),
      resultField: 'data',
      labelField: 'plateNo',
      valueField: 'id',
      props: {
        filterable: true,
        clearable: true,
        disabled: !form.value.carrierId,
        placeholder: form.value.carrierId ? '从车辆档案选择' : '请先选择承运方'
      }
    },
    {
      label: '乙方代表人',
      key: 'driverId',
      type: 'select',
      span: 12,
      api: () =>
        fetchTransportAgreementDriverOptions({
          carrierId: form.value.carrierId,
          vehicleId: form.value.vehicleId || undefined
        }),
      immediate: false,
      resultField: 'data',
      labelField: 'driverName',
      valueField: 'id',
      props: {
        filterable: true,
        clearable: true,
        disabled: !form.value.carrierId,
        placeholder: form.value.carrierId ? '从司机管理选择（选填）' : '请先选择承运方'
      }
    },
    {
      label: '车型',
      key: 'vehicleType',
      type: 'text',
      props: {
        emptyText: '选择车辆后自动带入',
        formatter: (value) =>
          value == null || value === ''
            ? '选择车辆后自动带入'
            : formatVehicleTypeDisplay(
                value,
                userStore.getDictItemByValue('vehicleType', typeof value === 'string' ? value : '')
              )
      }
    },
    {
      label: '车长',
      key: 'vehicleLengthText',
      type: 'input',
      props: { disabled: true, placeholder: '选择车辆后自动带入' }
    },
    {
      label: '协议开始时间',
      key: 'startsOn',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', placeholder: '请选择开始时间' }
    },
    {
      label: '协议结束时间',
      key: 'endsOn',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', placeholder: '请选择结束时间' }
    },
    { label: '协议内容', key: 'contentHtml', span: 24 },
    {
      label: '协议附件',
      key: 'attachments',
      type: 'uploadFile',
      span: 24,
      props: {
        title: '选择或拖入协议附件',
        resourceTenantId: form.value.tenantId,
        disabled: !form.value.tenantId,
        limit: 10,
        multiple: true
      }
    },
    { label: '证件附件', key: 'documentsSection', type: 'tab', span: 24 },
    {
      label: '身份证（最多 5 张）',
      key: 'idCardImages',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '身份证',
        size: 104,
        limit: 5,
        multiple: true
      }
    },
    {
      label: '行驶证（最多 5 张）',
      key: 'registrationImages',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '行驶证',
        size: 104,
        limit: 5,
        multiple: true
      }
    },
    {
      label: '驾驶证（最多 5 张）',
      key: 'driverLicenseImages',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '驾驶证',
        size: 104,
        limit: 5,
        multiple: true
      }
    },
    {
      label: '道路运输证（最多 5 张）',
      key: 'roadPermitImages',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '道路运输证',
        size: 104,
        limit: 5,
        multiple: true
      }
    }
  ])
  const rules = computed<FormRules<AgreementForm>>(() => ({
    tenantId: needsTenantChoice.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    shipperName: [{ required: true, message: '请输入托运方', trigger: 'blur' }],
    carrierId: [{ required: true, message: '请选择承运方', trigger: 'change' }],
    contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
    vehicleId: [{ required: true, message: '请选择车牌号', trigger: 'change' }],
    startsOn: [{ required: true, message: '请选择协议开始时间', trigger: 'change' }],
    endsOn: [{ required: true, message: '请选择协议结束时间', trigger: 'change' }],
    contentHtml: [{ required: true, message: '请输入协议内容', trigger: 'change' }]
  }))

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (editingId.value && !detailReady.value) return false
      if (driverEvidenceLoading.value || driverEvidenceError.value) {
        ElMessage.warning('司机证件尚未读取成功，请重试或清除司机后补充证件')
        return false
      }
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (form.value.endsOn && form.value.startsOn && form.value.endsOn < form.value.startsOn) {
        ElMessage.warning('协议结束时间不能早于开始时间')
        return false
      }
      const payload: TransportAgreementInput = {
        tenantId: form.value.tenantId,
        customerId: form.value.customerId,
        shipperName: form.value.shipperName.trim(),
        carrierId: form.value.carrierId,
        contactPhone: form.value.contactPhone.trim(),
        vehicleId: form.value.vehicleId,
        driverId: form.value.driverId || null,
        startsOn: form.value.startsOn,
        endsOn: form.value.endsOn,
        contentHtml: form.value.contentHtml,
        attachments: form.value.attachments,
        idCardImages: form.value.idCardImages,
        registrationImages: form.value.registrationImages,
        driverLicenseImages: form.value.driverLicenseImages,
        roadPermitImages: form.value.roadPermitImages,
        partyBRepresentative: normalizeNullableText(form.value.partyBRepresentative)
      }
      if (editingId.value) await editTransportAgreement(editingId.value, payload)
      else await addTransportAgreement(payload)
      emit('success', editingId.value ? 'edit' : 'add')
      return true
    } catch (error) {
      notifyFriendlyError(error, '运输协议保存失败，请检查运输信息和证件后重试')
      return false
    }
  }

  const hydrateEditForm = async (row: TransportAgreementRecord, version: number): Promise<void> => {
    hydrating.value = true
    Object.assign(form.value, {
      ...initialForm(),
      tenantId: row.tenantId,
      customerId: row.customerId,
      shipperName: row.shipperName,
      carrierId: row.carrierId,
      carrierName: row.carrierName,
      driverId: row.driverId,
      driverName: row.partyBRepresentative || '',
      contactPhone: row.contactPhone,
      vehicleId: row.vehicleId,
      plateNo: row.plateNo,
      vehicleType: row.vehicleType ?? '',
      vehicleLengthText: row.vehicleLengthM ? `${row.vehicleLengthM} m` : '车辆档案未维护',
      startsOn: row.startsOn || '',
      endsOn: row.endsOn || '',
      contentHtml: row.contentHtml,
      attachments: [...row.attachments],
      idCardImages: [...row.idCardImages],
      registrationImages: [...row.registrationImages],
      driverLicenseImages: [...row.driverLicenseImages],
      roadPermitImages: [...row.roadPermitImages],
      partyBRepresentative: row.partyBRepresentative
    })
    await nextTick()
    if (version === detailLoadVersion) hydrating.value = false
  }
  const invalidateDetailLoad = (): void => {
    ++detailLoadVersion
    editRow = undefined
    detailLoading.value = false
    detailReady.value = false
  }
  const loadEditDetail = async (): Promise<void> => {
    const row = editRow
    if (!row) return
    const version = ++detailLoadVersion
    detailLoading.value = true
    detailReady.value = false
    detailError.value = ''
    try {
      const result = await fetchTransportAgreementDetail(row.id)
      if (version !== detailLoadVersion) return
      if (result.error) throw result.error
      const current = result.data
      if (!current) throw new Error('运输协议不存在或已超出当前租户范围')
      if (
        current.status !== 'pending_signed' ||
        !['draft', 'rejected'].includes(current.approvalStatus)
      ) {
        detailError.value = '协议状态已变化，请刷新列表后重试。'
        return
      }
      await hydrateEditForm(current, version)
      if (version !== detailLoadVersion) return
      detailReady.value = true
      await nextTick()
      await formRef.value?.reloadOptions('carrierId')
      if (version !== detailLoadVersion) return
      await formRef.value?.reloadOptions('vehicleId')
      if (version !== detailLoadVersion) return
      if (current.carrierId) await formRef.value?.reloadOptions('driverId')
      if (version !== detailLoadVersion) return
      formRef.value?.clearValidate()
    } catch {
      if (version === detailLoadVersion) {
        detailReady.value = false
        detailError.value = '运输协议读取失败，请重试或关闭弹窗。'
      }
    } finally {
      if (version === detailLoadVersion) detailLoading.value = false
    }
  }
  const handleOpen = async (row?: TransportAgreementRecord): Promise<void> => {
    ++detailLoadVersion
    editRow = row
    activeTab.value = 'transportSection'
    editingId.value = row?.id ?? ''
    detailReady.value = !row
    detailLoading.value = Boolean(row)
    detailError.value = ''
    hydrating.value = true
    ++driverLoadVersion.value
    driverEvidenceLoading.value = false
    driverEvidenceError.value = false
    Object.assign(form.value, initialForm())
    await nextTick()
    hydrating.value = false
    await dialogRef.value?.handleOpen(row, {
      title: row ? `编辑运输协议 · ${row.agreementNo}` : '新增运输协议',
      subtitle: '填写运输信息和证件，保存后可提交审批。',
      contentMaxHeight: 'calc(100vh - 160px)',
      onOpen: async () => {
        await nextTick()
        if (row) await loadEditDetail()
        else {
          await formRef.value?.reloadOptions('carrierId')
          formRef.value?.clearValidate()
        }
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
