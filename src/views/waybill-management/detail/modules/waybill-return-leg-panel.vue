<template>
  <ArtSectionCard
    title="同一趟运输 · 正向与返程"
    subtitle="两段货单共用主运输任务号；共用路桥费只在主单登记一次，返程仅显示分摊额。"
    preserve-content-structure
  >
    <ArtAsyncState
      :loading="loading"
      loading-mode="skeleton"
      :error="error"
      :empty="!summary?.returnLegId"
      empty-text="本趟暂无返程货单"
      empty-description="完成返程配货后，正向与返程收入及毛利会在这里汇总。"
      size="compact"
      @retry="load"
    >
      <div v-if="summary" class="space-y-4">
        <div class="grid gap-3 lg:grid-cols-2">
          <article class="rounded-xl border border-[var(--el-border-color-light)] p-4">
            <div class="flex items-center gap-2">
              <span
                class="flex size-7 items-center justify-center rounded-lg bg-[var(--el-fill-color-light)] text-[var(--el-text-color-regular)]"
              >
                <ArtSvgIcon icon="ri:truck-line" aria-hidden="true" />
              </span>
              <strong class="text-sm">正向货</strong>
              <ElTag size="small" type="info">主单</ElTag>
            </div>
            <p class="mb-0 mt-3 text-base font-semibold text-[var(--el-text-color-primary)]">
              {{ summary.forwardOriginStation || waybill.originCity || '—' }}
              <span class="mx-2 text-[var(--el-text-color-placeholder)]">→</span>
              {{ summary.forwardDestinationStation || waybill.destinationCity || '—' }}
            </p>
            <p class="mb-0 mt-1 text-xs text-[var(--el-text-color-secondary)]">
              客户：{{ waybill.order?.shippingCustomer?.customerName || '—' }}
            </p>
            <dl
              class="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--el-border-color-light)] pt-3 text-sm"
            >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">预计收入</dt
                ><dd class="mt-1 font-semibold tabular-nums">{{
                  formatSensitiveCurrencyValue(summary.forwardRevenue, 'CNY')
                }}</dd></div
              >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">独立成本</dt
                ><dd class="mt-1">未单独分摊</dd></div
              >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">独立毛利</dt
                ><dd class="mt-1">待分摊</dd></div
              >
            </dl>
          </article>

          <article
            class="rounded-xl border border-[var(--el-color-primary-light-5)] bg-[var(--el-color-primary-light-9)] p-4"
          >
            <div class="flex items-center gap-2">
              <span
                class="flex size-7 items-center justify-center rounded-lg bg-[var(--el-bg-color)] text-[var(--el-color-primary)]"
              >
                <ArtSvgIcon icon="ri:arrow-go-back-line" aria-hidden="true" />
              </span>
              <strong class="text-sm">返程配货</strong>
              <ElTag size="small" type="primary">子单 #2</ElTag>
            </div>
            <p class="mb-0 mt-3 text-base font-semibold text-[var(--el-text-color-primary)]">
              {{ summary.returnOriginStation || '—' }}
              <span class="mx-2 text-[var(--el-text-color-placeholder)]">→</span>
              {{ summary.returnDestinationStation || '—' }}
            </p>
            <p class="mb-0 mt-1 text-xs text-[var(--el-text-color-secondary)]">
              返程结算客户：{{ summary.returnCustomerName || '历史子单未指定' }}
            </p>
            <dl
              class="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--el-color-primary-light-5)] pt-3 text-sm"
            >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">预计收入</dt
                ><dd class="mt-1 font-semibold tabular-nums">{{
                  formatSensitiveCurrencyValue(summary.returnRevenue, 'CNY')
                }}</dd></div
              >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">预计费用</dt
                ><dd class="mt-1 font-semibold tabular-nums">{{
                  formatSensitiveCurrencyValue(returnProjectedCost, 'CNY')
                }}</dd></div
              >
              <div
                ><dt class="text-xs text-[var(--el-text-color-secondary)]">预计毛利</dt
                ><dd class="mt-1 font-semibold tabular-nums text-[var(--el-color-primary)]">{{
                  formatSensitiveCurrencyValue(summary.returnProjectedGrossProfit, 'CNY')
                }}</dd></div
              >
            </dl>
          </article>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--el-fill-color-light)] px-4 py-3 text-sm"
        >
          <span class="text-[var(--el-text-color-secondary)]">本趟合计预计收入（正向 + 返程）</span>
          <strong class="tabular-nums">{{
            formatSensitiveCurrencyValue(summary.tripPlannedRevenue, 'CNY')
          }}</strong>
        </div>

        <div
          v-if="hasApprovedActual"
          class="rounded-lg border border-[var(--el-border-color-light)] p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <strong class="text-sm">返程财务已审核 · 截至当前</strong>
            <ElTag
              v-if="summary.actualAccountingStatus === 'partial_cost'"
              size="small"
              type="warning"
              >部分费用待审核</ElTag
            >
            <ElTag v-else size="small" type="success">已审核口径</ElTag>
          </div>
          <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div
              ><dt class="text-xs text-[var(--el-text-color-secondary)]">收入</dt
              ><dd class="mt-1 font-semibold tabular-nums">{{
                formatSensitiveCurrencyValue(summary.returnActualRevenue, 'CNY')
              }}</dd></div
            >
            <div
              ><dt class="text-xs text-[var(--el-text-color-secondary)]">成本</dt
              ><dd class="mt-1 font-semibold tabular-nums">{{
                formatSensitiveCurrencyValue(summary.returnActualCost, 'CNY')
              }}</dd></div
            >
            <div
              ><dt class="text-xs text-[var(--el-text-color-secondary)]">毛利</dt
              ><dd class="mt-1 font-semibold tabular-nums">{{
                formatSensitiveCurrencyValue(summary.returnActualGrossProfit, 'CNY')
              }}</dd></div
            >
          </dl>
        </div>
        <p v-else class="mb-0 text-xs text-[var(--el-text-color-secondary)]">
          返程实际毛利待应收与费用审核后显示；上方均为业务预计值。
        </p>

        <ElButton link type="primary" @click="emit('openFees')">查看本趟费用明细</ElButton>
      </div>
    </ArtAsyncState>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { formatSensitiveCurrencyValue } from '@/utils/ui/format'
  import { fetchReturnTripSummary, type ReturnTripSummary } from '@tms/api/modules/return-trip'

  const props = defineProps<{ waybill: Api.Tms.Waybill.WaybillDetailRecord }>()
  const emit = defineEmits<{ openFees: [] }>()
  const summary = ref<ReturnTripSummary>()
  const loading = ref(false)
  const error = ref<Error | null>(null)
  let requestId = 0

  const hasApprovedActual = computed(
    () =>
      summary.value?.actualAccountingStatus === 'approved_to_date' ||
      summary.value?.actualAccountingStatus === 'partial_cost'
  )
  const returnProjectedCost = computed<number | null>(() => {
    const direct = summary.value?.returnDirectPlannedExpense
    const allocated = summary.value?.returnAllocatedToll
    if (direct == null || allocated == null) return null
    const directAmount = Number(direct)
    const allocatedAmount = Number(allocated)
    return Number.isFinite(directAmount) && Number.isFinite(allocatedAmount)
      ? directAmount + allocatedAmount
      : null
  })

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
