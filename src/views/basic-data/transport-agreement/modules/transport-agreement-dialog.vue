<template>
  <ArtDialog ref="dialogRef" size="xl">
    <div
      class="mb-4 rounded-md bg-[var(--el-color-primary-light-9)] px-4 py-3 text-sm text-[var(--el-text-color-primary)]"
    >
      协议号保存时自动生成；承运方来自承运商管理，车辆信息来自车辆档案。
    </div>
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
  import { useUserStore } from '@/store/modules/user'
  import {
    addTransportAgreement,
    editTransportAgreement,
    fetchBasicRecordCarrierOptions,
    fetchTmsVehicleOptions,
    type TransportAgreementInput,
    type TransportAgreementRecord
  } from '@tms/api'
  import { useBasicRecordTenant } from '../../modules/basic-record-tenant'

  defineOptions({ name: 'TmsTransportAgreementDialog' })

  type AgreementForm = TransportAgreementInput & {
    carrierName: string
    plateNo: string
    vehicleType: string
    vehicleLengthText: string
  }
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  onMounted(() => void userStore.ensureDictLoaded('tmsTransportAgreementStatus'))
  const { needsTenantChoice, tenantField, selectedTenantId } = useBasicRecordTenant()
  const activeTab = ref('transportSection')
  const dialogRef = ref<ArtDialogExpose<TransportAgreementRecord | undefined>>()
  const formRef = ref<FormExpose>()
  const editingId = ref('')
  const hydrating = ref(false)
  const carrierLoadVersion = ref(0)
  const vehicleLoadVersion = ref(0)
  const initialForm = (): AgreementForm => ({
    tenantId: selectedTenantId.value,
    shipperName: '',
    carrierId: '',
    carrierName: '',
    contactPhone: '',
    vehicleId: '',
    plateNo: '',
    vehicleType: '',
    vehicleLengthText: '',
    startsOn: '',
    endsOn: '',
    status: 'signed',
    contentHtml: '',
    idCardImages: [],
    registrationImages: [],
    driverLicenseImage: null,
    roadPermitImage: null,
    partyASeal: '',
    partyARepresentative: '',
    partyASignedOn: '',
    partyBSeal: '',
    partyBRepresentative: '',
    partyBSignedOn: ''
  })
  const form = ref<AgreementForm>(initialForm())

  watch(
    () => form.value.tenantId,
    async () => {
      if (hydrating.value) return
      form.value.carrierId = ''
      if (needsTenantChoice.value) await formRef.value?.reloadOptions('carrierId')
    }
  )
  watch(
    () => form.value.carrierId,
    async (id) => {
      if (hydrating.value) return
      const version = ++carrierLoadVersion.value
      form.value.carrierName = ''
      form.value.partyBRepresentative = ''
      form.value.vehicleId = ''
      if (id) {
        const { data } = await fetchBasicRecordCarrierOptions(form.value.tenantId)
        if (version !== carrierLoadVersion.value) return
        const carrier = (data ?? []).find((item) => item.id === id)
        form.value.carrierName = carrier?.companyName ?? ''
        form.value.partyBRepresentative = carrier?.legalRepresentative || carrier?.contactName || ''
      }
      await formRef.value?.reloadOptions('vehicleId')
    }
  )
  watch(
    () => form.value.vehicleId,
    async (id) => {
      if (hydrating.value) return
      const version = ++vehicleLoadVersion.value
      form.value.plateNo = ''
      form.value.vehicleType = ''
      form.value.vehicleLengthText = ''
      if (!id || !form.value.carrierId) return
      const { data } = await fetchTmsVehicleOptions({ carrierId: form.value.carrierId })
      if (version !== vehicleLoadVersion.value) return
      const vehicle = (data ?? []).find((item) => item.id === id)
      form.value.plateNo = vehicle?.plateNo ?? ''
      form.value.vehicleType = vehicle?.vehicleType ?? ''
      form.value.vehicleLengthText = '车辆档案未维护'
    }
  )

  const formItems = computed<FormItem[]>(() => [
    ...tenantField.value,
    { label: '运输信息', key: 'transportSection', type: 'tab', span: 24 },
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
      label: '车型',
      key: 'vehicleType',
      type: 'input',
      props: { disabled: true, placeholder: '选择车辆后自动带入' }
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
    {
      label: '协议状态',
      key: 'status',
      type: 'select',
      hidden: !editingId.value,
      props: {
        options: userStore.getDictMap.tmsTransportAgreementStatus ?? [],
        placeholder: '请选择协议状态'
      }
    },
    { label: '协议内容', key: 'contentHtml', span: 24 },
    { label: '证件附件', key: 'documentsSection', type: 'tab', span: 24 },
    {
      label: '身份证（最多 3 张）',
      key: 'idCardImages',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '身份证',
        size: 104,
        limit: 3,
        multiple: true
      }
    },
    {
      label: '行驶证（最多 3 张）',
      key: 'registrationImages',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '行驶证',
        size: 104,
        limit: 3,
        multiple: true
      }
    },
    {
      label: '驾驶证',
      key: 'driverLicenseImage',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '驾驶证',
        size: 104,
        limit: 1
      }
    },
    {
      label: '道路运输证',
      key: 'roadPermitImage',
      span: 12,
      type: 'uploadImage',
      props: {
        resourceTenantId: form.value.tenantId,
        readonly: !form.value.tenantId,
        title: '道路运输证',
        size: 104,
        limit: 1
      }
    },
    { label: '签署信息', key: 'signSection', type: 'tab', span: 24 },
    {
      label: '甲方（盖章）',
      key: 'partyASeal',
      type: 'input',
      span: 12,
      props: { maxlength: 120 }
    },
    {
      label: '甲方代表人',
      key: 'partyARepresentative',
      type: 'input',
      span: 12,
      props: { maxlength: 80 }
    },
    {
      label: '甲方签订日期',
      key: 'partyASignedOn',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', placeholder: '请选择日期' }
    },
    {
      label: '乙方（盖章）',
      key: 'partyBSeal',
      type: 'input',
      span: 12,
      props: { maxlength: 120 }
    },
    {
      label: '乙方代表人',
      key: 'partyBRepresentative',
      type: 'input',
      span: 12,
      props: { maxlength: 80, placeholder: '选择承运商后自动带入，可调整' }
    },
    {
      label: '乙方签订日期',
      key: 'partyBSignedOn',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD', placeholder: '请选择日期' }
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
    contentHtml: [{ required: true, message: '请输入协议内容', trigger: 'change' }],
    partyASeal: [{ required: true, message: '请输入甲方（盖章）', trigger: 'blur' }],
    partyARepresentative: [{ required: true, message: '请输入甲方代表人', trigger: 'blur' }],
    partyASignedOn: [{ required: true, message: '请选择甲方签订日期', trigger: 'change' }],
    partyBSeal: [{ required: true, message: '请输入乙方（盖章）', trigger: 'blur' }],
    partyBRepresentative: [{ required: true, message: '请输入乙方代表人', trigger: 'blur' }],
    partyBSignedOn: [{ required: true, message: '请选择乙方签订日期', trigger: 'change' }]
  }))

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (form.value.endsOn && form.value.startsOn && form.value.endsOn < form.value.startsOn) {
        ElMessage.warning('协议结束时间不能早于开始时间')
        return false
      }
      const payload: TransportAgreementInput = {
        tenantId: form.value.tenantId,
        shipperName: form.value.shipperName.trim(),
        carrierId: form.value.carrierId,
        contactPhone: form.value.contactPhone.trim(),
        vehicleId: form.value.vehicleId,
        startsOn: form.value.startsOn,
        endsOn: form.value.endsOn,
        status: form.value.status,
        contentHtml: form.value.contentHtml,
        idCardImages: form.value.idCardImages,
        registrationImages: form.value.registrationImages,
        driverLicenseImage: form.value.driverLicenseImage,
        roadPermitImage: form.value.roadPermitImage,
        partyASeal: form.value.partyASeal.trim(),
        partyARepresentative: form.value.partyARepresentative.trim(),
        partyASignedOn: form.value.partyASignedOn,
        partyBSeal: form.value.partyBSeal.trim(),
        partyBRepresentative: form.value.partyBRepresentative.trim(),
        partyBSignedOn: form.value.partyBSignedOn
      }
      if (editingId.value) await editTransportAgreement(editingId.value, payload)
      else await addTransportAgreement(payload)
      emit('success', editingId.value ? 'edit' : 'add')
      return true
    } catch (error) {
      notifyFriendlyError(error, '运输协议保存失败，请检查签约信息后重试')
      return false
    }
  }

  const handleOpen = async (row?: TransportAgreementRecord): Promise<void> => {
    activeTab.value = 'transportSection'
    editingId.value = row?.id ?? ''
    hydrating.value = true
    Object.assign(form.value, initialForm())
    if (row) {
      Object.assign(form.value, {
        tenantId: row.tenantId,
        shipperName: row.shipperName,
        carrierId: row.carrierId,
        carrierName: row.carrierName,
        contactPhone: row.contactPhone,
        vehicleId: row.vehicleId,
        plateNo: row.plateNo,
        vehicleType: row.vehicleType ?? '',
        vehicleLengthText: row.vehicleLengthM ? `${row.vehicleLengthM} m` : '车辆档案未维护',
        startsOn: row.startsOn || '',
        endsOn: row.endsOn || '',
        status: row.status,
        contentHtml: row.contentHtml,
        idCardImages: [...row.idCardImages],
        registrationImages: [...row.registrationImages],
        driverLicenseImage: row.driverLicenseImage,
        roadPermitImage: row.roadPermitImage,
        partyASeal: row.partyASeal,
        partyARepresentative: row.partyARepresentative,
        partyASignedOn: row.partyASignedOn,
        partyBSeal: row.partyBSeal,
        partyBRepresentative: row.partyBRepresentative,
        partyBSignedOn: row.partyBSignedOn
      })
    }
    await nextTick()
    hydrating.value = false
    await dialogRef.value?.handleOpen(row, {
      title: row ? `编辑运输协议 · ${row.agreementNo}` : '新增运输协议',
      subtitle: '运输信息、证件与双方签署资料。',
      contentMaxHeight: 'calc(100vh - 160px)',
      onOpen: async () => {
        await nextTick()
        await formRef.value?.reloadOptions('carrierId')
        if (row) await formRef.value?.reloadOptions('vehicleId')
        formRef.value?.clearValidate()
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>
