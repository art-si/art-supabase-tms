<template>
  <ArtDrawer
    ref="drawerRef"
    :size="860"
    header-icon="ri:arrow-go-back-line"
    :on-confirm="submit"
    confirm-text="保存返程配货"
    :confirm-loading="saving"
    :confirm-disabled="cannotSubmit"
    @close="invalidatePreview"
  >
    <div class="space-y-4">
      <div
        class="rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-light)] p-4"
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span class="text-[var(--el-text-color-secondary)]">正向订单</span>
          <strong class="text-[var(--el-text-color-primary)]">{{ order?.orderNo }}</strong>
          <span class="text-[var(--el-text-color-secondary)]">
            {{ order?.originStation }} → {{ order?.destinationStation }}
          </span>
        </div>
        <p class="mb-0 mt-2 text-xs leading-5 text-[var(--el-text-color-secondary)]">
          同一趟出车沿用主运输任务号。返程收入与预计费用作为子单记录，共用路桥费仅在主任务登记一次。
        </p>
      </div>

      <ArtSectionCard
        title="关联主运输任务"
        subtitle="选择已分配正向货量的本趟主任务；每趟任务只可添加一条返程货单。"
        :loading="optionsLoading"
        :error="optionsError ? '请检查网络或权限后重试。' : null"
        error-title="运输任务或客户加载失败"
        preserve-content-structure
        @retry="loadOptions"
      >
        <ArtEmptyState
          v-if="!candidates.length"
          title="暂无可关联的运输任务"
          description="请先完成该订单的调度。"
          size="compact"
        />
        <div v-else>
          <ElAlert
            v-if="!eligibleCandidates.length"
            title="当前没有可添加返程的主任务"
            description="未配载任务请先完成正向派车配载；已有关联返程或已结束的任务不能重复添加。"
            type="info"
            :closable="false"
            show-icon
            class="mb-3"
          />
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="candidate in candidates"
              :key="candidate.id"
              type="button"
              class="rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
              :class="
                selectedWaybillId === candidate.id
                  ? 'border-[var(--el-color-primary)] bg-[var(--el-color-primary-light-9)]'
                  : candidate.canAddReturn
                    ? 'border-[var(--el-border-color-light)] hover:border-[var(--el-color-primary-light-5)]'
                    : 'cursor-not-allowed border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color-light)]'
              "
              :disabled="!candidate.canAddReturn"
              @click="selectedWaybillId = candidate.id"
            >
              <span class="block font-medium text-[var(--el-text-color-primary)]">
                {{ candidate.waybillNo }}
              </span>
              <span class="mt-1 block text-xs text-[var(--el-text-color-secondary)]">
                <span v-if="candidateUnavailableReason(candidate)">
                  {{ candidateUnavailableReason(candidate) }}
                </span>
                <ArtDictDisplay v-else dict-code="tmsWaybillStatus" :value="candidate.status" />
              </span>
            </button>
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        title="返程路线"
        subtitle="选择返程结算客户，从正向目的地接货，填写返程目的地、计划时间和单独里程。"
        preserve-content-structure
      >
        <ElAlert
          v-if="!optionsLoading && !optionsError && !customerOptions.length"
          title="当前租户暂无可用客户，请先在客户档案中新增或启用客户。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-4"
        />
        <ArtForm
          ref="formRef"
          :model-value="form"
          :items="routeFormItems"
          :rules="rules"
          :span="12"
          :gutter="16"
          label-position="top"
          :show-reset="false"
          :show-submit="false"
          @update:model-value="replaceReactiveModel(form, $event)"
        />
      </ArtSectionCard>

      <ArtSectionCard
        title="返程收入与预计费用"
        subtitle="信息费、平台技术服务费及返程专属费用仅归集本子单；共享成本按比例分摊或全部留在主单。"
        preserve-content-structure
      >
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label v-for="field in moneyFields" :key="field.key" class="block">
            <span class="mb-1.5 block text-sm text-[var(--el-text-color-regular)]">{{
              field.label
            }}</span>
            <ElInputNumber
              v-model="form[field.key]"
              class="w-full!"
              :min="0"
              :max="9999999999.99"
              :precision="2"
              :controls="false"
            />
          </label>
        </div>
        <div class="mt-5 border-t border-[var(--el-border-color-light)] pt-4">
          <ElRadioGroup v-model="allocationMode" aria-label="共用成本归集方式">
            <ElRadio value="master">全部归集主单</ElRadio>
            <ElRadio value="allocate">按比例分摊</ElRadio>
          </ElRadioGroup>
          <div v-if="allocationMode === 'allocate'" class="mt-3 flex items-center gap-2">
            <ElInputNumber
              v-model="form.sharedCostAllocationPct"
              :min="0"
              :max="100"
              :precision="2"
            />
            <span class="text-sm text-[var(--el-text-color-secondary)]">% 分摊至返程</span>
          </div>
        </div>
        <ElAlert
          v-if="sharedTollError"
          class="mt-4"
          title="共用路桥费读取失败，暂不能准确预估分摊成本。"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #default>
            <ElButton link type="primary" @click="loadSharedToll(selectedWaybillId)"
              >重试读取</ElButton
            >
          </template>
        </ElAlert>
        <div
          class="mt-5 grid gap-3 rounded-lg bg-[var(--el-fill-color-light)] p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程运费收入</span>
            <strong class="mt-1 block text-lg">¥{{ money(form.freightIncome) }}</strong>
          </div>
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程专属预计费用</span>
            <strong class="mt-1 block text-lg">¥{{ money(directExpense) }}</strong>
          </div>
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程司机提成预估</span>
            <strong class="mt-1 block text-lg">
              {{ previewMoney(preview?.amount) }}
            </strong>
          </div>
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程预计毛利</span>
            <strong class="mt-1 block text-lg text-[var(--el-color-primary)]">
              {{ previewMoney(preview?.projectedGrossProfit) }}
            </strong>
          </div>
        </div>
        <p class="mb-0 mt-2 text-xs text-[var(--el-text-color-secondary)]">
          已审核主单共用路桥费 ¥{{ money(sharedToll) }}，返程分摊
          {{ previewMoney(preview?.allocatedToll) }}；预计毛利已扣司机提成，预计毛利率
          {{ previewPercent(preview?.projectedGrossMargin) }}。
        </p>
        <ElAlert
          v-if="previewError"
          class="mt-3"
          title="返程收益预览失败，保存时仍会按最新规则重新计算。"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #default>
            <ElButton link type="primary" @click="loadPreview">重试预览</ElButton>
          </template>
        </ElAlert>
        <p
          v-else-if="previewLoading"
          class="mb-0 mt-2 text-xs text-[var(--el-text-color-secondary)]"
        >
          正在按当前返程资料预估司机提成和毛利…
        </p>
        <p
          v-else-if="preview && preview.matched === false"
          class="mb-0 mt-2 text-xs text-[var(--el-text-color-secondary)]"
        >
          当前没有匹配的司机提成规则，本次预估按 0 元计入；保存时会重新匹配。
        </p>
        <p class="mb-0 mt-2 text-xs leading-5 text-[var(--el-text-color-secondary)]">
          以上为业务预计值，司机提成已计入预计毛利；不是已审核成本或财务过账。保存时会按最新规则重新计算。
        </p>
      </ArtSectionCard>

      <ArtSectionCard title="备注" preserve-content-structure>
        <ElInput
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="补充返程配货说明"
        />
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { useDebounceFn } from '@vueuse/core'
  import type { FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { fetchCustomerOptions } from '@tms/api/modules/customer'
  import {
    createReturnTrip,
    fetchReturnSharedToll,
    fetchReturnTripCandidates,
    previewReturnTrip,
    type ReturnTripCandidate,
    type ReturnTripInput,
    type ReturnTripPreview,
    type ReturnTripPreviewInput
  } from '@tms/api/modules/return-trip'

  type OrderRecord = Api.Tms.Order.OrderRecord
  type MoneyKey =
    'freightIncome' | 'informationFee' | 'technicalServiceFee' | 'directTollFee' | 'directMiscFee'

  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const formRef = ref<{ validate: () => Promise<boolean> }>()
  const order = ref<OrderRecord>()
  const candidates = ref<ReturnTripCandidate[]>([])
  const selectedWaybillId = ref('')
  const allocationMode = ref<'master' | 'allocate'>('master')
  const saving = ref(false)
  const optionsLoading = ref(false)
  const optionsError = ref(false)
  const sharedTollLoading = ref(false)
  const sharedTollError = ref(false)
  const sharedToll = ref(0)
  const preview = ref<ReturnTripPreview>()
  const previewLoading = ref(false)
  const previewError = ref(false)
  let previewRequestId = 0
  const drawerOpen = ref(false)
  const customerOptions = ref<Api.Tms.BasicData.CustomerOption[]>([])
  const eligibleCandidates = computed(() =>
    candidates.value.filter((candidate) => candidate.canAddReturn)
  )
  const cannotSubmit = computed(
    () =>
      !selectedWaybillId.value ||
      optionsLoading.value ||
      optionsError.value ||
      sharedTollLoading.value ||
      sharedTollError.value
  )
  const form = reactive<ReturnTripInput>({
    returnCustomerId: '',
    originStation: '',
    destinationStation: '',
    plannedDepartureAt: null,
    distanceKm: null,
    cargoWeightTons: null,
    cargoVolumeM3: null,
    freightIncome: 0,
    informationFee: 0,
    technicalServiceFee: 0,
    directTollFee: 0,
    directMiscFee: 0,
    sharedCostAllocationPct: 0,
    remark: null
  })
  const moneyFields: Array<{ key: MoneyKey; label: string }> = [
    { key: 'freightIncome', label: '返程运费（元）' },
    { key: 'informationFee', label: '信息费（元）' },
    { key: 'technicalServiceFee', label: '平台技术服务费（元）' },
    { key: 'directTollFee', label: '返程专属路桥费（元）' },
    { key: 'directMiscFee', label: '返程其他费用（元）' }
  ]
  const routeFormItems = computed<FormItem[]>(() => [
    {
      label: '返程结算客户',
      key: 'returnCustomerId',
      type: 'select',
      span: 24,
      props: {
        options: customerOptions.value.map((customer) => ({
          label: customer.customerName,
          value: customer.id
        })),
        filterable: true,
        placeholder: '请选择承担返程运费的客户',
        class: '!w-full'
      }
    },
    {
      label: '始发地',
      key: 'originStation',
      type: 'input',
      props: { readonly: true }
    },
    {
      label: '目的地',
      key: 'destinationStation',
      type: 'input',
      props: { maxlength: 100, placeholder: '请输入返程目的地' }
    },
    {
      label: '计划发车时间',
      key: 'plannedDepartureAt',
      type: 'date',
      props: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ssZ',
        placeholder: '请选择时间',
        class: '!w-full'
      }
    },
    {
      label: '返程里程（公里）',
      key: 'distanceKm',
      type: 'number',
      props: { min: 0, precision: 2, controls: false, class: '!w-full' }
    },
    {
      label: '返程货物重量（吨）',
      key: 'cargoWeightTons',
      type: 'number',
      props: { min: 0, precision: 3, controls: false, class: '!w-full' }
    },
    {
      label: '返程货物体积（立方米）',
      key: 'cargoVolumeM3',
      type: 'number',
      props: { min: 0, precision: 3, controls: false, class: '!w-full' }
    }
  ])
  const rules: FormRules<ReturnTripInput> = {
    returnCustomerId: [{ required: true, message: '请选择返程结算客户', trigger: 'change' }],
    originStation: [{ required: true, message: '请填写返程始发地', trigger: 'blur' }],
    destinationStation: [{ required: true, message: '请填写返程目的地', trigger: 'blur' }]
  }
  const directExpense = computed(
    () => form.informationFee + form.technicalServiceFee + form.directTollFee + form.directMiscFee
  )
  const previewInput = computed<ReturnTripPreviewInput>(() => ({
    returnCustomerId: form.returnCustomerId,
    originStation: form.originStation,
    destinationStation: form.destinationStation,
    plannedDepartureAt: form.plannedDepartureAt,
    distanceKm: form.distanceKm,
    cargoWeightTons: form.cargoWeightTons,
    cargoVolumeM3: form.cargoVolumeM3,
    freightIncome: form.freightIncome,
    informationFee: form.informationFee,
    technicalServiceFee: form.technicalServiceFee,
    directTollFee: form.directTollFee,
    directMiscFee: form.directMiscFee,
    sharedCostAllocationPct: allocationMode.value === 'allocate' ? form.sharedCostAllocationPct : 0
  }))
  const canPreview = computed(
    () =>
      drawerOpen.value &&
      !!selectedWaybillId.value &&
      !!form.returnCustomerId &&
      !!form.originStation &&
      !!form.destinationStation
  )

  function invalidatePreview(): void {
    drawerOpen.value = false
    previewRequestId++
    preview.value = undefined
    previewLoading.value = false
    previewError.value = false
  }

  async function loadPreview(): Promise<void> {
    if (!canPreview.value) return
    const requestId = ++previewRequestId
    const waybillId = selectedWaybillId.value
    preview.value = undefined
    previewLoading.value = true
    previewError.value = false
    try {
      const result = await previewReturnTrip(waybillId, previewInput.value)
      if (drawerOpen.value && requestId === previewRequestId) preview.value = result
    } catch {
      if (drawerOpen.value && requestId === previewRequestId) previewError.value = true
    } finally {
      if (drawerOpen.value && requestId === previewRequestId) previewLoading.value = false
    }
  }
  const debouncedPreview = useDebounceFn(loadPreview, 300)
  watch([selectedWaybillId, previewInput], () => {
    previewRequestId++
    preview.value = undefined
    previewError.value = false
    previewLoading.value = canPreview.value
    if (canPreview.value) void debouncedPreview()
  })

  function candidateUnavailableReason(candidate: ReturnTripCandidate): string | null {
    if (candidate.hasReturnLeg) return '已有关联返程货单'
    if (['signed', 'cancelled', 'completed'].includes(candidate.status)) return '任务已结束'
    if (!candidate.hasForwardAllocation) return '请先完成正向派车配载'
    return candidate.canAddReturn ? null : '当前任务不可添加返程'
  }

  async function loadSharedToll(waybillId: string): Promise<void> {
    sharedToll.value = 0
    if (!waybillId) return
    sharedTollLoading.value = true
    sharedTollError.value = false
    try {
      const amount = await fetchReturnSharedToll(waybillId)
      if (selectedWaybillId.value === waybillId) sharedToll.value = amount
    } catch {
      if (selectedWaybillId.value === waybillId) sharedTollError.value = true
    } finally {
      if (selectedWaybillId.value === waybillId) sharedTollLoading.value = false
    }
  }

  watch(selectedWaybillId, (waybillId) => void loadSharedToll(waybillId))
  watch(cannotSubmit, (confirmDisabled) => drawerRef.value?.setOptions({ confirmDisabled }))

  function money(value: number): string {
    return Number(value || 0).toFixed(2)
  }

  function previewMoney(value: number | string | null | undefined): string {
    if (value === '***') return '***'
    if (preview.value && value === undefined) return '无权限查看'
    return typeof value === 'number' ? `¥${money(value)}` : '待预估'
  }

  function previewPercent(value: number | string | null | undefined): string {
    if (value === '***') return '***'
    if (preview.value && value === undefined) return '无权限查看'
    return typeof value === 'number' ? `${money(value)}%` : '待预估'
  }

  async function handleOpen(row: OrderRecord): Promise<void> {
    if (!row.id) return
    invalidatePreview()
    drawerOpen.value = true
    order.value = row
    Object.assign(form, {
      returnCustomerId: '',
      originStation: row.destinationStation || '',
      destinationStation: row.originStation || '',
      plannedDepartureAt: null,
      distanceKm: null,
      cargoWeightTons: null,
      cargoVolumeM3: null,
      freightIncome: 0,
      informationFee: 0,
      technicalServiceFee: 0,
      directTollFee: 0,
      directMiscFee: 0,
      sharedCostAllocationPct: 0,
      remark: null
    })
    allocationMode.value = 'master'
    optionsLoading.value = true
    optionsError.value = false
    sharedTollLoading.value = false
    sharedTollError.value = false
    await drawerRef.value?.handleOpen(null, {
      title: '新增返程配货',
      subtitle: '一趟出车 · 正向货与返程货共用主运输任务'
    })
    await loadOptions()
  }

  async function loadOptions(): Promise<void> {
    if (!order.value?.id) return
    optionsLoading.value = true
    optionsError.value = false
    candidates.value = []
    customerOptions.value = []
    selectedWaybillId.value = ''
    try {
      candidates.value = await fetchReturnTripCandidates(String(order.value.id))
      const targetTenantId = candidates.value[0]?.tenantId
      if (!targetTenantId) {
        customerOptions.value = []
      } else {
        const customers = await fetchCustomerOptions({ tenantId: targetTenantId })
        if (customers.error) throw customers.error
        customerOptions.value = customers.data ?? []
      }
    } catch {
      optionsError.value = true
      return
    } finally {
      optionsLoading.value = false
    }
    selectedWaybillId.value = eligibleCandidates.value[0]?.id ?? ''
  }

  async function submit(): Promise<boolean> {
    if (!selectedWaybillId.value) {
      ElMessage.warning('请先选择可关联的主运输任务')
      return false
    }
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      saving.value = true
      await createReturnTrip(selectedWaybillId.value, {
        ...form,
        sharedCostAllocationPct:
          allocationMode.value === 'allocate' ? form.sharedCostAllocationPct : 0,
        remark: normalizeNullableText(form.remark)
      })
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
