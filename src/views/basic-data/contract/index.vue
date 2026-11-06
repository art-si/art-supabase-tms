<template>
  <div class="tms-contract business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      v-if="deleteContext.active"
      :customer-id="deleteContext.customerId"
      :customer-name="deleteContext.customerName"
      action-hint="请核对关联合同；请先按业务规则终止或保留合同。"
    />
    <BusinessWorkspaceHeader
      v-if="!embedded"
      eyebrow="CONTRACT GOVERNANCE"
      title="运输合同"
      description="集中管理客户/货主与承运商合同、计费方式、生效周期及审核状态，确保运输合作有据可循。"
      icon="ri:file-shield-2-line"
      :tags="[
        { label: '合同治理', type: 'primary' },
        { label: '周期可追踪', type: 'warning' }
      ]"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      :key="`${tablePermissionKey}:${viewMode}`"
      ref="tableQueryRef"
      v-model="table.searchQuery"
      :search-items="searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      :header-actions-placement="embedded ? 'table' : 'workspace'"
      :search-bar-props="{ span: 6, labelWidth: 112, showExpand: true }"
      :table-props="{
        rowKey: viewMode === 'detail' ? 'detailRowKey' : 'id',
        emptyText: viewMode === 'detail' ? '暂无合同明细' : '暂无运输合同',
        emptyDescription:
          viewMode === 'detail'
            ? '当前条件下没有可展示的货物明细，请切回按单据查看合同。'
            : '可新增合同，或调整状态、承运商、计费方式和关键字后重新查询。'
      }"
      :focusable="!embedded"
    >
      <template #header-left>
        <div class="flex items-center gap-2" aria-label="合同查询方式">
          <ElSegmented v-model="viewMode" :options="viewModeOptions" size="small" />
        </div>
      </template>
    </ArtTableQuery>

    <ContractDialog ref="dialogRef" @success="handleSaveSuccess" />
    <ContractTerminateDialog ref="terminateDialogRef" @success="tableQueryRef?.refreshUpdate()" />
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { ElMessage, ElMessageBox, ElSegmented, ElTag } from 'element-plus'
  import { RouterLink } from 'vue-router'
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
  import { formatNameCodeOption } from '@/utils/form'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { canViewField, formatSensitiveNumber } from '@/utils/field-permission'
  import { useUserStore } from '@/store/modules/user'
  import {
    deleteContract,
    deleteContractBatch,
    copyContract,
    exportContractDetailRows,
    exportContractList,
    fetchCarrierOptions,
    fetchContractList,
    fetchContractDetailRows,
    fetchCustomerOptions,
    importContracts,
    type ContractDetailListRow
  } from '@tms/api'
  import ContractDialog from './modules/contract-dialog.vue'
  import ContractTerminateDialog from './modules/contract-terminate-dialog.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { useMasterDataDeleteProcessingContext } from '@/hooks/core/useMasterDataDeleteProcessing'
  import { usesCarrierParty } from './modules/contract-business-type'
  import { contractLifecycleMeta, getContractLifecycleStatus } from './modules/contract-lifecycle'

  defineOptions({ name: 'TmsContract' })

  const {
    customerId,
    customerTenantId,
    embedded = false
  } = defineProps<{
    customerId?: string
    customerTenantId?: string
    customer?: { id?: string }
    embedded?: boolean
  }>()

  const { deleteGuardRef, deleteRecord, deleteRecords } = useRecordDeleteGuard(
    'tms_contract',
    '运输合同'
  )

  type Contract = Api.Tms.BasicData.Contract
  type ContractLifecycleStatus = Api.Tms.BasicData.ContractLifecycleStatus
  type ContractBusinessType = Api.Tms.BasicData.ContractBusinessType
  type ContractFieldKey = Api.Tms.BasicData.ContractFieldKey
  type ContractFieldAccessMap = Api.Tms.BasicData.ContractFieldAccessMap
  type SearchParams = Api.Tms.BasicData.ContractSearchParams
  type CarrierOption = Api.Tms.BasicData.CarrierOption
  type CustomerOption = Api.Tms.BasicData.CustomerOption
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface ContractDialogExpose {
    handleOpen: (
      row?: Contract,
      options?: { customerId?: string; customerTenantId?: string }
    ) => Promise<void>
  }

  interface TableGroup {
    searchQuery: SearchParams
  }

  const router = useRouter()
  const route = useRoute()
  const deleteContext = useMasterDataDeleteProcessingContext()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<ContractDialogExpose>()
  const terminateDialogRef = ref<InstanceType<typeof ContractTerminateDialog>>()
  const listFieldAccess = ref<ContractFieldAccessMap>({})
  const currentRows = ref<Contract[]>([])
  const copyingContractId = ref<string | null>(null)
  const viewMode = ref<'document' | 'detail'>('document')
  const viewModeOptions = [
    { label: '按单据', value: 'document' },
    { label: '按明细', value: 'detail' }
  ]

  const table = reactive<TableGroup>({
    searchQuery: {
      lifecycleStatus: undefined,
      businessContractType: undefined,
      contractCategory: undefined,
      customerId: customerId || '',
      carrierId: typeof route.query.carrierId === 'string' ? route.query.carrierId : '',
      recordId:
        typeof route.query.contractId === 'string'
          ? route.query.contractId
          : typeof route.query.recordId === 'string'
            ? route.query.recordId
            : '',
      billingMethod: '',
      createTimeRange: [],
      keyword: ''
    }
  })

  const statusOptions: Array<{ label: string; value: ContractLifecycleStatus }> = [
    { label: '待生效', value: 'pending_effective' },
    { label: '生效中', value: 'effective' },
    { label: '已到期', value: 'expired' },
    { label: '已终止', value: 'terminated' }
  ]

  const billingMethodOptions = computed(() => getDictMap.value.tmsContractBillingMethod ?? [])
  const contractCategoryOptions = computed(() => getDictMap.value.tmsContractCategory ?? [])
  const businessTypeOptions = computed(() => getDictMap.value.tmsContractBusinessType ?? [])
  const transportModeOptions = computed(() => getDictMap.value.tmsContractTransportMode ?? [])
  const booleanOptions = computed(() => getDictMap.value.commonBoolean ?? [])
  const billingLabelMap = computed(() => {
    const map = new Map<string, string>()
    billingMethodOptions.value.forEach((item) => {
      if (item.value) map.set(item.value, item.label || item.name || item.value)
    })
    return map
  })
  const billingValueMap = computed(() => {
    const map = new Map<string, string>()
    billingMethodOptions.value.forEach((item) => {
      if (item.value) map.set(item.value, item.value)
      if (item.label) map.set(item.label, item.value)
      if (item.name) map.set(item.name, item.value)
    })
    return map
  })
  const contractCategoryLabelMap = computed(() => createDictLabelMap(contractCategoryOptions.value))
  const businessTypeLabelMap = computed(() => createDictLabelMap(businessTypeOptions.value))
  const transportModeLabelMap = computed(() => createDictLabelMap(transportModeOptions.value))
  const contractCategoryValueMap = computed(() => createDictValueMap(contractCategoryOptions.value))
  const businessTypeValueMap = computed(() => createDictValueMap(businessTypeOptions.value))
  const transportModeValueMap = computed(() => createDictValueMap(transportModeOptions.value))
  const booleanValueMap = computed(() => createDictValueMap(booleanOptions.value))
  const booleanLabelMap = computed(() => createDictLabelMap(booleanOptions.value))

  const contractExcelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'contractName', title: '合同名称', required: true },
    { key: 'contractNo', title: '合同编号' },
    { key: 'paperContractNo', title: '纸质合同编号' },
    { key: 'mnemonicCode', title: '助记码' },
    {
      key: 'lifecycleStatus',
      title: '合同状态',
      formatter: (_value, row) =>
        contractLifecycleMeta[getContractLifecycleStatus(row as Contract)].label
    },
    {
      key: 'businessContractType',
      title: '业务合同分类',
      required: true,
      formatter: (value) => formatDictValue(value, businessTypeLabelMap.value)
    },
    {
      key: 'contractCategory',
      title: '合同类别',
      required: true,
      formatter: (value) => formatDictValue(value, contractCategoryLabelMap.value)
    },
    {
      key: 'transportMode',
      title: '运输方式',
      required: true,
      formatter: (value) => formatDictValue(value, transportModeLabelMap.value)
    },
    {
      key: 'carrierName',
      title: '承运商名称',
      formatter: (_value, row) => (row as Contract).carrier?.companyName || ''
    },
    {
      key: 'customerName',
      title: '客户/货主名称',
      formatter: (_value, row) => (row as Contract).customer?.customerName || ''
    },
    { key: 'contractAmount', title: '合同金额' },
    {
      key: 'billingUnit',
      title: '计费单位',
      formatter: (value) =>
        formatDictValue(value, createDictLabelMap(getDictMap.value.tmsCargoUnit ?? []))
    },
    { key: 'transportUnitPrice', title: '运输单价' },
    { key: 'roadConsumptionRate', title: '路耗标准%' },
    { key: 'lossDeductionPrice', title: '亏扣价' },
    { key: 'agreedTransportQuantity', title: '合同约定运输量' },
    { key: 'handler', title: '经办人', required: true },
    {
      key: 'signTime',
      title: '签订时间',
      required: true,
      formatter: (value) => formatDateTime(value)
    },
    { key: 'effectiveDate', title: '生效日期' },
    { key: 'expiryDate', title: '到期日期' },
    {
      key: 'isCompleted',
      title: '是否完成',
      formatter: (value) =>
        formatDictValue(toBooleanValue(value) ? 'true' : 'false', booleanLabelMap.value)
    },
    {
      key: 'billingMethod',
      title: '计费方式',
      required: true,
      formatter: (value) => formatBillingMethod(value)
    },
    { key: 'contactName', title: '联系人姓名' },
    { key: 'partyContactPhone', title: '相对方联系电话' },
    { key: 'customerSignatory', title: '客户签约人' },
    { key: 'waybillNo', title: '运单号' },
    { key: 'transportRoute', title: '运输路线' },
    { key: 'shipperName', title: '发货方' },
    { key: 'payerName', title: '付款方' },
    { key: 'consigneeName', title: '收货方' },
    { key: 'specialTransportRequirements', title: '运输特殊要求' },
    { key: 'otherDeductionTerms', title: '其他扣款约定' },
    { key: 'contractDescription', title: '合同说明摘要' }
  ]

  const excelSensitiveFieldMap: Partial<Record<string, ContractFieldKey>> = {
    contractAmount: 'contractAmount',
    transportUnitPrice: 'transportUnitPrice',
    roadConsumptionRate: 'roadConsumptionRate',
    lossDeductionPrice: 'lossDeductionPrice',
    partyContactPhone: 'partyContactPhone'
  }

  const shouldDisplaySensitiveField = (field: ContractFieldKey): boolean =>
    canViewField(listFieldAccess.value, field) ||
    currentRows.value.some((row) => canViewField(row.fieldAccess, field))

  const visibleExportColumns = computed(() =>
    contractExcelColumns.filter((column) => {
      const field = excelSensitiveFieldMap[String(column.key)]
      return !field || shouldDisplaySensitiveField(field)
    })
  )

  const visibleDetailExportColumns = computed<ArtTableQueryExcelColumn[]>(() => [
    ...visibleExportColumns.value,
    { key: 'detailIndex', title: '明细序号' },
    { key: 'detailCargoCode', title: '货物编码' },
    { key: 'detailCargoDescription', title: '货物名称' },
    { key: 'detailContractQuantity', title: '合同数量' },
    {
      key: 'detailUnit',
      title: '计量单位',
      formatter: (value) =>
        formatDictValue(value, createDictLabelMap(getDictMap.value.tmsCargoUnit ?? []))
    },
    ...(shouldDisplaySensitiveField('transportDetailsPricing')
      ? [
          { key: 'detailTransportUnitPrice', title: '明细单价' },
          { key: 'detailFreight', title: '明细运费' }
        ]
      : [])
  ])

  const tablePermissionKey = computed(() =>
    (['contractAmount', 'partyContactPhone', 'transportDetailsPricing'] as const)
      .map((field) => `${field}:${shouldDisplaySensitiveField(field) ? 'visible' : 'hidden'}`)
      .join('|')
  )

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '合同状态',
      key: 'lifecycleStatus',
      type: 'select',
      props: { options: statusOptions, clearable: true }
    },
    {
      label: '业务合同分类',
      key: 'businessContractType',
      type: 'select',
      props: { options: businessTypeOptions.value, clearable: true }
    },
    {
      label: '合同类别',
      key: 'contractCategory',
      type: 'select',
      props: { options: contractCategoryOptions.value, clearable: true }
    },
    {
      label: '承运商',
      key: 'carrierId',
      type: 'select',
      api: () => fetchCarrierOptions({ tenantId: customerTenantId }),
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      labelFn: (option) => formatNameCodeOption(option, 'companyName', 'carrierCode'),
      props: { clearable: true, filterable: true, placeholder: '请选择承运商' }
    },
    {
      label: '客户/货主',
      key: 'customerId',
      hidden: () => Boolean(customerId),
      type: 'select',
      api: () => fetchCustomerOptions({ tenantId: customerTenantId }),
      resultField: 'data',
      labelField: 'customerName',
      valueField: 'id',
      labelFn: (option) => formatNameCodeOption(option, 'customerName', 'customerCode'),
      props: { clearable: true, filterable: true, placeholder: '请选择客户或货主' }
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
      props: { clearable: true, placeholder: '名称、编号、纸质编号、助记码、联系人或路线' }
    }
  ])

  const documentColumns = (): ColumnOption<Contract>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    {
      prop: 'contractNo',
      label: '合同编号',
      width: 165,
      formatter: (row) =>
        row.id ? (
          <RouterLink
            class="tms-contract__code-link"
            to={`/tms/basic-data/contract-detail/${row.id}`}
            title={`查看合同 ${row.contractNo || row.contractName} 详情`}
          >
            {row.contractNo || '-'}
          </RouterLink>
        ) : (
          row.contractNo || '-'
        )
    },
    { prop: 'contractName', label: '合同名称', minWidth: 210, showOverflowTooltip: true },
    { prop: 'paperContractNo', label: '纸质合同编号', minWidth: 150, showOverflowTooltip: true },
    { prop: 'mnemonicCode', label: '助记码', width: 110 },
    {
      prop: 'lifecycleStatus',
      label: '合同状态',
      width: 110,
      formatter: (row) => renderStatus(row)
    },
    {
      prop: 'businessContractType',
      label: '业务合同分类',
      width: 145,
      dict: { code: 'tmsContractBusinessType', display: 'auto' }
    },
    {
      prop: 'contractCategory',
      label: '合同类别',
      width: 125,
      dict: { code: 'tmsContractCategory', display: 'text' }
    },
    {
      prop: 'transportMode',
      label: '运输方式',
      width: 110,
      dict: { code: 'tmsContractTransportMode', display: 'auto' }
    },
    {
      prop: 'carrier',
      label: '承运商',
      minWidth: 160,
      formatter: (row) => row.carrier?.companyName || '-'
    },
    {
      prop: 'customer',
      label: '客户/货主',
      minWidth: 160,
      formatter: (row) => row.customer?.customerName || '-'
    },
    {
      prop: 'partyName',
      label: '合同相对方',
      minWidth: 190,
      showOverflowTooltip: true,
      formatter: (row) => row.customer?.customerName || row.carrier?.companyName || '-'
    },
    ...(shouldDisplaySensitiveField('partyContactPhone')
      ? [
          {
            prop: 'partyContactPhone',
            label: '联系电话',
            width: 145,
            formatter: (row: Contract) => row.partyContactPhone || '-'
          }
        ]
      : []),
    ...(shouldDisplaySensitiveField('contractAmount')
      ? [
          {
            prop: 'contractAmount',
            label: '合同金额',
            width: 130,
            align: 'right' as const,
            formatter: (row: Contract) => formatSensitiveNumber(row.contractAmount)
          }
        ]
      : []),
    {
      prop: 'billingUnit',
      label: '计费单位',
      width: 110,
      dict: { code: 'tmsCargoUnit', display: 'text' }
    },
    { prop: 'handler', label: '经办人', width: 110 },
    { prop: 'contactName', label: '业务联系人', width: 120 },
    { prop: 'customerSignatory', label: '客户签约人', width: 120 },
    {
      prop: 'signTime',
      label: '签约日期',
      width: 150,
      formatter: (row) => formatDateTime(row.signTime)
    },
    { prop: 'effectiveDate', label: '生效日期', width: 120 },
    {
      prop: 'expiryDate',
      label: '到期日期',
      width: 120,
      formatter: (row) => row.expiryDate || '-'
    },
    { prop: 'shipperName', label: '发货方', minWidth: 130 },
    { prop: 'consigneeName', label: '收货方', minWidth: 130 },
    { prop: 'payerName', label: '付款方', minWidth: 130 },
    {
      prop: 'operation',
      label: '操作',
      width: 120,
      fixed: 'right',
      formatter: (row) => (
        <div class="flex">
          {(row.contractStatus === 'draft' || row.contractStatus === 'rejected') && (
            <ArtButtonTable
              type="edit"
              permission="TmsContract:Edit"
              onClick={() => openDialog(row)}
            />
          )}
          <ArtButtonMore
            list={getMoreActions(row)}
            onClick={(item: ButtonMoreItem) => handleMoreAction(item, row)}
          />
        </div>
      )
    }
  ]

  const columnsFactory = (): ColumnOption<Contract>[] => {
    const columns = documentColumns()
    if (viewMode.value === 'document') return columns
    const operation = columns.pop()
    const details: ColumnOption<Contract>[] = [
      { prop: 'detailIndex', label: '明细序号', width: 95 },
      {
        prop: 'detailCargoCode',
        label: '货物编码',
        minWidth: 135,
        formatter: (row) => (row as ContractDetailListRow).detailCargoCode || '—'
      },
      {
        prop: 'detailCargoDescription',
        label: '货物名称',
        minWidth: 190,
        showOverflowTooltip: true,
        formatter: (row) => (row as ContractDetailListRow).detailCargoDescription || '—'
      },
      {
        prop: 'detailContractQuantity',
        label: '合同数量',
        width: 120,
        align: 'right',
        formatter: (row) => (row as ContractDetailListRow).detailContractQuantity ?? '—'
      },
      {
        prop: 'detailUnit',
        label: '计量单位',
        width: 115,
        dict: { code: 'tmsCargoUnit', display: 'text' }
      },
      ...(shouldDisplaySensitiveField('transportDetailsPricing')
        ? [
            {
              prop: 'detailTransportUnitPrice',
              label: '明细单价',
              width: 125,
              align: 'right' as const,
              formatter: (row: Contract) =>
                formatSensitiveNumber((row as ContractDetailListRow).detailTransportUnitPrice)
            },
            {
              prop: 'detailFreight',
              label: '明细运费',
              width: 125,
              align: 'right' as const,
              formatter: (row: Contract) =>
                formatSensitiveNumber((row as ContractDetailListRow).detailFreight)
            }
          ]
        : [])
    ]
    return [
      ...columns.slice(1, 2),
      ...details,
      ...columns.slice(2),
      ...(operation ? [operation] : [])
    ]
  }

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { permission: 'TmsContract:Add', type: 'add', onClick: () => openDialog() },
    ...(viewMode.value === 'document'
      ? [
          {
            permission: 'TmsContract:Delete',
            type: 'delete',
            confirm: false,
            onClick: async ({ selectedRows }) => {
              const rows = selectedRows as Contract[]
              const ids = rows.map((row) => String(row.id)).filter(Boolean)
              await deleteRecords({
                resources: rows.map((row) => ({
                  id: String(row.id),
                  label: row.contractName || row.contractNo || '运输合同'
                })),
                permission: 'TmsContract:Delete',
                remove: () => deleteContractBatch(ids),
                onDeleted: async () => {
                  await tableQueryRef.value?.refreshRemove()
                }
              })
            }
          } as ArtTableQueryHeaderAction
        ]
      : []),
    ...(!embedded
      ? [
          {
            type: 'import',
            importColumns: contractExcelColumns,
            importTransformer: transformImportRows,
            importApi: async (rows) => {
              await importContracts(rows as Contract[])
            },
            onImportSuccess: () => {
              ElMessage.success('导入成功')
            },
            onImportError: (error) => {
              notifyFriendlyError(error, '合同导入失败，请检查文件内容和目标租户')
            }
          } as ArtTableQueryHeaderAction
        ]
      : []),
    {
      permission: 'TmsContract:Export',
      type: 'export',
      exportFilename: 'TMS合同资料',
      exportSheetName: viewMode.value === 'detail' ? '合同明细' : '运输合同',
      exportColumns: () =>
        viewMode.value === 'detail' ? visibleDetailExportColumns.value : visibleExportColumns.value,
      exportApi: async ({ selectedIds, searchParams, maxRows }) => {
        await Promise.all(
          [
            'tmsContractBusinessType',
            'tmsContractCategory',
            'tmsContractTransportMode',
            'tmsContractBillingMethod',
            'tmsCargoUnit',
            'commonBoolean'
          ].map((code) => userStore.ensureDictLoaded(code))
        )
        return (viewMode.value === 'detail' ? exportContractDetailRows : exportContractList)({
          ...(searchParams as SearchParams),
          customerId: customerId || (searchParams as SearchParams).customerId,
          ids: selectedIds.map(String),
          maxRows
        })
      }
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await (
      viewMode.value === 'detail' ? fetchContractDetailRows : fetchContractList
    )({
      ...params,
      customerId: customerId || params.customerId,
      from,
      to
    })
    listFieldAccess.value = result.fieldAccess
    currentRows.value = result.data
    return result
  }

  const createDictLabelMap = (options: Api.DataCenter.DictListItem[]): Map<string, string> => {
    const map = new Map<string, string>()
    options.forEach((item) => {
      if (item.value) map.set(item.value, item.label || item.name || item.value)
    })
    return map
  }

  const createDictValueMap = (options: Api.DataCenter.DictListItem[]): Map<string, string> => {
    const map = new Map<string, string>()
    options.forEach((item) => {
      if (item.value) map.set(item.value, item.value)
      if (item.label) map.set(item.label, item.value)
      if (item.name) map.set(item.name, item.value)
    })
    return map
  }

  const formatDictValue = (value: unknown, labels: Map<string, string>): string => {
    const key = String(value ?? '').trim()
    return key ? labels.get(key) || '待核对' : '—'
  }

  const renderStatus = (row: Contract) => {
    const meta = contractLifecycleMeta[getContractLifecycleStatus(row)]
    return <ElTag type={meta.type}>{meta.label}</ElTag>
  }

  const formatBillingMethod = (value: unknown): string => {
    const key = String(value ?? '').trim()
    return key ? billingLabelMap.value.get(key) || '待核对' : '—'
  }

  const formatDateTime = (value?: unknown): string => {
    if (!value) return '-'
    return formatWithDayjs(String(value), 'YYYY-MM-DD HH:mm:ss') ?? '-'
  }

  const getImportValue = (row: Record<string, unknown>, key: string, title: string): string => {
    return String(row[title] ?? row[key] ?? '').trim()
  }

  const parseImportNumber = (
    row: Record<string, unknown>,
    key: string,
    title: string
  ): number | null => {
    const rawValue = getImportValue(row, key, title)
    if (!rawValue) return null
    const value = Number(rawValue)
    return Number.isFinite(value) ? value : null
  }

  const toBooleanValue = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value
    const normalized = String(value ?? '').trim()
    return booleanValueMap.value.get(normalized) === 'true' || normalized === 'true'
  }

  const transformImportRows = async (rows: Array<Record<string, unknown>>): Promise<Contract[]> => {
    const [{ data: carriers }, { data: customers }] = await Promise.all([
      fetchCarrierOptions(),
      fetchCustomerOptions()
    ])
    const carrierMap = new Map<string, CarrierOption>()
    ;(carriers ?? []).forEach((carrier) => {
      carrierMap.set(carrier.companyName, carrier)
      if (carrier.carrierCode) carrierMap.set(carrier.carrierCode, carrier)
      if (carrier.carrierCode)
        carrierMap.set(`${carrier.companyName}（${carrier.carrierCode}）`, carrier)
    })
    const customerMap = new Map<string, CustomerOption>()
    ;(customers ?? []).forEach((customer) => {
      customerMap.set(customer.customerName, customer)
      if (customer.customerCode) customerMap.set(customer.customerCode, customer)
      if (customer.customerCode)
        customerMap.set(`${customer.customerName}（${customer.customerCode}）`, customer)
    })

    return rows
      .map((row) => {
        const carrierName = getImportValue(row, 'carrierName', '承运商名称')
        const customerName = getImportValue(row, 'customerName', '客户/货主名称')
        const carrier = carrierMap.get(carrierName)
        const customer = customerMap.get(customerName)
        const importedBusinessType = businessTypeValueMap.value.get(
          getImportValue(row, 'businessContractType', '业务合同分类')
        )
        const businessContractType: ContractBusinessType = customerId
          ? 'customer'
          : importedBusinessType === 'customer' || importedBusinessType === 'carrier'
            ? importedBusinessType
            : customer
              ? 'customer'
              : 'carrier'
        return {
          contractNo: getImportValue(row, 'contractNo', '合同编号') || undefined,
          contractName: getImportValue(row, 'contractName', '合同名称'),
          paperContractNo: getImportValue(row, 'paperContractNo', '纸质合同编号') || null,
          mnemonicCode: getImportValue(row, 'mnemonicCode', '助记码') || null,
          contractStatus: 'draft' as const,
          businessContractType,
          contractCategory:
            contractCategoryValueMap.value.get(
              getImportValue(row, 'contractCategory', '合同类别')
            ) || 'annual_framework',
          transportMode:
            transportModeValueMap.value.get(getImportValue(row, 'transportMode', '运输方式')) ||
            'road',
          carrierId: carrier?.id || null,
          customerId: customerId || customer?.id || null,
          contactName: getImportValue(row, 'contactName', '联系人姓名') || null,
          customerSignatory: getImportValue(row, 'customerSignatory', '客户签约人') || null,
          waybillNo: getImportValue(row, 'waybillNo', '运单号') || null,
          billingMethod:
            billingValueMap.value.get(getImportValue(row, 'billingMethod', '计费方式')) || '',
          billingUnit: getImportValue(row, 'billingUnit', '计费单位') || null,
          contractAmount: parseImportNumber(row, 'contractAmount', '合同金额'),
          transportUnitPrice: parseImportNumber(row, 'transportUnitPrice', '运输单价'),
          roadConsumptionRate: parseImportNumber(row, 'roadConsumptionRate', '路耗标准%'),
          lossDeductionPrice: parseImportNumber(row, 'lossDeductionPrice', '亏扣价'),
          agreedTransportQuantity: parseImportNumber(
            row,
            'agreedTransportQuantity',
            '合同约定运输量'
          ),
          signTime: getImportValue(row, 'signTime', '签订时间'),
          effectiveDate: getImportValue(row, 'effectiveDate', '生效日期') || null,
          expiryDate: getImportValue(row, 'expiryDate', '到期日期') || null,
          isCompleted: toBooleanValue(getImportValue(row, 'isCompleted', '是否完成')),
          handler: getImportValue(row, 'handler', '经办人'),
          transportRoute: getImportValue(row, 'transportRoute', '运输路线') || null,
          shipperName: getImportValue(row, 'shipperName', '发货方') || null,
          payerName: getImportValue(row, 'payerName', '付款方') || null,
          consigneeName: getImportValue(row, 'consigneeName', '收货方') || null,
          specialTransportRequirements:
            getImportValue(row, 'specialTransportRequirements', '运输特殊要求') || null,
          otherDeductionTerms: getImportValue(row, 'otherDeductionTerms', '其他扣款约定') || null,
          contractDescription: getImportValue(row, 'contractDescription', '合同说明摘要') || null,
          transportDetails: [],
          attachments: []
        }
      })
      .filter(
        (row) =>
          row.contractName &&
          (usesCarrierParty(row.businessContractType) ? row.carrierId : row.customerId) &&
          row.billingMethod &&
          row.signTime &&
          row.handler
      )
  }

  const openDialog = (row?: Contract): void => {
    void dialogRef.value?.handleOpen(row, {
      customerId,
      customerTenantId
    })
  }

  const openDetail = (row: Contract): void => {
    if (!row.id) return
    void router.push(`/tms/basic-data/contract-detail/${row.id}`)
  }

  const getMoreActions = (row: Contract): ButtonMoreItem[] => [
    { auth: 'TmsContract:View', key: 'view', label: '查看', icon: 'ri:eye-line' },
    {
      auth: 'TmsContract:Copy',
      key: 'copy',
      label: '复制',
      icon: 'ri:file-copy-line',
      disabled: copyingContractId.value === row.id
    },
    ...(row.contractStatus === 'approved'
      ? [
          {
            auth: 'TmsContract:Terminate',
            key: 'terminate',
            label: '终止合同',
            icon: 'ri:stop-circle-line',
            color: '#f56c6c'
          }
        ]
      : []),
    {
      auth: 'TmsContract:Delete',
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-5-line',
      color: '#f56c6c'
    }
  ]

  const handleMoreAction = (item: ButtonMoreItem, row: Contract): void => {
    if (item.key === 'view') {
      openDetail(row)
      return
    }
    if (item.key === 'copy') {
      void handleCopy(row)
      return
    }
    if (item.key === 'terminate') {
      void terminateDialogRef.value?.open(row)
      return
    }
    if (item.key === 'delete') {
      void handleDelete(row)
    }
  }

  const handleCopy = async (row: Contract): Promise<void> => {
    if (!row.id || copyingContractId.value) return
    copyingContractId.value = row.id
    try {
      await ElMessageBox.confirm(
        `确定复制运输合同“${row.contractName}”吗？将生成新的草稿合同。`,
        '复制合同',
        {
          confirmButtonText: '复制',
          cancelButtonText: '取消',
          type: 'info'
        }
      )
    } catch {
      copyingContractId.value = null
      return
    }
    try {
      await copyContract(row.id)
      await tableQueryRef.value?.refreshCreate()
    } catch (error) {
      notifyFriendlyError(error, '合同复制失败，请检查权限后重试')
    } finally {
      copyingContractId.value = null
    }
  }

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleDelete = async (row: Contract): Promise<void> => {
    const id = row.id
    if (!id) return
    await deleteRecord({
      resource: { id, label: row.contractName || row.contractNo || '运输合同' },
      permission: 'TmsContract:Delete',
      remove: () => deleteContract(id),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }

  const syncMasterDeleteRoute = (forceRefresh = false): void => {
    const active = route.query.fromMasterDelete === '1' || route.query.fromCustomerDelete === '1'
    const carrierId = typeof route.query.carrierId === 'string' ? route.query.carrierId : ''
    const routeCustomerId =
      customerId || (typeof route.query.customerId === 'string' ? route.query.customerId : '')
    const recordId =
      typeof route.query.contractId === 'string'
        ? route.query.contractId
        : active && typeof route.query.recordId === 'string'
          ? route.query.recordId
          : ''
    const changed =
      table.searchQuery.carrierId !== carrierId ||
      table.searchQuery.customerId !== routeCustomerId ||
      table.searchQuery.recordId !== recordId
    Object.assign(table.searchQuery, { carrierId, customerId: routeCustomerId, recordId })
    if (active || changed) {
      Object.assign(table.searchQuery, {
        lifecycleStatus: undefined,
        businessContractType: undefined,
        contractCategory: undefined,
        billingMethod: '',
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
  .tms-contract {
    :deep(.tms-contract__code-link) {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
      vertical-align: middle;
      color: var(--el-color-primary);
      white-space: nowrap;
      text-decoration: none;

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
