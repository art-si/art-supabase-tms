<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="DRIVER RISK REGISTER"
      title="黑名单"
      description="集中记录需要重点核查的司机及拉黑原因，支持按姓名、手机号与所属组织组合检索。"
      icon="ri:forbid-2-line"
      :tags="[{ label: '司机风险记录', type: 'warning' }]"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableRef"
      v-model="search"
      :search-items="searchItems"
      :api-fn="fetchTable"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 86, showExpand: false }"
      :table-props="{
        rowKey: 'id',
        emptyText: '暂无黑名单记录',
        emptyDescription: '新增司机拉黑记录后，可在此查看原因和登记时间。'
      }"
      focusable
    />

    <BlacklistDialog ref="formDialogRef" @success="() => tableRef?.refreshCreate()" />
    <ArtDialog ref="detailDialogRef" size="lg" :show-footer="false">
      <ArtSectionTitle>拉黑信息</ArtSectionTitle>
      <ArtDescriptions v-if="detail" :data="detail" :items="detailItems" :columns="2" />
    </ArtDialog>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'

  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import {
    deleteTmsBasicRecords,
    fetchDriverBlacklistList,
    type BlacklistSearch,
    type DriverBlacklistRecord
  } from '@tms/api'
  import BlacklistDialog from './modules/blacklist-dialog.vue'

  defineOptions({ name: 'TmsDriverBlacklist' })

  const tableRef = ref<ArtTableQueryExpose>()
  const { deleteGuardRef, deleteRecords } = useRecordDeleteGuard(
    'tms_driver_blacklist',
    '司机黑名单'
  )
  const formDialogRef = ref<InstanceType<typeof BlacklistDialog>>()
  const detailDialogRef = ref<ArtDialogExpose<DriverBlacklistRecord>>()
  const detail = ref<DriverBlacklistRecord>()
  const search = ref<BlacklistSearch>({ driverName: '', phone: '', organizationName: '' })

  const searchItems: SearchFormItem[] = [
    {
      label: '司机姓名',
      key: 'driverName',
      type: 'input',
      props: { clearable: true, placeholder: '请输入司机姓名' }
    },
    {
      label: '手机号',
      key: 'phone',
      type: 'input',
      props: { clearable: true, placeholder: '请输入手机号' }
    },
    {
      label: '所属组织',
      key: 'organizationName',
      type: 'input',
      props: { clearable: true, placeholder: '请输入公司或组织名称' }
    }
  ]

  const detailItems: ArtDescriptionItem<DriverBlacklistRecord>[] = [
    { key: 'driverName', label: '司机姓名', field: 'driverName' },
    { key: 'phone', label: '手机号', field: 'phone', copyable: true },
    { key: 'organizationName', label: '所属组织', field: 'organizationName' },
    {
      key: 'blacklistedAt',
      label: '拉黑时间',
      value: (row: DriverBlacklistRecord) => formatWithDayjs(row.blacklistedAt, 'YYYY-MM-DD HH:mm')
    },
    { key: 'reason', label: '拉黑原因', field: 'reason', span: 2 },
    { key: 'remark', label: '备注', field: 'remark', span: 2 },
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (row: DriverBlacklistRecord) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    }
  ]

  const columnsFactory = (): ColumnOption<DriverBlacklistRecord>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    {
      prop: 'driverName',
      label: '司机姓名',
      minWidth: 145,
      fixed: 'left',
      formatter: (row) => (
        <div class="flex min-w-0 items-center gap-2">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--el-color-warning-light-9)] text-[var(--el-color-warning)]">
            {row.driverName.slice(0, 1)}
          </span>
          <strong class="truncate" title={row.driverName}>
            {row.driverName}
          </strong>
        </div>
      )
    },
    { prop: 'phone', label: '手机号', width: 145 },
    { prop: 'organizationName', label: '所属组织', minWidth: 210, showOverflowTooltip: true },
    {
      prop: 'blacklistedAt',
      label: '拉黑时间',
      width: 166,
      formatter: (row) => formatWithDayjs(row.blacklistedAt, 'YYYY-MM-DD HH:mm')
    },
    { prop: 'reason', label: '拉黑原因', minWidth: 250, showOverflowTooltip: true },
    { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
    { prop: 'createBy', label: '创建人', width: 130, showOverflowTooltip: true },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 166,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    },
    {
      prop: 'operation',
      label: '操作',
      width: 92,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="TmsDriverBlacklist:View"
            onClick={() => void showDetail(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  const exportColumns = [
    { key: 'driverName', title: '司机姓名' },
    { key: 'phone', title: '手机号' },
    { key: 'organizationName', title: '所属组织' },
    { key: 'blacklistedAt', title: '拉黑时间' },
    { key: 'reason', title: '拉黑原因' },
    { key: 'remark', title: '备注' },
    { key: 'createBy', title: '创建人' },
    { key: 'createTime', title: '创建时间' }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsDriverBlacklist:Add',
      type: 'add',
      label: '新增黑名单',
      onClick: () => void formDialogRef.value?.handleOpen()
    },
    {
      permission: 'TmsDriverBlacklist:Delete',
      type: 'delete',
      confirm: false,
      onClick: async ({ selectedRows, api }) => {
        const resources = (selectedRows as DriverBlacklistRecord[]).map((row) => ({
          id: row.id,
          label: row.driverName || '司机黑名单'
        }))
        await deleteRecords({
          resources,
          permission: 'TmsDriverBlacklist:Delete',
          remove: () =>
            deleteTmsBasicRecords(
              'tms_driver_blacklist',
              resources.map((resource) => resource.id)
            ),
          onDeleted: async () => {
            await api.refreshRemove()
          }
        })
      }
    },
    {
      permission: 'TmsDriverBlacklist:Export',
      type: 'export',
      exportFilename: '司机黑名单',
      exportSheetName: '黑名单',
      exportColumns,
      exportApi: async ({ maxRows }) => ({
        data:
          (await fetchDriverBlacklistList({ ...search.value, from: 0, to: maxRows - 1 })).data ?? []
      })
    }
  ])

  const fetchTable = (params: BlacklistSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchDriverBlacklistList({ ...params, from, to })
  }

  const showDetail = async (row: DriverBlacklistRecord): Promise<void> => {
    detail.value = row
    await detailDialogRef.value?.handleOpen(row, { title: `黑名单详情 · ${row.driverName}` })
  }
</script>
