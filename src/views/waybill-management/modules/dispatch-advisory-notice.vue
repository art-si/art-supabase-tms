<template>
  <div v-if="loading || error || warnings.length" class="grid gap-3" aria-live="polite">
    <ElAlert
      type="warning"
      :closable="false"
      show-icon
      class="whitespace-pre-line"
      :title="label ? `${label} · 风险仅作提醒，不影响配载` : '调度风险仅作提醒，不影响本次配载'"
      :description="description"
    />
  </div>
</template>

<script setup lang="ts">
  import { fetchDispatchAdvisories, type DispatchAdvisory } from '@tms/api'

  defineOptions({ name: 'TmsDispatchAdvisoryNotice' })
  const props = defineProps<{
    orderId?: string
    vehicleId?: string | null
    driverId?: string | null
    label?: string
  }>()
  const warnings = ref<DispatchAdvisory[]>([])
  const loading = ref(false)
  const error = ref('')
  const description = computed(() =>
    loading.value
      ? '正在读取司机与车辆风险信息…'
      : error.value ||
        warnings.value.map((warning) => `${warning.subjectLabel}：${warning.message}`).join('\n')
  )
  let revision = 0

  watch(
    () => [props.orderId, props.vehicleId, props.driverId] as const,
    async ([orderId, vehicleId, driverId], _old, onCleanup) => {
      const current = ++revision
      onCleanup(() => ++revision)
      warnings.value = []
      error.value = ''
      loading.value = false
      if (!orderId || (!vehicleId && !driverId)) return
      loading.value = true
      try {
        const result = await fetchDispatchAdvisories(orderId, vehicleId, driverId)
        if (current !== revision) return
        warnings.value = result.data ?? []
      } catch {
        if (current !== revision) return
        error.value = '风险信息暂未获取，可重选车辆或司机重试；不影响提交，请人工核对。'
      } finally {
        if (current === revision) loading.value = false
      }
    },
    { immediate: true }
  )
</script>
