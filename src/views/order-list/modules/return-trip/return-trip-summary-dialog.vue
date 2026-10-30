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
        title="一趟运输 · 预计收益"
        subtitle="正向收入按主单或拆合单分摊额读取；返程货收入归同一趟运输。"
        :loading="loading"
        :error="loadError ? '请检查网络或权限后重试。' : null"
        error-title="返程收益加载失败"
        preserve-content-structure
        @retry="loadSummary"
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
              {{ amount(metric.value) }}
            </strong>
          </div>
        </div>
        <ArtEmptyState
          v-else-if="!loading"
          title="暂无返程配货记录"
          description="为该运输任务添加返程货单后，可查看本趟收入与预计毛利。"
          size="compact"
        />
      </ArtSectionCard>
      <ArtSectionCard
        v-if="summary"
        title="财务已审核 · 截至当前"
        subtitle="以 FMS 已审核应收与已审核运单费用计算；后续费用入账会改变毛利。"
        preserve-content-structure
      >
        <div v-if="hasApprovedActual" class="grid gap-3 sm:grid-cols-3">
          <div
            v-for="metric in actualMetrics"
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
              {{ amount(metric.value) }}
            </strong>
          </div>
        </div>
        <ArtEmptyState
          v-else
          title="实际毛利待核算"
          :description="actualEmptyDescription"
          size="compact"
        />
        <ElAlert
          v-if="summary.actualAccountingStatus === 'partial_cost'"
          class="mt-3"
          title="仍有待审核的返程费用或共用路桥费，当前数字只反映已审核部分。"
          type="warning"
          :closable="false"
          show-icon
        />
      </ArtSectionCard>
      <ArtSectionCard v-if="summary" title="返程预计成本分解" preserve-content-structure>
        <div class="grid gap-2 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-4"
            ><span>返程专属费用</span
            ><strong>{{ amount(summary.returnDirectPlannedExpense) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>已审核共用路桥费</span
            ><strong>{{ amount(summary.sharedApprovedToll) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>返程分摊路桥费</span
            ><strong>{{ amount(summary.returnAllocatedToll) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>返程预计毛利率</span
            ><strong>{{ percent(summary.returnProjectedMargin) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>正向司机提成预估</span
            ><strong>{{ commission(summary.forwardCommissionEstimate) }}</strong></div
          >
          <div class="flex justify-between gap-4"
            ><span>返程司机最终提成预估（计入毛利）</span
            ><strong>{{ amount(summary.returnPlannedCommission) }}</strong></div
          >
        </div>
      </ArtSectionCard>
      <ElAlert
        title="预计值与财务已审核值分开展示；返程专属费用只有提交并审核后才进入实际成本。"
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
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
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
  const loadError = ref(false)
  const metrics = computed(() => [
    { label: '正向货预计收入', value: summary.value?.forwardRevenue },
    { label: '返程货预计收入', value: summary.value?.returnRevenue },
    { label: '本趟合计预计收入', value: summary.value?.tripPlannedRevenue },
    { label: '返程专属预计费用', value: summary.value?.returnDirectPlannedExpense },
    { label: '返程分摊共用费用', value: summary.value?.returnAllocatedToll },
    {
      label: '返程预计毛利（已扣提成）',
      value: summary.value?.returnProjectedGrossProfit,
      emphasis: true
    }
  ])

  const hasApprovedActual = computed(
    () =>
      summary.value?.actualAccountingStatus === 'approved_to_date' ||
      summary.value?.actualAccountingStatus === 'partial_cost'
  )
  const actualMetrics = computed(() => [
    { label: '已审核返程收入', value: summary.value?.returnActualRevenue },
    { label: '已审核返程成本', value: summary.value?.returnActualCost },
    {
      label: '已审核毛利 · 截至当前',
      value: summary.value?.returnActualGrossProfit,
      emphasis: true
    }
  ])
  const actualEmptyDescription = computed(() =>
    summary.value?.actualAccountingStatus === 'ambiguous_receivable'
      ? '返程应收来源存在重复，请财务核对后再展示实际毛利。'
      : '返程应收完成 FMS 审核后，这里会按已审核费用计算毛利。'
  )

  function money(value: number | string | null | undefined): string {
    if (value === '***') return '***'
    if (value == null || value === '') return '—'
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—'
  }

  function amount(value: number | string | null | undefined): string {
    const formatted = money(value)
    return formatted === '—' || formatted === '***' ? formatted : `¥${formatted}`
  }

  function percent(value: number | string | null | undefined): string {
    const formatted = money(value)
    return formatted === '—' || formatted === '***' ? formatted : `${formatted}%`
  }

  function commission(value: ReturnTripSummary['returnCommissionEstimate']): string {
    return value?.matched ? amount(value.amount) : '暂无匹配规则'
  }

  async function loadSummary(): Promise<void> {
    const waybillId = selectedWaybillId.value
    if (!waybillId) return
    summary.value = undefined
    loadError.value = false
    loading.value = true
    try {
      const result = await fetchReturnTripSummary(waybillId)
      if (selectedWaybillId.value === waybillId) summary.value = result
    } catch {
      if (selectedWaybillId.value === waybillId) loadError.value = true
    } finally {
      if (selectedWaybillId.value === waybillId) loading.value = false
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
