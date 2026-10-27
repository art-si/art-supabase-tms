<template>
  <ArtSectionCard
    :title="title"
    :subtitle="subtitle"
    :loading="state.loading"
    :error="state.error"
    :empty="!state.records.length"
    :empty-title="!canView ? '暂无查看权限' : !employeeLinked ? '未关联员工档案' : `暂无${title}`"
    :empty-description="
      !canView
        ? `请开通${title}查看权限。`
        : !employeeLinked
          ? `请在司机档案关联员工后查询${title}。`
          : `关联司机的${title}会显示在这里。`
    "
    @retry="loadRecords"
  >
    <ArtTable :data="state.records" :columns="columns" :pagination="false" row-key="id" />
    <ElPagination
      v-if="state.total > pageSize"
      v-model:current-page="state.page"
      class="mt-4 flex justify-end"
      :page-size="pageSize"
      :total="state.total"
      layout="total, prev, pager, next"
      @current-change="loadRecords"
    />
  </ArtSectionCard>
</template>

<script setup lang="tsx">
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import { listDriverFinanceRecords, type DriverFinanceRecord } from '@/api/driver-finance'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'

  defineOptions({ name: 'TmsDriverFinancePanel' })

  const props = defineProps<{
    driverId: string
    employeeLinked: boolean
    kind: 'loan' | 'repayment' | 'reimbursement'
  }>()
  const { hasAuth } = useAuth()
  const permissionByKind = {
    loan: 'FinanceLoanApplication:View',
    repayment: 'FinanceRepayment:View',
    reimbursement: 'FinanceExpenseReimbursement:View'
  } as const
  const titleByKind = { loan: '借款明细', repayment: '还款明细', reimbursement: '费用报销明细' }
  const title = computed(() => titleByKind[props.kind])
  const subtitle = computed(() => '仅按该司机关联的员工档案归集，不按同名人员推断')
  const canView = computed(() => hasAuth(permissionByKind[props.kind]))
  const pageSize = 20
  const state = reactive({
    records: [] as DriverFinanceRecord[],
    total: 0,
    page: 1,
    loading: false,
    error: null as string | null
  })
  const columns = computed<ColumnOption<DriverFinanceRecord>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 68 },
    { prop: 'no', label: '单据编号', minWidth: 180, formatter: (row) => row.no || '—' },
    {
      prop: 'occurredOn',
      label: '发生日期',
      minWidth: 130,
      formatter: (row) => row.occurredOn || '—'
    },
    {
      prop: 'amount',
      label: '金额',
      minWidth: 130,
      align: 'right',
      formatter: (row) => formatSensitiveNumberWithAffix(row.amount, { prefix: '¥' })
    },
    {
      prop: 'status',
      label: '状态',
      minWidth: 120,
      dict: {
        code:
          props.kind === 'loan'
            ? 'fmsExpenseDocumentStatus'
            : props.kind === 'repayment'
              ? 'fmsRepaymentStatus'
              : 'tmsReimbursementApprovalStatus',
        display: 'tag'
      }
    },
    {
      prop: 'waybillNo',
      label: '关联运单',
      minWidth: 160,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.waybillNo || '—'}
          to={
            row.waybillId && hasAuth('TmsLoadedWaybillList:View')
              ? `/tms/waybill-management/detail/${row.waybillId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'orderNo',
      label: '运输订单',
      minWidth: 160,
      formatter: (row) => row.orderNo || '—'
    },
    { prop: 'reason', label: '用途 / 事由', minWidth: 200, formatter: (row) => row.reason || '—' },
    {
      prop: 'relatedNo',
      label: '关联单据',
      minWidth: 160,
      formatter: (row) => row.relatedNo || '—'
    },
    { prop: 'remark', label: '备注', minWidth: 200, formatter: (row) => row.remark || '—' }
  ])

  let requestId = 0
  async function loadRecords(): Promise<void> {
    const currentRequest = ++requestId
    state.error = null
    if (!canView.value || !props.driverId || !props.employeeLinked) {
      state.records = []
      state.total = 0
      state.loading = false
      return
    }
    state.loading = true
    try {
      const result = await listDriverFinanceRecords({
        driverId: props.driverId,
        kind: props.kind,
        page: state.page,
        pageSize
      })
      if (currentRequest !== requestId) return
      state.records = result.records
      state.total = result.total
    } catch {
      if (currentRequest !== requestId) return
      state.records = []
      state.total = 0
      state.error = `${title.value}加载失败，请重试。`
    } finally {
      if (currentRequest === requestId) state.loading = false
    }
  }
  watch(
    () => [props.driverId, props.kind, props.employeeLinked, canView.value],
    () => {
      state.page = 1
      void loadRecords()
    },
    { immediate: true }
  )
</script>
