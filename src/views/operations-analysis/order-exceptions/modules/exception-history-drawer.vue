<template>
  <ArtDrawer
    ref="drawerRef"
    size="md"
    :loading="state.loading"
    :show-footer="false"
    :show-fullscreen-button="false"
  >
    <ArtAsyncState
      :error="state.error"
      :empty="!state.loading && !state.rows.length"
      empty-text="暂无处理记录"
      empty-description="刷新台账后可重新查看。"
      @retry="loadHistory"
    >
      <ElTimeline class="pt-2 pr-2">
        <ElTimelineItem
          v-for="(entry, index) in state.rows"
          :key="index"
          :timestamp="formatDateTimeValue(entry.at)"
          placement="top"
        >
          <div class="flex flex-wrap items-center gap-2">
            <strong>{{ actionLabels[entry.action] ?? '处理记录' }}</strong>
            <ElTag size="small" effect="plain">{{
              statusLabels[entry.status] ?? '状态待核实'
            }}</ElTag>
          </div>
          <p class="mt-2 text-sm text-[var(--el-text-color-secondary)]"
            >操作人：{{ entry.actorName }}</p
          >
          <p class="mt-2 whitespace-pre-wrap break-words">{{
            entry.note || '登记异常，等待核实处理。'
          }}</p>
          <p v-if="entry.action === 'resolve'" class="mt-2 text-sm">
            货损：{{ reportNumber(entry.damageAmount) }} 元 · 理赔：{{
              reportNumber(entry.claimAmount)
            }}
            元
          </p>
        </ElTimelineItem>
      </ElTimeline>
    </ArtAsyncState>
  </ArtDrawer>
</template>
<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { ElTag, ElTimeline, ElTimelineItem } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import {
    getOrderExceptionHistory,
    type OrderExceptionHistoryEntry
  } from '@tms/api/modules/order-exceptions'
  import { reportNumber } from '../../../components/management-reports/report-cells'

  interface HistoryContext {
    id: string
    orderNo: string
  }
  interface HistoryState {
    id: string
    loading: boolean
    error: string
    rows: OrderExceptionHistoryEntry[]
  }
  const drawerRef = ref<ArtDrawerExpose<HistoryContext>>()
  const state = reactive<HistoryState>({ id: '', loading: false, error: '', rows: [] })
  const actionLabels: Record<string, string> = {
    create: '登记异常',
    start: '开始处理',
    resolve: '登记结果',
    close: '确认结案',
    reopen: '退回处理'
  }
  const statusLabels: Record<string, string> = {
    pending: '待处理',
    in_progress: '处理中',
    resolved: '待结案',
    closed: '已结案'
  }
  let requestVersion = 0
  async function loadHistory(): Promise<void> {
    const version = ++requestVersion
    Object.assign(state, { loading: true, error: '', rows: [] })
    try {
      const rows = await getOrderExceptionHistory(state.id)
      if (version === requestVersion) state.rows = rows
    } catch (error) {
      if (version === requestVersion)
        state.error = getFriendlySupabaseErrorMessage(error, '处理历史加载失败，请重试')
    } finally {
      if (version === requestVersion) state.loading = false
    }
  }
  async function handleOpen(context: HistoryContext): Promise<void> {
    Object.assign(state, { id: context.id, rows: [], error: '', loading: true })
    await drawerRef.value?.handleOpen(context, {
      title: '异常处理历史',
      subtitle: `订单 ${context.orderNo} · 理赔登记不代表已付款`,
      onOpen: loadHistory
    })
  }
  defineExpose({ handleOpen })
</script>
