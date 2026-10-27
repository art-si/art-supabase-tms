<template>
  <ArtDialog ref="dialogRef" width="680px" :loading="loading">
    <div class="space-y-4">
      <ArtSectionCard
        title="正向货司机提成"
        subtitle="根据司机、车型、线路、方向和生效日期自动匹配；手工调整会记录原因与操作人。"
        preserve-content-structure
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg bg-[var(--el-fill-color-light)] p-3">
            <span class="block text-xs text-[var(--el-text-color-secondary)]">已保存提成预估</span>
            <strong class="mt-1 block text-xl tabular-nums text-[var(--el-color-primary)]">
              {{ currentAmount }}
            </strong>
          </div>
          <div class="rounded-lg bg-[var(--el-fill-color-light)] p-3">
            <span class="block text-xs text-[var(--el-text-color-secondary)]">计算来源</span>
            <strong class="mt-1 block text-sm">{{ estimateSource }}</strong>
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard title="调整本趟提成" preserve-content-structure>
        <div class="grid gap-4">
          <label class="grid gap-1.5 text-sm text-[var(--el-text-color-regular)]">
            <span>本次拟调整金额（元）</span>
            <ElInputNumber
              v-model="amount"
              class="w-full!"
              :min="0"
              :max="1000000000"
              :precision="2"
              :controls="false"
            />
          </label>
          <label class="grid gap-1.5 text-sm text-[var(--el-text-color-regular)]">
            <span>调整原因</span>
            <ElInput
              v-model="reason"
              type="textarea"
              :rows="3"
              minlength="5"
              maxlength="500"
              show-word-limit
              placeholder="说明线路、车型或费用变化的原因（至少 5 字）"
            />
          </label>
        </div>
        <p class="mb-0 mt-3 text-xs text-[var(--el-text-color-secondary)]">
          只有点击“确定”后才会保存本次金额；保存时将记录原估算、原因、操作人和时间。
        </p>
      </ArtSectionCard>

      <ArtSectionCard title="调整记录" preserve-content-structure>
        <div v-if="summary?.history.length" class="space-y-2">
          <div
            v-for="record in summary.history"
            :key="record.id"
            class="rounded-lg border border-[var(--el-border-color-light)] p-3 text-sm"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <strong>¥{{ money(record.amount) }}</strong>
              <span class="text-xs text-[var(--el-text-color-secondary)]">
                {{ record.actorName }} · <time>{{ formatDateTime(record.createdAt) }}</time>
              </span>
            </div>
            <p class="mb-0 mt-1 break-words text-[var(--el-text-color-regular)]">
              {{ record.reason }}
            </p>
          </div>
        </div>
        <ArtEmptyState
          v-else
          title="暂无人工调整"
          description="保存调整后，金额、原因、操作人和时间会在此留痕。"
          size="compact"
          :visual-size="64"
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import {
    fetchWaybillCommission,
    overrideForwardCommission,
    type WaybillCommissionSummary
  } from '@tms/api/modules/waybill-commission'

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const summary = ref<WaybillCommissionSummary>()
  const amount = ref<number | null>(0)
  const reason = ref('')
  const loading = ref(false)
  const waybillId = ref('')
  const formatDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '-',
    invalidText: '-'
  })

  const currentAmount = computed(() => {
    const estimate = summary.value?.estimate
    return estimate?.amount == null ? '暂无匹配规则' : `¥${money(estimate.amount)}`
  })
  const estimateSource = computed(() => {
    const estimate = summary.value?.estimate
    if (estimate?.manualOverride) return '人工调整 · 原规则快照已保留'
    if (estimate?.matched) return `自动匹配 · 规则版本 ${estimate.snapshot?.versionNo ?? '-'}`
    return '暂无匹配的有效提成规则'
  })

  function money(value: number): string {
    return Number(value).toFixed(2)
  }

  async function handleOpen(id: string): Promise<void> {
    waybillId.value = id
    summary.value = undefined
    reason.value = ''
    amount.value = 0
    await dialogRef.value?.handleOpen(undefined, {
      title: '司机提成核对与调整',
      subtitle: '本次调整只影响这趟运输任务，提成规则本身保持原版本',
      onConfirm: submit
    })
    loading.value = true
    try {
      const result = await fetchWaybillCommission(id)
      if (waybillId.value !== id) return
      summary.value = result
      amount.value = result.estimate?.amount ?? 0
    } catch (error) {
      notifyFriendlyError(error, '司机提成资料加载失败，请稍后重试')
      dialogRef.value?.handleClose()
    } finally {
      loading.value = false
    }
  }

  async function submit(): Promise<boolean> {
    if (amount.value == null || amount.value < 0 || amount.value > 1000000000) {
      ElMessage.warning('请填写有效的提成金额')
      return false
    }
    if (reason.value.trim().length < 5) {
      ElMessage.warning('请填写至少 5 字的调整原因')
      return false
    }
    try {
      await overrideForwardCommission(waybillId.value, amount.value, reason.value.trim())
      ElMessage.success('司机提成已调整并留痕')
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '司机提成调整失败，请核对后重试')
      return false
    }
  }

  defineExpose({ handleOpen })
</script>
