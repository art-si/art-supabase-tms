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
          <div class="grid min-w-0 w-full gap-4 pb-4">
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
                      <span class="block">{{
                        item.cargoName || `第 ${lineIndex + 1} 行货物`
                      }}</span>
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
            <p
              v-if="validationError"
              role="alert"
              class="m-0 text-sm text-[var(--el-color-danger)]"
            >
              {{ validationError }}
            </p>
            <ElAlert
              v-else-if="hasRemainder"
              type="warning"
              :closable="false"
              show-icon
              title="仍有货量未调度；提交后原始单保留在待运载列表，可继续安排后续批次。"
            />
          </div>
        </template>
        <template v-for="(part, index) in parts" :key="part.key" #[`part_${part.key}Actions`]>
          <ElButton v-if="parts.length > minimumParts" link type="danger" @click="removePart(index)"
            ><ArtSvgIcon icon="ri:delete-bin-line" />移除批次</ElButton
          >
        </template>
      </ArtForm>
      <DispatchAdvisoryNotice
        v-for="(part, index) in parts"
        :key="part.key"
        :order-id="source?.id"
        :order-tenant-id="source?.tenantId"
        :vehicle-id="part.vehicleId"
        :driver-id="part.driverId"
        :label="`执行批次 ${index + 1}`"
      />
      <ElButton plain type="primary" class="justify-self-start" @click="addPart"
        >添加执行批次</ElButton
      >
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { vehicleDriverColumns } from '@/components/business/vehicle-driver-select/columns'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import type {
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import DispatchAdvisoryNotice from './dispatch-advisory-notice.vue'
  import { notifyDispatchAdvisories } from './dispatch-advisory-feedback'
  import { fetchDispatchResourceOptions } from './dispatch-resource-options'
  import { ElMessage } from 'element-plus'
  import {
    fetchCustomerAddressOptions,
    submitDispatchPlan,
    type DispatchMode,
    type DispatchDriverCandidate,
    type DispatchVehicleCandidate
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
    dispatchMode: DispatchMode
    driverId: string | null
    carrierId: string | null
    agreementId: string | null
    selectedDrivers: DataSelectRecord[]
    driverChosenDirectly: boolean
    resourceMessage: string
    departure: string
    arrival: string
    receivingAddressId: string
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Api.Tms.Waybill.WaybillRecord>>()
  const source = shallowRef<Api.Tms.Waybill.WaybillRecord>()
  const deliveryAddresses = ref<Api.Tms.BasicData.CustomerAddress[]>([])
  const parts = ref<SplitPart[]>([])
  const basis = ref<SplitBasis>('quantity')
  const tenantScope = useTenantScopeStore()
  const configuredModeOptions = useDictionaryOptions('tmsDispatchOperatorMode')
  const modeOptions = computed(() =>
    configuredModeOptions.filter((option) =>
      ['carrier', 'self_operated', 'individual_driver'].includes(option.value)
    )
  )
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
        key: `parts.${index}.dispatchMode`,
        label: '调度对象',
        type: 'radioGroup',
        span: 24,
        options: modeOptions.value,
        props: { optionType: 'button', onChange: () => resetPartResources(part) }
      },
      {
        key: `parts.${index}.vehicleId`,
        label: '执行车辆',
        type: 'dataSelect',
        span: 12,
        description:
          part.resourceMessage || '选择车辆后自动带入关联司机；风险信息只提醒，不阻断配载。',
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
          apiFn: (params: DataSelectFetchParams) => fetchPartResources(part, 'vehicle', params),
          columns: vehicleDriverColumns('vehicle', part.dispatchMode === 'individual_driver'),
          dialogWidth: 'xl',
          showTableHeader: true,
          searchPlaceholder: '搜索车牌、司机、公司或承运商',
          onConfirm: (_value: unknown, rows: DataSelectRecord[]) => handlePartVehicle(part, rows),
          onClear: () => handlePartVehicle(part, []),
          showPagination: true
        }
      },
      {
        key: `parts.${index}.driverId`,
        label: '司机',
        type: 'dataSelect',
        span: 12,
        props: {
          mode: 'table',
          multiple: false,
          showSelectedPanel: false,
          modelValue: part.driverId ?? undefined,
          'onUpdate:modelValue': (value: unknown) => {
            part.driverId = value ? String(value) : null
          },
          selectedData: part.selectedDrivers,
          'onUpdate:selectedData': (rows: DataSelectRecord[]) => {
            part.selectedDrivers = rows
          },
          title: '选择执行司机',
          placeholder: '请选择司机',
          rowKey: 'id',
          labelKey: 'driverName',
          descriptionKey: 'phone',
          dialogWidth: 'xl',
          showTableHeader: true,
          searchPlaceholder: '搜索司机、车牌、公司或承运商',
          apiFn: (params: DataSelectFetchParams) => fetchPartResources(part, 'driver', params),
          columns: vehicleDriverColumns('driver', part.dispatchMode === 'individual_driver'),
          showPagination: true,
          onConfirm: (_value: unknown, rows: DataSelectRecord[]) => handlePartDriver(part, rows),
          onClear: () => handlePartDriver(part, [])
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
      dispatchMode: 'self_operated',
      driverId: null,
      carrierId: null,
      agreementId: null,
      selectedDrivers: [],
      driverChosenDirectly: false,
      resourceMessage: '',
      departure: '',
      arrival: '',
      receivingAddressId: source.value?.receivingAddressId || ''
    })
  }

  function removePart(index: number): void {
    parts.value.splice(index, 1)
  }

  function fetchPartResources(
    part: SplitPart,
    resource: 'vehicle' | 'driver',
    params: DataSelectFetchParams
  ) {
    const tenantId = source.value?.tenantId || tenantScope.effectiveTenantId || undefined
    return fetchDispatchResourceOptions(part.dispatchMode, resource, tenantId, params)
  }

  function resetPartResources(part: SplitPart): void {
    Object.assign(part, {
      vehicleId: '',
      driverId: null,
      carrierId: null,
      agreementId: null,
      selectedVehicles: [],
      selectedDrivers: [],
      driverChosenDirectly: false,
      resourceMessage: ''
    })
  }

  function handlePartVehicle(part: SplitPart, rows: DataSelectRecord[]): void {
    const vehicle = rows[0] as DispatchVehicleCandidate | undefined
    const previousDriver = part.selectedDrivers[0] as DispatchDriverCandidate | undefined
    const driver =
      vehicle?.primaryDriver ||
      (part.driverChosenDirectly && vehicle && previousDriver?.carrierId === vehicle.carrierId
        ? previousDriver
        : undefined)
    Object.assign(part, {
      vehicleId: vehicle?.id || '',
      selectedVehicles: vehicle ? [vehicle] : [],
      driverId: driver?.id || null,
      selectedDrivers: driver ? [driver] : [],
      driverChosenDirectly: !vehicle?.primaryDriver && Boolean(driver),
      carrierId: vehicle?.carrierId || driver?.carrierId || null,
      agreementId: driver?.agreementId || null,
      resourceMessage:
        vehicle && !driver ? '车辆未关联该调度对象下的司机，可手动选择；不会按姓名猜测关联。' : ''
    })
  }

  function handlePartDriver(part: SplitPart, rows: DataSelectRecord[]): void {
    const driver = rows[0] as DispatchDriverCandidate | undefined
    const previousVehicle = part.selectedVehicles[0] as DispatchVehicleCandidate | undefined
    const vehicle =
      driver?.vehicle ||
      (driver &&
      previousVehicle &&
      (previousVehicle.primaryDriverId === driver.id ||
        (part.dispatchMode === 'carrier' && previousVehicle.carrierId === driver.carrierId))
        ? previousVehicle
        : undefined)
    Object.assign(part, {
      driverId: driver?.id || null,
      selectedDrivers: driver ? [driver] : [],
      driverChosenDirectly: Boolean(driver),
      vehicleId: vehicle?.id || '',
      selectedVehicles: vehicle ? [vehicle] : [],
      carrierId: driver?.carrierId || vehicle?.carrierId || null,
      agreementId: driver?.agreementId || null,
      resourceMessage:
        driver && !vehicle ? '司机未关联车辆，可手动选择；已有车牌信息以司机档案为准。' : ''
    })
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
    if (
      parts.value.some(
        (part) => (!part.vehicleId && !part.driverId) || !part.departure || !part.arrival
      )
    ) {
      ElMessage.warning('请为每个批次选择车辆或司机，并填写计划发车和到达时间')
      return false
    }
    try {
      await submitPlan()
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '拆单配载未完成，请核对单据和货量分配后重试')
      return false
    }
  }

  async function submitPlan(): Promise<void> {
    const orderId = source.value?.id
    if (!orderId) throw new Error('请先选择原始运输单')
    const result = await submitDispatchPlan({
      kind: 'split',
      executions: parts.value.map((part) => ({
        dispatchVehicleId: part.vehicleId,
        dispatchMode: part.dispatchMode,
        dispatchDriverId: part.driverId,
        dispatchCarrierId: part.carrierId,
        dispatchAgreementId: part.agreementId,
        plannedDepartureTime: part.departure,
        plannedArrivalTime: part.arrival,
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
    notifyDispatchAdvisories(result.data)
  }

  defineExpose({ handleOpen })
</script>
