<template>
  <ArtDrawer
    ref="drawerRef"
    size="min(96vw, 1040px)"
    header-icon="ri:arrow-go-back-line"
    :on-confirm="submit"
    :confirm-text="step === 2 ? '创建返程运输单' : '下一步'"
    :confirm-loading="saving"
  >
    <div class="space-y-4 pb-4">
      <div
        class="rounded-lg border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-light)] p-4 text-sm"
      >
        <strong>{{ source?.orderNo }}</strong>
        <span class="ml-3 text-[var(--el-text-color-secondary)]"
          >{{ source?.originStation }} → {{ source?.destinationStation }}</span
        >
        <p class="mb-0 mt-2 text-[var(--el-text-color-secondary)]"
          >返程生成独立订单和待接单运单。司机、车辆默认沿用所选正向调度单。</p
        >
      </div>
      <nav class="flex flex-wrap gap-2" aria-label="返程开单步骤">
        <button
          v-for="(label, index) in steps"
          :key="label"
          type="button"
          class="rounded-lg border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
          :class="
            step === index
              ? 'border-[var(--el-color-primary)] bg-[var(--el-color-primary-light-9)] text-[var(--el-color-primary)]'
              : 'border-[var(--el-border-color-light)]'
          "
          :aria-current="step === index ? 'step' : undefined"
          @click="step = index"
          >{{ index + 1 }} · {{ label }}</button
        >
      </nav>
      <ArtSectionCard
        v-if="loadError"
        title="基础资料加载失败"
        :error="loadError"
        @retry="loadOptions"
      />
      <template v-else>
        <ArtSectionCard
          v-show="step === 0"
          title="收发信息"
          subtitle="返程始发地与原单目的地一致；请核对本次联系人及地址。"
          preserve-content-structure
        >
          <ArtForm
            ref="contactFormRef"
            v-model="form"
            :items="contactItems"
            :span="12"
            :gutter="16"
            label-position="top"
          />
        </ArtSectionCard>
        <ArtSectionCard
          v-show="step === 1"
          title="配置信息"
          subtitle="沿用运输单车型、计费与交接设置。"
          preserve-content-structure
        >
          <ArtForm v-model="sourceChoice" :items="sourceItems" :span="12" label-position="top" />
          <OrderConfig
            v-model="form.orderConfig"
            :can-edit-attachments="true"
            :resource-tenant-id="source?.tenantId || ''"
          />
        </ArtSectionCard>
        <ArtSectionCard
          v-show="step === 2"
          title="货物信息"
          subtitle="返程货物和运费独立归属新订单。"
          preserve-content-structure
        >
          <div class="mb-4 flex flex-wrap items-center gap-2">
            <ElButton plain @click="cargoSelectorRef?.open()">选择货物</ElButton>
            <ElButton plain @click="addCargo">添加货物</ElButton>
            <ElButton
              plain
              :disabled="!form.shippingCustomerId"
              @click="contractSelectorRef?.open(form.shippingCustomerId || '')"
              >选择客户合同</ElButton
            >
            <span v-if="form.contractId" class="text-sm text-[var(--el-text-color-secondary)]">{{
              contractLabel
            }}</span>
          </div>
          <div
            v-for="(item, index) in form.cargoItems"
            :key="index"
            class="mb-3 rounded-lg border border-[var(--el-border-color-light)] p-3"
          >
            <div class="mb-2 flex items-center justify-between"
              ><strong>货物 {{ index + 1 }}</strong
              ><ElButton link type="danger" @click="removeCargo(index)">移除</ElButton></div
            >
            <ArtForm
              v-model="form.cargoItems[index]"
              :items="cargoItems"
              :span="8"
              :gutter="12"
              label-position="top"
            />
          </div>
          <ArtForm v-model="form" :items="feeItems" :span="8" :gutter="12" label-position="top" />
        </ArtSectionCard>
      </template>
    </div>
    <CargoSelector ref="cargoSelectorRef" @confirm="selectCargo" />
    <ContractSelector ref="contractSelectorRef" @select="selectContract" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { fetchCustomerOptions } from '@tms/api/modules/customer'
  import {
    createReturnOrder,
    fetchReturnTripCandidates,
    type ReturnTripCandidate
  } from '@tms/api/modules/return-trip'
  import {
    createInitialCargoItem,
    createInitialForm,
    normalizeOrderPayload,
    type OrderForm
  } from '../../../order-open/modules/order-open-model'
  import OrderConfig from '../../../order-open/modules/order-config.vue'
  import CargoSelector from '../../../modules/cargo-multiple-select.vue'
  import ContractSelector from '../../../order-open/modules/order-contract-selector.vue'
  import type { OrderContractCandidate } from '@tms/api'

  type OrderRecord = Api.Tms.Order.OrderRecord
  type CargoMaster = Api.Tms.BasicData.Cargo
  type ReturnForm = OrderForm & { cargoItems: Api.Tms.Order.CargoItem[] }
  const createReturnForm = (): ReturnForm => ({
    ...createInitialForm(),
    cargoItems: [createInitialCargoItem()]
  })
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const contactFormRef = ref<InstanceType<typeof ArtForm>>()
  const cargoSelectorRef = ref<{ open: () => Promise<void> }>()
  const contractSelectorRef = ref<{ open: (customerId: string) => Promise<void> }>()
  const source = ref<OrderRecord>()
  const form = ref<ReturnForm>(createReturnForm())
  const sourceChoice = reactive({ waybillId: '' })
  const candidates = ref<ReturnTripCandidate[]>([])
  const customers = ref<Api.Tms.BasicData.CustomerOption[]>([])
  const contractLabel = ref('')
  const step = ref(0)
  const steps = ['收发信息', '配置信息', '货物信息']
  const saving = ref(false)
  const loadError = ref('')
  const customerOptions = computed(() =>
    customers.value.map((row) => ({ label: row.customerName, value: row.id }))
  )
  const sourceItems = computed<FormItem[]>(() => [
    {
      key: 'waybillId',
      label: '沿用司机与车辆',
      type: 'select',
      span: 24,
      props: {
        clearable: true,
        options: candidates.value.map((row) => ({ label: row.waybillNo, value: row.id })),
        placeholder: '无正向调度单时可留空'
      }
    }
  ])
  const contactItems = computed<FormItem[]>(() => [
    { key: 'originStation', label: '始发地', type: 'input', props: { disabled: true } },
    {
      key: 'destinationStation',
      label: '目的地',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写返程目的地' }] }
    },
    {
      key: 'shippingCustomerId',
      label: '返程发货客户',
      type: 'select',
      formItemProps: { rules: [{ required: true, message: '请选择发货客户' }] },
      props: { options: customerOptions.value, filterable: true }
    },
    {
      key: 'receivingCustomerId',
      label: '返程收货客户',
      type: 'select',
      props: { options: customerOptions.value, filterable: true, clearable: true }
    },
    {
      key: 'shippingContactName',
      label: '发货联系人',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写发货联系人' }] }
    },
    {
      key: 'shippingContactPhone',
      label: '发货电话',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写发货电话' }] }
    },
    {
      key: 'shippingAddressDetail',
      label: '发货地址',
      type: 'input',
      span: 24,
      formItemProps: { rules: [{ required: true, message: '请填写发货地址' }] }
    },
    {
      key: 'receivingContactName',
      label: '收货联系人',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写收货联系人' }] }
    },
    {
      key: 'receivingContactPhone',
      label: '收货电话',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写收货电话' }] }
    },
    {
      key: 'receivingAddressDetail',
      label: '收货地址',
      type: 'input',
      span: 24,
      formItemProps: { rules: [{ required: true, message: '请填写收货地址' }] }
    },
    {
      key: 'departureAt',
      label: '计划发车',
      type: 'date',
      props: { type: 'datetime', valueFormat: 'YYYY-MM-DDTHH:mm:ssZ', class: 'w-full!' }
    },
    {
      key: 'arrivalAt',
      label: '计划到达',
      type: 'date',
      props: { type: 'datetime', valueFormat: 'YYYY-MM-DDTHH:mm:ssZ', class: 'w-full!' }
    }
  ])
  const cargoItems: FormItem[] = [
    {
      key: 'cargoName',
      label: '货物名称',
      type: 'input',
      formItemProps: { rules: [{ required: true, message: '请填写货物名称' }] }
    },
    {
      key: 'quantity',
      label: '数量',
      type: 'number',
      props: { min: 0, precision: 0, controls: false, class: 'w-full!' }
    },
    { key: 'unit', label: '单位', type: 'input' },
    {
      key: 'weightKg',
      label: '重量（千克）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    },
    {
      key: 'volumeM3',
      label: '体积（立方米）',
      type: 'number',
      props: { min: 0, precision: 3, controls: false, class: 'w-full!' }
    },
    {
      key: 'freight',
      label: '运费（元）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    }
  ]
  const feeItems: FormItem[] = [
    {
      key: 'transportFee',
      label: '运输费（元）',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: 'w-full!' }
    },
    {
      key: 'paymentMethod',
      label: '付款方式',
      type: 'select',
      props: {
        options: [
          { label: '到付', value: 'collect' },
          { label: '现付', value: 'cash' },
          { label: '月结', value: 'monthly' }
        ]
      }
    },
    {
      key: 'orderRemark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { rows: 2, maxlength: 500 }
    }
  ]
  async function handleOpen(row: OrderRecord): Promise<void> {
    if (!row.id) return
    source.value = row
    step.value = 0
    contractLabel.value = ''
    sourceChoice.waybillId = ''
    form.value = {
      ...createInitialForm(),
      originStation: row.destinationStation || '',
      destinationStation: row.originStation || '',
      originStationId: row.destinationStationId || null,
      destinationStationId: row.originStationId || null,
      shippingContactName: row.receivingContactName || '',
      shippingContactPhone: row.receivingContactPhone || '',
      shippingAddressDetail: row.receivingAddressDetail || '',
      receivingContactName: row.shippingContactName || '',
      receivingContactPhone: row.shippingContactPhone || '',
      receivingAddressDetail: row.shippingAddressDetail || '',
      shippingCustomerId: row.receivingCustomerId || null,
      receivingCustomerId: row.shippingCustomerId || null,
      cargoItems: [createInitialCargoItem()]
    }
    await drawerRef.value?.handleOpen(null, {
      title: '新增返程运输单',
      subtitle: '收发信息 · 配置信息 · 货物信息'
    })
    await loadOptions()
  }
  async function loadOptions(): Promise<void> {
    if (!source.value?.id) return
    loadError.value = ''
    drawerRef.value?.setLoading(true)
    try {
      const [nextCandidates, customerResult] = await Promise.all([
        fetchReturnTripCandidates(source.value.id),
        fetchCustomerOptions({ tenantId: source.value.tenantId || '' })
      ])
      if (customerResult.error) throw customerResult.error
      candidates.value = nextCandidates.filter((row) => row.status !== 'cancelled')
      customers.value = customerResult.data ?? []
      sourceChoice.waybillId = candidates.value[0]?.id || ''
    } catch {
      loadError.value = '请检查网络或权限后重试。'
    } finally {
      drawerRef.value?.setLoading(false)
    }
  }
  function addCargo(): void {
    form.value.cargoItems = [...(form.value.cargoItems ?? []), createInitialCargoItem()]
  }
  function removeCargo(index: number): void {
    form.value.cargoItems = (form.value.cargoItems ?? []).filter((_, i) => i !== index)
  }
  function selectCargo(rows: CargoMaster[]): void {
    const existing = (form.value.cargoItems ?? []).filter((item) => item.cargoName)
    form.value.cargoItems = [
      ...existing,
      ...rows.map((row) => ({
        ...createInitialCargoItem(),
        cargoId: row.id,
        cargoName: row.cargoName,
        cargoCode: row.cargoCode || '',
        unit: row.unit || '',
        weightKg: row.weightKg || null,
        volumeM3: row.volumeM3 || null
      }))
    ]
  }
  function selectContract(row: OrderContractCandidate): void {
    form.value.contractId = row.id
    contractLabel.value = `${row.contractNo} · ${row.contractName}`
  }
  async function submit(): Promise<boolean> {
    if (saving.value || loadError.value || !source.value?.id) return false
    if (step.value === 0) {
      if (!(await validateArtFormForSubmit(contactFormRef.value))) return false
      step.value = 1
      return false
    }
    if (step.value === 1) {
      step.value = 2
      return false
    }
    if (
      !(form.value.cargoItems ?? []).some(
        (item) => item.cargoName?.trim() && Number(item.quantity) > 0
      )
    ) {
      ElMessage.warning('请至少填写一项有名称和数量的返程货物')
      return false
    }
    saving.value = true
    try {
      const payload = normalizeOrderPayload({
        form: form.value,
        stationNames: {
          origin: form.value.originStation,
          destination: form.value.destinationStation
        }
      })
      await createReturnOrder(source.value.id, sourceChoice.waybillId || null, payload)
      emit('success')
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }
  defineExpose({ handleOpen })
</script>
