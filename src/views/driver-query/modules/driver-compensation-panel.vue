<template>
  <ArtSectionCard
    title="工资薪酬"
    subtitle="仅显示 HR 已批准且当前生效的基础薪酬方案；实际发薪以 HR 薪酬模块为准"
    :loading="state.loading"
    :error="state.error"
    :empty="!state.current"
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
    :min-height="168"
    @retry="loadCompensation"
  >
    <ArtDescriptions
      v-if="state.current"
      :data="state.current"
      :items="descriptionItems"
      :columns="3"
    />
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { fetchDriverCompensation, type DriverCompensationRecord } from '@/api/driver-compensation'
  import { useAuth } from '@/hooks/core/useAuth'
  import { formatSensitiveCurrencyValue } from '@/utils/ui/format'
  import { formatWithDayjs } from '@/utils/time'

  defineOptions({ name: 'TmsDriverCompensationPanel' })

  const props = defineProps<{ driverId: string }>()
  const { hasAuth } = useAuth()
  const canViewAmount = computed(
    () =>
      hasAuth('TmsDriverQuery:View') &&
      hasAuth('Hr:Compensation:View') &&
      hasAuth('Hr:Compensation:Amount:View')
  )
  const state = reactive<{
    current: DriverCompensationRecord | null
    employeeLinked: boolean | null
    loading: boolean
    error: string | null
  }>({ current: null, employeeLinked: null, loading: false, error: null })
  const emptyTitle = computed(() => {
    if (!canViewAmount.value) return '暂无薪酬查看权限'
    if (state.employeeLinked === false) return '司机尚未关联员工档案'
    return '暂无生效的薪酬方案'
  })
  const emptyDescription = computed(() => {
    if (!canViewAmount.value) return '需要同时具备 HR 薪酬查看和薪酬金额查看权限。'
    if (state.employeeLinked === false) return '请先在司机档案中关联同租户员工。'
    return '只有已批准且当前生效的 HR 薪酬记录会显示在这里。'
  })
  const descriptionItems: ArtDescriptionItem<DriverCompensationRecord>[] = [
    { key: 'planName', label: '薪酬方案', field: 'planName' },
    {
      key: 'baseAmount',
      label: '基础薪酬',
      value: (record: DriverCompensationRecord) =>
        formatSensitiveCurrencyValue(record.baseAmount, record.currencyCode)
    },
    { key: 'payFrequency', label: '发薪频率', field: 'payFrequency', dictCode: 'hrPayFrequency' },
    {
      key: 'effectiveFrom',
      label: '生效日期',
      value: (record: DriverCompensationRecord) =>
        formatWithDayjs(record.effectiveFrom, 'YYYY-MM-DD') || '--'
    },
    {
      key: 'effectiveTo',
      label: '截止日期',
      value: (record: DriverCompensationRecord) =>
        formatWithDayjs(record.effectiveTo, 'YYYY-MM-DD') || '长期有效'
    },
    { key: 'status', label: '审批状态', value: () => '已批准' }
  ]

  let requestId = 0
  async function loadCompensation(): Promise<void> {
    const currentRequest = ++requestId
    state.current = null
    state.employeeLinked = null
    state.error = null
    if (!props.driverId || !canViewAmount.value) {
      state.loading = false
      return
    }
    state.loading = true
    try {
      const result = await fetchDriverCompensation(props.driverId)
      if (currentRequest !== requestId || !canViewAmount.value) return
      state.current = result?.current ?? null
      state.employeeLinked = result?.employeeLinked ?? null
    } catch {
      if (currentRequest !== requestId) return
      state.error = '司机薪酬加载失败，请重试。'
    } finally {
      if (currentRequest === requestId) state.loading = false
    }
  }

  watch(
    () => [props.driverId, canViewAmount.value],
    () => void loadCompensation(),
    { immediate: true }
  )
</script>
