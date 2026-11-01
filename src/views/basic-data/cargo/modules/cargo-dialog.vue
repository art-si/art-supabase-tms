<template>
  <ArtDialog ref="dialogRef" size="lg" @close="handleDialogClose">
    <ArtForm
      ref="formRef"
      v-model:active-tab="activeTab"
      v-model="form"
      :items="formItems"
      :rules="formRules"
      :span="8"
      :gutter="20"
      label-width="112px"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { normalizeNullableNumber, normalizeNullableText } from '@/utils/form/normalize'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type { FormRules } from 'element-plus'
  import TreeUtils from '@/utils/tree'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import type { MasterGroup } from '@/api/master-groups'
  import {
    addCargo,
    editCargo,
    fetchCargoMaterialOptions,
    type CargoMaterialOption
  } from '@tms/api'

  defineOptions({ name: 'TmsCargoDialog' })

  type Cargo = Api.Tms.BasicData.Cargo
  type CargoForm = Cargo

  export interface CargoDialogOpenData {
    row?: Cargo
    copy?: boolean
    groups: MasterGroup[]
    initialGroupId?: string
  }

  interface DialogExposeForm {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ (event: 'success', type: 'add' | 'edit'): void }>()
  const { tenantOptions } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId, shouldExposeTenantField } = useTenantScopeFormPolicy()
  const activeTab = ref('materialSection')
  const dialogRef = ref<ArtDialogExpose<CargoDialogOpenData>>()
  const formRef = ref<DialogExposeForm>()
  const materials = ref<CargoMaterialOption[]>([])
  const materialContextVersion = ref(0)
  const dialogActive = ref(false)
  const groups = ref<MasterGroup[]>([])
  const groupTree = new TreeUtils({ parentKey: 'parentId' })

  const initialForm = (): CargoForm => ({
    id: undefined,
    tenantId: defaultWriteTenantId.value || undefined,
    materialId: null,
    materialGroupId: null,
    cargoCode: '',
    cargoName: '',
    specModel: '',
    unit: '',
    lengthM: null,
    widthM: null,
    heightM: null,
    volumeM3: null,
    weightKg: null,
    valueAmount: null,
    enabled: true,
    remark: ''
  })
  const form = ref<CargoForm>(initialForm())
  const tenantChoices = computed(() =>
    tenantOptions.value.map((tenant) => ({
      label: tenant.tenantName || tenant.tenantCode,
      value: tenant.id
    }))
  )
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
  const fetchMaterialChoices = async (params?: Record<string, unknown>) => {
    const tenantId = typeof params?.tenantId === 'string' ? params.tenantId : ''
    const version = params?.contextVersion
    const rows = tenantId ? await fetchCargoMaterialOptions(tenantId) : []
    if (
      dialogActive.value &&
      version === materialContextVersion.value &&
      tenantId === form.value.tenantId
    ) {
      materials.value = rows
    }
    return rows.map((material) => ({
      label: `${material.materialCode} · ${material.materialName}`,
      value: material.id
    }))
  }
  const unitLabel = computed(() => {
    const material = materials.value.find((item) => item.id === form.value.materialId)
    return material?.baseUnit?.unitName || material?.basicUnit || form.value.unit || ''
  })
  const formRules = computed<FormRules<CargoForm>>(() => ({
    tenantId: shouldExposeTenantField.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    materialId: [{ required: true, message: '请选择 MDM 物料编码', trigger: 'change' }],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }))
  const numberInputProps = { min: 0, precision: 2, controlsPosition: 'right', class: '!w-full' }
  const formItems = computed<FormItem[]>(() => [
    { label: '物料身份', key: 'materialSection', type: 'tab', span: 24 },
    ...(shouldExposeTenantField.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select' as const,
            span: 12,
            props: {
              options: tenantChoices.value,
              filterable: true,
              disabled: Boolean(form.value.id),
              placeholder: '请选择货物所属租户',
              onChange: handleTenantChange
            }
          }
        ]
      : []),
    {
      label: '物料编码',
      key: 'materialId',
      type: 'select',
      span: 16,
      api: fetchMaterialChoices,
      params: {
        tenantId: form.value.tenantId,
        contextVersion: materialContextVersion.value,
        active: dialogActive.value
      },
      shouldFetch: (params) => Boolean(params?.active && params.tenantId),
      props: {
        filterable: true,
        clearable: true,
        disabled: !form.value.tenantId,
        placeholder: '从 MDM 物料编码中选择',
        onChange: applyMaterial
      },
      description: '名称、规格和唯一计量单位取自 MDM 物料主数据。'
    },
    {
      label: '物料分组',
      key: 'materialGroupId',
      type: 'treeSelect',
      span: 8,
      options: groupOptions.value,
      props: { clearable: true, filterable: true, placeholder: '请选择物料分组' }
    },
    {
      label: '货物名称',
      key: 'cargoName',
      type: 'input',
      props: { disabled: true, placeholder: '选择物料后自动带入' }
    },
    {
      label: '规格型号',
      key: 'specModel',
      type: 'input',
      props: { disabled: true, placeholder: '从物料编码带入' }
    },
    {
      label: '计量单位',
      key: 'unit',
      type: 'text',
      content: () => unitLabel.value || '选择物料后自动带入'
    },
    { label: '运输参数', key: 'transportSection', type: 'tab', span: 24 },
    { label: '长(m)', key: 'lengthM', type: 'number', props: numberInputProps },
    { label: '宽(m)', key: 'widthM', type: 'number', props: numberInputProps },
    { label: '高(m)', key: 'heightM', type: 'number', props: numberInputProps },
    {
      label: '体积(m³)',
      key: 'volumeM3',
      type: 'number',
      props: { ...numberInputProps, precision: 3 }
    },
    { label: '重量(kg)', key: 'weightKg', type: 'number', props: numberInputProps },
    { label: '价值(元)', key: 'valueAmount', type: 'number', props: numberInputProps },
    {
      label: '状态',
      key: 'enabled',
      type: 'switch',
      props: { activeText: '启用', inactiveText: '停用', inlinePrompt: true }
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
        placeholder: '补充运输注意事项'
      }
    }
  ])

  const replaceForm = (next: CargoForm): void => {
    Object.assign(form.value, initialForm(), next)
  }
  const handleDialogClose = (): void => {
    dialogActive.value = false
    materialContextVersion.value += 1
    materials.value = []
  }
  const handleTenantChange = (): void => {
    form.value.materialId = null
    form.value.materialGroupId = null
    form.value.cargoCode = ''
    form.value.cargoName = ''
    form.value.specModel = ''
    form.value.unit = ''
    materials.value = []
  }
  const applyMaterial = (id?: string): void => {
    const material = materials.value.find((item) => item.id === id)
    form.value.cargoCode = material?.materialCode || ''
    form.value.cargoName = material?.materialName || ''
    form.value.specModel = material?.specificationModel || ''
    form.value.unit = material?.basicUnit || ''
    if (material?.materialGroupId) form.value.materialGroupId = material.materialGroupId
  }
  const payload = (): Cargo => ({
    id: form.value.id,
    tenantId: form.value.tenantId,
    materialId: form.value.materialId,
    materialGroupId: form.value.materialGroupId,
    cargoName: form.value.cargoName,
    unit: form.value.unit,
    lengthM: normalizeNullableNumber(form.value.lengthM),
    widthM: normalizeNullableNumber(form.value.widthM),
    heightM: normalizeNullableNumber(form.value.heightM),
    volumeM3: normalizeNullableNumber(form.value.volumeM3),
    weightKg: normalizeNullableNumber(form.value.weightKg),
    valueAmount: normalizeNullableNumber(form.value.valueAmount),
    enabled: form.value.enabled,
    remark: normalizeNullableText(form.value.remark)
  })
  const handleSubmit = async (): Promise<boolean> => {
    if (!dialogActive.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    try {
      const type = form.value.id ? 'edit' : 'add'
      if (type === 'edit') await editCargo(payload())
      else await addCargo(payload())
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '货物档案保存失败，请检查填写内容后重试')
      return false
    }
  }
  const handleOpen = async (data: CargoDialogOpenData): Promise<void> => {
    activeTab.value = 'materialSection'
    materialContextVersion.value += 1
    dialogActive.value = true
    materials.value = []
    groups.value = data.groups
    const selectedGroup = groups.value.find((group) => group.id === data.initialGroupId)
    replaceForm({
      ...initialForm(),
      ...(data.row ? structuredClone(toRaw(data.row)) : {}),
      tenantId:
        data.row?.tenantId || selectedGroup?.tenantId || defaultWriteTenantId.value || undefined,
      id: data.copy ? undefined : data.row?.id,
      materialId: data.copy ? null : data.row?.materialId || null,
      materialGroupId: data.row?.materialGroupId || data.initialGroupId || null
    })
    if (data.copy) {
      form.value.cargoCode = ''
      form.value.cargoName = ''
      form.value.specModel = ''
      form.value.unit = ''
    }
    await dialogRef.value?.handleOpen(data, {
      title: data.copy ? '复制货物参数' : data.row ? '编辑货物' : '新增货物',
      subtitle: data.copy
        ? '运输参数已复制，请选择另一条 MDM 物料编码。'
        : '物料身份来自 MDM，运输参数供 TMS 开单使用。',
      contentMaxHeight: '70vh',
      onConfirm: handleSubmit,
      onReset: () => {
        replaceForm(initialForm())
        materials.value = []
        materialContextVersion.value += 1
        void nextTick().then(() => formRef.value?.clearValidate())
      }
    })
  }
  defineExpose({ handleOpen, handleClose: () => dialogRef.value?.handleClose() })
</script>
