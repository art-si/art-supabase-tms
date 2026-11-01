<template>
  <ArtDialog ref="dialogRef">
    <div class="grid min-w-0 gap-4">
      <ElAlert
        type="info"
        :closable="false"
        show-icon
        title="原始运输单不会改变；每个批次生成独立调度运单和车辆任务，运费按重量优先分摊。"
      />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <strong class="block text-base">{{ source?.orderNo || '原始运输单' }}</strong>
          <span class="text-sm text-[var(--el-text-color-secondary)]">
            {{ source?.cargoItems?.length ?? 0 }} 行货物 · {{ parts.length }} 个执行批次
          </span>
        </div>
      </div>

      <ArtForm
        :model-value="splitForm"
        :items="splitItems"
        :span="12"
        :gutter="16"
        root-class="p-0! md:p-0!"
      >
        <template #allocations>
          <ElScrollbar class="max-w-full rounded border border-[var(--el-border-color-lighter)]">
            <table class="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead class="bg-[var(--el-fill-color-light)]">
                <tr>
                  <th class="p-3">货物行 / SKU</th>
                  <th class="p-3">可分配{{ basisLabel }}</th>
                  <th v-for="(part, index) in parts" :key="part.key" class="p-3">
                    批次 {{ index + 1 }}
                  </th>
                  <th class="p-3">未分配</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, lineIndex) in cargoItems"
                  :key="`${item.cargoId || item.cargoName}-${lineIndex}`"
                  class="border-t border-[var(--el-border-color-lighter)]"
                >
                  <th class="p-3 font-medium">
                    <span class="block">{{ item.cargoName || `第 ${lineIndex + 1} 行货物` }}</span>
                    <small class="text-[var(--el-text-color-secondary)]">{{
                      item.cargoCode || item.specModel || '无 SKU'
                    }}</small>
                  </th>
                  <td class="p-3 tabular-nums">{{ basisValue(item) }}</td>
                  <td v-for="part in parts" :key="part.key" class="p-3">
                    <ElInputNumber
                      v-model="part.amounts[lineIndex]"
                      :min="0"
                      :max="basisValue(item)"
                      :precision="basis === 'quantity' ? 3 : 4"
                      :controls="false"
                      class="w-28!"
                      :aria-label="`${item.cargoName || `第 ${lineIndex + 1} 行货物`}在批次${parts.indexOf(part) + 1}的分配量`"
                    />
                  </td>
                  <td
                    class="p-3 tabular-nums"
                    :class="remaining(lineIndex) < 0 ? 'text-[var(--el-color-danger)]' : ''"
                  >
                    {{ remaining(lineIndex) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </ElScrollbar>
          <p v-if="validationError" role="alert" class="m-0 text-sm text-[var(--el-color-danger)]">
            {{ validationError }}
          </p>
          <ElAlert
            v-else-if="hasRemainder"
            type="warning"
            :closable="false"
            show-icon
            title="仍有货量未调度；提交后原始单保留在待运载列表，可继续安排后续批次。"
          />
        </template>
        <template v-for="(part, index) in parts" :key="part.key" #[`part_${part.key}Actions`]>
          <ElButton v-if="parts.length > minimumParts" link type="danger" @click="removePart(index)"
            ><ArtSvgIcon icon="ri:delete-bin-line" />移除批次</ElButton
          >
        </template>
      </ArtForm>
      <ElButton plain type="primary" class="justify-self-start" @click="addPart"
        >添加执行批次</ElButton
      >
    </div>
  </ArtDialog>
  <DispatchCertificateRiskDialog ref="certificateRiskDialogRef" />
</template>

<script setup lang="ts">
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import DispatchCertificateRiskDialog from './dispatch-certificate-risk-dialog.vue'
  import { ElMessage } from 'element-plus'
  import {
    fetchCustomerAddressOptions,
    fetchDispatchVehicleOptions,
    checkDispatchCertificateRisk,
    submitDispatchPlan
  } from '@tms/api'
  import {
    buildSplitLines,
    splitBasisValue,
    validateSplitInputs,
    type SplitBasis
  } from './split-dispatch-model'

  defineOptions({ name: 'TmsSplitDispatchDialog' })

  interface SplitPart {
    key: number
    amounts: number[]
    vehicleId: string
    selectedVehicles: DataSelectRecord[]
    departure: string
    arrival: string
    receivingAddressId: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Api.Tms.Waybill.WaybillRecord>>()
  const certificateRiskDialogRef = ref<InstanceType<typeof DispatchCertificateRiskDialog>>()
  const source = shallowRef<Api.Tms.Waybill.WaybillRecord>()
  const deliveryAddresses = ref<Api.Tms.BasicData.CustomerAddress[]>([])
  const parts = ref<SplitPart[]>([])
  const basis = ref<SplitBasis>('quantity')
  const configuredBasisOptions = useDictionaryOptions('tmsWaybillSplitBasis')
  const basisOptions = computed(() =>
    configuredBasisOptions.filter((option) =>
      ['quantity', 'weight', 'volume'].includes(option.value)
    )
  )
  const splitForm = reactive({ basis, parts })
  const splitItems = computed<FormItem[]>(() => [
    {
      key: 'basis',
      label: '拆单口径',
      type: 'radioGroup',
      span: 24,
      options: basisOptions.value,
      props: { optionType: 'button', 'aria-label': '拆单口径' }
    },
    { key: 'allocations', label: '货量分配', type: 'splitAllocations', span: 24 },
    ...parts.value.flatMap((part, index): FormItem[] => [
      { key: `part_${part.key}`, label: `执行批次 ${index + 1}`, type: 'divider', span: 24 },
      {
        key: `parts.${index}.vehicleId`,
        label: '执行车辆',
        type: 'dataSelect',
        span: 24,
        props: {
          mode: 'table',
          multiple: false,
          showSelectedPanel: false,
          modelValue: part.vehicleId,
          'onUpdate:modelValue': (value: string | number | undefined) => {
            part.vehicleId = String(value ?? '')
          },
          selectedData: part.selectedVehicles,
          'onUpdate:selectedData': (rows: DataSelectRecord[]) => {
            part.selectedVehicles = rows
          },
          title: '选择执行车辆',
          placeholder: '请选择车辆',
          rowKey: 'id',
          labelKey: 'plateNo',
          descriptionKey: 'companyName',
          apiFn: fetchVehicleSelectData,
          columns: vehicleColumns,
          showPagination: true
        }
      },
      {
        key: `parts.${index}.departure`,
        label: '计划发车',
        type: 'date',
        props: { type: 'datetime', valueFormat: 'YYYY-MM-DD HH:mm:ss', class: 'w-full!' }
      },
      {
        key: `parts.${index}.arrival`,
        label: '计划到达',
        type: 'date',
        props: { type: 'datetime', valueFormat: 'YYYY-MM-DD HH:mm:ss', class: 'w-full!' }
      },
      {
        key: `parts.${index}.receivingAddressId`,
        label: '本批次送达地址',
        type: 'select',
        span: 24,
        hidden: !deliveryAddresses.value.length,
        options: deliveryAddresses.value.map((address) => ({
          value: address.id || '',
          label: `${address.contactName} · ${address.region}${address.addressDetail}`
        })),
        props: {
          placeholder: '请选择送达地址',
          class: 'w-full',
          clearable: false,
          filterable: false
        }
      }
    ])
  ])
  const nextKey = ref(0)
  const minimumParts = computed(() => (source.value?.dispatchStatus === 'partial' ? 1 : 2))
  const cargoItems = computed(
    () => source.value?.remainingCargoItems ?? source.value?.cargoItems ?? []
  )
  const basisLabel = computed(
    () => ({ quantity: '件数', weight: '重量 (kg)', volume: '体积 (m³)' })[basis.value]
  )
  const vehicleColumns: DataSelectColumn[] = [
    { prop: 'plateNo', label: '车牌号', minWidth: 130 },
    { prop: 'companyName', label: '所属公司', minWidth: 160 },
    { prop: 'tonnageOrSeat', label: '吨位/座位', width: 120 }
  ]

  const validationError = computed(() =>
    validateSplitInputs(
      cargoItems.value,
      basis.value,
      parts.value.map((part) => part.amounts.map((amount, lineIndex) => ({ lineIndex, amount }))),
      minimumParts.value
    )
  )
  const hasRemainder = computed(() =>
    cargoItems.value.some((_item, index) => remaining(index) > 0.000001)
  )

  watch(basis, () => {
    for (const part of parts.value) part.amounts = cargoItems.value.map(() => 0)
  })

  function basisValue(item: Api.Tms.Order.CargoItem): number {
    return splitBasisValue(item, basis.value)
  }

  function remaining(lineIndex: number): number {
    return Number(
      (
        basisValue(cargoItems.value[lineIndex]) -
        parts.value.reduce((sum, part) => sum + Number(part.amounts[lineIndex] || 0), 0)
      ).toFixed(4)
    )
  }

  function addPart(): void {
    parts.value.push({
      key: ++nextKey.value,
      amounts: cargoItems.value.map(() => 0),
      vehicleId: '',
      selectedVehicles: [],
      departure: '',
      arrival: '',
      receivingAddressId: source.value?.receivingAddressId || ''
    })
  }

  function removePart(index: number): void {
    parts.value.splice(index, 1)
  }

  async function fetchVehicleSelectData(params: DataSelectFetchParams) {
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    const result = await fetchDispatchVehicleOptions({
      from,
      to,
      keyword: params.keyword
    })
    return { data: result.data ?? [], total: result.total ?? 0 }
  }

  async function handleOpen(row: Api.Tms.Waybill.WaybillRecord): Promise<void> {
    source.value = row
    basis.value = 'quantity'
    parts.value = []
    addPart()
    if (minimumParts.value === 2) addPart()
    deliveryAddresses.value = []
    await dialogRef.value?.handleOpen(row, {
      title: `${minimumParts.value === 1 ? '继续拆单配载' : '拆单配载'} · ${row.orderNo}`,
      subtitle: '按货物行分配件数、重量或体积，为每个批次安排独立车辆与送达地址。',
      size: 'xl',
      contentMaxHeight: '78vh',
      confirmText: '生成调度执行单',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          if (row.receivingCustomerId) {
            const result = await fetchCustomerAddressOptions({
              customerId: row.receivingCustomerId,
              addressType: 'receiving'
            })
            deliveryAddresses.value = result.data ?? []
          }
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }

  async function handleSubmit(): Promise<boolean> {
    const orderId = source.value?.id
    if (!orderId || validationError.value) {
      ElMessage.warning(validationError.value || '请先选择原始运输单')
      return false
    }
    if (parts.value.some((part) => !part.vehicleId || !part.departure || !part.arrival)) {
      ElMessage.warning('请为每个批次选择车辆、计划发车和到达时间')
      return false
    }
    try {
      const checks = await Promise.all(
        parts.value.map((part) =>
          checkDispatchCertificateRisk(
            part.vehicleId,
            (part.selectedVehicles[0] as Api.Tms.Waybill.DispatchVehicleOption | undefined)
              ?.primaryDriverId
          )
        )
      )
      const blockedIndexes = checks.flatMap((check, index) => (check.blocked ? [index] : []))
      if (blockedIndexes.length) {
        await certificateRiskDialogRef.value?.handleOpen(
          {
            blocked: true,
            risks: checks.flatMap((check) => check.risks),
            canOverride: blockedIndexes.every((index) => checks[index].canOverride)
          },
          async (reason) => {
            try {
              await submitPlan(new Set(blockedIndexes), reason)
              dialogRef.value?.handleClose(true)
              emit('success')
              return true
            } catch (error) {
              notifyFriendlyError(error, '强制派车失败，请核对权限和证件状态后重试')
              return false
            }
          }
        )
        return false
      }
      await submitPlan()
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '证件风险检查或拆单配载失败，请重试；未完成检查前不会派车')
      return false
    }
  }

  async function submitPlan(
    blockedIndexes: ReadonlySet<number> = new Set(),
    reason?: string
  ): Promise<void> {
    const orderId = source.value?.id
    if (!orderId) throw new Error('请先选择原始运输单')
    await submitDispatchPlan({
      kind: 'split',
      executions: parts.value.map((part, index) => ({
        dispatchVehicleId: part.vehicleId,
        dispatchDriverId: (
          part.selectedVehicles[0] as Api.Tms.Waybill.DispatchVehicleOption | undefined
        )?.primaryDriverId,
        plannedDepartureTime: part.departure,
        plannedArrivalTime: part.arrival,
        certificateRiskOverride: blockedIndexes.has(index),
        certificateRiskOverrideReason: blockedIndexes.has(index) ? reason : null,
        receivingAddressId: part.receivingAddressId || null,
        allocations: [
          {
            orderId,
            lines: buildSplitLines(
              cargoItems.value,
              basis.value,
              part.amounts.map((amount, lineIndex) => ({ lineIndex, amount }))
            )
          }
        ]
      }))
    })
  }

  defineExpose({ handleOpen })
</script>
