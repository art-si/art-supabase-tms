<template>
  <ArtDialog ref="dialogRef" width="720px">
    <div class="space-y-3">
      <p class="text-sm text-[var(--el-text-color-secondary)]">
        勾选本次预约对应的调度子单。已取消的运单不可选择。
      </p>
      <ElScrollbar max-height="50vh">
        <ElCheckboxGroup v-model="selectedIds" class="grid gap-2">
          <ElCheckbox
            v-for="candidate in candidates"
            :key="candidate.id"
            :value="candidate.id"
            :disabled="candidate.id === anchorWaybillId || candidate.status === 'cancelled'"
            class="m-0! flex h-auto! min-h-14 items-start rounded-lg border border-[var(--el-border-color-lighter)] px-3 py-2"
          >
            <span class="grid min-w-0 gap-1 leading-5">
              <strong class="font-medium text-[var(--el-text-color-primary)]">
                {{ candidate.waybillNo }}
              </strong>
              <small
                class="truncate text-[var(--el-text-color-secondary)]"
                :title="candidate.shipperAddress || ''"
              >
                {{ candidate.sourceOrderNos.join('、') }} ·
                {{ candidate.shipperAddress || '发货地址未开放' }}
              </small>
            </span>
          </ElCheckbox>
        </ElCheckboxGroup>
      </ElScrollbar>
      <ArtEmptyState
        v-if="!candidates.length"
        title="暂无可选的调度子单"
        description="请先创建符合当前条件的调度子单。"
        size="compact"
        :visual-size="64"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import type { AppointmentCandidate } from '@tms/api'
  import { uniq } from 'lodash-es'

  defineOptions({ name: 'TmsAppointmentChildDialog' })

  const emit = defineEmits<{
    (event: 'select', ids: string[]): void
  }>()

  const dialogRef = ref<ArtDialogExpose>()
  const candidates = ref<AppointmentCandidate[]>([])
  const selectedIds = ref<string[]>([])
  const anchorWaybillId = ref('')

  async function handleOpen(options: {
    candidates: AppointmentCandidate[]
    selectedIds: string[]
    anchorWaybillId: string
  }): Promise<void> {
    candidates.value = options.candidates
    selectedIds.value = [...options.selectedIds]
    anchorWaybillId.value = options.anchorWaybillId
    await dialogRef.value?.handleOpen(undefined, {
      title: '选择调度子单',
      confirmText: '确认选择',
      onConfirm: () => {
        emit('select', uniq([...selectedIds.value, anchorWaybillId.value]))
      }
    })
  }

  defineExpose({ handleOpen })
</script>
