<template>
  <div class="grid min-w-0 grid-cols-1 gap-3">
    <div v-if="editable" class="flex flex-wrap justify-end gap-2">
      <ElButton :disabled="!contractId" @click="openContract"
        ><ArtSvgIcon icon="ri:file-list-3-line" />批量选合同明细</ElButton
      >
      <ElButton @click="cargoPicker?.open()"
        ><ArtSvgIcon icon="ri:archive-line" />批量选货物</ElButton
      >
      <ElButton type="primary" plain @click="items.push(createInitialCargoItem())"
        ><ArtSvgIcon icon="ri:add-line" />添加</ElButton
      >
    </div>
    <ArtTable
      class="min-w-0"
      :data="items"
      :columns="columns"
      :pagination="false"
      :max-height="420"
      empty-height="160px"
      table-layout="fixed"
      empty-text="尚未添加货物"
      empty-description="可从合同明细、常用货物中参选，也可手动填写。"
    />
    <div class="flex flex-wrap justify-end gap-4 text-sm text-[var(--el-text-color-secondary)]">
      <span>总数量：{{ summary.quantity }}</span
      ><span>总重量：{{ summary.weight }} kg</span><span>总体积：{{ summary.volume }} 方</span>
    </div>
    <ArtDataSelect
      :key="tenantId"
      ref="cargoPicker"
      :show-trigger="false"
      multiple
      :api-fn="fetchCargoes"
      :columns="cargoPickerColumns"
      row-key="id"
      label-key="cargoName"
      description-key="cargoCode"
      title="批量选择货物"
      search-placeholder="搜索货物名称、编码或规格型号"
      show-table-header
      @confirm="confirmCargoes"
    />
    <ArtDataSelect
      :key="`${tenantId}:${contractId || ''}`"
      ref="contractPicker"
      :show-trigger="false"
      multiple
      :api-fn="fetchDetails"
      :columns="contractColumns"
      row-key="key"
      label-key="cargoDescription"
      description-key="contractNo"
      title="批量选择合同明细"
      show-table-header
      @confirm="confirmDetails"
    />
  </div>
</template>

<script setup lang="tsx">
  import { computed, ref, shallowRef, watch } from 'vue'
  import { differenceBy } from 'lodash-es'
  import {
    ElAutocomplete,
    ElButton,
    ElInput,
    ElInputNumber,
    ElSelect,
    ElOption
  } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectColumn,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import type { ColumnOption } from '@/types'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { formatSensitiveNumber } from '@/utils/field-permission'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { fetchCargoList, fetchPriceContractDetails } from '@tms/api'
  import {
    createInitialCargoItem,
    calculateOrderCargoSummary
  } from '../../order-open/modules/order-open-model'
  import {
    mergeOrderContractDetails,
    synchronizeContractCargoFreight
  } from '../../order-open/modules/order-contract-detail'

  defineOptions({ name: 'TmsAgreementCargoEditor' })
  type Cargo = Api.Tms.Order.CargoItem & {
    splitTransportFee?: number | string | null
    loadingFee?: number | string | null
    packageFee?: number | string | null
  }
  type Master = Api.Tms.BasicData.Cargo
  type Detail = Api.Tms.BasicData.ContractDetailSelectorItem
  const props = withDefaults(
    defineProps<{
      kind: 'customer' | 'carrier'
      contractId?: string | null
      tenantId: string
      editable?: boolean
      pricingVisible?: boolean
      pricingEditable?: boolean
      carrierCosts?: boolean
    }>(),
    { editable: true, pricingVisible: true, pricingEditable: true, carrierCosts: false }
  )
  const items = defineModel<Cargo[]>({ required: true })
  const emit = defineEmits<{ freight: [amount: number] }>()
  const cargoPicker = ref<ArtDataSelectExpose>()
  const contractPicker = ref<ArtDataSelectExpose>()
  const suggestions = shallowRef<Master[]>([])
  const units = useDictionaryOptions('tmsCargoUnit')
  const summary = computed(() => calculateOrderCargoSummary(items.value))
  const cargoPickerColumns: DataSelectColumn<Master>[] = [
    { prop: 'cargoCode', label: '货物编码', minWidth: 140 },
    { prop: 'cargoName', label: '货物名称', minWidth: 180 },
    { prop: 'specModel', label: '规格型号', minWidth: 140 },
    { prop: 'unit', label: '计量单位', width: 100, dict: { code: 'tmsCargoUnit' } }
  ]
  const contractColumns: DataSelectColumn<Detail>[] = [
    { prop: 'contractNo', label: '合同编号', minWidth: 140 },
    { prop: 'cargoDescription', label: '货物名称', minWidth: 180 },
    { prop: 'cargoCode', label: '货物编码', minWidth: 120 },
    { prop: 'unit', label: '计量单位', width: 100, dict: { code: 'tmsCargoUnit' } },
    {
      prop: 'transportUnitPrice',
      label: '合同单价',
      minWidth: 120,
      formatter: (row) => formatSensitiveNumber(row.transportUnitPrice)
    }
  ]
  const numberColumn = (
    prop: 'quantity' | 'weightKg' | 'volumeM3' | 'splitTransportFee' | 'loadingFee' | 'packageFee',
    label: string,
    precision = 2
  ): ColumnOption<Cargo> => ({
    prop,
    label,
    width: 140,
    formatter: (row) =>
      props.editable &&
      (!['splitTransportFee', 'loadingFee', 'packageFee'].includes(prop) ||
        props.pricingEditable) ? (
        <ElInputNumber
          modelValue={typeof row[prop] === 'number' ? row[prop] : undefined}
          onUpdate:modelValue={(value: number | undefined) => {
            row[prop] = value ?? null
          }}
          min={0}
          precision={precision}
          controls={false}
          class="w-full!"
          aria-label={label}
        />
      ) : (
        formatSensitiveNumber(row[prop])
      )
  })
  const columns = computed<ColumnOption<Cargo>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 58 },
    {
      prop: 'cargoName',
      label: '货物名称',
      minWidth: 180,
      formatter: (row) =>
        props.editable ? (
          <ElAutocomplete
            modelValue={row.cargoName || ''}
            onUpdate:modelValue={(value: string | number) => updateCargoName(row, String(value))}
            fetchSuggestions={fetchSuggestions}
            onSelect={(value) => selectSuggestion(row, value)}
            valueKey="cargoName"
            aria-label="货物名称"
            placeholder="选择或输入货物名称"
            maxlength={80}
          />
        ) : (
          row.cargoName || '—'
        )
    },
    { prop: 'cargoCode', label: '货物编码', width: 130 },
    {
      prop: 'specModel',
      label: '规格型号',
      minWidth: 150,
      formatter: (row) =>
        props.editable ? (
          <ElInput
            v-model={row.specModel}
            aria-label="规格型号"
            maxlength={100}
            placeholder="选择货物后可修改"
          />
        ) : (
          row.specModel || '—'
        )
    },
    {
      prop: 'packageType',
      label: '计量单位',
      width: 140,
      formatter: (row) =>
        props.editable ? (
          <ElSelect
            modelValue={row.packageType || row.unit}
            onUpdate:modelValue={(value: string) => {
              row.packageType = value
              row.unit = value
            }}
            aria-label="计量单位"
            class="w-full!"
          >
            {units.map((unit) => (
              <ElOption key={unit.value} label={unit.label} value={unit.value} />
            ))}
          </ElSelect>
        ) : (
          units.find((unit) => unit.value === (row.packageType || row.unit))?.label || '—'
        )
    },
    numberColumn('quantity', '数量'),
    numberColumn('weightKg', '重量（kg）'),
    numberColumn('volumeM3', '体积（方）', 3),
    ...(props.pricingVisible
      ? [
          {
            prop: 'unitPrice',
            label: '合同单价（元）',
            width: 145,
            formatter: (row: Cargo) =>
              row.sourceContractId ? formatSensitiveNumber(row.unitPrice) : '—'
          },
          {
            prop: 'freight',
            label: '运费（元）',
            width: 130,
            formatter: (row: Cargo) =>
              row.sourceContractId ? formatSensitiveNumber(row.freight) : '—'
          },
          ...(props.carrierCosts
            ? [
                numberColumn('splitTransportFee', '分摊运费（元）'),
                numberColumn('loadingFee', '装卸费（元）'),
                numberColumn('packageFee', '包装费（元）')
              ]
            : [])
        ]
      : []),
    { prop: 'sourceContractNo', label: '来源合同', minWidth: 150 },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 160,
      formatter: (row) =>
        props.editable ? (
          <ElInput v-model={row.remark} aria-label="货物备注" maxlength={200} />
        ) : (
          row.remark || '—'
        )
    },
    ...(props.editable
      ? [
          {
            prop: 'operation',
            label: '操作',
            width: 64,
            fixed: 'right' as const,
            formatter: (row: Cargo) => (
              <ArtIconButton
                icon="ri:delete-bin-line"
                label="移除货物"
                tone="danger"
                onClick={() => {
                  items.value = items.value.filter((item) => item !== row)
                }}
              />
            )
          }
        ]
      : [])
  ])
  async function fetchCargoes(params: DataSelectFetchParams) {
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    const result = await fetchCargoList({
      tenantId: props.tenantId,
      keyword: params.keyword,
      enabled: true,
      from,
      to
    })
    if (result.error) throw result.error
    return { data: result.data || [], total: result.total || 0 }
  }
  async function fetchDetails(params: DataSelectFetchParams) {
    if (!props.contractId) return { data: [], total: 0 }
    const rows = await fetchPriceContractDetails(props.kind, props.contractId, params.keyword)
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    return { data: rows.slice(from, to + 1), total: rows.length }
  }
  function confirmCargoes(_value: unknown, rows: Master[]): void {
    const additions = differenceBy(
      rows.map((row): Cargo => ({
        ...createInitialCargoItem(),
        cargoId: row.id,
        cargoName: row.cargoName,
        cargoCode: row.cargoCode,
        specModel: row.specModel,
        quantity: 1,
        packageType: row.unit,
        unit: row.unit,
        weightKg: row.weightKg,
        volumeM3: row.volumeM3
      })),
      items.value,
      'cargoName'
    )
    items.value = [...items.value.filter((row) => row.cargoName), ...additions]
  }
  function confirmDetails(_value: unknown, rows: Detail[]): void {
    if (!props.contractId || rows.some((row) => row.contractId !== props.contractId)) return
    items.value = mergeOrderContractDetails(items.value, rows).items
  }
  const openContract = () => contractPicker.value?.open()
  watch(
    () => props.contractId,
    (value, previous) => {
      if (previous && value !== previous)
        items.value = items.value.filter(
          (row) => !row.sourceContractId || row.sourceContractId === value
        )
    }
  )
  watch(
    () => items.value.map((row) => [row.quantity, row.unitPrice, row.sourceContractId]),
    (_current, previous) => {
      if (!props.pricingEditable) return
      const result = synchronizeContractCargoFreight(items.value)
      if (result.hasContractCargo && result.transportFee !== null)
        emit('freight', result.transportFee)
      else if (!result.hasContractCargo && previous?.some((row) => row[2])) emit('freight', 0)
    },
    { deep: true }
  )

  function updateCargoName(row: Cargo, value: string): void {
    if (value === row.cargoName) return
    Object.assign(row, {
      cargoName: value,
      cargoId: null,
      cargoCode: '',
      unitPrice: null,
      freight: null,
      sourceContractId: null,
      sourceContractNo: null,
      sourceContractName: null,
      sourceContractDetailKey: null
    })
  }
  async function fetchSuggestions(
    keyword: string,
    callback: (rows: Record<string, unknown>[]) => void
  ): Promise<void> {
    const tenantId = props.tenantId
    try {
      const result = await fetchCargoList({ tenantId, keyword, enabled: true, from: 0, to: 19 })
      if (tenantId !== props.tenantId) return callback([])
      suggestions.value = result.data || []
      callback(suggestions.value.map((row) => ({ ...row })))
    } catch {
      callback([])
    }
  }
  function selectSuggestion(row: Cargo, value: Record<string, unknown>): void {
    const source = suggestions.value.find((item) => item.id === value.id)
    if (!source) return
    Object.assign(row, {
      cargoId: source.id,
      cargoName: source.cargoName,
      cargoCode: source.cargoCode,
      specModel: source.specModel,
      packageType: source.unit,
      unit: source.unit,
      quantity: row.quantity ?? 1,
      weightKg: source.weightKg,
      volumeM3: source.volumeM3
    })
  }
</script>
