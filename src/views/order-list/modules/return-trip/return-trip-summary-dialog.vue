<template>
  <ArtDialog ref="dialogRef" width="min(96vw, 760px)" :show-footer="false">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:arrow-go-back-line"
        eyebrow="关联运输订单"
        :title="order?.orderNo || '—'"
        :description="
          selectedWaybill?.waybillNo
            ? `主运输任务 ${selectedWaybill.waybillNo}`
            : '暂无关联主运输任务'
        "
        compact
      >
        <template v-if="candidates.length > 1" #aside>
          <ElSelect
            v-model="selectedWaybillId"
            class="w-52 max-w-full"
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
        </template>
      </ArtEntitySummary>
      <ElTabs v-model="activeTab">
        <ElTabPane name="forecast" label="预计收益">
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
                class="min-w-0 rounded-[var(--art-control-radius)] border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] p-3"
              >
                <span class="block text-xs text-[var(--el-text-color-secondary)]">{{
                  metric.label
                }}</span>
                <strong
                  class="mt-1 block text-lg tabular-nums"
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
            v-if="summary?.returns?.length"
            class="mt-4"
            title="返程调度明细"
            subtitle="各段返程均关联同一张正向调度单；配载与空载共用返程序号。"
            preserve-content-structure
          >
            <ul class="m-0 list-none divide-y divide-[var(--el-border-color-light)] p-0">
              <li
                v-for="segment in summary.returns"
                :key="segment.waybillId"
                class="py-3 first:pt-0 last:pb-0"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <strong class="break-all text-sm">{{ segment.waybillNo }}</strong>
                  <ElTag
                    size="small"
                    :type="segment.dispatchType === 'return_empty' ? 'info' : 'primary'"
                  >
                    {{ segment.dispatchType === 'return_empty' ? '返程空载' : '返程配载' }}
                  </ElTag>
                </div>
                <p class="mb-0 mt-1 text-xs text-[var(--el-text-color-secondary)]">
                  {{ segment.originStation || '—' }} → {{ segment.destinationStation || '—' }}
                  <span v-if="segment.returnCustomerName"> · {{ segment.returnCustomerName }}</span>
                </p>
                <dl class="mb-0 mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div
                    v-for="metric in segmentMetrics(segment)"
                    :key="metric.label"
                    class="min-w-0"
                  >
                    <dt class="text-xs text-[var(--el-text-color-secondary)]">{{
                      metric.label
                    }}</dt>
                    <dd class="ml-0 mt-1 break-all font-semibold tabular-nums">{{
                      amount(metric.value)
                    }}</dd>
                  </div>
                </dl>
              </li>
            </ul>
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane v-if="summary" name="actual" label="已审核财务">
          <ArtSectionCard
            title="财务已审核 · 截至当前"
            subtitle="以 FMS 已审核应收与已审核运单费用计算；后续费用入账会改变毛利。"
            preserve-content-structure
          >
            <div v-if="hasTripActual" class="mb-4 grid gap-3 sm:grid-cols-3">
              <div
                v-for="metric in tripActualMetrics"
                :key="metric.label"
                class="min-w-0 rounded-[var(--art-control-radius)] bg-[var(--el-fill-color-light)] p-3"
              >
                <span class="block text-xs text-[var(--el-text-color-secondary)]">{{
                  metric.label
                }}</span>
                <strong class="mt-1 block break-all text-lg tabular-nums">{{
                  amount(metric.value)
                }}</strong>
              </div>
            </div>
            <div v-if="hasApprovedActual" class="grid gap-3 sm:grid-cols-3">
              <div
                v-for="metric in actualMetrics"
                :key="metric.label"
                class="min-w-0 rounded-[var(--art-control-radius)] border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] p-3"
              >
                <span class="block text-xs text-[var(--el-text-color-secondary)]">{{
                  metric.label
                }}</span>
                <strong
                  class="mt-1 block text-lg tabular-nums"
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
        </ElTabPane>
        <ElTabPane v-if="summary" name="cost" label="预计成本分解">
          <ArtSectionCard title="返程预计成本分解" preserve-content-structure>
            <div class="grid gap-2 text-sm">
              <div
                class="flex items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] py-2"
                ><span class="min-w-0 text-[var(--el-text-color-regular)]">返程专属费用</span
                ><strong class="shrink-0 text-right tabular-nums">{{
                  amount(summary.returnDirectPlannedExpense)
                }}</strong></div
              >
              <div
                class="flex items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] py-2"
                ><span class="min-w-0 text-[var(--el-text-color-regular)]">已审核共用路桥费</span
                ><strong class="shrink-0 text-right tabular-nums">{{
                  amount(summary.sharedApprovedToll)
                }}</strong></div
              >
              <div
                class="flex items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] py-2"
                ><span class="min-w-0 text-[var(--el-text-color-regular)]">返程分摊路桥费</span
                ><strong class="shrink-0 text-right tabular-nums">{{
                  amount(summary.returnAllocatedToll)
                }}</strong></div
              >
              <div
                class="flex items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] py-2"
                ><span class="min-w-0 text-[var(--el-text-color-regular)]">返程预计毛利率</span
                ><strong class="shrink-0 text-right tabular-nums">{{
                  percent(summary.returnProjectedMargin)
                }}</strong></div
              >
              <div
                class="flex items-start justify-between gap-4 border-b border-[var(--el-border-color-lighter)] py-2"
                ><span class="min-w-0 text-[var(--el-text-color-regular)]">正向司机提成预估</span
                ><strong class="shrink-0 text-right tabular-nums">{{
                  commission(summary.forwardCommissionEstimate)
                }}</strong></div
              >
              <div class="flex items-start justify-between gap-4 py-2"
                ><span class="min-w-0 text-[var(--el-text-color-regular)]"
                  >返程司机最终提成预估（计入毛利）</span
                ><strong class="shrink-0 text-right tabular-nums">{{
                  amount(summary.returnPlannedCommission)
                }}</strong></div
              >
            </div>
          </ArtSectionCard>
        </ElTabPane>
      </ElTabs>
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
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { formatPercentValue, formatSensitiveCurrencyValue } from '@/utils/ui/format'
  import {
    fetchReturnTripCandidates,
    fetchReturnTripSummary,
    type ReturnTripCandidate,
    type ReturnSegmentSummary,
    type ReturnTripSummary
  } from '@tms/api/modules/return-trip'

  type OrderRecord = Api.Tms.Order.OrderRecord
  const activeTab = ref('forecast')
  const dialogRef = ref<ArtDialogExpose>()
  const order = ref<OrderRecord>()
  const candidates = ref<ReturnTripCandidate[]>([])
  const selectedWaybillId = ref('')
  const selectedWaybill = computed(() =>
    candidates.value.find((candidate) => candidate.id === selectedWaybillId.value)
  )
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
  const hasTripActual = computed(
    () => summary.value?.tripActualRevenue != null && summary.value?.tripActualCost != null
  )
  const tripActualMetrics = computed(() => [
    { label: '本趟已审核收入', value: summary.value?.tripActualRevenue },
    { label: '本趟已审核成本', value: summary.value?.tripActualCost },
    { label: '本趟已审核毛利', value: summary.value?.tripActualGrossProfit }
  ])
  const segmentMetrics = (segment: ReturnSegmentSummary) => [
    { label: '预计收入', value: segment.plannedRevenue },
    { label: '专属预计费用', value: segment.directPlannedExpense },
    { label: '共用费用分摊', value: segment.allocatedSharedToll },
    { label: '预计司机提成', value: segment.plannedCommission },
    { label: '预计毛利', value: segment.projectedGrossProfit },
    { label: '已审核毛利', value: segment.actualGrossProfit }
  ]
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

  function amount(value: number | string | null | undefined): string {
    return value == null || value === '' ? '—' : formatSensitiveCurrencyValue(value)
  }

  function percent(value: number | string | null | undefined): string {
    return formatPercentValue(value, { emptyText: '—', fractionDigits: 2 })
  }

  function commission(value: ReturnTripSummary['returnCommissionEstimate']): string {
    return value?.matched ? amount(value.amount) : '暂无匹配规则'
  }

  async function loadSummary(): Promise<void> {
    activeTab.value = 'forecast'
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
    activeTab.value = 'forecast'
    if (!row.id) return
    order.value = row
    summary.value = undefined
    candidates.value = []
    selectedWaybillId.value = ''
    loadError.value = false
    loading.value = true
    const orderId = row.id
    await dialogRef.value?.handleOpen(null, {
      title: '返程收益预估',
      subtitle: '同一主运输任务的正向货、各段返程与分摊成本',
      onOpen: async () => {
        try {
          const records = await fetchReturnTripCandidates(orderId)
          if (order.value?.id !== orderId) return
          candidates.value = records.filter((candidate) => candidate.hasReturnLeg)
          selectedWaybillId.value = candidates.value[0]?.id ?? ''
          if (selectedWaybillId.value) await loadSummary()
        } catch {
          if (order.value?.id === orderId) loadError.value = true
        } finally {
          if (order.value?.id === orderId) loading.value = false
        }
      }
    })
  }

  defineExpose({ handleOpen })
</script>
