<template>
  <div class="h-[440px] min-w-0 w-full">
    <ArtTableQuery
      class="h-full"
      :key="`${kind}:${customerId}`"
      :api-fn="fetchRows"
      :columns-factory="columnsFactory"
      :table-props="{
        rowKey: 'id',
        emptyText: kind === 'waybill' ? '此客户暂无运单' : '此客户暂无对账单',
        emptyDescription: '相关业务生成后自动显示在此。'
      }"
    />
  </div>
</template>

<script setup lang="tsx">
  import { fetchWaybillList } from '@tms/api'
  import {
    fetchCustomerStatementLinks,
    type CustomerStatementLinkRecord
  } from '@/api/customer-business-relations'
  import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { navigateToApplication } from '@/utils/application-navigation'
  import { financePaths } from '@/router/business-paths'
  defineOptions({ name: 'TmsCustomerBusinessRecords' })
  const props = defineProps<{ kind: 'waybill' | 'statement'; customerId: string }>()
  type Row = Api.Tms.Waybill.WaybillRecord | CustomerStatementLinkRecord
  const router = useRouter()
  const fetchRows = async (params: { current: number; size: number }) => {
    const from = Math.max(params.current - 1, 0) * params.size
    const to = from + params.size - 1
    return props.kind === 'waybill'
      ? fetchWaybillList({ customerId: props.customerId, from, to }, 'loaded_waybill_list')
      : fetchCustomerStatementLinks(props.customerId, from, to)
  }
  const columnsFactory = (): ColumnOption<Row>[] =>
    props.kind === 'waybill'
      ? [
          { prop: 'waybillNo', label: '运单号', minWidth: 180 },
          { prop: 'orderNo', label: '订单号', minWidth: 180 },
          { prop: 'originStation', label: '始发地', minWidth: 160 },
          { prop: 'destinationStation', label: '目的地', minWidth: 160 },
          { prop: 'waybillStatus', label: '状态', width: 110, dict: { code: 'tmsWaybillStatus' } },
          {
            prop: 'operation',
            label: '操作',
            fixed: 'right',
            width: 72,
            formatter: (row) => (
              <ArtButtonTable
                type="view"
                permission="TmsLoadedWaybillList:View"
                onClick={() =>
                  void router.push({ name: 'TmsWaybillDetail', params: { id: row.id } })
                }
              />
            )
          }
        ]
      : [
          { prop: 'statementNo', label: '对账单号', minWidth: 200 },
          { prop: 'periodStart', label: '账期开始', width: 130 },
          { prop: 'periodEnd', label: '账期结束', width: 130 },
          {
            prop: 'status',
            label: '状态',
            width: 115,
            dict: { code: 'tmsSettlementStatus' }
          },
          { prop: 'waybillCount', label: '运单数', width: 90 },
          {
            prop: 'operation',
            label: '操作',
            fixed: 'right',
            width: 72,
            formatter: (row) => (
              <ArtButtonTable
                type="view"
                permission="FinanceCustomerSettlement:View"
                onClick={() => {
                  if ('statementNo' in row)
                    void navigateToApplication(
                      'fms',
                      financePaths.customerSettlement,
                      { customerId: props.customerId, recordId: row.id },
                      router
                    )
                }}
              />
            )
          }
        ]
</script>
