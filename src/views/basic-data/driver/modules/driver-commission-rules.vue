<template>
  <div class="driver-commission">
    <div class="driver-commission__heading">
      <div>
        <strong>司机提成方案</strong>
        <p>按车型、线路、方向和生效日期维护规则。每次调整会留下版本。</p>
      </div>
      <ElButton v-if="driverId && canEdit" type="primary" @click="openEditor()">新增方案</ElButton>
    </div>
    <ArtTable
      v-if="driverId"
      :data="rules"
      :columns="columns"
      :loading="loading"
      :pagination="false"
      empty-text="暂无提成方案"
      empty-description="可为这名司机配置正向货和返程货各自的提成。"
    />
    <p v-else class="driver-commission__empty">保存司机档案后可配置提成方案。</p>
    <ArtDialog ref="dialogRef" size="lg">
      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="formItems"
        :rules="formRules"
        :span="12"
        :gutter="16"
        label-width="112px"
        :show-reset="false"
        :show-submit="false"
      />
    </ArtDialog>
  </div>
</template>

<script setup lang="tsx">
  import { ElButton, type FormRules } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchDriverCommissionRules,
    fetchTmsVehicleTypeProfiles,
    saveDriverCommissionRule,
    type DriverCommissionRule
  } from '@tms/api'

  const props = defineProps<{ driverId?: string; selectedRuleId?: string }>()
  const { hasAuth } = useAuth()
  const canEdit = computed(() => hasAuth('TmsDriver:Edit'))
  const rules = ref<DriverCommissionRule[]>([])
  const selectedHandled = ref('')
  const loading = ref(false)
  const typeOptions = ref<{ value: string; label: string }[]>([])
  const dialogRef = ref<ArtDialogExpose<DriverCommissionRule | undefined>>()
  const formRef = ref<{ validate: () => Promise<boolean> }>()

  const emptyForm = (): DriverCommissionRule => ({
    driverId: props.driverId || '',
    ruleName: '',
    vehicleTypeProfileId: null,
    vehicleId: null,
    origin: '',
    destination: '',
    direction: 'forward',
    weightMinTons: null,
    weightMaxTons: null,
    volumeMinM3: null,
    volumeMaxM3: null,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: null,
    method: 'fixed_per_trip',
    rate: 0,
    enabled: true,
    remark: ''
  })
  const form = reactive<DriverCommissionRule>(emptyForm())
  const methodOptions = [
    { value: 'fixed_per_trip', label: '按趟固定金额' },
    { value: 'per_km', label: '按里程（元/公里）' },
    { value: 'per_ton_km', label: '按吨公里' },
    { value: 'per_volume', label: '按方量' },
    { value: 'freight_percent', label: '按运费比例（%）' }
  ]
  const directionOptions = [
    { value: 'forward', label: '正向货' },
    { value: 'return', label: '返程配货' }
  ]
  const formItems = computed<FormItem[]>(() => [
    { label: '方案名称', key: 'ruleName', type: 'input', span: 24, props: { maxlength: 100 } },
    {
      label: '车型范围',
      key: 'vehicleTypeProfileId',
      type: 'select',
      span: 24,
      props: {
        options: typeOptions.value,
        filterable: true,
        clearable: true,
        placeholder: '留空适用于全部车型'
      }
    },
    {
      label: '始发地',
      key: 'origin',
      type: 'input',
      props: { maxlength: 100, placeholder: '留空表示不限线路' }
    },
    {
      label: '目的地',
      key: 'destination',
      type: 'input',
      props: { maxlength: 100, placeholder: '留空表示不限线路' }
    },
    { label: '货运方向', key: 'direction', type: 'select', props: { options: directionOptions } },
    { label: '提成方式', key: 'method', type: 'select', props: { options: methodOptions } },
    {
      label: '提成费率',
      key: 'rate',
      type: 'number',
      props: { min: 0, precision: 2, class: '!w-full' }
    },
    {
      label: '生效日期',
      key: 'effectiveFrom',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      label: '失效日期',
      key: 'effectiveTo',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: '!w-full' }
    },
    {
      label: '重量下限(吨)',
      key: 'weightMinTons',
      type: 'number',
      props: { min: 0, class: '!w-full' }
    },
    {
      label: '重量上限(吨)',
      key: 'weightMaxTons',
      type: 'number',
      props: { min: 0, class: '!w-full' }
    },
    {
      label: '方量下限(m³)',
      key: 'volumeMinM3',
      type: 'number',
      props: { min: 0, class: '!w-full' }
    },
    {
      label: '方量上限(m³)',
      key: 'volumeMaxM3',
      type: 'number',
      props: { min: 0, class: '!w-full' }
    },
    { label: '启用状态', key: 'enabled', type: 'switch' },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500 }
    }
  ])
  const formRules: FormRules<DriverCommissionRule> = {
    ruleName: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
    effectiveFrom: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
    method: [{ required: true, message: '请选择提成方式', trigger: 'change' }],
    rate: [
      { required: true, type: 'number', min: 0.01, message: '提成费率需大于 0', trigger: 'change' }
    ]
  }
  const columns: ColumnOption<DriverCommissionRule>[] = [
    { prop: 'ruleName', label: '方案名称', minWidth: 170 },
    {
      prop: 'vehicleTypeProfileId',
      label: '车型',
      minWidth: 125,
      formatter: (row) =>
        row.vehicleTypeProfileId
          ? (typeOptions.value.find((item) => item.value === row.vehicleTypeProfileId)?.label ??
            '指定车型')
          : '全部车型'
    },
    { prop: 'origin', label: '始发地', minWidth: 105, formatter: (row) => row.origin || '不限' },
    {
      prop: 'destination',
      label: '目的地',
      minWidth: 105,
      formatter: (row) => row.destination || '不限'
    },
    {
      prop: 'direction',
      label: '方向',
      width: 90,
      formatter: (row) => (row.direction === 'return' ? '返程配货' : '正向货')
    },
    {
      prop: 'method',
      label: '提成方式',
      minWidth: 130,
      formatter: (row) =>
        methodOptions.find((item) => item.value === row.method)?.label ?? row.method
    },
    { prop: 'rate', label: '费率', width: 95 },
    { prop: 'effectiveFrom', label: '生效日期', width: 120 },
    { prop: 'versionNo', label: '版本', width: 70, formatter: (row) => `V${row.versionNo ?? 1}` },
    {
      prop: 'operation',
      label: '操作',
      width: 80,
      formatter: (row) => (
        <ArtButtonTable type="edit" permission="TmsDriver:Edit" onClick={() => openEditor(row)} />
      )
    }
  ]

  async function load(): Promise<void> {
    if (!props.driverId) return
    loading.value = true
    try {
      rules.value = (await fetchDriverCommissionRules(props.driverId)).data
      if (props.selectedRuleId && selectedHandled.value !== props.selectedRuleId) {
        const selected = rules.value.find((rule) => rule.id === props.selectedRuleId)
        if (selected) {
          selectedHandled.value = props.selectedRuleId
          void openEditor(selected)
        }
      }
    } finally {
      loading.value = false
    }
  }
  watch(
    () => props.driverId,
    () => {
      selectedHandled.value = ''
      void load()
    },
    { immediate: true }
  )

  async function openEditor(row?: DriverCommissionRule): Promise<void> {
    if (!props.driverId || !canEdit.value) return
    Object.assign(form, emptyForm(), row ?? {})
    try {
      const response = await fetchTmsVehicleTypeProfiles()
      typeOptions.value = (response.data ?? []).map((item) => ({
        value: item.id,
        label: `${item.category}${item.lengthM ? ` · ${item.lengthM} 米` : ''}${item.loadTons ? ` · ${item.loadTons} 吨` : ''}`
      }))
    } catch (error) {
      notifyFriendlyError(error, '车型规格加载失败，请稍后重试')
      return
    }
    await dialogRef.value?.handleOpen(row, {
      title: row ? '编辑提成方案' : '新增提成方案',
      subtitle: '车型、线路与方向共同决定任务的预计算提成',
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) return false
        try {
          await saveDriverCommissionRule(row?.id ?? null, { ...form, driverId: props.driverId! })
          await load()
          return true
        } catch (error) {
          notifyFriendlyError(error, '提成方案保存失败，请核对后重试')
          return false
        }
      }
    })
  }
</script>

<style scoped lang="scss">
  .driver-commission {
    &__heading {
      display: flex;
      gap: 16px;
      align-items: start;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    &__heading strong {
      font-size: 14px;
      color: var(--art-gray-900);
    }

    &__heading p,
    &__empty {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--art-gray-700);
    }
  }
</style>
