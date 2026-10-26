<template>
  <ArtDialog ref="dialogRef" width="700px" :show-footer="false">
    <div class="space-y-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--el-fill-color-light)] p-3"
      >
        <div>
          <span class="text-xs text-[var(--el-text-color-secondary)]">关联运输订单</span>
          <strong class="ml-2 text-sm">{{ order?.orderNo }}</strong>
        </div>
        <ElSelect
          v-if="candidates.length > 1"
          v-model="selectedWaybillId"
          class="w-52"
          aria-label="选择主运输任务"
          @change="loadSummary"
        >
          <ElOption
            v-for="candidate in candidates"
            :key="candidate.id"
            :value="candidate.id"
            :label="candidate.waybillNo"
          />
        </ElSelect>
        <strong v-else class="text-sm">{{ candidates[0]?.waybillNo }}</strong>
      </div>
      <ArtSectionCard
        title="一趟运输 · 收入与返程毛利"
        subtitle="正向收入按主单或拆合单分摊额读取，返程收入只归本趟出车。"
        :loading="loading"
        preserve-content-structure
      >
        <div v-if="summary" class="grid gap-3 sm:grid-cols-3">
          <div
            v-for="metric in metrics"
            :key="metric.label"
            class="rounded-lg border border-[var(--el-border-color-light)] p-3"
          >
            <span class="block text-xs text-[var(--el-text-color-secondary)]">{{
              metric.label
            }}</span>
            <strong
              class="mt-1 block text-lg"
              :class="metric.emphasis ? 'text-[var(--el-color-primary)]' : ''"
            >
              ¥{{ money(metric.value) }}
            </strong>
          </div>
        </div>
        <ElEmpty v-else-if="!loading" description="该运输任务暂无返程配货记录" />
      </ArtSectionCard>
      <ArtSectionCard v-if="summary" title="返程预计成本分解" preserve-content-structure>
        <div class="grid gap-2 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-4"
            ><span>返程专属费用</span
            ><strong>¥{{ money(summary.returnDirectPlannedExpense) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>已审核共用路桥费</span
            ><strong>¥{{ money(summary.sharedApprovedToll) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>返程分摊路桥费</span
            ><strong>¥{{ money(summary.returnAllocatedToll) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>返程预计毛利率</span
            ><strong>{{ money(summary.returnProjectedMargin) }}%</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>正向司机提成预估</span
            ><strong>{{ commission(summary.forwardCommissionEstimate) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>返程司机提成预估</span
            ><strong>{{ commission(summary.returnCommissionEstimate) }}</strong></div
          >
        </div>
      </ArtSectionCard>
      <ElAlert
        title="以上均为预计业务值，返程专属费用尚未进入已审核成本、应收应付或 FMS 过账。"
        type="info"
        :closable="false"
        show-icon
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    fetchReturnTripCandidates,
    fetchReturnTripSummary,
    type ReturnTripCandidate,
    type ReturnTripSummary
  } from '@tms/api/modules/return-trip'

  type OrderRecord = Api.Tms.Order.OrderRecord
  const dialogRef = ref<ArtDialogExpose>()
  const order = ref<OrderRecord>()
  const candidates = ref<ReturnTripCandidate[]>([])
  const selectedWaybillId = ref('')
  const summary = ref<ReturnTripSummary>()
  const loading = ref(false)
  const metrics = computed(() => [
    { label: '正向货收入', value: summary.value?.forwardRevenue ?? 0 },
    { label: '返程货收入', value: summary.value?.returnRevenue ?? 0 },
    { label: '本趟合计预计收入', value: summary.value?.tripPlannedRevenue ?? 0 },
    { label: '返程专属预计费用', value: summary.value?.returnDirectPlannedExpense ?? 0 },
    { label: '返程分摊共用费用', value: summary.value?.returnAllocatedToll ?? 0 },
    { label: '返程预计毛利', value: summary.value?.returnProjectedGrossProfit ?? 0, emphasis: true }
  ])

  function money(value: number): string {
    return Number(value || 0).toFixed(2)
  }

  function commission(value: ReturnTripSummary['returnCommissionEstimate']): string {
    return value?.matched ? `¥${money(Number(value.amount))}` : '暂无匹配规则'
  }

  async function loadSummary(): Promise<void> {
    const waybillId = selectedWaybillId.value
    if (!waybillId) return
    loading.value = true
    try {
      const result = await fetchReturnTripSummary(waybillId)
      if (selectedWaybillId.value === waybillId) summary.value = result
    } finally {
      loading.value = false
    }
  }

  async function handleOpen(row: OrderRecord): Promise<void> {
    if (!row.id) return
    order.value = row
    summary.value = undefined
    candidates.value = (await fetchReturnTripCandidates(String(row.id))).filter(
      (candidate) => candidate.hasReturnLeg
    )
    selectedWaybillId.value = candidates.value[0]?.id ?? ''
    await dialogRef.value?.handleOpen(null, {
      title: '返程收益预估',
      subtitle: '同一主运输任务的正向货、返程货与分摊成本'
    })
    if (selectedWaybillId.value) await loadSummary()
  }

  defineExpose({ handleOpen })
</script>
