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
      empty-text="暂无催收记录"
      empty-description="完成客户沟通后，可通过登记催收保存联系结果。"
      @retry="loadHistory"
    >
      <ElTimeline class="pt-2 pr-2">
        <ElTimelineItem
          v-for="entry in state.rows"
          :key="entry.id"
          :timestamp="formatDateTimeValue(entry.contactedAt)"
          placement="top"
        >
          <strong class="break-words">{{ entry.method }}</strong>
          <p class="mt-2 whitespace-pre-wrap break-words">{{ entry.note }}</p>
          <p class="mt-2 text-sm text-[var(--el-text-color-secondary)]">
            登记人：{{ entry.actorName }}
          </p>
          <p v-if="entry.nextFollowUp" class="mt-1 text-sm"> 下次跟进：{{ entry.nextFollowUp }} </p>
        </ElTimelineItem>
      </ElTimeline>
    </ArtAsyncState>
  </ArtDrawer>
</template>
<script setup lang="ts">
  import { reactive, ref } from 'vue'
  import { ElTimeline, ElTimelineItem } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import {
    listReceivableCollections,
    type ReceivableCollectionRecord
  } from '@tms/api/modules/receivable-collections'

  interface HistoryContext {
    documentId: string
    documentNo: string
  }
  const drawerRef = ref<ArtDrawerExpose<HistoryContext>>()
  const state = reactive<{
    documentId: string
    loading: boolean
    error: string
    rows: ReceivableCollectionRecord[]
  }>({ documentId: '', loading: false, error: '', rows: [] })
  let requestVersion = 0

  async function loadHistory(): Promise<void> {
    const version = ++requestVersion
    Object.assign(state, { loading: true, error: '', rows: [] })
    try {
      const rows = await listReceivableCollections(state.documentId)
      if (version === requestVersion) state.rows = rows
    } catch (error) {
      if (version === requestVersion)
        state.error = getFriendlySupabaseErrorMessage(error, '催收历史加载失败，请重试')
    } finally {
      if (version === requestVersion) state.loading = false
    }
  }

  async function handleOpen(context: HistoryContext): Promise<void> {
    Object.assign(state, { documentId: context.documentId, rows: [], error: '', loading: true })
    await drawerRef.value?.handleOpen(context, {
      title: '催收历史',
      subtitle: `应收单 ${context.documentNo} · 按联系时间倒序`,
      onOpen: loadHistory
    })
  }
  defineExpose({ handleOpen })
</script>
