<template>
  <ArtDialog ref="dialogRef" size="lg">
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :span="8"
      :gutter="20"
      label-width="100px"
    >
      <template #addressPicker>
        <ArtAddressPicker
          v-model:region-path="form.data.regionPath"
          v-model:address-detail="form.data.addressDetail"
          v-model:region-adcode="form.data.regionAdcode"
          v-model:longitude="form.data.longitude"
          v-model:latitude="form.data.latitude"
          v-model:coordinate-system="form.data.coordinateSystem"
          v-model:coordinate-source="form.data.coordinateSource"
          v-model:coordinate-status="form.data.coordinateStatus"
          v-model:geocode-provider="form.data.geocodeProvider"
          v-model:geocoded-at="form.data.geocodedAt"
          :region-api="fetchRegionOptions"
          label-width="100px"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { toTenantSelectOptions } from '@/utils/tenant-display'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { FormRules } from 'element-plus'
  import { cloneDeep, omit, toNumber, trim, uniq } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
  import { fetchRegionOptions } from '@/api/region-options'
  import { useDocumentNumberRule } from '@/hooks/core/useDocumentNumberRule'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { addStation, editStation } from '@tms/api'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { normalizeNullableText } from '@/utils/form/normalize'

  defineOptions({ name: 'TmsStationDialog' })

  type Station = Api.Tms.Station.StationRecord
  type StationForm = Api.Tms.Station.StationSavePayload & {
    regionPath: string[]
    addressDetail: string
    addressPicker?: undefined
  }

  interface DialogExposeForm {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface FormGroup {
    data: StationForm
    stationTypeOptions: ComputedRef<Api.DataCenter.DictListItem[]>
    items: ComputedRef<FormItem[]>
    rules: FormRules<StationForm>
  }

  const emit = defineEmits<{
    (event: 'success', type: 'add' | 'edit'): void
  }>()

  const { getDictMap } = storeToRefs(useUserStore())
  const { tenantOptions } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId, shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<Station | undefined>>()
  const formRef = ref<DialogExposeForm>()
  const tenantChoices = computed(() => toTenantSelectOptions(tenantOptions.value))

  const createInitialForm = (): StationForm => ({
    id: undefined,
    tenantId: defaultWriteTenantId.value || undefined,
    stationCode: '',
    stationName: '',
    stationTypes: ['shipping'],
    regionCode: '',
    region: '',
    regionPath: [],
    addressDetail: '',
    regionAdcode: '',
    longitude: null,
    latitude: null,
    coordinateSystem: 'gcj02',
    coordinateSource: null,
    coordinateStatus: null,
    geocodeProvider: null,
    geocodedAt: null,
    managerName: '',
    contactPhone: '',
    enabled: true,
    sort: 0,
    remark: ''
  })

  const form: UnwrapNestedRefs<FormGroup> = reactive<FormGroup>({
    data: createInitialForm(),
    stationTypeOptions: computed(() => getDictMap.value.tmsStationType ?? []),
    rules: {
      tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
      stationTypes: [{ required: true, message: '请至少选择一个站点类型', trigger: 'change' }],
      stationName: [
        { required: true, message: '请输入站点名称', trigger: 'blur' },
        { min: 2, max: 80, message: '长度应为 2 到 80 个字符', trigger: 'blur' }
      ],
      stationCode: [
        {
          validator: (_rule, value, callback) =>
            stationNumber.manualRequired(Boolean(form.data.id)) && !String(value || '').trim()
              ? callback(new Error('请输入站点编码'))
              : callback(),
          trigger: 'blur'
        },
        { max: 30, message: '站点编码不能超过 30 个字符', trigger: 'blur' }
      ],
      regionCode: [{ max: 30, message: '地区编码不能超过 30 个字符', trigger: 'blur' }],
      managerName: [{ max: 50, message: '负责人不能超过 50 个字符', trigger: 'blur' }],
      contactPhone: [{ max: 20, message: '联系电话不能超过 20 个字符', trigger: 'blur' }],
      remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
    },
    items: computed<FormItem[]>(() => [
      ...(shouldExposeTenantField.value
        ? [
            {
              label: '所属租户',
              key: 'tenantId',
              type: 'select' as const,
              props: {
                options: tenantChoices.value,
                filterable: true,
                disabled: Boolean(form.data.id),
                style: { width: '100%' },
                placeholder: '请选择站点所属租户'
              }
            }
          ]
        : []),
      {
        label: '站点编码',
        key: 'stationCode',
        type: 'input',
        props: {
          maxlength: 30,
          ...stationNumber.inputProps(Boolean(form.data.id), '请输入站点编码')
        },
        description: stationNumber.description.value
      },
      {
        label: '站点名称',
        key: 'stationName',
        type: 'input',
        props: {
          maxlength: 80,
          placeholder: '请输入站点名称'
        }
      },
      {
        label: '站点类型',
        key: 'stationTypes',
        type: 'select',
        props: {
          options: form.stationTypeOptions,
          multiple: true,
          collapseTags: true,
          collapseTagsTooltip: true,
          placeholder: '可选择多个站点类型'
        }
      },
      { label: '省市区与详细地址', key: 'addressPicker', type: 'slot', span: 24 },
      {
        label: '排序',
        key: 'sort',
        type: 'number',
        props: {
          min: 0,
          precision: 0,
          controlsPosition: 'right',
          class: '!w-full'
        }
      },
      {
        label: '状态',
        key: 'enabled',
        type: 'switch',
        props: {
          activeText: '启用',
          inactiveText: '停用',
          inlinePrompt: true
        }
      },
      {
        label: '负责人',
        key: 'managerName',
        type: 'input',
        props: {
          maxlength: 50,
          placeholder: '请输入负责人姓名'
        }
      },
      {
        label: '联系电话',
        key: 'contactPhone',
        type: 'input',
        props: {
          maxlength: 20,
          placeholder: '请输入站点联系电话'
        }
      },
      {
        label: '备注',
        key: 'remark',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 500,
          showWordLimit: true,
          placeholder: '请输入备注'
        }
      }
    ])
  })
  const stationNumber = useDocumentNumberRule('master.station', () => form.data.tenantId)

  const replaceForm = (nextForm: StationForm): void => {
    Object.assign(form.data, createInitialForm(), nextForm)
  }

  const resetForm = async (): Promise<void> => {
    replaceForm(createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const normalizePayload = (): Api.Tms.Station.StationSavePayload => {
    const payload = omit(cloneDeep(toRaw(form.data)), [
      'regionPath',
      'addressPicker',
      'stationType',
      'stationRoles',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime'
    ]) as Api.Tms.Station.StationSavePayload

    return {
      ...payload,
      stationCode: trim(String(payload.stationCode || '')),
      stationName: trim(String(payload.stationName || '')),
      stationTypes: uniq(payload.stationTypes.map((item) => trim(String(item))).filter(Boolean)),
      regionCode: normalizeNullableText(payload.regionCode),
      region: form.data.regionPath.join('/'),
      addressDetail: normalizeNullableText(payload.addressDetail),
      regionAdcode: normalizeNullableText(payload.regionAdcode),
      managerName: normalizeNullableText(payload.managerName),
      contactPhone: normalizeNullableText(payload.contactPhone),
      sort: toNumber(payload.sort ?? 0),
      remark: normalizeNullableText(payload.remark)
    }
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
      const type = form.data.id ? 'edit' : 'add'
      if (type === 'edit') await editStation(payload)
      else await addStation(payload)
      emit('success', type)
      return true
    } catch (error) {
      notifyFriendlyError(error, '站点保存失败，请检查填写内容后重试')
      return false
    }
  }

  const handleOpen = async (row?: Station): Promise<void> => {
    await resetForm()
    const isEdit = Boolean(row?.id)
    if (row) {
      const stationTypes = row.stationRoles?.length
        ? row.stationRoles.map((item) => item.roleType)
        : [row.stationType]
      replaceForm({
        ...createInitialForm(),
        ...omit(cloneDeep(toRaw(row)), ['stationType', 'stationRoles']),
        stationTypes,
        regionPath: row.region?.split('/').filter(Boolean) ?? [],
        addressDetail: row.addressDetail || ''
      })
    }

    await dialogRef.value?.handleOpen(row, {
      title: isEdit ? '编辑站点' : '新增站点',
      subtitle: '维护站点类型、区域位置、联系人和运输网络可用状态',
      contentMaxHeight: '70vh',
      loading: true,
      loadingText: '正在加载编号规则…',
      onOpen: async (_openData, api) => {
        try {
          await stationNumber.loadRule()
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
