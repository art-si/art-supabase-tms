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
    <ArtDialog
      ref="detailDialogRef"
      size="lg"
      :show-footer="false"
      @close="captureClosingRouteDetail"
      @closed="clearRouteDetail"
    >
      <ArtSectionTitle>拉黑信息</ArtSectionTitle>
      <ArtDescriptions v-if="detail" :data="detail" :items="detailItems" :columns="2" />
    </ArtDialog>
  </div>
</template>

<script setup lang="tsx">
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
    isPrivateAttachmentPath,
    signPrivateAttachmentPaths
  } from '@/utils/supabase/private-attachment'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useUserStore } from '@/store/modules/user'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { ElMessage } from 'element-plus'
  import {
    fetchDriverBlacklistList,
    fetchDriverBlacklistDetail,
    releaseDriverBlacklist,
    type BlacklistSearch,
    type DriverBlacklistRecord
  } from '@tms/api'
  import BlacklistDialog from './modules/blacklist-dialog.vue'
  import { driverOwnershipLabel, driverTypeLabel } from './modules/driver-label'

  defineOptions({ name: 'TmsDriverBlacklist' })

  const tableRef = ref<ArtTableQueryExpose>()
  const formDialogRef = ref<InstanceType<typeof BlacklistDialog>>()
  const detailDialogRef = ref<ArtDialogExpose<DriverBlacklistRecord>>()
  const detail = ref<DriverBlacklistRecord>()
  const search = ref<BlacklistSearch>({ driverName: '', phone: '', organizationName: '' })
  const route = useRoute()
  const router = useRouter()
  const tenantScope = useTenantScopeStore()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const canView = computed(() => hasAuth('TmsDriverBlacklist:View'))
  const captureDetailOperation = useTenantOperationGuard('TmsDriverBlacklist:View')
  const captureReleaseOperation = useTenantOperationGuard('TmsDriverBlacklist:Release')
  const ownershipOptions = useDictionaryOptions('tmsDriverOwnership')
  const driverTypeOptions = useDictionaryOptions('tmsDriverType')
  const blacklistStatusOptions = useDictionaryOptions('tmsDriverBlacklistStatus')
  const statusLabel = (status?: string | null): string =>
    status === 'legacy'
      ? '历史记录'
      : getDictionaryDisplayLabel(
          blacklistStatusOptions.find((item) => item.value === status),
          status,
          { emptyText: '—' }
        )

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
      key: 'driverOwnership',
      label: '司机归属',
      value: (row) => driverOwnershipLabel(row.driverOwnership, ownershipOptions)
    },
    {
      key: 'driverType',
      label: '司机类型',
      value: (row) => driverTypeLabel(row.driverType, driverTypeOptions)
    },
    { key: 'carrierName', label: '所属承运商', field: 'carrierName' },
    { key: 'companyName', label: '所属公司', field: 'companyName' },
    { key: 'plateNo', label: '车牌号', field: 'plateNo' },
    {
      key: 'blacklistedAt',
      label: '拉黑时间',
      value: (row: DriverBlacklistRecord) => formatWithDayjs(row.blacklistedAt, 'YYYY-MM-DD HH:mm')
    },
    { key: 'reason', label: '拉黑原因', field: 'reason', span: 2 },
    {
      key: 'status',
      label: '状态',
      field: 'status',
      render: (_value, row) =>
        row.status === 'legacy' ? (
          '历史记录'
        ) : (
          <ArtDictDisplay dictCode="tmsDriverBlacklistStatus" value={row.status} display="tag" />
        )
    },
    {
      key: 'releasedAt',
      label: '解除时间',
      value: (row: DriverBlacklistRecord) =>
        row.releasedAt ? formatWithDayjs(row.releasedAt, 'YYYY-MM-DD HH:mm') : '—'
    },
    { key: 'remark', label: '备注', field: 'remark', span: 2 },
    { key: 'createBy', label: '创建人', field: 'createBy' },
    {
      key: 'createTime',
      label: '创建时间',
      value: (row: DriverBlacklistRecord) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    }
  ]

  const columnsFactory = (): ColumnOption<DriverBlacklistRecord>[] => [
    { type: 'globalIndex', label: '序号', width: 68, fixed: 'left' },
    {
      prop: 'portraitUrl',
      label: '照片',
      width: 72,
      formatter: (row) =>
        row.portraitPreviewUrl ? (
          <img
            src={row.portraitPreviewUrl}
            alt={`${row.driverName}的照片`}
            width="36"
            height="36"
            class="h-9 w-9 rounded object-cover"
          />
        ) : (
          <span aria-label="暂无照片">—</span>
        )
    },
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
    {
      prop: 'driverOwnership',
      label: '司机归属',
      minWidth: 120,
      dict: { code: 'tmsDriverOwnership', display: 'text' }
    },
    {
      prop: 'driverType',
      label: '司机类型',
      minWidth: 120,
      dict: { code: 'tmsDriverType', display: 'text' }
    },
    { prop: 'carrierName', label: '所属承运商', minWidth: 170, showOverflowTooltip: true },
    { prop: 'companyName', label: '所属公司', minWidth: 170, showOverflowTooltip: true },
    { prop: 'plateNo', label: '车牌号', minWidth: 135 },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      formatter: (row) =>
        row.status === 'legacy' ? (
          '历史记录'
        ) : (
          <ArtDictDisplay dictCode="tmsDriverBlacklistStatus" value={row.status} display="tag" />
        )
    },
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
      width: 170,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission="TmsDriverBlacklist:View"
            onClick={() => void showDetail(row)}
          />
          {row.status === 'active' && (
            <ArtButtonTable
              type="sign"
              permission="TmsDriverBlacklist:Release"
              label="解除黑名单"
              onClick={() => void releaseRecord(row)}
            />
          )}
        </BusinessTableRowActions>
      )
    }
  ]

  const exportColumns = [
    { key: 'driverName', title: '司机姓名' },
    { key: 'phone', title: '手机号' },
    { key: 'organizationName', title: '所属组织' },
    {
      key: 'driverOwnership',
      title: '司机归属',
      formatter: (value: unknown) =>
        driverOwnershipLabel(typeof value === 'string' ? value : null, ownershipOptions)
    },
    {
      key: 'driverType',
      title: '司机类型',
      formatter: (value: unknown) =>
        driverTypeLabel(typeof value === 'string' ? value : null, driverTypeOptions)
    },
    { key: 'carrierName', title: '所属承运商' },
    { key: 'companyName', title: '所属公司' },
    { key: 'plateNo', title: '车牌号' },
    {
      key: 'status',
      title: '状态',
      formatter: (value: unknown) => statusLabel(typeof value === 'string' ? value : null)
    },
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
      permission: 'TmsDriverBlacklist:Export',
      type: 'export',
      exportFilename: '司机黑名单',
      exportSheetName: '黑名单',
      exportColumns,
      exportApi: async ({ maxRows }) => {
        const userStore = useUserStore()
        await Promise.all(
          ['tmsDriverOwnership', 'tmsDriverType', 'tmsDriverBlacklistStatus'].map((code) =>
            userStore.ensureDictLoaded(code)
          )
        )
        return {
          data:
            (await fetchDriverBlacklistList({ ...search.value, from: 0, to: maxRows - 1 })).data ??
            []
        }
      }
    }
  ])

  const fetchTable = async (params: BlacklistSearch & { current: number; size: number }) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchDriverBlacklistList({ ...params, from, to })
    const paths = result.data
      .map((row) => row.portraitUrl)
      .filter((path): path is string => Boolean(path && isPrivateAttachmentPath(path)))
    if (paths.length) {
      try {
        const previews = await signPrivateAttachmentPaths('tms-driver-private', paths)
        result.data.forEach((row) => {
          row.portraitPreviewUrl = row.portraitUrl ? previews.get(row.portraitUrl) || null : null
        })
      } catch (error) {
        notifyFriendlyError(error, '司机照片加载失败，请稍后重试')
      }
    }
    return result
  }

  const releaseRecord = async (row: DriverBlacklistRecord): Promise<void> => {
    const isCurrentOperation = captureReleaseOperation()
    try {
      await confirmAction(
        `解除 ${row.driverName} 的黑名单后，司机将恢复登记前的启用状态，拉黑记录会继续保留。`,
        '解除黑名单',
        { type: 'warning', confirmButtonText: '确认解除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    if (!isCurrentOperation()) {
      ElMessage.warning('操作权限或租户范围已变化，请刷新页面后重试')
      return
    }
    try {
      await releaseDriverBlacklist(row.id)
      await tableRef.value?.refreshRemove()
    } catch (error) {
      notifyFriendlyError(error, '解除黑名单失败，请刷新列表后重试')
    }
  }

  const showDetail = async (row: DriverBlacklistRecord): Promise<void> => {
    detailDisplaySequence++
    detailScopeKey = currentScopeKey()
    detail.value = row
    await detailDialogRef.value?.handleOpen(row, { title: `黑名单详情 · ${row.driverName}` })
  }

  const isOwnRoute = (): boolean => route.name === 'TmsDriverBlacklist'
  const currentScopeKey = (): string =>
    [tenantScope.effectiveTenantId, tenantScope.revision, userStore.getUserInfo.userId].join(':')
  let detailDisplaySequence = 0
  let detailScopeKey = ''
  let closingRouteId = ''
  let closingSequence = 0
  let lastRequestedKey = ''
  let detailRequestVersion = 0
  const invalidateDetail = (): void => {
    detailRequestVersion++
    detailDisplaySequence++
    detailScopeKey = ''
    closingRouteId = ''
    lastRequestedKey = ''
    detail.value = undefined
    if (unref(detailDialogRef.value?.visible)) void detailDialogRef.value?.handleClose(true)
  }
  const captureClosingRouteDetail = (row?: Record<string, unknown>): void => {
    const rowId = typeof row?.id === 'string' ? row.id : ''
    closingSequence = detailDisplaySequence
    closingRouteId =
      isOwnRoute() &&
      canView.value &&
      detailScopeKey === currentScopeKey() &&
      rowId === route.query.recordId
        ? rowId
        : ''
  }
  const clearRouteDetail = (): void => {
    const closedId = closingRouteId
    closingRouteId = ''
    if (closingSequence !== detailDisplaySequence) return
    detail.value = undefined
    lastRequestedKey = ''
    if (!isOwnRoute() || !closedId || route.query.recordId !== closedId) return
    const query = { ...route.query }
    delete query.recordId
    delete query.driverId
    void router.replace({ name: 'TmsDriverBlacklist', query })
  }
  const openRouteDetail = async (): Promise<void> => {
    if (!isOwnRoute() || !canView.value) return
    const id = route.query.recordId
    if (id === undefined) return
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      ElMessage.warning('黑名单记录链接无效，请返回列表重新打开')
      return
    }
    const requestKey = `${route.fullPath}:${currentScopeKey()}`
    if (requestKey === lastRequestedKey) return
    lastRequestedKey = requestKey
    const version = ++detailRequestVersion
    const isCurrentOperation = captureDetailOperation()
    const isCurrent = () =>
      version === detailRequestVersion &&
      isCurrentOperation() &&
      isOwnRoute() &&
      route.query.recordId === id
    let opened = false
    try {
      const result = await fetchDriverBlacklistDetail(id)
      if (!isCurrent()) return
      if (result.error) throw result.error
      const row = result.data
      if (
        !row ||
        row.id !== id ||
        (tenantScope.effectiveTenantId !== null &&
          row.tenantId !== tenantScope.effectiveTenantId) ||
        (typeof route.query.driverId === 'string' && row.driverId !== route.query.driverId)
      ) {
        ElMessage.warning('黑名单记录不存在或当前账号无权查看，请返回列表核对')
        return
      }
      await nextTick()
      if (!isCurrent()) return
      await showDetail(row)
      opened = true
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '黑名单记录打开失败，请返回列表重试')
    } finally {
      if (!opened && lastRequestedKey === requestKey) lastRequestedKey = ''
    }
  }
  watch(
    () => [
      route.fullPath,
      tenantScope.effectiveTenantId,
      tenantScope.revision,
      userStore.getUserInfo.userId,
      canView.value
    ],
    () => {
      invalidateDetail()
      if (isOwnRoute() && canView.value) void openRouteDetail()
    },
    { immediate: true, flush: 'sync' }
  )
  onActivated(() => {
    if (isOwnRoute()) void openRouteDetail()
  })
  onDeactivated(invalidateDetail)
</script>
