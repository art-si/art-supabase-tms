<template>
  <ArtDialog ref="dialogRef" size="xl" :show-fullscreen-button="false">
    <ArtAsyncState :error="error" @retry="load">
      <ArtTable :data="rows" :columns="columns" row-key="_key" :max-height="520" />
    </ArtAsyncState>
  </ArtDialog>
</template>
<script setup lang="ts">
  import { ref, watch } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { fetchMonthlyPerformance } from '@tms/api/modules/monthly-plan'
  import type { ReportRow } from '@tms/api/modules/management-reports'
  import {
    numberColumn,
    textColumn,
    reportNumber
  } from '../../../components/management-reports/report-cells'

  const scope = useTenantScopeStore()
  const dialogRef = ref<ArtDialogExpose>()
  const rows = ref<ReportRow[]>([])
  const error = ref('')
  let end = ''
  let request = 0
  const columns = [
    { ...textColumn('label', '指标名称', 175), fixed: 'left' as const },
    textColumn('category', '分类', 105),
    textColumn('unit', '单位', 80),
    numberColumn('actual', '本月实际', 120),
    {
      ...numberColumn('budget', '整月预算', 120),
      formatter: (row: ReportRow) => (row.budget === null ? '未编制' : reportNumber(row.budget))
    },
    {
      ...numberColumn('difference', '实际－预算', 130),
      formatter: (row: ReportRow) => (row.difference === null ? '—' : reportNumber(row.difference))
    },
    numberColumn('year', '本年累计 / 期末', 155),
    {
      ...numberColumn('target', '整月目标', 120),
      formatter: (row: ReportRow) => (row.target === null ? '未设定' : reportNumber(row.target))
    },
    textColumn('direction', '目标方向', 95),
    { ...textColumn('warning', '目标状态', 110), fixed: 'right' as const },
    textColumn('remark', '编制说明', 220),
    textColumn('basis', '统计说明', 270)
  ]
  async function load(): Promise<void> {
    const token = ++request
    dialogRef.value?.setLoading(true)
    error.value = ''
    rows.value = []
    try {
      const result = await fetchMonthlyPerformance(end, scope.effectiveTenantId)
      if (token === request) rows.value = result
    } catch (cause) {
      if (token === request)
        error.value = getFriendlySupabaseErrorMessage(
          cause,
          '预算对比读取失败，请检查报表权限后重试'
        )
    } finally {
      if (token === request) dialogRef.value?.setLoading(false)
    }
  }
  watch(
    () => scope.revision,
    () => {
      request++
      rows.value = []
      void dialogRef.value?.handleClose(true)
    }
  )
  async function handleOpen(until: string): Promise<void> {
    end = until
    await dialogRef.value?.handleOpen(undefined, {
      title: `${until.slice(0, 7)} 预算执行对比`,
      subtitle: `月初至 ${until}，不含关键词筛选；应收与逾期为截止日余额，不累计。差异为实际减预算，比例差异为百分点。全部租户请切换具体租户对比。`,
      showConfirmButton: false,
      cancelText: '关闭',
      onOpen: load
    })
  }
  defineExpose({ handleOpen })
</script>
