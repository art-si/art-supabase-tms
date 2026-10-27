<template>
  <div class="driver-commission">
    <div class="driver-commission__heading">
      <div>
        <strong>司机提成方案</strong>
        <p>按车型、线路、方向和生效日期维护规则。每次调整会留下版本。</p>
      </div>
      <ElButton v-if="driverId && canEdit" type="primary" @click="openEditor()">新增方案</ElButton>
    </div>
    <div
      v-if="driverId && loadError"
      class="flex items-center gap-3 py-6 text-sm text-[var(--art-gray-700)]"
    >
      <span>提成方案加载失败，请重试。</span>
      <ElButton link type="primary" @click="load">重新加载</ElButton>
    </div>
    <ArtTable
      v-else-if="driverId"
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
    <ArtDialog ref="historyDialogRef" size="xl" :show-footer="false" :loading="historyLoading">
      <div v-if="historyRule" class="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <strong class="text-[var(--art-gray-900)]">{{ historyRule.ruleName }}</strong>
        <span class="text-[var(--art-gray-600)]">当前 V{{ historyRule.versionNo ?? 1 }}</span>
        <span class="text-[var(--art-gray-600)]">
          {{ historyRule.effectiveFrom }} 至 {{ historyRule.effectiveTo || '长期有效' }}
        </span>
      </div>
      <div
        v-if="historyError"
        class="flex items-center gap-3 py-6 text-sm text-[var(--art-gray-700)]"
      >
        <span>版本记录加载失败，请重试。</span>
        <ElButton link type="primary" @click="reloadHistory">重新加载</ElButton>
      </div>
      <ArtTable
        v-else
        :data="history"
        :columns="historyColumns"
        :pagination="false"
        empty-text="暂无版本记录"
        empty-description="规则创建或调整后会在这里留痕。"
      />
    </ArtDialog>
  </div>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { uniqBy } from 'lodash-es'
  import { ElButton, ElMessage, ElTag, type FormRules } from 'element-plus'
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
  import { formatCompactNumberValue, formatDateTimeValue } from '@/utils/ui/format'
  import {
    fetchDriverCommissionRevisions,
    fetchDriverCommissionRules,
    fetchTmsDriverCommissionVehicleOptions,
    fetchTmsVehicleTypeProfiles,
    saveDriverCommissionRule,
    type DriverCommissionRevision,
    type TmsVehicleOption,
    type DriverCommissionRule
  } from '@tms/api'

  const props = defineProps<{ driverId?: string; tenantId?: string; selectedRuleId?: string }>()
  const { hasAuth } = useAuth()
  const canEdit = computed(() => hasAuth('TmsDriver:Edit'))
  const canView = computed(() => hasAuth('TmsDriver:View'))
  const rules = ref<DriverCommissionRule[]>([])
  const history = ref<DriverCommissionRevision[]>([])
  const historyRule = ref<DriverCommissionRule | null>(null)
  const historyLoading = ref(false)
  const historyError = ref(false)
  const selectedHandled = ref('')
  const loading = ref(false)
  const loadError = ref(false)
  const typeOptions = ref<{ value: string; label: string }[]>([])
  const vehicleOptions = ref<TmsVehicleOption[]>([])
  let loadRequestId = 0
  const dialogRef = ref<ArtDialogExpose<DriverCommissionRule | undefined>>()
  const historyDialogRef = ref<ArtDialogExpose<DriverCommissionRule | undefined>>()
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
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
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
  const rateUnits: Record<DriverCommissionRule['method'], string> = {
    fixed_per_trip: '元/趟',
    per_km: '元/公里',
    per_ton_km: '元/吨公里',
    per_volume: '元/方',
    freight_percent: '%'
  }
  const formItems = computed<FormItem[]>(() => [
    { label: '方案名称', key: 'ruleName', type: 'input', span: 24, props: { maxlength: 100 } },
    {
      label: '关联车型',
      key: 'vehicleTypeProfileId',
      type: 'select',
      span: 24,
      props: {
        options: typeOptions.value,
        filterable: true,
        clearable: false,
        disabled: Boolean(form.vehicleId && selectedVehicle.value?.vehicleTypeProfileId),
        placeholder: '请选择适用车型'
      }
    },
    {
      label: '车牌号',
      key: 'vehicleId',
      type: 'select',
      span: 24,
      description: '留空适用于该车型的所有车辆；选定车辆后自动带入车型。',
      props: {
        options: vehicleOptions.value
          .filter((item): item is TmsVehicleOption & { id: string } => Boolean(item.id))
          .map((item) => ({ value: item.id, label: item.plateNo })),
        filterable: true,
        clearable: true,
        placeholder: '请选择车牌号（可留空）',
        onChange: (value: string | null) => {
          if (!value) return
          const profileId = vehicleOptions.value.find(
            (item) => item.id === value
          )?.vehicleTypeProfileId
          form.vehicleTypeProfileId = profileId ?? null
        }
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
      label: `提成单价（${rateUnits[form.method]}）`,
      key: 'rate',
      type: 'number',
      props: {
        min: 0,
        max: form.method === 'freight_percent' ? 100 : undefined,
        precision: 2,
        class: '!w-full'
      }
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
    vehicleTypeProfileId: [{ required: true, message: '请选择关联车型', trigger: 'change' }],
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
      minWidth: 180,
      showOverflowTooltip: true,
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
      prop: 'vehicleId',
      label: '车牌号',
      minWidth: 120,
      formatter: (row) =>
        row.vehicleId
          ? (vehicleOptions.value.find((item) => item.id === row.vehicleId)?.plateNo ?? '指定车辆')
          : '全部车辆'
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
    {
      prop: 'rate',
      label: '提成单价',
      minWidth: 125,
      formatter: (row) => `${formatCompactNumberValue(row.rate)} ${rateUnits[row.method]}`
    },
    {
      prop: 'effectiveFrom',
      label: '生效区间',
      minWidth: 180,
      formatter: (row) => `${row.effectiveFrom} — ${row.effectiveTo || '长期'}`
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 85,
      formatter: (row) => {
        const today = dayjs().format('YYYY-MM-DD')
        const status = !row.enabled
          ? { label: '已停用', type: 'info' as const }
          : row.effectiveFrom > today
            ? { label: '待生效', type: 'warning' as const }
            : row.effectiveTo && row.effectiveTo < today
              ? { label: '已失效', type: 'info' as const }
              : { label: '生效中', type: 'success' as const }
        return (
          <ElTag type={status.type} effect="light">
            {status.label}
          </ElTag>
        )
      }
    },
    { prop: 'versionNo', label: '版本', width: 70, formatter: (row) => `V${row.versionNo ?? 1}` },
    {
      prop: 'operation',
      label: '操作',
      width: 100,
      fixed: 'right',
      formatter: (row) => (
        <div class="flex items-center gap-1">
          <ArtButtonTable
            type="view"
            label="查看版本"
            permission="TmsDriver:View"
            onClick={() => openHistory(row)}
          />
          <ArtButtonTable type="edit" permission="TmsDriver:Edit" onClick={() => openEditor(row)} />
        </div>
      )
    }
  ]
  const selectedVehicle = computed(() =>
    vehicleOptions.value.find((item) => item.id === form.vehicleId)
  )
  const historyColumns: ColumnOption<DriverCommissionRevision>[] = [
    { prop: 'versionNo', label: '版本', width: 64, formatter: (row) => `V${row.versionNo}` },
    {
      prop: 'eventType',
      label: '变更',
      width: 72,
      formatter: (row) => (row.eventType === 'created' ? '创建' : '调整')
    },
    {
      prop: 'snapshot',
      label: '适用范围',
      minWidth: 240,
      showOverflowTooltip: true,
      formatter: (row) => {
        const snapshot = row.snapshot
        const plate = vehicleOptions.value.find((item) => item.id === snapshot.vehicleId)?.plateNo
        const vehicle = plate || (snapshot.vehicleId ? '指定车辆' : '全部车辆')
        const type = typeOptions.value.find(
          (item) => item.value === snapshot.vehicleTypeProfileId
        )?.label
        const route = `${snapshot.origin || '任意始发地'} → ${snapshot.destination || '任意目的地'}`
        return `${type || '车型不限'} · ${vehicle} · ${route} · ${snapshot.direction === 'return' ? '返程' : '正向'}`
      }
    },
    {
      prop: 'snapshot',
      label: '生效区间',
      minWidth: 160,
      formatter: (row) =>
        `${row.snapshot.effectiveFrom || '—'} — ${row.snapshot.effectiveTo || '长期'}`
    },
    {
      prop: 'snapshot',
      label: '计价',
      minWidth: 120,
      formatter: (row) => {
        const snapshot = row.snapshot
        const unit = rateUnits[snapshot.method || 'fixed_per_trip']
        return `${formatCompactNumberValue(snapshot.rate)} ${unit}`
      }
    },
    { prop: 'actorName', label: '经办人', minWidth: 95 },
    {
      prop: 'recordedAt',
      label: '记录时间',
      minWidth: 165,
      formatter: (row) => formatDateTimeValue(row.recordedAt)
    }
  ]

  async function loadReferences(selectedVehicleId?: string | null): Promise<void> {
    const tenantId = props.tenantId
    if (!tenantId) throw new Error('司机所属租户缺失，请重新打开档案')
    const [profiles, vehicles] = await Promise.all([
      fetchTmsVehicleTypeProfiles(tenantId),
      fetchTmsDriverCommissionVehicleOptions(tenantId)
    ])
    if (profiles.error || vehicles.error) {
      throw profiles.error ?? vehicles.error ?? new Error('车辆及车型资料加载失败')
    }
    if (props.tenantId !== tenantId) return
    typeOptions.value = (profiles.data ?? []).map((item) => ({
      value: item.id,
      label: `${item.category}${item.lengthM ? ` · ${item.lengthM} 米` : ''}${item.loadTons ? ` · ${item.loadTons} 吨` : ''}`
    }))
    const options = vehicles.data ?? []
    if (selectedVehicleId && !options.some((item) => item.id === selectedVehicleId)) {
      const selected = await fetchTmsDriverCommissionVehicleOptions(tenantId, [selectedVehicleId])
      if (selected.error) throw selected.error
      if (props.tenantId !== tenantId) return
      vehicleOptions.value = uniqBy([...options, ...(selected.data ?? [])], 'id')
      return
    }
    vehicleOptions.value = options
  }

  async function load(): Promise<void> {
    if (!props.driverId) return
    const driverId = props.driverId
    const requestId = ++loadRequestId
    loading.value = true
    loadError.value = false
    try {
      const result = await fetchDriverCommissionRules(driverId)
      if (result.error) throw result.error
      if (requestId !== loadRequestId) return
      rules.value = result.data
      try {
        await loadReferences()
      } catch (error) {
        if (requestId === loadRequestId)
          notifyFriendlyError(error, '车牌和车型资料加载失败，请刷新后重试')
      }
      if (requestId !== loadRequestId) return
      if (props.selectedRuleId && selectedHandled.value !== props.selectedRuleId) {
        const selected = rules.value.find((rule) => rule.id === props.selectedRuleId)
        if (selected) {
          selectedHandled.value = props.selectedRuleId
          void openEditor(selected)
        }
      }
    } catch (error) {
      if (requestId === loadRequestId) {
        loadError.value = true
        notifyFriendlyError(error, '提成方案加载失败，请稍后重试')
      }
    } finally {
      if (requestId === loadRequestId) loading.value = false
    }
  }
  watch(
    () => [props.driverId, props.tenantId],
    () => {
      loadRequestId += 1
      selectedHandled.value = ''
      loadError.value = false
      rules.value = []
      typeOptions.value = []
      vehicleOptions.value = []
      void load()
    },
    { immediate: true }
  )

  async function openEditor(row?: DriverCommissionRule): Promise<void> {
    if (!props.driverId || !canEdit.value) return
    Object.assign(form, emptyForm(), row ?? {})
    try {
      await loadReferences(row?.vehicleId)
    } catch (error) {
      notifyFriendlyError(error, '车型规格加载失败，请稍后重试')
      return
    }
    await dialogRef.value?.handleOpen(row, {
      title: row ? '编辑提成方案' : '新增提成方案',
      subtitle: '车型、线路与方向共同决定任务的预计算提成',
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
          ElMessage.warning('失效日期不能早于生效日期')
          return false
        }
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

  async function reloadHistory(): Promise<void> {
    if (!historyRule.value?.id) return
    historyLoading.value = true
    historyError.value = false
    try {
      const result = await fetchDriverCommissionRevisions(historyRule.value.id)
      if (result.error) throw result.error
      history.value = result.data
    } catch {
      historyError.value = true
      history.value = []
    } finally {
      historyLoading.value = false
    }
  }

  async function openHistory(row: DriverCommissionRule): Promise<void> {
    if (!canView.value || !row.id) return
    historyRule.value = row
    history.value = []
    historyError.value = false
    await historyDialogRef.value?.handleOpen(row, {
      title: '提成规则版本记录',
      subtitle: '保存后的规则快照用于追溯适用范围和费率变化',
      onOpen: reloadHistory
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
