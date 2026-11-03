<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="STATION NETWORK"
      title="运输站点"
      description="维护运输网络中的站点类型、区域位置、联系人与可用状态，为线路规划提供基础。"
      icon="ri:global-line"
      :tags="[
        { label: '运输网络', type: 'primary' },
        { label: '区域覆盖', type: 'info' }
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
        emptyText: '暂无运输站点',
        emptyDescription: '可新增站点，或调整站点类型、状态和关键字后重新查询。'
      }"
      focusable
    />

    <StationDialog ref="dialogRef" @success="handleSaveSuccess" />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { ElMessage, ElSwitch } from 'element-plus'
  import { trim, uniq } from 'lodash-es'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryExcelColumn,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { normalizeImportedEnabled } from '@/utils/form/normalize'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import {
    deleteStation,
    deleteStationBatch,
    exportStationList,
    fetchStationDeleteDependencies,
    fetchStationList,
    importStations,
    updateStationEnabled
  } from '@tms/api'
  import StationDialog from './modules/station-dialog.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'

  defineOptions({ name: 'TmsStation' })

  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()

  type Station = Api.Tms.Station.StationRecord
  type StationSavePayload = Api.Tms.Station.StationSavePayload
  type SearchParams = Api.Tms.Station.StationSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface StationDialogExpose {
    handleOpen: (row?: Station) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { isAllTenants, tenantOptions } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<StationDialogExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()
  const tenantLabelById = computed(
    () =>
      new Map(
        tenantOptions.value.map((tenant) => [tenant.id, tenant.tenantName || tenant.tenantCode])
      )
  )

  const tableState = reactive<{ searchQuery: SearchParams }>({
    searchQuery: {
      stationType: '',
      enabled: undefined,
      keyword: ''
    }
  })

  const stationTypeOptions = computed(() => getDictMap.value.tmsStationType ?? [])
  const commonBooleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true'
    }))
  )

  const stationTypeLabelToValue = computed(() => {
    const map = new Map<string, string>()
    stationTypeOptions.value.forEach((item) => {
      if (item.label && item.value) map.set(item.label, item.value)
    })
    return map
  })

  const getStationTypes = (station: Station): string[] => {
    const roleTypes = (station.stationRoles ?? []).map((item) => String(item.roleType))
    return uniq(roleTypes.length ? roleTypes : [String(station.stationType || '')]).filter(Boolean)
  }

  const stationExcelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'stationCode', title: '编号' },
    { key: 'stationName', title: '站名称', required: true },
    {
      key: 'stationTypes',
      title: '类型',
      required: true,
      formatter: (_value, row) =>
        getStationTypes(row as Station)
          .map((type) =>
            getDictionaryDisplayLabel(
              userStore.getDictDisplayItemByValue('tmsStationType', type),
              type
            )
          )
          .join('、')
    },
    { key: 'regionCode', title: '地区编码' },
    { key: 'region', title: '省市区' },
    { key: 'addressDetail', title: '详细地址' },
    { key: 'longitude', title: '经度' },
    { key: 'latitude', title: '纬度' },
    { key: 'managerName', title: '负责人' },
    { key: 'contactPhone', title: '联系电话' },
    {
      key: 'enabled',
      title: '状态',
      formatter: (value) =>
        getDictionaryDisplayLabel(
          userStore.getDictDisplayItemByValue('commonBoolean', String(value ?? '')),
          value,
          { emptyText: '' }
        )
    },
    { key: 'remark', title: '备注' }
  ]
  const stationExportColumns = computed<ArtTableQueryExcelColumn[]>(() =>
    isAllTenants.value
      ? [
          {
            key: 'tenantId',
            title: '所属租户',
            formatter: (_value, row) =>
              tenantLabelById.value.get((row as Station).tenantId || '') || '租户不可用'
          },
          ...stationExcelColumns
        ]
      : stationExcelColumns
  )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '站点编码、名称、负责人或电话'
      }
    },
    {
      label: '站点类型',
      key: 'stationType',
      type: 'select',
      props: {
        options: stationTypeOptions.value,
        clearable: true,
        placeholder: '请选择站点类型'
      }
    },
    {
      label: '状态',
      key: 'enabled',
      type: 'select',
      props: {
        options: commonBooleanOptions.value,
        clearable: true,
        placeholder: '请选择状态'
      }
    }
  ])

  const columnsFactory = (): ColumnOption<Station>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    ...(isAllTenants.value
      ? [
          {
            prop: 'tenantId',
            label: '所属租户',
            minWidth: 150,
            formatter: (row: Station) =>
              tenantLabelById.value.get(row.tenantId || '') || '租户不可用'
          } as ColumnOption<Station>
        ]
      : []),
    { prop: 'stationCode', label: '编号', width: 140 },
    {
      prop: 'stationName',
      label: '站名称',
      minWidth: 180,
      showOverflowTooltip: true
    },
    {
      prop: 'stationRoles',
      label: '类型',
      minWidth: 220,
      formatter: (row) => (
        <div class="flex flex-wrap gap-1">
          {getStationTypes(row).map((type) => (
            <ArtDictDisplay key={type} dictCode="tmsStationType" value={type} display="tag" />
          ))}
        </div>
      )
    },
    {
      prop: 'regionCode',
      label: '地区编码',
      minWidth: 130,
      formatter: (row) => row.regionCode || '-'
    },
    { prop: 'region', label: '省市区', minWidth: 170, showOverflowTooltip: true },
    { prop: 'addressDetail', label: '详细地址', minWidth: 200, showOverflowTooltip: true },
    {
      prop: 'managerName',
      label: '负责人',
      width: 120,
      formatter: (row) => row.managerName || '-'
    },
    {
      prop: 'contactPhone',
      label: '联系电话',
      width: 150,
      formatter: (row) => row.contactPhone || '-'
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 100,
      formatter: (row) => {
        const previous = Boolean(row.enabled)
        return hasAuth('TmsStation:Toggle') ? (
          <ElSwitch
            v-model={row.enabled}
            inlinePrompt
            activeText="启"
            inactiveText="停"
            onChange={(value) => handleStatusChange(row, previous, Boolean(value))}
          />
        ) : (
          <ArtDictDisplay
            dictCode="commonBoolean"
            value={String(row.enabled ?? '')}
            display="tag"
          />
        )
      }
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
            permission="TmsStation:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonTable
            type="delete"
            permission="TmsStation:Delete"
            onClick={() => handleDelete(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { permission: 'TmsStation:Add', type: 'add', onClick: () => openDialog() },
    {
      permission: 'TmsStation:Import',
      type: 'import',
      importColumns: stationExcelColumns,
      importRecordTransformer: (rows) => rows.map(normalizeImportRow),
      importApi: async (rows) => {
        const targetTenantId = defaultWriteTenantId.value
        if (!targetTenantId) throw new Error('无法确定导入目标租户，请刷新后重试')
        await importStations(
          (rows as StationSavePayload[]).map((row) => ({
            ...row,
            tenantId: targetTenantId
          }))
        )
      },
      onImportSuccess: () => {
        ElMessage.success('导入成功')
      },
      onImportError: (error) => {
        notifyFriendlyError(error, '站点导入失败，请检查文件内容和目标租户')
      }
    },
    {
      permission: 'TmsStation:Export',
      type: 'export',
      exportFilename: 'TMS站点资料',
      exportSheetName: '站点管理',
      exportColumns: stationExportColumns.value,
      exportApi: async ({ selectedIds, searchParams, maxRows }) => {
        await Promise.all(
          ['tmsStationType', 'commonBoolean'].map((code) => userStore.ensureDictLoaded(code))
        )
        return exportStationList({
          ...(searchParams as SearchParams),
          ids: selectedIds.map(String),
          maxRows
        })
      }
    },
    {
      permission: 'TmsStation:Delete',
      type: 'delete',
      confirm: false,
      onClick: async ({ selectedRows }) => {
        const rows = selectedRows as Station[]
        if (await inspectDeleteDependencies(rows)) return
        try {
          await confirmAction(
            `确定删除选中的 ${rows.length} 条站点资料吗？删除后无法恢复。`,
            '删除确认',
            {
              confirmButtonText: '删除',
              cancelButtonText: '取消',
              type: 'warning',
              confirmButtonType: 'danger'
            }
          )
        } catch {
          return
        }
        try {
          await deleteStationBatch(rows.map((row) => String(row.id)).filter(Boolean))
          await tableQueryRef.value?.refreshRemove()
        } catch (error) {
          await handleDeleteFailure(error, rows)
        }
      }
    }
  ])

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchStationList({ ...params, from, to })
  }

  const normalizeStationTypes = (value: unknown): string[] =>
    uniq(
      String(value ?? '')
        .split(/[、,，;；]/)
        .map((item) => trim(item))
        .filter(Boolean)
        .map((item) => stationTypeLabelToValue.value.get(item) || item)
    )

  const normalizeImportRow = (row: Record<string, unknown>): StationSavePayload =>
    ({
      ...row,
      stationTypes: normalizeStationTypes(row.stationTypes),
      enabled: normalizeImportedEnabled(row.enabled)
    }) as StationSavePayload

  const openDialog = (row?: Station): void => {
    void dialogRef.value?.handleOpen(row)
  }

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleStatusChange = async (
    row: Station,
    previous: boolean,
    enabled: boolean
  ): Promise<void> => {
    if (!row.id) return
    row.enabled = enabled
    try {
      await updateStationEnabled(row.id, enabled)
    } catch {
      row.enabled = previous
    }
  }

  const inspectDeleteDependencies = async (rows: Station[]): Promise<boolean> => {
    const resources = rows
      .filter((row) => row.id)
      .map((row) => ({ id: String(row.id), label: row.stationName }))
    if (!resources.length) return true
    if (!deleteGuardRef.value) {
      ElMessage.error('关联校验尚未就绪，请刷新页面后重试删除')
      return true
    }
    const statusLabels = new Map(
      (getDictMap.value.tmsOrderStatus ?? []).map((item) => [item.value, item.label || item.name])
    )
    return deleteGuardRef.value.inspect({
      resourceLabel: '站点',
      resources,
      navigationResource: { type: 'station', queryKey: 'stationId' },
      dependencyMeta: {
        station_order: {
          label: '关联订单',
          unit: '单',
          description: '订单仍引用该站点。请保留或停用站点，确需删除时先处理订单关联。',
          actionLabel: '查看订单',
          routeName: 'TmsOrderList',
          order: 10
        },
        station_favorite_route: {
          label: '关联常用线路',
          unit: '条',
          description: '常用线路仍将该站点用作途经点。请先调整线路中的途经点，再删除站点。',
          actionLabel: '查看常用线路',
          routeName: 'TmsFavoriteRoute',
          order: 20
        }
      },
      fetchDependencies: async (ids) =>
        (await fetchStationDeleteDependencies(ids)).map((record) => ({
          ...record,
          recordStatus: statusLabels.get(record.recordStatus ?? '') || record.recordStatus
        }))
    })
  }

  const handleDeleteFailure = async (error: unknown, rows: Station[]): Promise<void> => {
    if (await inspectDeleteDependencies(rows)) return
    ElMessage.error(getFriendlySupabaseErrorMessage(error, '站点删除失败，请稍后重试'))
  }

  const handleDelete = async (row: Station): Promise<void> => {
    if (!row.id) return
    if (await inspectDeleteDependencies([row])) return
    try {
      await confirmAction(`确定删除站点“${row.stationName}”吗？删除后无法恢复。`, '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonType: 'danger'
      })
    } catch {
      return
    }
    try {
      await deleteStation(row.id)
      await tableQueryRef.value?.refreshRemove()
    } catch (error) {
      await handleDeleteFailure(error, [row])
    }
  }
</script>
