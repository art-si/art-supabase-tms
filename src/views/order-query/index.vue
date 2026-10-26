<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="ORDER TRACE"
      title="运输订单综合查询"
      description="从订单出发，查看运输进度、主车主驾及各执行运单的关联记录。"
      icon="ri:file-search-line"
      :tags="[
        { label: '一单一主线', type: 'primary' },
        { label: '多车多司机按执行运单展开', type: 'info' }
      ]"
      :metrics="workspaceMetrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="searchQuery"
      :search-items="searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 94 }"
      :table-props="{
        rowKey: 'id',
        tableLayout: 'fixed',
        emptyText: '暂无符合条件的运输订单',
        emptyDescription: '请调整订单号、客户或状态条件后重试。'
      }"
      :on-success="handleTableSuccess"
      focusable
    />
  </div>
</template>

<script setup lang="tsx">
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExcelColumn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { exportOrderList, fetchOrderList } from '@tms/api'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import {
    canViewField,
    formatSensitiveNumber,
    mergeFieldAccessMaps
  } from '@/utils/field-permission'
  import { formatWithDayjs } from '@/utils/time'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'

  defineOptions({ name: 'TmsOrderQuery' })

  type OrderRecord = Api.Tms.Order.OrderRecord
  type SearchParams = Api.Tms.Order.OrderSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const router = useRouter()
  const route = useRoute()
  const { hasAuth } = useAuth()
  const { getDictMap } = storeToRefs(useUserStore())
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const total = ref(0)
  const currentRows = ref<OrderRecord[]>([])
  const fieldAccess = ref<Api.Tms.Order.OrderFieldAccessMap>({})
  const searchQuery = reactive<SearchParams>({
    recordId: typeof route.query.recordId === 'string' ? route.query.recordId : '',
    cargoKeyword: '',
    shippingKeyword: '',
    receivingKeyword: '',
    orderStatus: ''
  })

  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: total.value,
      description: '订单去重计数',
      icon: 'ri:file-list-3-line'
    },
    {
      label: '本页运输中',
      value: currentRows.value.filter((row) => row.orderStatus === 'transporting').length,
      description: '按订单状态统计',
      icon: 'ri:truck-line',
      tone: 'primary'
    },
    {
      label: '本页待派车',
      value: currentRows.value.filter((row) => !row.dispatchVehicleId).length,
      description: '主派车资料待关联',
      icon: 'ri:time-line',
      tone: 'warning'
    }
  ])

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '订单',
      key: 'cargoKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入订单号或货物名称' }
    },
    {
      label: '发货方',
      key: 'shippingKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '姓名、电话或地址' }
    },
    {
      label: '收货方',
      key: 'receivingKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '姓名、电话或地址' }
    },
    {
      label: '订单状态',
      key: 'orderStatus',
      type: 'select',
      props: { options: getDictMap.value.tmsOrderStatus ?? [], clearable: true }
    }
  ])

  const exportColumns = computed<ArtTableQueryExcelColumn[]>(() => [
    { key: 'orderNo', title: '订单号' },
    { key: 'shippingContactName', title: '发货方' },
    { key: 'receivingContactName', title: '收货方' },
    { key: 'originStation', title: '发货站' },
    { key: 'destinationStation', title: '到货站' },
    { key: 'dispatchPlateNo', title: '主车辆' },
    { key: 'dispatchDriverName', title: '主司机' },
    { key: 'orderStatus', title: '订单状态' },
    ...(canViewField(fieldAccess.value, 'freightAmounts')
      ? [{ key: 'totalFee', title: '订单运费' }]
      : []),
    { key: 'createTime', title: '开单时间' }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsOrderQuery:Export',
      type: 'export',
      exportFilename: '运输订单综合查询',
      exportSheetName: '订单主线',
      exportColumns: () => exportColumns.value,
      exportApi: async ({ selectedIds, searchParams, maxRows }) => {
        const result = await exportOrderList({
          ...(searchParams as SearchParams),
          ids: selectedIds.map(String),
          maxRows
        })
        fieldAccess.value = mergeFieldAccessMaps(
          result.fieldAccess,
          ...(result.data ?? []).map((row) => row.fieldAccess)
        )
        return result
      }
    }
  ])

  const columnsFactory = (): ColumnOption<OrderRecord>[] => [
    { type: 'globalIndex', label: '序号', width: 64 },
    {
      prop: 'orderNo',
      label: '订单号',
      minWidth: 174,
      fixed: 'left',
      formatter: (row) => (
        <BusinessRecordLink
          label={row.orderNo}
          description={
            row.createTime ? formatWithDayjs(row.createTime, 'YYYY-MM-DD') || undefined : undefined
          }
          to={
            row.id && hasAuth('TmsOrderQuery:View')
              ? `/tms/order-query/detail/${row.id}`
              : undefined
          }
          compact
        />
      )
    },
    { prop: 'shippingContactName', label: '发货方', minWidth: 130 },
    { prop: 'receivingContactName', label: '收货方', minWidth: 130 },
    { prop: 'originStation', label: '发货站', minWidth: 125 },
    { prop: 'destinationStation', label: '到货站', minWidth: 125 },
    {
      prop: 'dispatchPlateNo',
      label: '主车辆',
      minWidth: 140,
      formatter: (row) =>
        row.dispatchPlateNo ? (
          <BusinessRecordLink
            label={row.dispatchPlateNo}
            to={
              row.dispatchVehicleId && hasAuth('VehicleQuery:View')
                ? `/vms/vehicle-query/detail/${row.dispatchVehicleId}`
                : undefined
            }
            compact
          />
        ) : (
          '待派车'
        )
    },
    {
      prop: 'dispatchDriverName',
      label: '主司机',
      minWidth: 130,
      formatter: (row) =>
        row.dispatchDriverName ? (
          <BusinessRecordLink
            label={row.dispatchDriverName}
            to={
              row.dispatchDriverId && hasAuth('TmsDriverQuery:View')
                ? `/tms/driver-query/detail/${row.dispatchDriverId}`
                : undefined
            }
            compact
          />
        ) : (
          '待分配'
        )
    },
    {
      prop: 'orderStatus',
      label: '订单状态',
      width: 112,
      dict: { code: 'tmsOrderStatus', display: 'auto' }
    },
    ...(canViewField(fieldAccess.value, 'freightAmounts')
      ? [
          {
            prop: 'totalFee',
            label: '订单运费',
            width: 132,
            formatter: (row: OrderRecord) => `¥${formatSensitiveNumber(row.totalFee)}`
          } satisfies ColumnOption<OrderRecord>
        ]
      : []),
    {
      prop: 'operation',
      label: '操作',
      width: 96,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="TmsOrderQuery:View"
            onClick={() => openDetail(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchOrderList({ ...params, from, to })
    fieldAccess.value = mergeFieldAccessMaps(
      result.fieldAccess,
      ...(result.data ?? []).map((row) => row.fieldAccess)
    )
    return result
  }

  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    currentRows.value = rows as OrderRecord[]
    total.value = response.total ?? rows.length
  }

  const openDetail = (row: OrderRecord): void => {
    if (!row.id) return
    void router.push(`/tms/order-query/detail/${row.id}`)
  }
</script>
