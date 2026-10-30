<template>
  <ArtDialog ref="dialogRef" width="720px" @close="handleClose">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <strong class="min-w-0 break-all text-sm">{{ waybillNo || '正在读取运单…' }}</strong>
      <ElSegmented
        v-if="legOptions.length > 1"
        :model-value="selectedLegKind"
        :options="legOptions"
        :disabled="loading || saving"
        aria-label="司机提成货段"
        @update:model-value="changeLeg"
      />
      <span v-else class="text-sm text-[var(--el-text-color-secondary)]">{{ legLabel }}</span>
    </div>
    <ArtAsyncState :loading="loading" :error="loadError" :min-height="260" @retry="retryLoad">
      <div v-if="summary" class="space-y-4">
        <ArtSectionCard
          :title="`${legLabel}司机提成`"
          subtitle="按司机、车型、线路、方向和生效日期匹配；人工调整单独记录原因与操作人。"
          preserve-content-structure
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg bg-[var(--el-fill-color-light)] p-3">
              <span class="block text-xs text-[var(--el-text-color-secondary)]"
                >已保存提成预估</span
              >
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

        <ArtSectionCard title="调整当前货段提成" preserve-content-structure>
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
                :disabled="saving || !canOverride"
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
                :disabled="saving || !canOverride"
                placeholder="说明线路、车型或费用变化的原因（至少 5 字）"
              />
            </label>
          </div>
          <p class="mb-0 mt-3 text-xs text-[var(--el-text-color-secondary)]">
            每次仅保存当前货段。切换货段保留本窗口未保存内容；关闭窗口后，未保存内容会丢弃。
          </p>
        </ArtSectionCard>

        <ArtSectionCard :title="`${legLabel}调整记录`" preserve-content-structure>
          <div v-if="summary.history.length" class="space-y-2">
            <div
              v-for="record in summary.history"
              :key="record.id"
              class="rounded-lg border border-[var(--el-border-color-light)] p-3 text-sm"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <strong>{{ formatCurrencyValue(record.amount) }}</strong>
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
            title="当前货段暂无人工调整"
            description="保存调整后，金额、原因、操作人和时间会在此留痕。"
            size="compact"
            :visual-size="64"
          />
        </ArtSectionCard>
      </div>
    </ArtAsyncState>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage, ElSegmented } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import { createDateTimeFormatter, formatCurrencyValue } from '@/utils/ui/format'
  import {
    fetchWaybillCommission,
    overrideWaybillLegCommission,
    type WaybillCommissionLegKind,
    type WaybillCommissionSummary
  } from '@tms/api/modules/waybill-commission'

  interface CommissionDraft {
    amount: number | null
    reason: string
  }

  const emit = defineEmits<{ success: [] }>()
  const { hasAuth } = useAuth()
  const canOverride = computed(() => hasAuth('TmsWaybillDetail:OverrideCommission'))
  const dialogRef = ref<ArtDialogExpose>()
  const selectedLegKind = ref<WaybillCommissionLegKind>('forward')
  const availableLegKinds = ref<WaybillCommissionLegKind[]>(['forward'])
  const summaries = ref<Partial<Record<WaybillCommissionLegKind, WaybillCommissionSummary>>>({})
  const drafts = reactive<Record<WaybillCommissionLegKind, CommissionDraft>>({
    forward: { amount: 0, reason: '' },
    return: { amount: 0, reason: '' }
  })
  const draftInitialized = reactive({ forward: false, return: false })
  const summary = computed(() => summaries.value[selectedLegKind.value])
  const amount = computed({
    get: () => drafts[selectedLegKind.value].amount,
    set: (value: number | null) => {
      drafts[selectedLegKind.value].amount = value
    }
  })
  const reason = computed({
    get: () => drafts[selectedLegKind.value].reason,
    set: (value: string) => {
      drafts[selectedLegKind.value].reason = value
    }
  })
  const loading = ref(false)
  const saving = ref(false)
  const loadError = ref<Error | null>(null)
  const waybillId = ref('')
  const waybillNo = ref('')
  let loadSequence = 0
  const {
    version: dialogSession,
    invalidate: invalidateDialog,
    isCurrent: isCurrentDialog
  } = useArtOverlaySession(() => Boolean(unref(dialogRef.value?.visible)))
  const confirmDisabled = computed(
    () => loading.value || saving.value || !!loadError.value || !summary.value || !canOverride.value
  )
  watch(confirmDisabled, (value) => dialogRef.value?.setOptions({ confirmDisabled: value }))
  const legLabel = computed(() => (selectedLegKind.value === 'return' ? '返程配货' : '正向货'))
  const legOptions = computed(() =>
    availableLegKinds.value.map((value) => ({
      value,
      label: value === 'return' ? '返程配货' : '正向货'
    }))
  )
  const formatDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '—',
    invalidText: '—'
  })
  const currentAmount = computed(() =>
    summary.value?.estimate?.amount == null
      ? '暂无匹配规则'
      : formatCurrencyValue(summary.value.estimate.amount)
  )
  const estimateSource = computed(() => {
    const estimate = summary.value?.estimate
    if (estimate?.manualOverride) return '人工调整 · 调整原因与操作人已留痕'
    if (estimate?.matched) return `自动匹配 · 规则版本 ${estimate.snapshot?.versionNo ?? '—'}`
    return '暂无匹配的有效提成规则'
  })

  async function loadSummary(kind: WaybillCommissionLegKind, force = false): Promise<void> {
    if (!force && summaries.value[kind]) return
    if (force) summaries.value[kind] = undefined
    const id = waybillId.value
    const session = dialogSession.value
    const sequence = ++loadSequence
    loading.value = true
    loadError.value = null
    try {
      const result = await fetchWaybillCommission(id, kind)
      if (!isCurrentDialog(session) || id !== waybillId.value || sequence !== loadSequence) return
      summaries.value[kind] = result
      waybillNo.value = result.waybillNo
      availableLegKinds.value = result.availableLegKinds
      if (!draftInitialized[kind]) {
        drafts[kind] = { amount: result.estimate?.amount ?? 0, reason: '' }
        draftInitialized[kind] = true
      }
    } catch (error) {
      if (isCurrentDialog(session) && id === waybillId.value && sequence === loadSequence)
        loadError.value = error instanceof Error ? error : new Error('司机提成资料加载失败，请重试')
    } finally {
      if (isCurrentDialog(session) && sequence === loadSequence) loading.value = false
    }
  }

  function changeLeg(value: string | number | boolean): void {
    if ((value !== 'forward' && value !== 'return') || loading.value || saving.value) return
    selectedLegKind.value = value
    loadError.value = null
    void loadSummary(value)
  }
  function retryLoad(): void {
    void loadSummary(selectedLegKind.value, true)
  }

  function handleClose(): void {
    invalidateDialog()
    loadSequence += 1
    loading.value = false
    saving.value = false
  }

  async function handleOpen(id: string): Promise<void> {
    if (saving.value) return
    const session = invalidateDialog()
    loadSequence += 1
    waybillId.value = id
    waybillNo.value = ''
    selectedLegKind.value = 'forward'
    availableLegKinds.value = ['forward']
    summaries.value = {}
    loadError.value = null
    draftInitialized.forward = false
    draftInitialized.return = false
    drafts.forward = { amount: 0, reason: '' }
    drafts.return = { amount: 0, reason: '' }
    await dialogRef.value?.handleOpen(undefined, {
      title: '司机提成核对与调整',
      subtitle: '按正向与返程分别核对，仅调整当前货段，不改写提成规则。',
      confirmText: '保存当前货段',
      cancelText: '关闭',
      confirmDisabled: true,
      onClose: () => !saving.value,
      onConfirm: submit
    })
    if (isCurrentDialog(session)) await loadSummary('forward')
  }

  async function submit(): Promise<boolean> {
    if (!summary.value || loading.value || saving.value || loadError.value || !canOverride.value)
      return false
    const kind = selectedLegKind.value
    const id = waybillId.value
    const session = dialogSession.value
    const draft = drafts[kind]
    if (
      draft.amount == null ||
      !Number.isFinite(draft.amount) ||
      draft.amount < 0 ||
      draft.amount > 1000000000
    ) {
      ElMessage.warning('请填写有效的提成金额')
      return false
    }
    if (draft.reason.trim().length < 5) {
      ElMessage.warning('请填写至少 5 字的调整原因')
      return false
    }
    saving.value = true
    try {
      await overrideWaybillLegCommission(id, kind, draft.amount, draft.reason.trim())
      if (!isCurrentDialog(session) || id !== waybillId.value || kind !== selectedLegKind.value)
        return false
      draftInitialized[kind] = false
      ElMessage.success(`${kind === 'return' ? '返程配货' : '正向货'}提成已调整并留痕`)
      emit('success')
      await loadSummary(kind, true)
    } catch (error) {
      if (isCurrentDialog(session) && id === waybillId.value)
        notifyFriendlyError(error, '司机提成调整失败，请核对后重试')
    } finally {
      if (isCurrentDialog(session)) saving.value = false
    }
    return false
  }

  defineExpose({ handleOpen })
</script>
