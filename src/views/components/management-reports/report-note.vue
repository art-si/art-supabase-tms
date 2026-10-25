<template>
  <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-g-700">
    <span>{{ description }}</span>
    <ElButton text size="small" @click="dialogRef?.handleOpen()"
      ><span class="art-icon-label"
        ><ArtSvgIcon icon="ri:information-line" />统计口径</span
      ></ElButton
    >
    <ArtDialog
      ref="dialogRef"
      title="统计口径"
      size="md"
      content-max-height="55vh"
      :show-fullscreen-button="false"
      :show-confirm-button="false"
      cancel-text="关闭"
    >
      <div class="space-y-3 text-sm leading-7 text-g-800">
        <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      </div>
    </ArtDialog>
  </div>
</template>
<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { computed, ref } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  const props = defineProps<{ description: string; note: string }>()
  const dialogRef = ref<ArtDialogExpose>()
  const paragraphs = computed(() => props.note.split(/(?<=。)\s*|\n+/u).filter(Boolean))
</script>
