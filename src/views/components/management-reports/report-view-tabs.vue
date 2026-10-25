<template>
  <ElTabs v-model="view" aria-label="报表展示方式" class="w-full">
    <ElTabPane label="表格明细" name="table" />
    <ElTabPane label="图表分析" name="chart" />
  </ElTabs>
</template>
<script setup lang="ts">
  const view = defineModel<'table' | 'chart'>({ default: 'table' })
</script>
