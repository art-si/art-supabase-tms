<template>
  <div class="business-workspace-page management-report-page art-full-height min-w-0">
    <BusinessWorkspaceHeader
      density="compact"
      :eyebrow="eyebrow"
      :title="title"
      :description="description"
      :icon="icon"
      :metrics="metrics"
    >
      <template #actions><BusinessTableWorkspaceActions :table="table" /></template>
    </BusinessWorkspaceHeader>
    <slot />
  </div>
</template>
<script setup lang="ts">
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  defineProps<{
    title: string
    eyebrow: string
    description: string
    icon: string
    metrics: BusinessWorkspaceMetric[]
    table?: ArtTableQueryExpose
  }>()
</script>
<style scoped lang="scss">
  .management-report-page {
    @media (width <= 640px) {
      height: auto;

      :deep(.art-table-card) {
        min-height: 560px;
      }
    }

    :deep(.art-search-bar) {
      container-type: inline-size;
    }

    :deep(.art-search-bar .el-row) {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      column-gap: 12px;
    }

    :deep(.art-search-bar .el-col) {
      width: 100%;
      max-width: 100%;
    }

    @container (width >= 780px) {
      :deep(.art-search-bar .el-row) {
        grid-template-columns: minmax(300px, 380px) minmax(220px, 300px) max-content;
      }
    }
  }
</style>
