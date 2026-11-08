<template>
  <div class="grid gap-3" aria-live="polite">
    <div v-if="orderId && (vehicleId || driverId)" class="flex justify-end">
      <ElButton
        v-auth="'TmsPendingWaybillList:ResourcePreflight'"
        type="primary"
        plain
        @click="openPreflight"
      >
        <ArtSvgIcon icon="ri:shield-check-line" />调度资源综合核验
      </ElButton>
    </div>
    <ElAlert
      v-if="loading || error || warnings.length"
      type="warning"
      :closable="false"
      show-icon
      class="whitespace-pre-line"
      :title="label ? `${label} · 风险仅作提醒，不影响配载` : '调度风险仅作提醒，不影响本次配载'"
      :description="description"
    />
  </div>
  <DispatchPreflightDrawer ref="preflightRef" />
</template>

<script setup lang="ts">
  import { fetchDispatchAdvisories, type DispatchAdvisory } from '@tms/api'
  import DispatchPreflightDrawer from './dispatch-preflight-drawer.vue'

  const preflightRef = ref<InstanceType<typeof DispatchPreflightDrawer>>()
  function openPreflight(): void {
    if (!props.orderId || (!props.vehicleId && !props.driverId)) return
    void preflightRef.value?.handleOpen({
      orderId: props.orderId,
      tenantId: props.orderTenantId,
      vehicleId: props.vehicleId,
      driverId: props.driverId
    })
  }

  defineOptions({ name: 'TmsDispatchAdvisoryNotice' })
  const props = defineProps<{
    orderId?: string
    orderTenantId?: string | null
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
