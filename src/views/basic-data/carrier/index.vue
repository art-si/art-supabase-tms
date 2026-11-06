<template>
  <div class="tms-carrier business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="CARRIER NETWORK"
      title="承运商资料"
      description="集中管理承运主体、合作类型、资质与履约关系，让调度选择和经营评估更高效。"
      icon="ri:truck-line"
      :tags="[
        { label: '运力伙伴', type: 'primary' },
        { label: '资质可追踪', type: 'info' }
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
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 86, showExpand: false }"
      :table-props="{
        emptyText: '暂无承运商资料',
        emptyDescription: '可新增承运商，或调整类型、状态、创建时间和关键字后重新查询。'
      }"
      focusable
    />

    <CarrierDialog ref="dialogRef" @success="handleSaveSuccess" />
    <CarrierDetailDialog ref="detailDialogRef" />
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleDeleteGuardCleared" />
  </div>
</template>

<script setup lang="tsx">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { ElButton, ElMessage } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryExcelColumn,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { navigateToApplication } from '@/utils/application-navigation'
  import { canViewField, mergeFieldAccessMaps } from '@/utils/field-permission'
  import { useUserStore } from '@/store/modules/user'
  import {
    deleteCarrier,
    deleteCarrierBatch,
    exportCarrierList,
    fetchCarrierList,
    importCarriers
  } from '@tms/api'
  import CarrierDialog from './modules/carrier-dialog.vue'
  import CarrierDetailDialog from './modules/carrier-detail-dialog.vue'
  import {
    carrierSelections,
    carrierSelectionLabels,
    parseCarrierSelections
  } from '@tms/views/basic-data/carrier/modules/carrier-selection'
  import { getDictionaryDisplayLabel, toDictionaryOption } from '@/utils/form/option'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'

  defineOptions({ name: 'TmsCarrier' })

  const { deleteRecords } = useRecordDeleteGuard('mdm_carrier', '承运商')

  type Carrier = Api.Tms.BasicData.Carrier
  type SearchParams = Api.Tms.BasicData.CarrierSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface CarrierDialogExpose {
    handleOpen: (row?: Carrier) => Promise<void>
  }

  interface CarrierDetailDialogExpose {
    handleOpen: (id: string) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  const router = useRouter()
  const route = useRoute()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<CarrierDialogExpose>()
  const detailDialogRef = ref<CarrierDetailDialogExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()
  const carrierFieldAccess = ref<Api.Tms.BasicData.CarrierFieldAccessMap>({})

  const tableState = reactive<{ searchQuery: SearchParams }>({
    searchQuery: {
      carrierType: '',
      enabled: undefined,
      createTimeRange: [],
      recordId: typeof route.query.recordId === 'string' ? route.query.recordId : '',
      keyword: ''
    }
  })

  const carrierTypeOptions = computed(() => getDictMap.value.tmsCarrierType ?? [])
  const commonBooleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true'
    }))
  )

  const carrierImportColumns: ArtTableQueryExcelColumn[] = [
    { key: 'carrierCode', title: '承运商编码' },
    { key: 'companyName', title: '公司名称', required: true },
    { key: 'carrierType', title: '承运商类型', required: true },
    { key: 'dispatchChannel', title: '调度渠道' },
    { key: 'driverCount', title: '司机数量' },
    { key: 'vehicleCount', title: '车辆数量' },
    { key: 'region', title: '区域' },
    { key: 'addressDetail', title: '公司地址' },
    { key: 'enabled', title: '状态' },
    { key: 'contactName', title: '联系人' },
    { key: 'contactPhone', title: '手机号码' }
  ]

  const visibleCarrierExportColumns = computed(() =>
    carrierImportColumns
      .filter((column) => {
        if (column.key === 'addressDetail') {
          return canViewField(carrierFieldAccess.value, 'addressDetail')
        }
        if (column.key === 'contactPhone') {
          return canViewField(carrierFieldAccess.value, 'contactPhone')
        }
        return true
      })
      .map((column) => {
        if (column.key === 'carrierType')
          return {
            ...column,
            formatter: (value: unknown) =>
              carrierSelectionLabels(
                String(value ?? '')
                  .split(',')
                  .filter(Boolean),
                carrierTypeOptions.value,
                '原类型待核对'
              )
          }
        if (column.key === 'dispatchChannel')
          return {
            ...column,
            formatter: (value: unknown) =>
              carrierSelectionLabels(
                String(value ?? '')
                  .split(',')
                  .filter(Boolean),
                getDictMap.value.tmsCarrierDispatchChannel ?? []
              )
          }
        if (column.key === 'enabled')
          return {
            ...column,
            formatter: (value: unknown) =>
              getDictionaryDisplayLabel(
                userStore.getDictItemByValue('commonBoolean', String(value)),
                String(value),
                { unknownText: '待核对' }
              )
          }
        return column
      })
  )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '承运商类型',
      key: 'carrierType',
      type: 'select',
      props: { options: carrierTypeOptions.value, clearable: true }
    },
    {
      label: '承运商状态',
      key: 'enabled',
      type: 'select',
      props: { options: commonBooleanOptions.value, clearable: true }
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
      props: { clearable: true, placeholder: '公司名称、编码或联系人' }
    }
  ])

  const columnsFactory = (): ColumnOption<Carrier>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 72 },
    {
      prop: 'carrierCode',
      label: '承运商编码',
      width: 165,
      formatter: (row) =>
        row.id ? (
          <button
            type="button"
            class="tms-carrier__code-link"
            title={`查看承运商 ${row.carrierCode || row.companyName} 详情`}
            onClick={() => openDetail(row)}
          >
            {row.carrierCode || '-'}
          </button>
        ) : (
          row.carrierCode || '-'
        )
    },
    { prop: 'companyName', label: '公司名称', minWidth: 210, showOverflowTooltip: true },
    {
      prop: 'carrierType',
      label: '承运商类型',
      minWidth: 170,
      showOverflowTooltip: true,
      formatter: (row) =>
        carrierSelectionLabels(
          carrierSelections(row.carrierTypes, row.carrierType),
          carrierTypeOptions.value,
          '原类型待核对'
        )
    },
    {
      prop: 'dispatchChannel',
      label: '调度渠道',
      minWidth: 120,
      formatter: (row) =>
        carrierSelectionLabels(
          carrierSelections(row.dispatchChannels, row.dispatchChannel),
          getDictMap.value.tmsCarrierDispatchChannel ?? []
        )
    },
    {
      prop: 'driverCount',
      label: '司机数量',
      width: 100,
      align: 'right',
      formatter: (row) => (
        <ElButton link type="primary" onClick={() => goDriverManage(row)}>
          {row.driverCount ?? 0}
        </ElButton>
      )
    },
    {
      prop: 'vehicleCount',
      label: '车辆数量',
      width: 100,
      align: 'right',
      formatter: (row) => (
        <ElButton link type="primary" onClick={() => goVehicleManage(row)}>
          {row.vehicleCount ?? 0}
        </ElButton>
      )
    },
    ...(canViewField(carrierFieldAccess.value, 'addressDetail')
      ? [
          {
            prop: 'address',
            label: '公司地址',
            minWidth: 240,
            showOverflowTooltip: true,
            formatter: (row: Carrier) =>
              [row.region, row.addressDetail].filter(Boolean).join(' ') || '-'
          } satisfies ColumnOption<Carrier>
        ]
      : []),
    ...(canViewField(carrierFieldAccess.value, 'contactPhone')
      ? [
          {
            prop: 'contactPhone',
            label: '联系人电话',
            width: 150,
            formatter: (row: Carrier) => row.contactPhone || '-'
          } satisfies ColumnOption<Carrier>
        ]
      : []),
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      dict: { code: 'commonBoolean', display: 'tag', value: (row) => String(row.enabled ?? '') }
    },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 120,
      fixed: 'right',
      formatter: (row) => (
        <div class="flex">
          <ArtButtonTable
            type="edit"
            permission="TmsCarrier:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonMore
            list={getMoreActions()}
            onClick={(item: ButtonMoreItem) => handleMoreAction(item, row)}
          />
        </div>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { permission: 'TmsCarrier:Add', type: 'add', onClick: () => openDialog() },
    {
      permission: 'TmsCarrier:Import',
      type: 'import',
      importColumns: carrierImportColumns,
      importApi: async (rows) => {
        const userStore = useUserStore()
        await Promise.all([
          userStore.ensureDictLoaded('tmsCarrierType'),
          userStore.ensureDictLoaded('tmsCarrierDispatchChannel')
        ])
        const typeOptions = (getDictMap.value.tmsCarrierType ?? []).map(toDictionaryOption)
        const channelOptions = (getDictMap.value.tmsCarrierDispatchChannel ?? []).map(
          toDictionaryOption
        )
        await importCarriers(
          (rows as Carrier[]).map((row) => {
            const carrierTypes = parseCarrierSelections(row.carrierType, typeOptions, '承运商类型')
            const dispatchChannels = parseCarrierSelections(
              row.dispatchChannel || 'offline',
              channelOptions,
              '调度渠道'
            ) as ('online' | 'offline')[]
            if (!carrierTypes.length || !dispatchChannels.length) {
              throw new Error('承运商类型和调度渠道至少各选择一项')
            }
            return {
              ...row,
              carrierType: carrierTypes[0] ?? '',
              carrierTypes,
              dispatchChannel: dispatchChannels[0],
              dispatchChannels
            }
          })
        )
      },
      onImportSuccess: () => {
        ElMessage.success('导入成功')
      },
      onImportError: () => {
        ElMessage.error('导入文件解析失败')
      }
    },
    {
      permission: 'TmsCarrier:Export',
      type: 'export',
      exportFilename: 'TMS承运商资料',
      exportSheetName: '承运商管理',
      exportColumns: () => visibleCarrierExportColumns.value,
      exportApi: async ({ selectedIds, searchParams, maxRows }) => {
        await Promise.all([
          userStore.ensureDictLoaded('tmsCarrierType'),
          userStore.ensureDictLoaded('tmsCarrierDispatchChannel'),
          userStore.ensureDictLoaded('commonBoolean')
        ])
        const result = await exportCarrierList({
          ...(searchParams as SearchParams),
          ids: selectedIds.map(String),
          maxRows
        })
        syncCarrierFieldAccess(result)
        return {
          ...result,
          data: result.data.map((row) => ({
            ...row,
            carrierType: carrierSelections(row.carrierTypes, row.carrierType).join(','),
            dispatchChannel: carrierSelections(row.dispatchChannels, row.dispatchChannel).join(',')
          }))
        }
      }
    },
    {
      permission: 'TmsCarrier:Delete',
      type: 'delete',
      confirm: false,
      onClick: ({ selectedRows }) => handleDeleteRows(selectedRows as Carrier[])
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchCarrierList({ ...params, from, to })
    syncCarrierFieldAccess(result)
    return result
  }

  const syncCarrierFieldAccess = (result: {
    fieldAccess?: Api.Tms.BasicData.CarrierFieldAccessMap
    data?: Carrier[] | null
  }): void => {
    carrierFieldAccess.value = mergeFieldAccessMaps(
      result.fieldAccess,
      ...(result.data ?? []).map((record) => record.fieldAccess)
    )
  }

  const openDialog = (row?: Carrier): void => {
    void dialogRef.value?.handleOpen(row)
  }

  const openDetail = (row: Carrier): void => {
    if (!row.id) return
    void detailDialogRef.value?.handleOpen(String(row.id))
  }

  const goDriverManage = (row: Carrier): void => {
    if (!row.id) return
    void router.push({
      path: '/tms/basic-data/driver',
      query: { carrierId: row.id }
    })
  }

  const goVehicleManage = (row: Carrier): void => {
    if (!row.id) return
    void navigateToApplication('vms', '/vms/vehicle-archive-manage', {
      carrierId: row.id
    }).catch((error) => ElMessage.error(getFriendlySupabaseErrorMessage(error, 'VMS 应用跳转失败')))
  }

  const getMoreActions = (): ButtonMoreItem[] => [
    { auth: 'TmsCarrier:View', key: 'view', label: '查看', icon: 'ri:eye-line' },
    {
      auth: 'TmsCarrier:Delete',
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-5-line',
      color: '#f56c6c'
    }
  ]

  const handleMoreAction = (item: ButtonMoreItem, row: Carrier): void => {
    if (item.key === 'view') {
      openDetail(row)
      return
    }
    if (item.key === 'delete') {
      void handleDelete(row)
    }
  }

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
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

  const handleDeleteRows = async (rows: Carrier[]): Promise<void> => {
    const resources = rows.map((row) => ({
      id: row.id ? String(row.id) : '',
      label: row.companyName || '未命名承运商'
    }))
    const ids = resources.map((item) => item.id)
    await deleteRecords({
      resources,
      permission: 'TmsCarrier:Delete',
      inspectReferences: async (snapshot) => {
        if (!deleteGuardRef.value) throw new Error('删除检查尚未就绪，请刷新列表后重试。')
        return deleteGuardRef.value.inspect({
          resourceType: 'carrier',
          resourceLabel: '承运商',
          resources: snapshot
        })
      },
      remove: () => (ids.length === 1 ? deleteCarrier(ids[0]) : deleteCarrierBatch(ids)),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }
  const handleDelete = (row: Carrier): Promise<void> => handleDeleteRows([row])
</script>

<style scoped lang="scss">
  .tms-carrier {
    :deep(.tms-carrier__code-link) {
      display: inline-block;
      max-width: 100%;
      padding: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
      vertical-align: middle;
      color: var(--el-color-primary);
      white-space: nowrap;
      text-decoration: none;
      cursor: pointer;
      background: transparent;
      border: 0;

      &:hover {
        color: var(--el-color-primary-dark-2);
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
        border-radius: var(--el-border-radius-small);
      }
    }
  }
</style>
