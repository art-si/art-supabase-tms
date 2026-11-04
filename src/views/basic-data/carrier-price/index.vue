<template>
  <div class="business-workspace-page art-full-height carrier-price">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      v-if="deleteContext.active"
      :customer-id="deleteContext.customerId"
      :customer-name="deleteContext.customerName"
      action-hint="请核对关联承运商协议价；处理完成后可返回原主数据页面继续删除。"
    />
    <BusinessWorkspaceHeader
      eyebrow="CARRIER AGREEMENT PRICE"
      title="承运商协议价"
      description="按关联合同、有效期与承运线路维护承运商协议价，为调度和成本测算提供依据。"
      icon="ri:money-cny-circle-line"
      :tags="[
        { label: '采购协议价', type: 'primary' },
        { label: '成本基线', type: 'warning' }
      ]"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="table.searchQuery"
      :search-items="table.searchItems"
      :api-fn="fetchTableData"
      :columns-factory="table.columnsFactory"
      :header-actions="table.headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 86, showExpand: false }"
      :table-props="{
        tableLayout: 'fixed',
        fit: false,
        showOverflowTooltip: false,
        emptyText: '暂无承运商协议价',
        emptyDescription: '可新增承运商协议价，或调整线路、运输模式、计费方式和日期后查询。'
      }"
      focusable
    />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { formatAuditActorName } from '@/utils/business/audit-actor-display'
  import { normalizePriceRegionSearch } from '../modules/price-form-utils'
  import { formatRateDistanceKm, formatRateEffectivePeriod } from '../modules/rate-card-detail'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ElButton } from 'element-plus'
  import type {
    ArtTableQueryExcelColumn,
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { fetchRegionOptions } from '@/api/region-options'
  import {
    deleteCarrierPrice,
    deleteCarrierPriceBatch,
    exportCarrierPriceList,
    fetchCarrierPriceList
  } from '@tms/api'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { createDateTimeFormatter } from '@/utils/ui/format'
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

  defineOptions({ name: 'TmsCarrierPrice' })

  type CarrierPrice = Api.Tms.BasicData.CarrierPrice
  type CarrierPriceFieldKey = Api.Tms.BasicData.CarrierPriceFieldKey
  type CarrierPriceFieldAccessMap = Api.Tms.BasicData.CarrierPriceFieldAccessMap
  type SearchParams = Api.Tms.BasicData.CarrierPriceSearchParams
  type SearchModel = SearchParams & {
    originRegionPath?: string[]
    destinationRegionPath?: string[]
  }
  type TableParams = SearchModel & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface TableGroup {
    searchQuery: SearchModel
    transportModeOptions: ComputedRef<Api.DataCenter.DictListItem[]>
    billingMethodOptions: ComputedRef<Api.DataCenter.DictListItem[]>
    excelColumns: ComputedRef<ArtTableQueryExcelColumn[]>
    searchItems: ComputedRef<SearchFormItem[]>
    headerActions: ComputedRef<ArtTableQueryHeaderAction[]>
    columnsFactory: () => ColumnOption<CarrierPrice>[]
  }

  const router = useRouter()
  const route = useRoute()
  const deleteContext = useMasterDataDeleteProcessingContext()
  const { hasAuth } = useAuth()
  const { getDictMap } = storeToRefs(useUserStore())
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecord, deleteRecords } = useRecordDeleteGuard(
    'tms_carrier_price',
    '承运商协议价'
  )
  const carrierPriceFieldAccess = ref<CarrierPriceFieldAccessMap>({})
  const currentRows = ref<CarrierPrice[]>([])

  const table: UnwrapNestedRefs<TableGroup> = reactive<TableGroup>({
    searchQuery: {
      carrierId: typeof route.query.carrierId === 'string' ? route.query.carrierId : '',
      recordId: typeof route.query.recordId === 'string' ? route.query.recordId : '',
      originRegionPath: [],
      destinationRegionPath: [],
      createTimeRange: [],
      keyword: ''
    },
    transportModeOptions: computed(getTransportModeOptions),
    billingMethodOptions: computed(getBillingMethodOptions),
    excelColumns: computed(createExcelColumns),
    searchItems: computed(createSearchItems),
    headerActions: computed(createHeaderActions),
    columnsFactory: createColumns
  })

  function getTransportModeOptions(): Api.DataCenter.DictListItem[] {
    return getDictMap.value.tmsCarrierPriceTransportMode ?? []
  }

  function getBillingMethodOptions(): Api.DataCenter.DictListItem[] {
    return getDictMap.value.tmsCustomerPriceBillingMethod ?? []
  }

  function createExcelColumns(): ArtTableQueryExcelColumn[] {
    return [
      { key: 'quoteNo', title: '协议价编号' },
      {
        key: 'contractName',
        title: '关联合同名称',
        formatter: (_value, row) => (row as CarrierPrice).contract?.contractName || ''
      },
      {
        key: 'contractNo',
        title: '关联合同编号',
        formatter: (_value, row) => (row as CarrierPrice).contract?.contractNo || ''
      },
      {
        key: 'agreementStatus',
        title: '协议状态',
        formatter: (value) => getLabel(getDictMap.value.tmsPriceAgreementStatus ?? [], value)
      },
      {
        key: 'effectivePeriod',
        title: '有效期',
        formatter: (_value, row) => formatRateEffectivePeriod(row as CarrierPrice)
      },
      {
        key: 'distanceKm',
        title: '线路里程',
        formatter: (value) => formatRateDistanceKm(value as number | string | null)
      },
      { key: 'originRegion', title: '始发地' },
      { key: 'destinationRegion', title: '目的地' },
      { key: 'transportMode', title: '运输方式', formatter: (value) => formatTransportMode(value) },
      {
        key: 'carrierName',
        title: '承运商',
        formatter: (_value, row) => (row as CarrierPrice).carrier?.companyName || ''
      },
      {
        key: 'driverName',
        title: '司机',
        formatter: (_value, row) => (row as CarrierPrice).driverName || ''
      },
      ...(canViewListField('contactPhones')
        ? [
            {
              key: 'driverPhone',
              title: '手机号码',
              formatter: (_value, row) => (row as CarrierPrice).driverPhone || ''
            } satisfies ArtTableQueryExcelColumn
          ]
        : []),
      {
        key: 'plateNo',
        title: '车牌号',
        formatter: (_value, row) => (row as CarrierPrice).plateNo || ''
      },
      { key: 'vehicleType', title: '车型', formatter: (value) => formatVehicleType(value) },
      { key: 'vehicleLength', title: '车长', formatter: (value) => formatVehicleLength(value) },
      { key: 'billingMethod', title: '计费方式', formatter: (value) => formatBillingMethod(value) },
      ...(canViewListField('costAmounts')
        ? [
            {
              key: 'totalFee',
              title: '运费合计（元）',
              formatter: (value) => formatSensitiveNumber(value as string | number | null)
            } satisfies ArtTableQueryExcelColumn
          ]
        : []),
      { key: 'createBy', title: '创建人', formatter: (value) => formatAuditActorName(value) },
      {
        key: 'createTime',
        title: '创建时间',
        formatter: (value) => formatDateTime(value as string | null)
      }
    ]
  }

  function createSearchItems(): SearchFormItem[] {
    return [
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
        label: '运输方式',
        key: 'transportMode',
        type: 'select',
        props: { options: table.transportModeOptions, clearable: true, placeholder: '请选择' }
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
    ]
  }

  function createHeaderActions(): ArtTableQueryHeaderAction[] {
    return [
      {
        permission: 'TmsCarrierPrice:Add',
        type: 'add',
        label: '新增',
        onClick: () => openEditPage()
      },
      {
        permission: 'TmsCarrierPrice:Delete',
        type: 'delete',
        label: '批量删除',
        confirm: false,
        onClick: async ({ selectedRows }) => {
          const rows = selectedRows as CarrierPrice[]
          await deleteRecords({
            resources: rows.map((row) => ({
              id: row.id ?? '',
              label: `${row.quoteNo} · ${row.carrier?.companyName || '承运商协议价'}`
            })),
            permission: 'TmsCarrierPrice:Delete',
            remove: () => deleteCarrierPriceBatch(rows.map((row) => row.id ?? '')),
            onDeleted: async () => {
              await tableQueryRef.value?.refreshRemove()
            }
          })
        }
      },
      {
        permission: 'TmsCarrierPrice:Export',
        type: 'export',
        exportFilename: 'TMS承运商协议价',
        exportSheetName: '承运商协议价',
        exportColumns: createExcelColumns(),
        exportApi: ({ selectedIds, searchParams, maxRows }) =>
          exportCarrierPriceList({
            ...normalizePriceRegionSearch(searchParams as SearchModel),
            ids: selectedIds.map(String),
            maxRows
          })
      }
    ]
  }

  function createColumns(): ColumnOption<CarrierPrice>[] {
    return [
      { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
      {
        prop: 'quoteNo',
        label: '协议价编号',
        width: 180,
        fixed: 'left',
        formatter: (row) =>
          hasAuth('TmsCarrierPrice:View') ? (
            <ElButton
              class="carrier-price__detail-link"
              link
              type="primary"
              disabled={!row.id}
              onClick={() => openDetailPage(row)}
            >
              {row.quoteNo || '-'}
            </ElButton>
          ) : (
            <span>{row.quoteNo || '-'}</span>
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
      { prop: 'originRegion', label: '始发地', width: 170 },
      { prop: 'destinationRegion', label: '目的地', width: 170 },
      {
        prop: 'transportMode',
        label: '运输方式',
        width: 110,
        dict: { code: 'tmsCarrierPriceTransportMode', display: 'text' }
      },
      {
        prop: 'carrierName',
        label: '承运商',
        width: 190,
        formatter: (row) => row.carrier?.companyName || '-'
      },
      { prop: 'driverName', label: '司机', width: 110 },
      ...(canViewListField('contactPhones')
        ? [{ prop: 'driverPhone', label: '手机号码', width: 130 } as ColumnOption<CarrierPrice>]
        : []),
      { prop: 'plateNo', label: '车牌号', width: 120 },
      {
        prop: 'vehicleType',
        label: '车型',
        width: 110,
        dict: { code: 'tmsCustomerPriceVehicleType', display: 'text' }
      },
      {
        prop: 'vehicleLength',
        label: '车长',
        width: 110,
        dict: { code: 'tmsCustomerPriceVehicleLength', display: 'text' }
      },
      {
        prop: 'billingMethod',
        label: '计费方式',
        width: 130,
        dict: { code: 'tmsCustomerPriceBillingMethod', display: 'text' }
      },
      ...(canViewListField('costAmounts')
        ? [
            {
              prop: 'totalFee',
              label: '运费合计（元）',
              width: 130,
              align: 'right',
              formatter: (row) => formatSensitiveNumber(row.totalFee)
            } as ColumnOption<CarrierPrice>
          ]
        : []),
      {
        prop: 'createBy',
        label: '创建人',
        width: 120,
        formatter: (row) => formatAuditActorName(row.createBy)
      },
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
              permission="TmsCarrierPrice:Edit"
              onClick={() => openEditPage(row)}
            />
            <ArtButtonTable
              type="delete"
              permission="TmsCarrierPrice:Delete"
              onClick={() => handleDelete(row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }

  async function fetchTableData(params: TableParams) {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchCarrierPriceList({
      ...normalizePriceRegionSearch(params),
      from,
      to
    })

    carrierPriceFieldAccess.value = result.fieldAccess
    currentRows.value = result.data

    return result
  }

  function canViewListField(field: CarrierPriceFieldKey): boolean {
    const merged = mergeFieldAccessMaps(
      carrierPriceFieldAccess.value,
      ...currentRows.value.map((row) => row.fieldAccess)
    )
    return canViewField(merged, field)
  }

  function openEditPage(row?: CarrierPrice): void {
    if (row?.id) {
      void router.push({ name: 'TmsCarrierPriceEdit', params: { id: row.id } })
      return
    }
    void router.push({ name: 'TmsCarrierPriceEdit' })
  }

  function openDetailPage(row: CarrierPrice): void {
    if (!row.id) return
    void router.push({ name: 'TmsCarrierPriceDetail', params: { id: row.id } })
  }

  async function handleDelete(row: CarrierPrice): Promise<void> {
    await deleteRecord({
      resource: {
        id: row.id ?? '',
        label: `${row.quoteNo} · ${row.carrier?.companyName || '承运商协议价'}`
      },
      permission: 'TmsCarrierPrice:Delete',
      remove: () => deleteCarrierPrice(row.id ?? ''),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }

  function formatTransportMode(value: unknown): string {
    return getLabel(table.transportModeOptions, value)
  }

  function formatBillingMethod(value: unknown): string {
    return getLabel(table.billingMethodOptions, value)
  }

  function formatVehicleType(value: unknown): string {
    return getLabel(getDictMap.value.tmsCustomerPriceVehicleType ?? [], value)
  }

  function formatVehicleLength(value: unknown): string {
    return getLabel(getDictMap.value.tmsCustomerPriceVehicleLength ?? [], value)
  }

  function getLabel(options: Api.DataCenter.DictListItem[], value: unknown): string {
    if (!value) return ''
    const text = String(value)
    const item = options.find((option) => option.value === text || option.label === text)
    return item?.label || text
  }

  const formatDateTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm:ss',
    emptyText: '-',
    invalidText: '-',
    allowTimeOnly: false
  })

  function syncMasterDeleteRoute(forceRefresh = false): void {
    const carrierId = typeof route.query.carrierId === 'string' ? route.query.carrierId : ''
    const recordId =
      route.query.fromMasterDelete === '1' && typeof route.query.recordId === 'string'
        ? route.query.recordId
        : ''
    const changed =
      table.searchQuery.carrierId !== carrierId || table.searchQuery.recordId !== recordId
    Object.assign(table.searchQuery, { carrierId, recordId })
    if (recordId || changed) {
      Object.assign(table.searchQuery, {
        originRegionPath: [],
        destinationRegionPath: [],
        createTimeRange: [],
        keyword: ''
      })
    }
    if (changed || forceRefresh) void nextTick().then(() => tableQueryRef.value?.refreshCreate())
  }

  watch(
    () => route.fullPath,
    () => syncMasterDeleteRoute(),
    { flush: 'post' }
  )
  onActivated(() => syncMasterDeleteRoute(true))
</script>

<style scoped lang="scss">
  .carrier-price {
    :deep(.carrier-price__detail-link) {
      justify-content: flex-start;
      max-width: 100%;
      font-weight: 500;

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
</style>
