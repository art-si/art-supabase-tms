<template>
  <ArtDialog
    ref="dialogRef"
    size="lg"
    :confirm-disabled="referenceLoading || !!referenceError"
    @close="handleDialogClose"
  >
    <ArtAsyncState
      v-if="referenceError"
      :error="referenceError"
      error-title="物料分类加载失败"
      retryable
      @retry="loadCategories"
    />
    <ElAlert
      v-if="saveError"
      :title="saveError"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />
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
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'
  import type { FormRules } from 'element-plus'
  import TreeUtils from '@/utils/tree'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import {
    buildMaterialCategoryNavigation,
    getMaterialCategoryIds
  } from '@/utils/business/material-category'
  import type { MaterialSelectCategory } from '@/components/business/art-material-select/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import type { MasterGroup } from '@/api/master-groups'
  import {
    addCargo,
    addCargoBatch,
    editCargo,
    fetchCargoMaterialPage,
    fetchCargoMaterialCategories,
    type CargoMaterialOption
  } from '@tms/api'

  defineOptions({ name: 'TmsCargoDialog' })

  type Cargo = Api.Tms.BasicData.Cargo
  type CargoForm = Cargo & { materialIds: string[] }

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
  const selectedMaterials = ref<CargoMaterialOption[]>([])
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  const categories = ref<MaterialSelectCategory[]>([])
  const referenceLoading = ref(false)
  const referenceError = ref('')
  const saveError = ref('')
  let referenceRevision = 0
  const dialogActive = ref(false)
  const groups = ref<MasterGroup[]>([])
  const groupTree = new TreeUtils({ parentKey: 'parentId' })

  const initialForm = (): CargoForm => ({
    id: undefined,
    tenantId: defaultWriteTenantId.value || undefined,
    materialId: null,
    materialIds: [],
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
  const fetchMaterials = (params: DataSelectFetchParams) => {
    const tenantId = form.value.tenantId
    if (!tenantId) return Promise.resolve({ data: [], total: 0 })
    const categoryId = String(params.filters.categoryId || '')
    return fetchCargoMaterialPage(
      params,
      tenantId,
      getMaterialCategoryIds(categories.value, categoryId)
    )
  }
  const loadCategories = async (): Promise<void> => {
    const revision = ++referenceRevision
    referenceLoading.value = true
    referenceError.value = ''
    try {
      const [rows] = await Promise.all([
        form.value.tenantId
          ? fetchCargoMaterialCategories(form.value.tenantId)
          : Promise.resolve([]),
        form.value.tenantId
          ? loadUnitDisplayNames([form.value.tenantId], 'tmsCargoUnit').catch((error) =>
              notifyFriendlyError(error, '计量单位名称加载失败，仍可保存运输参数', 'warning')
            )
          : Promise.resolve()
      ])
      if (revision === referenceRevision) categories.value = rows
    } catch {
      if (revision === referenceRevision) referenceError.value = '物料分类加载失败，请重试后继续。'
    } finally {
      if (revision === referenceRevision) referenceLoading.value = false
    }
  }
  const unitLabel = computed(() => {
    const material = selectedMaterials.value.find((item) => item.id === form.value.materialId)
    const value = form.value.unit || material?.basicUnit || material?.baseUnit?.unitName
    if (!value) return ''
    const resolved = unitDisplayName(form.value.tenantId || '', value)
    return resolved === value
      ? formatUnitDisplayName(material?.baseUnit?.unitName || value, '')
      : resolved
  })
  const formRules = computed<FormRules<CargoForm>>(() => ({
    tenantId: shouldExposeTenantField.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    materialId: form.value.id
      ? [{ required: true, message: '请选择 MDM 物料编码', trigger: 'change' }]
      : [],
    materialIds: form.value.id
      ? []
      : [
          {
            type: 'array',
            required: true,
            min: 1,
            message: '请至少选择一个物料编码',
            trigger: 'change'
          }
        ],
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
      key: form.value.id ? 'materialId' : 'materialIds',
      type: 'dataSelect',
      span: 16,
      props: {
        mode: 'table',
        multiple: !form.value.id,
        apiFn: fetchMaterials,
        selectedData: selectedMaterials.value,
        navigation: buildMaterialCategoryNavigation(categories.value),
        rowKey: 'id',
        labelKey: 'materialName',
        descriptionKey: 'materialCode',
        title: '参选物料编码',
        subtitle: '按物料分类查找，可多选后批量新增货物。',
        searchPlaceholder: '搜索物料编码、名称、描述或规格',
        showSelectedPanel: true,
        showPagination: true,
        columns: [
          { prop: 'materialCode', label: '物料编码', minWidth: 150 },
          { prop: 'materialName', label: '物料名称', minWidth: 180 },
          { prop: 'description', label: '物料描述', minWidth: 160 },
          { prop: 'specificationModel', label: '规格型号', minWidth: 150 },
          {
            prop: 'baseUnit.unitName',
            label: '单位',
            width: 100,
            formatter: (row: CargoMaterialOption) =>
              unitDisplayName(row.tenantId, row.baseUnit?.unitName || row.basicUnit)
          }
        ],
        clearable: true,
        disabled: !form.value.tenantId || referenceLoading.value || !!referenceError.value,
        placeholder: '参选 MDM 物料编码',
        onChange: applyMaterial
      },
      description: form.value.id
        ? '名称、规格和计量单位取自 MDM 物料主数据。'
        : '可多选物料批量新增；运输参数应用于本次选中的全部货物。'
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
      props: { formatter: () => unitLabel.value || '选择物料后自动带入' }
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
    saveError.value = ''
    dialogActive.value = false
    referenceRevision += 1
    selectedMaterials.value = []
    categories.value = []
  }
  const handleTenantChange = (): void => {
    form.value.materialId = null
    form.value.materialIds = []
    form.value.materialGroupId = null
    form.value.cargoCode = ''
    form.value.cargoName = ''
    form.value.specModel = ''
    form.value.unit = ''
    selectedMaterials.value = []
    categories.value = []
    void loadCategories()
  }
  const applyMaterial = (_value: unknown, rows: CargoMaterialOption[]): void => {
    selectedMaterials.value = rows
    const material = rows[0]
    form.value.materialId = material?.id || null
    form.value.materialIds = rows.map((row) => row.id)
    form.value.cargoCode = material?.materialCode || ''
    form.value.cargoName = material?.materialName || ''
    form.value.specModel = material?.specificationModel || ''
    form.value.unit = material?.baseUnit?.unitName || formatUnitDisplayName(material?.basicUnit, '')
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
    saveError.value = ''
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    try {
      const type = form.value.id ? 'edit' : 'add'
      if (type === 'edit') await editCargo(payload())
      else {
        const records = selectedMaterials.value.map((material) => ({
          ...payload(),
          materialId: material.id,
          materialGroupId: material.materialGroupId || form.value.materialGroupId,
          cargoCode: material.materialCode,
          cargoName: material.materialName,
          specModel: material.specificationModel || '',
          unit: material.baseUnit?.unitName || formatUnitDisplayName(material.basicUnit, '')
        }))
        if (records.length === 1) await addCargo(records[0])
        else await addCargoBatch(records)
      }
      emit('success', type)
      return true
    } catch (error) {
      saveError.value = getFriendlySupabaseErrorMessage(
        error,
        '货物档案保存失败，请检查填写内容后重试'
      )
      return false
    }
  }
  const handleOpen = async (data: CargoDialogOpenData): Promise<void> => {
    saveError.value = ''
    activeTab.value = 'materialSection'
    referenceRevision += 1
    dialogActive.value = true
    selectedMaterials.value =
      !data.copy && data.row?.material
        ? [
            {
              id: data.row.materialId || '',
              tenantId: data.row.tenantId || '',
              materialCode: data.row.material.materialCode || data.row.cargoCode || '',
              materialName: data.row.material.materialName || data.row.cargoName || '',
              specificationModel: data.row.material.specificationModel,
              basicUnit: data.row.material.basicUnit || data.row.unit || '',
              materialGroupId: data.row.material.materialGroupId,
              baseUnit: data.row.material.baseUnit
            }
          ]
        : []
    categories.value = []
    groups.value = data.groups
    const selectedGroup = groups.value.find((group) => group.id === data.initialGroupId)
    replaceForm({
      ...initialForm(),
      ...(data.row ? structuredClone(toRaw(data.row)) : {}),
      tenantId:
        data.row?.tenantId || selectedGroup?.tenantId || defaultWriteTenantId.value || undefined,
      id: data.copy ? undefined : data.row?.id,
      materialId: data.copy ? null : data.row?.materialId || null,
      materialIds: [],
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
      onOpen: loadCategories,
      onConfirm: handleSubmit,
      onReset: () => {
        replaceForm(initialForm())
        selectedMaterials.value = []
        categories.value = []
        void loadCategories()
        void nextTick().then(() => formRef.value?.clearValidate())
      }
    })
  }
  defineExpose({ handleOpen, handleClose: () => dialogRef.value?.handleClose() })
</script>
