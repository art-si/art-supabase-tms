<template>
  <ArtDrawer
    ref="drawerRef"
    :size="860"
    header-icon="ri:arrow-go-back-line"
    :on-confirm="submit"
    confirm-text="保存返程配货"
    :confirm-loading="saving"
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
        subtitle="选择本趟出车的运单；已有返程配货的任务不能重复添加。"
        preserve-content-structure
      >
        <ElEmpty
          v-if="!candidates.length"
          description="该订单暂无可关联的运输任务，请先完成调度。"
        />
        <div v-else class="grid gap-2 sm:grid-cols-2">
          <button
            v-for="candidate in candidates"
            :key="candidate.id"
            type="button"
            class="rounded-lg border p-3 text-left transition-colors"
            :class="
              selectedWaybillId === candidate.id
                ? 'border-[var(--el-color-primary)] bg-[var(--el-color-primary-light-9)]'
                : 'border-[var(--el-border-color-light)] hover:border-[var(--el-color-primary-light-5)]'
            "
            :disabled="
              candidate.hasReturnLeg || ['cancelled', 'completed'].includes(candidate.status)
            "
            @click="selectedWaybillId = candidate.id"
          >
            <span class="block font-medium text-[var(--el-text-color-primary)]">
              {{ candidate.waybillNo }}
            </span>
            <span class="mt-1 block text-xs text-[var(--el-text-color-secondary)]">
              {{ candidate.hasReturnLeg ? '已有关联返程货单' : candidate.status }}
            </span>
          </button>
        </div>
      </ArtSectionCard>

      <ArtSectionCard
        title="返程路线"
        subtitle="从正向目的地接货，填写返程目的地、计划时间和单独里程。"
        preserve-content-structure
      >
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
        <div class="mt-5 grid gap-3 rounded-lg bg-[var(--el-fill-color-light)] p-4 sm:grid-cols-3">
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程运费收入</span>
            <strong class="mt-1 block text-lg">¥{{ money(form.freightIncome) }}</strong>
          </div>
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程专属预计费用</span>
            <strong class="mt-1 block text-lg">¥{{ money(directExpense) }}</strong>
          </div>
          <div>
            <span class="text-xs text-[var(--el-text-color-secondary)]">返程预计毛利</span>
            <strong class="mt-1 block text-lg text-[var(--el-color-primary)]">
              ¥{{ money(projectedGrossProfit) }}
            </strong>
          </div>
        </div>
        <p class="mb-0 mt-2 text-xs text-[var(--el-text-color-secondary)]">
          已审核主单共用路桥费 ¥{{ money(sharedToll) }}，返程分摊 ¥{{ money(allocatedToll) }}；
          预计毛利率
          {{
            form.freightIncome ? money((projectedGrossProfit / form.freightIncome) * 100) : '0.00'
          }}%。
        </p>
        <p class="mb-0 mt-2 text-xs leading-5 text-[var(--el-text-color-secondary)]">
          以上为业务预计值，不是已审核成本或财务过账。共享成本分摊后的预计毛利须结合主任务实际费用查看。
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
  import type { FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    createReturnTrip,
    fetchReturnSharedToll,
    fetchReturnTripCandidates,
    type ReturnTripCandidate,
    type ReturnTripInput
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
  const sharedToll = ref(0)
  const form = reactive<ReturnTripInput>({
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
  const routeFormItems: FormItem[] = [
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
  ]
  const rules: FormRules<ReturnTripInput> = {
    originStation: [{ required: true, message: '请填写返程始发地', trigger: 'blur' }],
    destinationStation: [{ required: true, message: '请填写返程目的地', trigger: 'blur' }]
  }
  const directExpense = computed(
    () => form.informationFee + form.technicalServiceFee + form.directTollFee + form.directMiscFee
  )
  const allocatedToll = computed(
    () =>
      sharedToll.value *
      (allocationMode.value === 'allocate' ? form.sharedCostAllocationPct / 100 : 0)
  )
  const projectedGrossProfit = computed(
    () => form.freightIncome - directExpense.value - allocatedToll.value
  )

  watch(selectedWaybillId, async (waybillId) => {
    sharedToll.value = 0
    if (!waybillId) return
    try {
      const amount = await fetchReturnSharedToll(waybillId)
      if (selectedWaybillId.value === waybillId) sharedToll.value = amount
    } catch {
      ElMessage.error('共用路桥费读取失败，请重试')
    }
  })

  function money(value: number): string {
    return Number(value || 0).toFixed(2)
  }

  async function handleOpen(row: OrderRecord): Promise<void> {
    if (!row.id) return
    order.value = row
    Object.assign(form, {
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
    candidates.value = await fetchReturnTripCandidates(String(row.id))
    selectedWaybillId.value =
      candidates.value.find(
        (candidate) =>
          !candidate.hasReturnLeg && !['cancelled', 'completed'].includes(candidate.status)
      )?.id ?? ''
    await drawerRef.value?.handleOpen(null, {
      title: '新增返程配货',
      subtitle: '一趟出车 · 正向货与返程货共用主运输任务'
    })
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
