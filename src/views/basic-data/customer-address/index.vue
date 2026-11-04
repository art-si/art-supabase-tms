<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="ADDRESS DIRECTORY"
      title="常用地址"
      description="集中维护收发货地点、联系人与营业时间，粘贴或语音输入可快速识别。"
      icon="ri:map-pin-user-line"
      :tags="[
        { label: '地址资产', type: 'primary' },
        { label: '快速开单', type: 'success' },
        { label: '到离场围栏', type: 'info' }
      ]"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="tableState.searchQuery"
      :search-items="searchItems"
      :api-fn="fetchTableData"
      :api-params="tableApiParams"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 82, showExpand: false }"
      :table-props="{
        emptyText: '暂无常用地址',
        emptyDescription: '新增常用地址，或调整地址类型、时间和关键字后重新查询。'
      }"
      focusable
    />

    <CustomerAddressDialog ref="dialogRef" @success="handleSaveSuccess" />
    <AddressGeofenceDialog ref="geofenceDialogRef" @success="handleGeofenceSuccess" />
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleDeleteGuardCleared" />
  </div>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { canEditField, canViewField, type FieldAccessLevel } from '@/utils/field-permission'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { isSupportedAddressType } from './address-type'
  import {
    deleteCustomerAddress,
    deleteCustomerAddressBatch,
    fetchCustomerAddressList
  } from '@tms/api'
  import CustomerAddressDialog from './modules/customer-address-dialog.vue'
  import AddressGeofenceDialog from './modules/address-geofence-dialog.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'

  defineOptions({ name: 'TmsCustomerAddress' })

  const { deleteRecords } = useRecordDeleteGuard('mdm_customer_address', '客户地址')

  type CustomerAddress = Api.Tms.BasicData.CustomerAddress
  type SearchParams = Api.Tms.BasicData.CustomerAddressSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface AddressDialogExpose {
    handleOpen: (
      row?: CustomerAddress,
      context?: { customerId?: string; customerName?: string }
    ) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  interface GeofenceDialogExpose {
    handleOpen: (row: CustomerAddress) => Promise<void>
  }

  interface TableState {
    searchQuery: SearchParams
  }

  const route = useRoute()
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<AddressDialogExpose>()
  const geofenceDialogRef = ref<GeofenceDialogExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()
  const addressFieldAccess = ref<Api.Tms.BasicData.CustomerAddressFieldAccessMap>({})

  const fieldAccessRank: Record<FieldAccessLevel, number> = {
    hidden: 0,
    masked: 1,
    read: 2,
    edit: 3
  }

  const mergeAddressFieldAccess = (
    baseAccess: Api.Tms.BasicData.CustomerAddressFieldAccessMap,
    records: CustomerAddress[]
  ): Api.Tms.BasicData.CustomerAddressFieldAccessMap => {
    const result = { ...baseAccess }
    records.forEach((record) => {
      Object.entries(record.fieldAccess ?? {}).forEach(([field, access]) => {
        const key = field as Api.Tms.BasicData.CustomerAddressFieldKey
        const current = result[key] ?? 'hidden'
        if (fieldAccessRank[access] > fieldAccessRank[current]) result[key] = access
      })
    })
    return result
  }

  const routeCustomerId = computed(() => String(route.query.customerId ?? ''))
  const customerName = computed(() => String(route.query.customerName ?? ''))
  const tableApiParams = computed<Partial<TableParams>>(() => ({
    customerId: routeCustomerId.value || undefined
  }))

  const tableState = reactive<TableState>({
    searchQuery: {
      customerId: routeCustomerId.value,
      addressType: undefined,
      createTimeRange: [],
      recordId: typeof route.query.recordId === 'string' ? route.query.recordId : '',
      keyword: ''
    }
  })

  const dictionaryAddressTypeOptions = useDictionaryOptions('tmsAddressType')
  const addressTypeOptions = computed(() =>
    dictionaryAddressTypeOptions.filter((item) => isSupportedAddressType(item.value))
  )
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '地址类型',
      key: 'addressType',
      type: 'segment',
      span: 24,
      props: {
        options: [
          { label: '全部', value: undefined },
          ...addressTypeOptions.value.map((item) => ({
            label: item.label,
            value: item.value
          }))
        ]
      }
    },
    {
      label: '创建日期',
      key: 'createTimeRange',
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
      label: '关键词',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '地址简称、收发货方、联系人或地址' }
    }
  ])

  const columnsFactory = (): ColumnOption<CustomerAddress>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 72 },
    {
      prop: 'addressType',
      label: '地址类型',
      width: 120,
      formatter: (row) => (
        <ElTag
          type={row.addressType === 'shipping' ? 'primary' : 'success'}
          effect="light"
          size="small"
        >
          {addressTypeOptions.value.find((item) => item.value === row.addressType)?.label || '-'}
        </ElTag>
      )
    },
    {
      prop: 'addressShortName',
      label: '地址简称',
      minWidth: 165,
      formatter: (row) => row.addressShortName || '-'
    },
    {
      prop: 'partyName',
      label: '收/发货方',
      minWidth: 175,
      showOverflowTooltip: true,
      formatter: (row) => row.partyName || '-'
    },
    { prop: 'contactName', label: '联系人', width: 120 },
    ...(canViewField(addressFieldAccess.value, 'contactPhone')
      ? [
          {
            prop: 'contactPhone',
            label: '联系电话',
            width: 150,
            formatter: (row: CustomerAddress) => row.contactPhone || '-'
          } satisfies ColumnOption<CustomerAddress>
        ]
      : []),
    ...(canViewField(addressFieldAccess.value, 'addressDetail')
      ? [
          {
            prop: 'fullAddress',
            label: '详细地址',
            minWidth: 300,
            showOverflowTooltip: true,
            formatter: (row: CustomerAddress) =>
              [row.region, row.addressDetail].filter(Boolean).join(' ') || '-'
          } satisfies ColumnOption<CustomerAddress>
        ]
      : []),
    {
      prop: 'businessHoursStart',
      label: '营业时间',
      width: 145,
      formatter: (row) =>
        row.businessHoursStart && row.businessHoursEnd
          ? `${row.businessHoursStart}–${row.businessHoursEnd}`
          : '-'
    },
    {
      prop: 'isDefault',
      label: '默认',
      width: 90,
      dict: { code: 'commonBoolean', display: 'tag', value: (row) => String(row.isDefault ?? '') }
    },
    {
      prop: 'geofenceEnabled',
      label: '电子围栏',
      width: 140,
      formatter: (row) => (
        <div class="flex min-w-0 items-center gap-[9px]">
          <span
            class={[
              'size-2 shrink-0 rounded-full',
              row.geofenceEnabled
                ? 'bg-[var(--el-color-success)] shadow-[0_0_0_4px_var(--el-color-success-light-9)]'
                : 'bg-[var(--el-color-info-light-5)]'
            ]}
          />
          <div class="grid min-w-0">
            <strong class="truncate text-[13px] text-[var(--el-text-color-primary)]">
              {row.geofenceEnabled ? '已启用' : '未启用'}
            </strong>
            <small class="truncate text-[var(--el-text-color-secondary)]">
              {row.geofenceEnabled ? `${row.geofenceRadiusM ?? '-'} 米` : '不参与定位校验'}
            </small>
          </div>
        </div>
      )
    },
    { prop: 'remark', label: '备注', minWidth: 150, showOverflowTooltip: true },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 164,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          {canEditField(row.fieldAccess, 'addressDetail') ? (
            <ArtButtonTable
              type="edit"
              icon="ri:radar-line"
              permission="TmsCustomerAddress:Geofence"
              label={row.geofenceEnabled ? '查看或修改围栏' : '设置围栏'}
              onClick={() => void geofenceDialogRef.value?.handleOpen(row)}
            />
          ) : null}
          <ArtButtonTable
            type="edit"
            permission="TmsCustomerAddress:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonTable
            type="delete"
            permission="TmsCustomerAddress:Delete"
            onClick={() => handleDelete(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { permission: 'TmsCustomerAddress:Add', type: 'add', onClick: () => openDialog() },
    {
      permission: 'TmsCustomerAddress:Delete',
      type: 'delete',
      confirm: false,
      onClick: ({ selectedRows }) => handleDeleteRows(selectedRows as CustomerAddress[])
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchCustomerAddressList({
      ...params,
      from,
      to
    })
    addressFieldAccess.value = mergeAddressFieldAccess(result.fieldAccess, result.data ?? [])
    return result
  }

  const openDialog = (row?: CustomerAddress): void => {
    void dialogRef.value?.handleOpen(row, {
      customerId: tableState.searchQuery.customerId ?? undefined,
      customerName: customerName.value ?? undefined
    })
  }

  watch(routeCustomerId, async (value) => {
    tableState.searchQuery.customerId = value
    await nextTick()
    await tableQueryRef.value?.getData()
  })

  watch(
    () => tableState.searchQuery.addressType,
    async () => {
      await nextTick()
      await tableQueryRef.value?.getData()
    },
    { flush: 'post' }
  )

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleGeofenceSuccess = (): void => {
    void tableQueryRef.value?.refreshUpdate()
  }

  const handleDeleteGuardCleared = (): void => {
    void tableQueryRef.value?.getData()
  }

  const syncMasterDeleteReturn = (forceRefresh = false): void => {
    const recordId =
      route.query.resumeMasterDelete === '1' && typeof route.query.recordId === 'string'
        ? route.query.recordId
        : ''
    const changed = tableState.searchQuery.recordId !== recordId
    tableState.searchQuery.recordId = recordId
    if (recordId) tableState.searchQuery.keyword = ''
    if (changed || forceRefresh) void nextTick().then(() => tableQueryRef.value?.refreshCreate())
  }

  watch(
    () => route.fullPath,
    () => syncMasterDeleteReturn(),
    { flush: 'post' }
  )
  onActivated(() => syncMasterDeleteReturn(true))

  const handleDeleteRows = async (rows: CustomerAddress[]): Promise<void> => {
    const resources = rows.map((row) => ({
      id: row.id ? String(row.id) : '',
      label: [row.region, row.addressDetail].filter(Boolean).join(' ') || '未命名地址'
    }))
    const ids = resources.map((item) => item.id)
    await deleteRecords({
      resources,
      permission: 'TmsCustomerAddress:Delete',
      inspectReferences: async (snapshot) => {
        if (!deleteGuardRef.value) throw new Error('删除检查尚未就绪，请刷新列表后重试。')
        return deleteGuardRef.value.inspect({
          resourceType: 'customer_address',
          resourceLabel: '客户地址',
          resources: snapshot
        })
      },
      remove: () =>
        ids.length === 1 ? deleteCustomerAddress(ids[0]) : deleteCustomerAddressBatch(ids),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }

  const handleDelete = (row: CustomerAddress): Promise<void> => handleDeleteRows([row])
</script>
