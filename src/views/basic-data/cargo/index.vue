<template>
  <div class="tms-cargo-page business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="CARGO CATALOG"
      title="货物管理"
      description="关联 MDM 物料编码，统一名称、规格与基本单位，并维护运输所需参数。"
      icon="ri:archive-stack-line"
      :tags="[
        { label: '货品标准化', type: 'primary' },
        { label: '计量一致性', type: 'success' }
      ]"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <div class="tms-cargo-page__workspace"
      ><ArtWorkspaceSplitter
        primary-size="300px"
        primary-min="250px"
        primary-max="360px"
        :breakpoint="900"
        stacked-primary-size="auto"
      >
        <template #primary>
          <MasterGroupPanel
            title="物料分组"
            :groups="groupState.rows"
            :selected-id="groupState.selectedId"
            :loading="groupState.loading"
            :error="groupState.error"
            @select="selectGroup"
            @refresh="refreshGroups"
          />
        </template>
        <div class="tms-cargo-page__table">
          <ArtTableQuery
            ref="tableQueryRef"
            v-model="tableState.searchQuery"
            :search-items="searchItems"
            :api-fn="fetchTableData"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            :immediate="false"
            header-actions-placement="workspace"
            :search-bar-props="{ span: 6, labelWidth: 86, showExpand: false }"
            :table-props="{
              emptyText: '暂无货物资料',
              emptyDescription: '可新增货物，或调整分组、状态、时间和关键字后重新查询。'
            }"
            focusable
            focus-scope-selector=".tms-cargo-page__workspace"
          />
        </div> </ArtWorkspaceSplitter
    ></div>

    <CargoDialog ref="dialogRef" @success="handleSaveSuccess" />
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleDeleteGuardCleared" />
  </div>
</template>

<script setup lang="tsx">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { ElMessage } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryExcelColumn,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { normalizeImportedEnabled, normalizeNullableNumber } from '@/utils/form/normalize'
  import { formatWithDayjs } from '@/utils/time'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import TreeUtils from '@/utils/tree'
  import { fetchMasterGroups, type MasterGroup } from '@/api/master-groups'
  import {
    deleteCargo,
    deleteCargoBatch,
    exportCargoList,
    fetchCargoList,
    importCargoes
  } from '@tms/api'
  import CargoDialog from './modules/cargo-dialog.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterGroupPanel from '@/components/business/master-group-panel/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import type { CargoDialogOpenData } from './modules/cargo-dialog.vue'

  defineOptions({ name: 'TmsCargo' })

  const { deleteRecords } = useRecordDeleteGuard('mdm_cargo', '货物')

  type Cargo = Api.Tms.BasicData.Cargo
  type SearchParams = Api.Tms.BasicData.CargoSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface CargoDialogExpose {
    handleOpen: (data: CargoDialogOpenData) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  const { getDictMap } = storeToRefs(useUserStore())
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { defaultWriteTenantId } = useTenantScopeFormPolicy()
  const route = useRoute()
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<CargoDialogExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()
  const groupState = reactive({
    rows: [] as MasterGroup[],
    selectedId: '',
    loading: false,
    error: ''
  })
  const groupTree = new TreeUtils({ parentKey: 'parentId' })
  const selectedGroupIds = computed(() => {
    if (!groupState.selectedId) return undefined
    const descendants = groupTree
      .getDescendants(groupTree.listToTree(groupState.rows), groupState.selectedId, true)
      .map((item) => String(item.id))
    return descendants.length ? descendants : [groupState.selectedId]
  })
  const groupNameById = computed(
    () => new Map(groupState.rows.map((group) => [group.id, group.name]))
  )

  const tableState = reactive<{ searchQuery: SearchParams }>({
    searchQuery: {
      enabled: undefined,
      createTimeRange: [],
      recordId: typeof route.query.recordId === 'string' ? route.query.recordId : '',
      keyword: ''
    }
  })

  const commonBooleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true'
    }))
  )

  const cargoExcelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'cargoCode', title: '物料编码', required: true },
    { key: 'cargoName', title: '货物名称' },
    {
      key: 'unit',
      title: 'MDM基本单位',
      formatter: (_value, record) => {
        const cargo = record as Cargo
        return cargo.material?.baseUnit?.unitName || cargo.material?.basicUnit || cargo.unit || ''
      }
    },
    { key: 'lengthM', title: '长(m)' },
    { key: 'widthM', title: '宽(m)' },
    { key: 'heightM', title: '高(m)' },
    { key: 'volumeM3', title: '体积(m³)' },
    { key: 'weightKg', title: '重量(kg)' },
    { key: 'valueAmount', title: '价值(元)' },
    { key: 'enabled', title: '状态' },
    { key: 'remark', title: '备注' }
  ]
  const cargoImportColumns = cargoExcelColumns.filter(
    (column) => column.key !== 'cargoName' && column.key !== 'unit'
  )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '状态',
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
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '物料编码、货物名称、规格或备注'
      }
    }
  ])

  const columnsFactory = (): ColumnOption<Cargo>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    {
      prop: 'cargoName',
      label: '物料 / 货物',
      minWidth: 255,
      formatter: (row) => (
        <div class="tms-cargo-page__identity">
          <span aria-hidden="true">
            <ArtSvgIcon icon="ri:archive-drawer-line" />
          </span>
          <div>
            <strong title={row.cargoName}>{row.cargoName}</strong>
            <small title={row.cargoCode || ''}>{row.cargoCode || '旧货物 · 待关联物料'}</small>
          </div>
        </div>
      )
    },
    {
      prop: 'specModel',
      label: '规格型号',
      minWidth: 150,
      showOverflowTooltip: true
    },
    {
      prop: 'unit',
      label: '基本单位',
      width: 110,
      formatter: (row) =>
        row.material?.baseUnit?.unitName || row.material?.basicUnit || row.unit || '-'
    },
    {
      prop: 'materialGroupId',
      label: '物料分组',
      minWidth: 130,
      formatter: (row) =>
        row.materialGroupId
          ? groupNameById.value.get(row.materialGroupId) || '分组不可见'
          : '未分组'
    },
    {
      prop: 'lengthM',
      label: '长(m)',
      width: 95,
      align: 'right',
      formatter: (row) => formatNumber(row.lengthM, 2)
    },
    {
      prop: 'widthM',
      label: '宽(m)',
      width: 95,
      align: 'right',
      formatter: (row) => formatNumber(row.widthM, 2)
    },
    {
      prop: 'heightM',
      label: '高(m)',
      width: 95,
      align: 'right',
      formatter: (row) => formatNumber(row.heightM, 2)
    },
    {
      prop: 'volumeM3',
      label: '体积(m³)',
      width: 110,
      align: 'right',
      formatter: (row) => formatNumber(row.volumeM3, 3)
    },
    {
      prop: 'weightKg',
      label: '重量(kg)',
      width: 110,
      align: 'right',
      formatter: (row) => formatNumber(row.weightKg, 2)
    },
    {
      prop: 'valueAmount',
      label: '价值(元)',
      width: 120,
      align: 'right',
      formatter: (row) => formatNumber(row.valueAmount, 2)
    },
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
      width: 160,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            icon="ri:file-copy-line"
            label="复制货物参数"
            permission="TmsCargo:Add"
            onClick={() => openDialog(row, true)}
          />
          <ArtButtonTable type="edit" permission="TmsCargo:Edit" onClick={() => openDialog(row)} />
          <ArtButtonTable
            type="delete"
            permission="TmsCargo:Delete"
            onClick={() => handleDelete(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { type: 'add', permission: 'TmsCargo:Add', onClick: () => openDialog() },
    {
      type: 'import',
      permission: 'TmsCargo:Import',
      importColumns: cargoImportColumns,
      importRecordTransformer: (rows) => rows.map(normalizeImportRow),
      importApi: async (rows) => {
        const targetTenantId = defaultWriteTenantId.value
        if (!targetTenantId) throw new Error('无法确定导入目标租户，请刷新后重试')
        await importCargoes(rows as Cargo[], targetTenantId)
      },
      onImportSuccess: () => {
        ElMessage.success('导入成功')
      },
      onImportError: (error) => {
        notifyFriendlyError(error, '货物导入失败，请检查文件内容和目标租户')
      }
    },
    {
      type: 'export',
      permission: 'TmsCargo:Export',
      exportFilename: 'TMS货物资料',
      exportSheetName: '货物管理',
      exportColumns: cargoExcelColumns,
      exportApi: ({ selectedIds, searchParams, maxRows }) =>
        exportCargoList({
          ...(searchParams as SearchParams),
          materialGroupIds: selectedGroupIds.value,
          ids: selectedIds.map(String),
          maxRows
        })
    },
    {
      type: 'delete',
      permission: 'TmsCargo:Delete',
      confirm: false,
      onClick: ({ selectedRows }) => handleDeleteRows(selectedRows as Cargo[])
    }
  ])

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchCargoList({ ...params, materialGroupIds: selectedGroupIds.value, from, to })
  }

  const formatNumber = (value?: number | null, digits = 2): string => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
    return Number(value).toFixed(digits)
  }

  const normalizeImportRow = (row: Record<string, unknown>): Cargo =>
    ({
      ...row,
      lengthM: normalizeNullableNumber(row.lengthM),
      widthM: normalizeNullableNumber(row.widthM),
      heightM: normalizeNullableNumber(row.heightM),
      volumeM3: normalizeNullableNumber(row.volumeM3),
      weightKg: normalizeNullableNumber(row.weightKg),
      valueAmount: normalizeNullableNumber(row.valueAmount),
      enabled: normalizeImportedEnabled(row.enabled)
    }) as Cargo

  const openDialog = (row?: Cargo, copy = false): void => {
    void dialogRef.value?.handleOpen({
      row,
      copy,
      groups: groupState.rows,
      initialGroupId: groupState.selectedId || undefined
    })
  }

  const loadGroups = async (): Promise<void> => {
    groupState.loading = true
    groupState.error = ''
    try {
      groupState.rows = await fetchMasterGroups('material', effectiveTenantId.value)
    } catch {
      groupState.error = '物料分组加载失败，请重试'
    } finally {
      groupState.loading = false
    }
  }
  const refreshGroups = (): void => {
    void loadGroups()
  }
  const selectGroup = async (id: string): Promise<void> => {
    groupState.selectedId = id
    await tableQueryRef.value?.getData()
  }
  watch(
    effectiveTenantId,
    async () => {
      groupState.selectedId = ''
      groupState.rows = []
      await loadGroups()
      await nextTick()
      await tableQueryRef.value?.refreshCreate()
    },
    { immediate: true }
  )

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

  const handleDeleteRows = async (rows: Cargo[]): Promise<void> => {
    const resources = rows.map((row) => ({
      id: row.id ? String(row.id) : '',
      label: row.cargoName || row.cargoCode || '未命名货物'
    }))
    const ids = resources.map((item) => item.id)
    await deleteRecords({
      resources,
      permission: 'TmsCargo:Delete',
      inspectReferences: async (snapshot) => {
        if (!deleteGuardRef.value) throw new Error('删除检查尚未就绪，请刷新列表后重试。')
        return deleteGuardRef.value.inspect({
          resourceType: 'cargo',
          resourceLabel: '货物',
          resources: snapshot
        })
      },
      remove: () => (ids.length === 1 ? deleteCargo(ids[0]) : deleteCargoBatch(ids)),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }

  const handleDelete = (row: Cargo): Promise<void> => handleDeleteRows([row])
</script>

<style scoped lang="scss">
  .tms-cargo-page {
    min-width: 0;
    min-height: 0;

    &__workspace {
      display: flex;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }

    &__table {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    &__identity {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: none;
        place-items: center;
        width: 32px;
        height: 32px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: var(--art-surface-radius);
      }

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>
