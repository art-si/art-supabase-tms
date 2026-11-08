<template>
  <ArtPermissionGuard permission="TmsAlertCenter:View">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="CONTRACT ALERTS"
        title="统一预警中心"
        description="集中查看运输合同到期预警。当前仅接入合同场景；提醒由统一任务按规则生成，终止合同的预警会解除。"
        icon="ri:alarm-warning-line"
        :tags="[
          { label: '合同到期', type: 'warning' },
          { label: '统一提醒', type: 'primary' },
          { label: '只读', type: 'info' }
        ]"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableRef" />
        </template>
      </BusinessWorkspaceHeader>

      <ArtTableQuery
        ref="tableRef"
        v-model="table.search"
        :search-items="searchItems"
        :api-fn="fetchTableData"
        :columns-factory="columnsFactory"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'subjectId',
          emptyText: '暂无合同预警',
          emptyDescription: '调整合同状态、预警状态或到期日期后重试。'
        }"
        focusable
      />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { storeToRefs } from 'pinia'
  import { ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { contractLifecycleMeta } from '../basic-data/contract/modules/contract-lifecycle'
  import {
    fetchContractAlertList,
    type ContractAlertRecord,
    type ContractAlertSearch
  } from '@tms/api/modules/alert-center'

  defineOptions({ name: 'TmsAlertCenter' })

  type TableParams = ContractAlertSearch & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const tableRef = ref<ArtTableQueryExpose>()
  const { hasAuth } = useAuth()
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const table = reactive<{ search: ContractAlertSearch }>({ search: { dueRange: [], keyword: '' } })

  const alertStatusOptions = useDictionaryOptions('notificationSubjectStatus')

  const searchItems: SearchFormItem[] = [
    {
      label: '合同状态',
      key: 'lifecycleStatus',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: Object.entries(contractLifecycleMeta).map(([value, item]) => ({
          value,
          label: item.label
        }))
      }
    },
    {
      label: '预警状态',
      key: 'alertStatus',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: alertStatusOptions
      }
    },
    {
      label: '到期日期',
      key: 'dueRange',
      type: 'date',
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期',
        rangeSeparator: '至'
      }
    },
    {
      label: '合同编号/名称',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索合同编号或名称' }
    }
  ]

  const columnsFactory = (): ColumnOption<ContractAlertRecord>[] => [
    { type: 'globalIndex', label: '序号', width: 70 },
    {
      prop: 'contractNo',
      label: '运输合同',
      minWidth: 235,
      fixed: 'left',
      formatter: (row) => (
        <BusinessRecordLink
          label={row.contractNo}
          description={row.contractName}
          title={`查看运输合同 ${row.contractNo}`}
          to={hasAuth('TmsContract:View') ? '/tms/basic-data/contract' : undefined}
          compact
        />
      )
    },
    { prop: 'partyName', label: '客户 / 承运商', minWidth: 180, showOverflowTooltip: true },
    ...(isPlatformSuper.value
      ? [{ prop: 'tenantName', label: '所属租户', minWidth: 160, showOverflowTooltip: true }]
      : []),
    {
      prop: 'lifecycleStatus',
      label: '合同状态',
      width: 105,
      formatter: (row) => {
        const item = contractLifecycleMeta[row.lifecycleStatus]
        return <ElTag type={item.type}>{item.label}</ElTag>
      }
    },
    {
      prop: 'alertStatus',
      label: '预警状态',
      width: 105,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="notificationSubjectStatus"
          value={row.alertStatus}
          display="tag"
        />
      )
    },
    {
      prop: 'expiryDate',
      label: '到期日期',
      width: 125,
      formatter: (row) => row.expiryDate || '—'
    },
    {
      prop: 'lastDeliveredAt',
      label: '最近站内提醒',
      width: 165,
      formatter: (row) =>
        row.lastDeliveredAt
          ? (formatWithDayjs(row.lastDeliveredAt, 'YYYY-MM-DD HH:mm') ?? '—')
          : '尚未投递'
    }
  ]

  function fetchTableData(params: TableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchContractAlertList({ ...params, from, to })
  }
</script>
