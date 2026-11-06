<template>
  <div class="tms-customer-page business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="客户主数据"
      title="客户资料"
      description="统一维护客户主体、行业等级、结算联系人与业务状态，为开单和对账提供可信主数据。"
      icon="ri:user-star-line"
      density="compact"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <div class="tms-customer-page__workspace">
      <ArtWorkspaceSplitter
        primary-size="300px"
        primary-min="250px"
        primary-max="360px"
        :breakpoint="900"
        stacked-primary-size="auto"
      >
        <template #primary>
          <MasterGroupPanel
            title="客户分组"
            :groups="groupState.rows"
            :selected-id="groupState.selectedId"
            :loading="groupState.loading"
            :error="groupState.error"
            @select="selectGroup"
            @refresh="refreshGroups"
          />
        </template>

        <div class="tms-customer-page__table">
          <ArtTableQuery
            ref="tableQueryRef"
            v-model="tableState.searchQuery"
            :search-items="searchItems"
            :api-fn="fetchTableData"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            :selection-actions="selectionActions"
            :immediate="false"
            header-actions-placement="workspace"
            :search-bar-props="{ span: 6, labelWidth: 86, showExpand: true }"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: '暂无客户资料',
              emptyDescription: '可新增客户，或调整分组、等级、行业、状态和关键字后重新查询。'
            }"
            focusable
            focus-scope-selector=".tms-customer-page__workspace"
          />
        </div>
      </ArtWorkspaceSplitter>
    </div>

    <CustomerDialog ref="dialogRef" @success="handleSaveSuccess" />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { ElMessage, ElTag } from 'element-plus'
  import { sumBy } from 'lodash-es'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteDependencyMeta
  } from '@/components/business/master-data-delete-guard/index.vue'
  import { formatReferenceStatus } from '@/components/business/master-data-delete-guard/record-meta'
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
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { mapExcelRowsToRecords } from '@/utils/file'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { canViewField, type FieldAccessLevel } from '@/utils/field-permission'
  import TreeUtils from '@/utils/tree'
  import { fetchMasterGroups, type MasterGroup } from '@/api/master-groups'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { financeRouteNames } from '@/router/business-paths'
  import {
    cleanupCustomerDeleteSafeDependencies,
    deleteCustomer,
    deleteCustomerBatch,
    exportCustomerList,
    fetchCustomerDeleteDependencyDetails,
    fetchCustomerDeleteSafeCleanupCandidates,
    fetchCustomerList,
    importCustomers
  } from '@tms/api'
  import type {
    CustomerDeleteDependencyCode,
    CustomerDeleteDependencyDetail,
    CustomerDeleteSafeCleanupCandidate,
    CustomerDeleteSafeCleanupCode
  } from '@tms/api'
  import CustomerDialog from './modules/customer-dialog.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterGroupPanel from '@/components/business/master-group-panel/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import type { CustomerDialogOpenData } from './modules/customer-dialog.vue'

  defineOptions({ name: 'TmsCustomer' })

  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()

  type Customer = Api.Tms.BasicData.Customer
  type SearchParams = Api.Tms.BasicData.CustomerSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface CustomerDialogExpose {
    handleOpen: (data: CustomerDialogOpenData) => Promise<void>
  }

  interface CustomerDeleteDependencyMeta {
    action: string
    actionLabel: string
    label: string
    order: number
    routeName: string
    unit: string
  }

  interface CustomerTableState {
    importing: boolean
    searchQuery: SearchParams
  }

  const router = useRouter()
  const route = useRoute()
  const { getDictMap } = storeToRefs(useUserStore())
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<CustomerDialogExpose>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const customerFieldAccess = ref<Api.Tms.BasicData.CustomerFieldAccessMap>({})
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
      .map((group) => String(group.id))
    return descendants.length ? descendants : [groupState.selectedId]
  })
  const groupNameById = computed(
    () => new Map(groupState.rows.map((group) => [group.id, group.name]))
  )

  const fieldAccessRank: Record<FieldAccessLevel, number> = {
    hidden: 0,
    masked: 1,
    read: 2,
    edit: 3
  }

  const mergeCustomerFieldAccess = (
    baseAccess: Api.Tms.BasicData.CustomerFieldAccessMap,
    records: Customer[]
  ): Api.Tms.BasicData.CustomerFieldAccessMap => {
    const result = { ...baseAccess }
    records.forEach((record) => {
      Object.entries(record.fieldAccess ?? {}).forEach(([field, access]) => {
        const key = field as Api.Tms.BasicData.CustomerFieldKey
        const current = result[key] ?? 'hidden'
        if (fieldAccessRank[access] > fieldAccessRank[current]) result[key] = access
      })
    })
    return result
  }

  const customerDeleteDependencyMeta: Record<
    CustomerDeleteDependencyCode,
    CustomerDeleteDependencyMeta
  > = {
    cash_allocation: {
      label: '收款核销分配',
      unit: '条',
      action: '请到“收付款管理”查看并撤销核销；历史核销记录本身不支持直接物理删除。',
      actionLabel: '去处理核销',
      routeName: financeRouteNames.cashTransaction,
      order: 1
    },
    cash_transaction: {
      label: '收付款流水',
      unit: '笔',
      action: '收付款流水属于财务历史，可作废但不直接物理删除；如需保留历史，建议停用客户。',
      actionLabel: '去查看流水',
      routeName: financeRouteNames.cashTransaction,
      order: 2
    },
    customer_statement: {
      label: '客户对账单',
      unit: '张',
      action: '无核销关系的草稿可一键清理；审核后或已作废记录应保留，并改为停用客户。',
      actionLabel: '去处理对账单',
      routeName: financeRouteNames.customerSettlement,
      order: 3
    },
    customer_statement_item: {
      label: '客户对账明细',
      unit: '条',
      action: '明细随对应草稿对账单一并删除，无需单独处理。',
      actionLabel: '去对应对账单',
      routeName: financeRouteNames.customerSettlement,
      order: 4
    },
    invoice: {
      label: '客户发票',
      unit: '张',
      action: '草稿发票可一键清理；已复核、已开具或已作废发票属于财务历史，应保留。',
      actionLabel: '去处理发票',
      routeName: financeRouteNames.invoiceManagement,
      order: 5
    },
    contract: {
      label: '运输合同',
      unit: '份',
      action: '合同属于经营与审批历史，应先终止或保留合同，并改为停用客户。',
      actionLabel: '去处理合同',
      routeName: 'TmsContract',
      order: 6
    },
    customer_price: {
      label: '客户价格方案',
      unit: '条',
      action: '报价配置可一键清理，也可以到“客户报价”逐条确认后删除。',
      actionLabel: '去删除报价',
      routeName: 'TmsCustomerPrice',
      order: 7
    },
    electronic_contract: {
      label: '电子合同',
      unit: '份',
      action: '电子合同属于签署历史，请保留记录并停用客户。',
      actionLabel: '查看电子合同',
      routeName: 'TmsElectronicContract',
      order: 8
    },
    transport_agreement: {
      label: '运输协议',
      unit: '份',
      action: '运输协议属于履约历史，请保留记录并停用客户。',
      actionLabel: '查看运输协议',
      routeName: 'TmsTransportAgreement',
      order: 9
    },
    order_invoice_account: {
      label: '已使用开票账户的运单',
      unit: '张',
      action: '开票账户已被运单引用，请保留业务记录并停用客户。',
      actionLabel: '查看关联运单',
      routeName: 'TmsOrderQueryDetail',
      order: 10
    }
  }

  const tableState = reactive<CustomerTableState>({
    importing: false,
    searchQuery: {
      customerLevel: '',
      industry: '',
      enabled: undefined,
      createTimeRange: [],
      customerId: typeof route.query.customerId === 'string' ? route.query.customerId : '',
      keyword: ''
    }
  })

  const customerLevelOptions = computed(() => getDictMap.value.tmsCustomerLevel ?? [])
  const customerIndustryOptions = computed(() => getDictMap.value.tmsCustomerIndustry ?? [])
  const commonBooleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true'
    }))
  )

  const customerExcelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'customerCode', title: '客户编号' },
    { key: 'customerName', title: '客户名称', required: true },
    { key: 'industry', title: '所属行业' },
    { key: 'customerLevel', title: '客户级别' },
    { key: 'region', title: '区域' },
    { key: 'addressDetail', title: '公司地址' },
    { key: 'postalCode', title: '邮编' },
    { key: 'remark', title: '备注' }
  ]

  const visibleCustomerExcelColumns = computed(() =>
    customerExcelColumns.filter((column) => {
      if (column.key === 'addressDetail') {
        return canViewField(customerFieldAccess.value, 'addressDetail')
      }
      return true
    })
  )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '客户级别',
      key: 'customerLevel',
      type: 'select',
      props: { options: customerLevelOptions.value, clearable: true }
    },
    {
      label: '所属行业',
      key: 'industry',
      type: 'select',
      props: { options: customerIndustryOptions.value, clearable: true }
    },
    {
      label: '客户状态',
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
        rangeSeparator: '至',
        class: '!w-full'
      }
    },
    {
      label: '关键词',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '客户名称、编号、联系人或电话' }
    }
  ])

  const columnsFactory = (): ColumnOption<Customer>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 72 },
    {
      prop: 'createTime',
      label: '创建时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.createTime, 'YYYY-MM-DD HH:mm')
    },
    { prop: 'customerCode', label: '客户编号', width: 140 },
    {
      prop: 'customerName',
      label: '客户名称',
      minWidth: 190,
      showOverflowTooltip: true,
      link: {
        permission: 'TmsCustomer:View',
        onClick: (row) => openDialog(row, !hasAuth('TmsCustomer:Edit'))
      }
    },
    {
      prop: 'groupId',
      label: '客户分组',
      minWidth: 140,
      formatter: (row) =>
        row.groupId ? groupNameById.value.get(row.groupId) || '分组不可见' : '未分组'
    },
    {
      prop: 'industry',
      label: '所属行业',
      width: 130,
      dict: { code: 'tmsCustomerIndustry', display: 'text' }
    },
    {
      prop: 'customerLevel',
      label: '客户级别',
      width: 120,
      formatter: (row) =>
        row.customerLevel ? (
          <ArtDictDisplay dictCode="tmsCustomerLevel" value={row.customerLevel} display="tag" />
        ) : (
          <span class="text-g-400">—</span>
        )
    },
    {
      prop: 'tags',
      label: '客户标签',
      minWidth: 200,
      formatter: (row) => (
        <div class="flex flex-wrap gap-1">
          {(row.tags?.length ? row.tags : ['']).map((tag) => (
            <ArtDictDisplay
              key={tag || 'empty'}
              dictCode="tmsCustomerTag"
              value={tag}
              display={tag ? 'tag' : 'text'}
            />
          ))}
        </div>
      )
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 96,
      formatter: (row) => (
        <ElTag type={row.enabled ? 'success' : 'info'} effect="light" size="small">
          {row.enabled ? '启用' : '停用'}
        </ElTag>
      )
    },
    { prop: 'contactName', label: '联系人', width: 110 },
    ...(canViewField(customerFieldAccess.value, 'contactPhone')
      ? [
          {
            prop: 'contactPhone',
            label: '手机号码',
            width: 140,
            formatter: (row: Customer) => row.contactPhone || '—'
          } satisfies ColumnOption<Customer>
        ]
      : []),
    {
      prop: 'operation',
      label: '操作',
      width: 160,
      fixed: 'right',
      formatter: (row) => (
        <div class="flex">
          <ArtButtonTable
            type="view"
            permission="TmsCustomer:View"
            icon="ri:map-pin-line"
            onClick={() => openAddressManage(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="TmsCustomer:Edit"
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
    {
      permission: 'TmsCustomer:Add',
      type: 'add',
      label: '新增客户',
      buttonProps: { type: 'primary', plain: false },
      onClick: () => openDialog()
    },
    {
      permission: 'TmsCustomer:Import',
      type: 'import',
      label: '导入',
      buttonProps: { plain: true, loading: tableState.importing },
      onImportSuccess: handleCustomerImportSuccess,
      onImportError: () => handleCustomerImportError()
    }
  ])

  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'TmsCustomer:Export',
      type: 'export',
      label: '导出选中',
      buttonProps: { type: 'primary', plain: true },
      selectionRequired: true,
      exportFilename: 'TMS客户资料',
      exportSheetName: '客户管理',
      exportColumns: visibleCustomerExcelColumns.value,
      exportApi: ({ selectedIds, searchParams, maxRows }) =>
        exportCustomerList({
          ...(searchParams as SearchParams),
          groupIds: selectedGroupIds.value,
          ids: selectedIds.map(String),
          maxRows
        })
    },
    {
      permission: 'TmsCustomer:Delete',
      type: 'delete',
      label: '批量删除',
      content: ({ selectedCount }: { selectedCount: number }) =>
        `确定删除选中的 ${selectedCount} 个客户吗？客户地址会一并删除，历史订单会解除客户关联；存在财务或价格资料时将无法删除。`,
      onClick: async ({ selectedRows }) => {
        const customers = selectedRows as Customer[]
        await executeCustomerDelete(customers)
      }
    }
  ])

  const handleCustomerImportSuccess = async (
    rows: Array<Record<string, unknown>>
  ): Promise<void> => {
    const customers = mapExcelRowsToRecords(rows, customerExcelColumns) as Customer[]
    if (!customers.length) {
      ElMessage.warning('未读取到可导入的客户资料，请检查客户名称等必填列')
      return
    }

    tableState.importing = true
    try {
      await importCustomers(customers)
      await tableQueryRef.value?.refreshCreate()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '客户导入失败，请检查数据后重试'))
    } finally {
      tableState.importing = false
    }
  }

  const handleCustomerImportError = (): void => {
    ElMessage.error('导入文件解析失败，请确认文件为有效的 Excel 格式')
  }

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchCustomerList({
      ...params,
      groupIds: selectedGroupIds.value,
      from,
      to
    })
    customerFieldAccess.value = mergeCustomerFieldAccess(result.fieldAccess, result.data ?? [])
    return result
  }

  const openDialog = (row?: Customer, readonly = false): void => {
    void dialogRef.value?.handleOpen({
      row,
      readonly,
      groups: groupState.rows,
      initialGroupId: row ? undefined : groupState.selectedId || undefined
    })
  }

  let groupLoadVersion = 0

  const loadGroups = async (): Promise<void> => {
    const version = ++groupLoadVersion
    groupState.loading = true
    groupState.error = ''
    try {
      const rows = await fetchMasterGroups('customer', effectiveTenantId.value)
      if (version !== groupLoadVersion) return
      groupState.rows = rows
      if (groupState.selectedId && !rows.some((group) => group.id === groupState.selectedId)) {
        groupState.selectedId = ''
      }
    } catch (error) {
      if (version !== groupLoadVersion) return
      groupState.error = getFriendlySupabaseErrorMessage(error, '客户分组加载失败，请重试')
    } finally {
      if (version === groupLoadVersion) groupState.loading = false
    }
  }

  const refreshGroups = async (): Promise<void> => {
    await loadGroups()
    await tableQueryRef.value?.refreshCreate()
  }

  const selectGroup = (id: string): void => {
    if (groupState.selectedId === id) return
    groupState.selectedId = id
    void tableQueryRef.value?.refreshCreate()
  }

  const openAddressManage = (row: Customer): void => {
    if (!row.id) return
    void router.push({
      name: 'TmsCustomerAddress',
      query: {
        customerId: row.id,
        customerName: row.customerName
      }
    })
  }

  const getMoreActions = (): ButtonMoreItem[] => [
    {
      auth: 'TmsCustomer:Delete',
      key: 'delete',
      label: '删除客户',
      icon: 'ri:delete-bin-5-line',
      color: 'var(--el-color-danger)'
    }
  ]

  const handleMoreAction = (item: ButtonMoreItem, row: Customer): void => {
    if (item.key === 'delete') void handleDelete(row)
  }

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleDelete = async (row: Customer): Promise<void> => {
    if (!row.id) return
    try {
      if (await showCustomerDeleteBlockersIfNeeded([row])) return
      await confirmAction(
        `确定删除客户“${row.customerName}”吗？客户地址会一并删除，历史订单会解除客户关联。若需保留业务历史，建议改为停用客户。`,
        '删除确认',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      await executeCustomerDelete([row], false)
    } catch (error) {
      if (!isFeedbackCancel(error)) await handleCustomerDeleteError(error, [row])
    }
  }

  const dependencyStatusLabelMap: Record<string, string> = {
    active: '当前生效',
    reversed: '已撤销',
    inactive: '已失效',
    pending_allocation: '待核销',
    partially_allocated: '部分核销',
    fully_allocated: '已核销',
    draft: '草稿',
    pending: '待审核',
    approved: '已审核',
    rejected: '已驳回',
    terminated: '已终止',
    pending_review: '待审核',
    confirmed: '已确认',
    issued: '已开具',
    certified: '已认证',
    voided: '已作废',
    pending_signed: '待签署',
    signed: '已签署',
    revision_requested: '待修订',
    created: '已开单',
    in_transit: '运输中',
    completed: '已完成',
    cancelled: '已取消'
  }

  const formatDependencyStatus = (status?: string | null): string => {
    if (!status) return ''
    return Object.hasOwn(dependencyStatusLabelMap, status)
      ? dependencyStatusLabelMap[status]!
      : formatReferenceStatus(status)
  }

  const safeCleanupLabelMap: Record<CustomerDeleteSafeCleanupCode, string> = {
    customer_price: '客户报价',
    customer_statement: '草稿对账单',
    invoice: '草稿发票'
  }

  const getSafeCleanupCandidateKey = (
    dependencyCode: CustomerDeleteDependencyCode,
    recordId: string
  ): string => `${dependencyCode}:${recordId}`

  const isSafeCleanupRecord = (
    record: CustomerDeleteDependencyDetail,
    candidateKeys: Set<string>
  ): boolean => {
    if (record.dependencyCode === 'customer_statement_item') {
      return candidateKeys.has(getSafeCleanupCandidateKey('customer_statement', record.targetId))
    }
    return candidateKeys.has(getSafeCleanupCandidateKey(record.dependencyCode, record.recordId))
  }

  const formatSafeCleanupSummary = (candidates: CustomerDeleteSafeCleanupCandidate[]): string => {
    const counts = candidates.reduce<Partial<Record<CustomerDeleteSafeCleanupCode, number>>>(
      (summary, candidate) => {
        summary[candidate.dependencyCode] = (summary[candidate.dependencyCode] ?? 0) + 1
        return summary
      },
      {}
    )
    return (Object.entries(counts) as Array<[CustomerDeleteSafeCleanupCode, number]>)
      .map(([code, count]) => `${safeCleanupLabelMap[code]} ${count} 项`)
      .join('、')
  }

  const showCustomerDeleteBlockersIfNeeded = async (customers: Customer[]): Promise<boolean> => {
    if (!deleteGuardRef.value) {
      ElMessage.error('关联校验尚未就绪，请刷新页面后重试删除')
      return true
    }
    const customerIds = customers.map((item) => String(item.id)).filter(Boolean)
    let cleanupCandidates: CustomerDeleteSafeCleanupCandidate[] = []
    const dependencyMeta: Record<string, MasterDataDeleteDependencyMeta> = Object.fromEntries(
      Object.entries(customerDeleteDependencyMeta).map(([code, meta]) => [
        code,
        {
          ...meta,
          description: meta.action,
          ...(code === 'order_invoice_account'
            ? {
                canNavigate: () => hasAuth('TmsOrderQuery:View'),
                routeParams: (record: { targetId: string }) => ({ id: record.targetId })
              }
            : code === 'electronic_contract'
              ? {
                  canNavigate: () => hasAuth('TmsElectronicContract:View')
                }
              : code === 'transport_agreement'
                ? {
                    canNavigate: () => hasAuth('TmsTransportAgreement:View')
                  }
                : {}),
          routeQuery: (record: { resourceId: string }) => ({
            fromCustomerDelete: '1',
            customerName:
              customers.find((item) => String(item.id) === record.resourceId)?.customerName ?? ''
          })
        }
      ])
    )
    return deleteGuardRef.value.inspect({
      resourceLabel: '客户',
      resources: customers.map((item) => ({ id: String(item.id), label: item.customerName })),
      navigationResource: { type: 'customer', queryKey: 'customerId' },
      dependencyMeta,
      fetchDependencies: async (ids) => {
        const [details, candidates] = await Promise.all([
          fetchCustomerDeleteDependencyDetails(ids),
          fetchCustomerDeleteSafeCleanupCandidates(ids)
        ])
        cleanupCandidates = candidates
        const candidateKeys = new Set(
          candidates.map((item) => getSafeCleanupCandidateKey(item.dependencyCode, item.recordId))
        )
        return details.map((record) => ({
          ...record,
          resourceId: record.customerId,
          recordStatus: formatDependencyStatus(record.recordStatus),
          cleanupAllowed: isSafeCleanupRecord(record, candidateKeys)
        }))
      },
      cleanup: {
        selectionMode: 'all',
        actionLabel: '一键清理可删除项',
        count: () => cleanupCandidates.length,
        confirmMessage: () =>
          '将永久删除 ' +
          formatSafeCleanupSummary(cleanupCandidates) +
          '。该操作不会删除收付款流水、核销记录及已生效票据，是否继续？',
        run: async () =>
          sumBy(await cleanupCustomerDeleteSafeDependencies(customerIds), 'deletedCount')
      }
    })
  }

  const isFeedbackCancel = (error: unknown): boolean => error === 'cancel' || error === 'close'

  const isForeignKeyViolation = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false
    const record = error as { code?: unknown; message?: unknown }
    if (record.code === '23503') return true
    const message = typeof record.message === 'string' ? record.message : ''
    return /23503|foreign key|violates foreign key constraint/i.test(message)
  }

  const handleCustomerDeleteError = async (
    error: unknown,
    customers: Customer[]
  ): Promise<void> => {
    if (isForeignKeyViolation(error)) {
      try {
        if (await showCustomerDeleteBlockersIfNeeded(customers)) return
      } catch {
        ElMessage.error('客户仍被业务资料引用，但暂时无法获取引用明细，请刷新后重试')
        return
      }
    }
    ElMessage.error(getFriendlySupabaseErrorMessage(error, '客户删除失败，请稍后重试'))
  }

  const executeCustomerDelete = async (
    customers: Customer[],
    checkDependencies = true
  ): Promise<void> => {
    const customerIds = customers.map((item) => String(item.id)).filter(Boolean)
    if (!customerIds.length) return
    try {
      if (checkDependencies && (await showCustomerDeleteBlockersIfNeeded(customers))) return
      if (customerIds.length === 1) await deleteCustomer(customerIds[0])
      else await deleteCustomerBatch(customerIds)
      ElMessage.success(
        customerIds.length === 1 ? '客户已删除' : `已删除 ${customerIds.length} 个客户`
      )
      await tableQueryRef.value?.refreshRemove()
    } catch (error) {
      await handleCustomerDeleteError(error, customers)
    }
  }

  const syncCustomerDeleteReturn = async (forceRefresh = false): Promise<void> => {
    const customerId = typeof route.query.customerId === 'string' ? route.query.customerId : ''
    const changed = tableState.searchQuery.customerId !== customerId
    if (!customerId && !changed) return
    if (customerId) groupState.selectedId = ''
    tableState.searchQuery.customerId = customerId
    if (customerId) tableState.searchQuery.keyword = ''
    if (changed || forceRefresh) {
      await nextTick()
      await tableQueryRef.value?.getData()
    }
    if (route.query.resumeCustomerDelete !== '1') return
    const customerName =
      typeof route.query.customerName === 'string' ? route.query.customerName : ''
    ElMessage.info(
      customerName
        ? `已返回并定位客户“${customerName}”，处理完全部前置资料后可重新删除`
        : '已返回客户管理，请重新检查并删除客户'
    )
    const query = { ...route.query }
    delete query.resumeCustomerDelete
    await router.replace({ name: 'TmsCustomer', query })
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

  watch(
    () => route.fullPath,
    () => void syncCustomerDeleteReturn(),
    { flush: 'post' }
  )

  onActivated(() => void syncCustomerDeleteReturn(true))
</script>

<style scoped lang="scss">
  .tms-customer-page {
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
      gap: 8px;
      min-width: 0;
      min-height: 0;
    }
  }
</style>
