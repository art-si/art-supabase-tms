<template>
  <ArtSectionCard
    title="同一趟运输 · 正向与返程"
    subtitle="所有返程均关联正向调度运单；收入和成本按各段汇总。"
    preserve-content-structure
  >
    <ArtAsyncState
      :loading="loading"
      loading-mode="skeleton"
      :error="error"
      :empty="!summary?.returns?.length"
      empty-text="本趟暂无返程调度运单"
      empty-description="新增返程配载或返程空载后，可在这里核对每段收益与整趟成本。"
      size="compact"
      @retry="load"
    >
      <div v-if="summary" class="space-y-4">
        <div class="rounded-xl border border-[var(--el-border-color-light)] p-4">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="text-sm">正向配载</strong>
            <ElTag size="small" type="info">主单</ElTag>
            <span class="text-sm font-medium tabular-nums">{{
              summary.forwardWaybillNo || waybill.waybillNo
            }}</span>
          </div>
          <p class="mb-0 mt-2 text-sm text-[var(--el-text-color-regular)]">
            {{ summary.forwardOriginStation || waybill.originCity || '—' }}
            <span class="mx-2 text-[var(--el-text-color-placeholder)]">→</span>
            {{ summary.forwardDestinationStation || waybill.destinationCity || '—' }}
          </p>
          <p class="mb-0 mt-2 text-sm">
            预计收入：<strong class="tabular-nums">{{
              formatSensitiveCurrencyValue(summary.forwardRevenue, 'CNY')
            }}</strong>
          </p>
        </div>
        <ol class="m-0 space-y-3 list-none p-0" aria-label="返程调度段">
          <li
            v-for="segment in summary.returns"
            :key="segment.waybillId"
            class="min-w-0 rounded-xl border border-[var(--el-border-color-light)] p-4"
          >
            <div class="flex flex-wrap items-center gap-2">
              <strong class="text-sm">第 {{ segment.sequence }} 段返程</strong>
              <ElTag
                size="small"
                :type="segment.dispatchType === 'return_empty' ? 'info' : 'primary'"
                >{{ segment.dispatchType === 'return_empty' ? '返程空载' : '返程配载' }}</ElTag
              >
              <RouterLink
                class="break-all text-sm font-medium text-[var(--el-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--el-color-primary)]"
                :to="{ name: 'TmsWaybillDetail', params: { id: segment.waybillId } }"
                >{{ segment.waybillNo }}</RouterLink
              >
            </div>
            <p class="mb-0 mt-2 text-sm text-[var(--el-text-color-regular)]">
              {{ segment.originStation || '—' }}
              <span class="mx-2 text-[var(--el-text-color-placeholder)]">→</span>
              {{ segment.destinationStation || '—' }}
              <span v-if="segment.returnCustomerName"> · {{ segment.returnCustomerName }}</span>
            </p>
            <dl
              class="mt-3 grid gap-3 border-t border-[var(--el-border-color-light)] pt-3 text-sm sm:grid-cols-3"
            >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">预计收入</dt
                ><dd class="mt-1 font-semibold tabular-nums">{{
                  formatSensitiveCurrencyValue(segment.plannedRevenue, 'CNY')
                }}</dd></div
              >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]"
                  >预计成本（含分摊与提成）</dt
                ><dd class="mt-1 font-semibold tabular-nums">{{
                  formatSensitiveCurrencyValue(segmentCost(segment), 'CNY')
                }}</dd></div
              >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">预计毛利</dt
                ><dd class="mt-1 font-semibold tabular-nums">{{
                  formatSensitiveCurrencyValue(segment.projectedGrossProfit, 'CNY')
                }}</dd></div
              >
            </dl>
          </li>
        </ol>
        <div class="rounded-lg bg-[var(--el-fill-color-light)] px-4 py-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>本趟合计预计收入（正向 + 全部返程）</span>
            <strong class="tabular-nums">{{
              formatSensitiveCurrencyValue(summary.tripPlannedRevenue, 'CNY')
            }}</strong>
          </div>
          <dl
            v-if="hasApprovedActual"
            class="mt-3 grid gap-3 border-t border-[var(--el-border-color-light)] pt-3 sm:grid-cols-3"
          >
            <div
              ><dt class="text-xs text-[var(--el-text-color-secondary)]">已审核收入</dt
              ><dd class="mt-1 font-semibold tabular-nums">{{
                formatSensitiveCurrencyValue(summary.tripActualRevenue, 'CNY')
              }}</dd></div
            >
            <div
              ><dt class="text-xs text-[var(--el-text-color-secondary)]">已审核成本</dt
              ><dd class="mt-1 font-semibold tabular-nums">{{
                formatSensitiveCurrencyValue(summary.tripActualCost, 'CNY')
              }}</dd></div
            >
            <div
              ><dt class="text-xs text-[var(--el-text-color-secondary)]">已审核毛利</dt
              ><dd class="mt-1 font-semibold tabular-nums">{{
                formatSensitiveCurrencyValue(summary.tripActualGrossProfit, 'CNY')
              }}</dd></div
            >
          </dl>
          <p v-else class="mb-0 mt-2 text-xs text-[var(--el-text-color-secondary)]"
            >实际毛利待应收与费用审核后显示；上方均为业务预计值。</p
          >
        </div>
        <ElButton link type="primary" @click="emit('openFees')">查看本趟费用明细</ElButton>
      </div>
    </ArtAsyncState>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { formatSensitiveCurrencyValue } from '@/utils/ui/format'
  import {
    fetchReturnTripSummary,
    type ReturnSegmentSummary,
    type ReturnTripSummary
  } from '@tms/api/modules/return-trip'

  const props = defineProps<{ waybill: Api.Tms.Waybill.WaybillDetailRecord }>()
  const emit = defineEmits<{ openFees: [] }>()
  const summary = ref<ReturnTripSummary>()
  const loading = ref(false)
  const error = ref<Error | null>(null)
  let requestId = 0

  const hasApprovedActual = computed(
    () =>
      summary.value?.tripActualRevenue != null &&
      summary.value?.tripActualCost != null &&
      summary.value?.tripActualGrossProfit != null &&
      (summary.value.actualAccountingStatus === 'approved_to_date' ||
        summary.value.actualAccountingStatus === 'partial_cost')
  )
  function segmentCost(segment: ReturnSegmentSummary): number | '***' | null {
    const direct = segment.directPlannedExpense
    const allocated = segment.allocatedSharedToll
    const commission = segment.plannedCommission
    if (direct == null || allocated == null || commission == null) return null
    if (direct === '***' || allocated === '***' || commission === '***') return '***'
    const directAmount = Number(direct)
    const allocatedAmount = Number(allocated)
    const commissionAmount = Number(commission)
    return Number.isFinite(directAmount) &&
      Number.isFinite(allocatedAmount) &&
      Number.isFinite(commissionAmount)
      ? directAmount + allocatedAmount + commissionAmount
      : null
  }

  async function load(): Promise<void> {
    const currentId = ++requestId
    summary.value = undefined
    error.value = null
    loading.value = true
    try {
      const result = await fetchReturnTripSummary(props.waybill.id)
      if (currentId === requestId) summary.value = result
    } catch (cause) {
      if (currentId === requestId)
        error.value = cause instanceof Error ? cause : new Error('返程资料加载失败')
    } finally {
      if (currentId === requestId) loading.value = false
    }
  }

  watch(
    () => props.waybill.id,
    () => void load(),
    { immediate: true }
  )
</script>
