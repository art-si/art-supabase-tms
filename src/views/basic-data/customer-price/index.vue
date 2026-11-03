<template>
  <div
    :class="
      embedded
        ? 'customer-price flex h-[460px] min-w-0 flex-col'
        : 'business-workspace-page art-full-height customer-price'
    "
  >
    <BusinessWorkspaceHeader
      v-if="!embedded"
      eyebrow="CUSTOMER AGREEMENT PRICE"
      title="客户协议价"
      description="按关联合同、有效期与运输线路维护客户协议价，支撑订单价格匹配和运费核算。"
      icon="ri:price-tag-3-line"
      :tags="[
        { label: '销售协议价', type: 'primary' },
        { label: '线路计价', type: 'info' }
      ]"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      v-if="customerDeleteContext.active"
      :customer-id="customerDeleteContext.customerId"
      :customer-name="customerDeleteContext.customerName"
      action-hint="请核对关联客户协议价。确认不再使用后，可直接在表格右侧删除该协议价。"
    />

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="table.searchQuery"
      :search-items="searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      :header-actions-placement="embedded ? 'table' : 'workspace'"
      :search-bar-props="{ span: 6, labelWidth: 86, showExpand: false }"
      :table-props="{
        tableLayout: 'fixed',
        fit: false,
        showOverflowTooltip: false,
        emptyText: '暂无客户协议价',
        emptyDescription: '可新增客户协议价，或调整线路、客户、运输类型和日期后重新查询。'
      }"
      :focusable="!embedded"
    />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { normalizePriceRegionSearch } from '../modules/price-form-utils'
  import { formatRateDistanceKm, formatRateEffectivePeriod } from '../modules/rate-card-detail'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryExcelColumn,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ElButton } from 'element-plus'
  import { ColumnOption } from '@/types'
  import { fetchRegionOptions } from '@/api/region-options'
  import {
    deleteCustomerPrice,
    deleteCustomerPriceBatch,
    exportCustomerPriceList,
    fetchCustomerPriceList
  } from '@tms/api'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import { formatCompactNumberValue } from '@/utils/ui/format'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { useMasterDataDeleteProcessingContext } from '@/hooks/core/useMasterDataDeleteProcessing'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    canViewField,
    formatSensitiveNumber,
    mergeFieldAccessMaps
  } from '@/utils/field-permission'

  defineOptions({ name: 'TmsCustomerPrice' })
  const props = defineProps<{ embedded?: boolean; customerId?: string }>()

  const { hasAuth } = useAuth()

  type CustomerPrice = Api.Tms.BasicData.CustomerPrice
  type CustomerPriceCargoItem = Api.Tms.BasicData.CustomerPriceCargoItem
  type CustomerPriceFieldKey = Api.Tms.BasicData.CustomerPriceFieldKey
  type CustomerPriceFieldAccessMap = Api.Tms.BasicData.CustomerPriceFieldAccessMap
  type SearchParams = Api.Tms.BasicData.CustomerPriceSearchParams
  type SearchModel = SearchParams & {
    originRegionPath?: string[]
    destinationRegionPath?: string[]
  }
  type TableParams = SearchModel & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface TableGroup {
    searchQuery: SearchModel
  }

  const router = useRouter()
  const route = useRoute()
  const customerDeleteContext = useMasterDataDeleteProcessingContext()
  const { getDictMap } = storeToRefs(useUserStore())
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecord, deleteRecords } = useRecordDeleteGuard(
    'tms_customer_price',
    '客户协议价'
  )
  const customerPriceFieldAccess = ref<CustomerPriceFieldAccessMap>({})
  const currentRows = ref<CustomerPrice[]>([])

  const table = reactive<TableGroup>({
    searchQuery: {
      originRegionPath: [],
      destinationRegionPath: [],
      createTimeRange: [],
      customerId: props.customerId ?? customerDeleteContext.value.customerId,
      keyword: '',
      recordId: customerDeleteContext.value.recordId
    }
  })

  const cargoUnitOptions = computed(() => getDictMap.value.tmsCargoUnit ?? [])
  const transportTypeOptions = computed(() => getDictMap.value.tmsCustomerPriceTransportType ?? [])
  const cargoTypeOptions = computed(() => getDictMap.value.tmsCustomerPriceCargoType ?? [])
  const billingMethodOptions = computed(() => getDictMap.value.tmsCustomerPriceBillingMethod ?? [])
  const agreementStatusOptions = computed(() => getDictMap.value.tmsPriceAgreementStatus ?? [])

  const customerPriceExcelColumns = computed<ArtTableQueryExcelColumn[]>(() => [
    { key: 'originRegion', title: '始发地' },
    { key: 'destinationRegion', title: '目的地' },
    {
      key: 'customerName',
      title: '客户名称',
      formatter: (_value, row) => (row as CustomerPrice).customer?.customerName || ''
    },
    {
      key: 'contractName',
      title: '关联合同名称',
      formatter: (_value, row) => (row as CustomerPrice).contract?.contractName || ''
    },
    {
      key: 'contractNo',
      title: '关联合同编号',
      formatter: (_value, row) => (row as CustomerPrice).contract?.contractNo || ''
    },
    {
      key: 'agreementStatus',
      title: '协议状态',
      formatter: (value) => getLabel(agreementStatusOptions.value, String(value ?? ''))
    },
    {
      key: 'effectivePeriod',
      title: '有效期',
      formatter: (_value, row) => formatRateEffectivePeriod(row as CustomerPrice)
    },
    {
      key: 'distanceKm',
      title: '线路里程',
      formatter: (value) => formatRateDistanceKm(value as number | string | null)
    },
    { key: 'shippingInfo', title: '发货信息', formatter: (_value, row) => formatShippingInfo(row) },
    {
      key: 'receivingInfo',
      title: '收货信息',
      formatter: (_value, row) => formatReceivingInfo(row)
    },
    { key: 'transportType', title: '类型', formatter: (value) => formatDict('transport', value) },
    { key: 'cargoType', title: '货物类型', formatter: (value) => formatDict('cargo', value) },
    {
      key: 'cargoQuantityTotal',
      title: '货物数量',
      formatter: (_value, row) => formatCargoQuantity(row as CustomerPrice)
    },
    {
      key: 'cargoVolumeTotal',
      title: '总体积',
      formatter: (value) => `${formatCompactNumberValue(value as number | string | null, 2)}m3`
    },
    {
      key: 'cargoWeightTotal',
      title: '总重量',
      formatter: (value) => `${formatCompactNumberValue(value as number | string | null, 2)}kg`
    },
    ...(canViewListField('quoteAmounts')
      ? [
          {
            key: 'totalFee',
            title: '运费合计',
            formatter: (value) =>
              formatSensitiveNumber(
                typeof value === 'number' || typeof value === 'string' ? value : undefined
              )
          } satisfies ArtTableQueryExcelColumn
        ]
      : []),
    { key: 'createBy', title: '创建人' },
    {
      key: 'createTime',
      title: '创建时间',
      formatter: (value) => formatDateTime(value as string | null)
    }
  ])

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '始发地',
      key: 'originRegionPath',
      type: 'cascader',
      api: fetchRegionOptions,
      labelField: 'name',
      valueField: 'name',
      childrenField: 'children',
      props: {
        class: 'w-full',
        clearable: true,
        filterable: true,
        placeholder: '请选择',
        props: {
          label: 'name',
          value: 'name',
          children: 'children',
          emitPath: true,
          checkStrictly: true
        }
      }
    },
    {
      label: '目的地',
      key: 'destinationRegionPath',
      type: 'cascader',
      api: fetchRegionOptions,
      labelField: 'name',
      valueField: 'name',
      childrenField: 'children',
      props: {
        class: 'w-full',
        clearable: true,
        filterable: true,
        placeholder: '请选择',
        props: {
          label: 'name',
          value: 'name',
          children: 'children',
          emitPath: true,
          checkStrictly: true
        }
      }
    },
    {
      label: '创建日期',
      key: 'createTimeRange',
      type: 'date',
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '请选择日期',
        endPlaceholder: '请选择日期',
        rangeSeparator: '~'
      }
    },
    {
      label: '',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '请输入关键词搜索' }
    }
  ])

  const columnsFactory = (): ColumnOption<CustomerPrice>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { prop: 'originRegion', label: '始发地', width: 170 },
    { prop: 'destinationRegion', label: '目的地', width: 170 },
    {
      prop: 'customerName',
      label: '客户名称',
      width: 190,
      formatter: (row) =>
        hasAuth('TmsCustomerPrice:View') ? (
          <ElButton
            class="customer-price__detail-link"
            link
            type="primary"
            disabled={!row.id}
            onClick={() => openDetailPage(row)}
          >
            {row.customer?.customerName || '-'}
          </ElButton>
        ) : (
          <span>{row.customer?.customerName || '-'}</span>
        )
    },
    {
      prop: 'contractName',
      label: '关联合同名称',
      minWidth: 190,
      formatter: (row) => row.contract?.contractName || '-'
    },
    {
      prop: 'contractNo',
      label: '关联合同编号',
      minWidth: 155,
      formatter: (row) => row.contract?.contractNo || '-'
    },
    {
      prop: 'agreementStatus',
      label: '协议状态',
      width: 110,
      dict: { code: 'tmsPriceAgreementStatus', display: 'auto' }
    },
    {
      prop: 'effectivePeriod',
      label: '有效期',
      minWidth: 210,
      formatter: (row) => formatRateEffectivePeriod(row)
    },
    {
      prop: 'distanceKm',
      label: '线路里程',
      width: 125,
      align: 'right',
      formatter: (row) => formatRateDistanceKm(row.distanceKm)
    },
    {
      prop: 'shippingInfo',
      label: '发货信息',
      minWidth: 240,
      formatter: (row) => renderShippingInfo(row)
    },
    {
      prop: 'receivingInfo',
      label: '收货信息',
      minWidth: 240,
      formatter: (row) => renderReceivingInfo(row)
    },
    {
      prop: 'transportType',
      label: '类型',
      width: 100,
      dict: { code: 'tmsCustomerPriceTransportType', display: 'text' }
    },
    {
      prop: 'cargoType',
      label: '货物类型',
      width: 110,
      dict: { code: 'tmsCustomerPriceCargoType', display: 'text' }
    },
    {
      prop: 'cargoQuantityTotal',
      label: '货物数量',
      width: 110,
      align: 'right',
      formatter: (row) => formatCargoQuantity(row)
    },
    {
      prop: 'cargoVolumeTotal',
      label: '总体积',
      width: 110,
      align: 'right',
      formatter: (row) => `${formatCompactNumberValue(row.cargoVolumeTotal, 2)}m³`
    },
    {
      prop: 'cargoWeightTotal',
      label: '总重量',
      width: 110,
      align: 'right',
      formatter: (row) => `${formatCompactNumberValue(row.cargoWeightTotal, 2)}kg`
    },
    ...(canViewListField('quoteAmounts')
      ? [
          {
            prop: 'totalFee',
            label: '运费合计',
            width: 120,
            align: 'right',
            formatter: (row) => formatSensitiveNumber(row.totalFee)
          } as ColumnOption<CustomerPrice>
        ]
      : []),
    { prop: 'createBy', label: '创建人', width: 120 },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 170,
      formatter: (row) => formatDateTime(row.createTime)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 120,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            permission="TmsCustomerPrice:Edit"
            onClick={() => openEditPage(row)}
          />
          <ArtButtonTable
            type="delete"
            permission="TmsCustomerPrice:Delete"
            onClick={() => handleDelete(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsCustomerPrice:Add',
      type: 'add',
      label: '新增',
      onClick: () => openEditPage()
    },
    {
      permission: 'TmsCustomerPrice:Delete',
      type: 'delete',
      label: '批量删除',
      confirm: false,
      onClick: async ({ selectedRows }) => {
        const rows = selectedRows as CustomerPrice[]
        await deleteRecords({
          resources: rows.map((row) => ({
            id: row.id ?? '',
            label: `${row.customer?.customerName || '客户协议价'} · ${row.originRegion} → ${row.destinationRegion}`
          })),
          permission: 'TmsCustomerPrice:Delete',
          remove: () => deleteCustomerPriceBatch(rows.map((row) => row.id ?? '')),
          onDeleted: async () => {
            await tableQueryRef.value?.refreshRemove()
          }
        })
      }
    },
    {
      permission: 'TmsCustomerPrice:Export',
      type: 'export',
      exportFilename: 'TMS客户协议价',
      exportSheetName: '客户协议价',
      exportColumns: customerPriceExcelColumns.value,
      exportApi: ({ selectedIds, searchParams, maxRows }) =>
        exportCustomerPriceList({
          ...normalizePriceRegionSearch(searchParams as SearchModel),
          customerId: props.customerId || (searchParams as SearchModel).customerId,
          ids: selectedIds.map(String),
          maxRows
        })
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchCustomerPriceList({
      ...normalizePriceRegionSearch(params),
      customerId: props.customerId || params.customerId,
      from,
      to
    })

    customerPriceFieldAccess.value = result.fieldAccess
    currentRows.value = result.data

    return result
  }

  const canViewListField = (field: CustomerPriceFieldKey): boolean => {
    const merged = mergeFieldAccessMaps(
      customerPriceFieldAccess.value,
      ...currentRows.value.map((row) => row.fieldAccess)
    )
    return canViewField(merged, field)
  }

  const canViewRowField = (row: CustomerPrice, field: CustomerPriceFieldKey): boolean =>
    canViewField(row.fieldAccess ?? customerPriceFieldAccess.value, field)

  onActivated(() => {
    syncCustomerDeleteRoute(true)
    if (!route.query.refresh) return
    const refreshType = String(route.query.refreshType || '')
    void refreshAfterEdit(refreshType)
  })

  const syncCustomerDeleteRoute = (forceRefresh = false): void => {
    const context = customerDeleteContext.value
    const customerId = props.customerId || (context.active ? context.customerId : '')
    const recordId = context.active ? context.recordId : ''
    const changed =
      table.searchQuery.customerId !== customerId || table.searchQuery.recordId !== recordId
    Object.assign(table.searchQuery, {
      customerId,
      recordId
    })
    if (context.active || changed) {
      Object.assign(table.searchQuery, {
        originRegionPath: [],
        destinationRegionPath: [],
        createTimeRange: [],
        keyword: ''
      })
    }
    if (changed || forceRefresh) {
      void nextTick().then(() => tableQueryRef.value?.refreshCreate())
    }
  }

  watch(
    () => route.fullPath,
    () => syncCustomerDeleteRoute(),
    { flush: 'post' }
  )

  async function refreshAfterEdit(refreshType: string): Promise<void> {
    if (refreshType === 'create') {
      await tableQueryRef.value?.refreshCreate()
    } else {
      await tableQueryRef.value?.refreshUpdate()
    }
    const query = { ...route.query }
    delete query.refresh
    delete query.refreshType
    await router.replace({ name: 'TmsCustomerPrice', query })
  }

  const openEditPage = (row?: CustomerPrice): void => {
    if (row?.id) {
      void router.push({ name: 'TmsCustomerPriceEdit', params: { id: row.id } })
      return
    }
    void router.push({
      name: 'TmsCustomerPriceEdit',
      query: props.customerId ? { customerId: props.customerId } : {}
    })
  }

  const openDetailPage = (row: CustomerPrice): void => {
    if (!row.id) return
    void router.push({ name: 'TmsCustomerPriceDetail', params: { id: row.id } })
  }

  const handleDelete = async (row: CustomerPrice): Promise<void> => {
    await deleteRecord({
      resource: {
        id: row.id ?? '',
        label: `${row.customer?.customerName || '客户协议价'} · ${row.originRegion} → ${row.destinationRegion}`
      },
      permission: 'TmsCustomerPrice:Delete',
      remove: () => deleteCustomerPrice(row.id ?? ''),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }

  const renderShippingInfo = (row: CustomerPrice) => (
    <div class="customer-price__info">
      <span>联系人姓名：{row.shippingContactName || '-'}</span>
      {canViewRowField(row, 'contactPhones') ? (
        <span>联系电话：{row.shippingContactPhone || '-'}</span>
      ) : null}
      <span>
        发货地址：
        {formatFullAddress(
          row.originRegion,
          canViewRowField(row, 'addressDetails') ? row.shippingAddressDetail : null
        )}
      </span>
    </div>
  )

  const renderReceivingInfo = (row: CustomerPrice) => (
    <div class="customer-price__info">
      <span>联系人姓名：{row.receivingContactName || '-'}</span>
      {canViewRowField(row, 'contactPhones') ? (
        <span>联系电话：{row.receivingContactPhone || '-'}</span>
      ) : null}
      <span>
        收货地址：
        {formatFullAddress(
          row.destinationRegion,
          canViewRowField(row, 'addressDetails') ? row.receivingAddressDetail : null
        )}
      </span>
    </div>
  )

  const formatShippingInfo = (row: unknown): string => {
    const data = row as CustomerPrice
    return [
      `联系人姓名：${data.shippingContactName || ''}`,
      ...(canViewRowField(data, 'contactPhones')
        ? [`联系电话：${data.shippingContactPhone || ''}`]
        : []),
      `发货地址：${formatFullAddress(
        data.originRegion,
        canViewRowField(data, 'addressDetails') ? data.shippingAddressDetail : null
      )}`
    ].join('\n')
  }

  const formatReceivingInfo = (row: unknown): string => {
    const data = row as CustomerPrice
    return [
      `联系人姓名：${data.receivingContactName || ''}`,
      ...(canViewRowField(data, 'contactPhones')
        ? [`联系电话：${data.receivingContactPhone || ''}`]
        : []),
      `收货地址：${formatFullAddress(
        data.destinationRegion,
        canViewRowField(data, 'addressDetails') ? data.receivingAddressDetail : null
      )}`
    ].join('\n')
  }

  const formatFullAddress = (region?: string | null, address?: string | null): string =>
    [region, address].filter(Boolean).join(' ') || '-'

  const formatCargoQuantity = (row: CustomerPrice): string => {
    const quantity = formatCompactNumberValue(row.cargoQuantityTotal, 0)
    const unit = getCargoUnitLabel(row.cargoItems?.[0])
    return `${quantity}${unit}`
  }

  const getCargoUnitLabel = (item?: CustomerPriceCargoItem): string => {
    if (!item?.unit) return ''
    return getLabel(cargoUnitOptions.value, item.unit)
  }

  const formatDict = (type: 'transport' | 'cargo' | 'billing', value: unknown): string => {
    if (!value) return ''
    const options =
      type === 'transport'
        ? transportTypeOptions.value
        : type === 'cargo'
          ? cargoTypeOptions.value
          : billingMethodOptions.value
    return getLabel(options, String(value))
  }

  const getLabel = (options: Api.DataCenter.DictListItem[], value?: string | null): string => {
    if (!value) return ''
    const item = options.find((option) => option.value === value || option.label === value)
    return item?.label || item?.name || value
  }

  const formatDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm:ss',
    emptyText: '-',
    invalidText: '-',
    allowTimeOnly: false
  })
</script>

<style scoped lang="scss">
  .customer-price {
    :deep(.customer-price__detail-link) {
      justify-content: flex-start;
      max-width: 100%;
      font-weight: 500;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    :deep(.customer-price__info) {
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: flex-start;
      line-height: 20px;
      white-space: normal;
    }
  }
</style>
