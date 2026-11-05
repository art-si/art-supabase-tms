<template>
  <div class="business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      v-if="deleteContext.active"
      :customer-id="deleteContext.customerId"
      :customer-name="deleteContext.customerName"
      action-hint="请核对关联司机；请先调整归属或处理司机资料。"
    />
    <BusinessWorkspaceHeader
      eyebrow="DRIVER ROSTER"
      title="司机资料"
      description="统一维护司机归属、从业类型、证照与可用状态，为车辆调度提供清晰的人力视图。"
      icon="ri:steering-2-line"
      :tags="[
        { label: '司机名册', type: 'primary' },
        { label: '调度可用', type: 'success' }
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
      :immediate="tableImmediate"
      :table-props="{
        emptyText: '暂无司机资料',
        emptyDescription: '可新增司机，或调整承运商、司机类型、状态和关键字后重新查询。'
      }"
      focusable
    />

    <DriverDialog ref="dialogRef" @success="handleSaveSuccess" />
    <DriverInviteDialog ref="inviteRef" @profile="handleInviteProfile" />
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleDeleteGuardCleared" />
  </div>
</template>

<script setup lang="tsx">
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryExcelColumn
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ColumnOption, DialogType } from '@/types'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { formatWithDayjs } from '@/utils/time'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import {
    isPrivateAttachmentPath,
    signPrivateAttachmentPaths
  } from '@/utils/supabase/private-attachment'
  import { useUserStore } from '@/store/modules/user'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import { useAuth } from '@/hooks/core/useAuth'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import {
    deleteDriver,
    deleteDriverBatch,
    exportDriverList,
    fetchCarrierDetail,
    fetchCarrierOptions,
    fetchDriverDetail,
    fetchDriverList,
    importDrivers
  } from '@tms/api'
  import DriverDialog from './modules/driver-dialog.vue'
  import DriverInviteDialog from './modules/driver-invite-dialog.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { useMasterDataDeleteProcessingContext } from '@/hooks/core/useMasterDataDeleteProcessing'
  import { canViewField, mergeFieldAccessMaps } from '@/utils/field-permission'

  defineOptions({ name: 'TmsDriver' })

  const { deleteRecords } = useRecordDeleteGuard('mdm_driver', '司机')

  type Driver = Api.Tms.BasicData.Driver
  type CarrierOption = Api.Tms.BasicData.CarrierOption
  type SearchParams = Api.Tms.BasicData.DriverSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface DriverDialogExpose {
    handleOpen: (
      row?: Driver,
      initial?: { phone: string; driverOwnership: string; carrierId: string | null },
      initialTab?: 'commission',
      commissionRuleId?: string,
      viewOnly?: boolean
    ) => Promise<void>
  }

  interface DriverInviteExpose {
    open: (targetId?: string) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { hasAuth } = useAuth()
  const route = useRoute()
  const deleteContext = useMasterDataDeleteProcessingContext()
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DriverDialogExpose>()
  const inviteRef = ref<DriverInviteExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()
  const driverFieldAccess = ref<Api.Tms.BasicData.DriverFieldAccessMap>({})

  const initialCarrierId = String(route.query.carrierId || '')
  const initialRecordId = String(route.query.recordId || route.query.driverId || '')
  const tableImmediate = !initialCarrierId && !initialRecordId

  const tableState = reactive<{ searchQuery: SearchParams }>({
    searchQuery: {
      carrierId: initialCarrierId,
      recordId: initialRecordId,
      driverType: undefined,
      gender: '',
      enabled: undefined,
      createTimeRange: [],
      keyword: ''
    }
  })

  onMounted(async () => {
    if (!initialCarrierId && !initialRecordId && !route.query.invitationId) return
    await nextTick()
    await tableQueryRef.value?.getData()
    await openDeepLink()
  })

  watch(
    () => route.fullPath,
    async () => {
      const carrierId = String(route.query.carrierId || '')
      const recordId = String(route.query.recordId || route.query.driverId || '')
      if (
        tableState.searchQuery.carrierId === carrierId &&
        tableState.searchQuery.recordId === recordId
      ) {
        await openDeepLink()
        return
      }
      Object.assign(tableState.searchQuery, {
        carrierId,
        recordId,
        driverType: undefined,
        gender: '',
        enabled: undefined,
        createTimeRange: [],
        keyword: ''
      })
      await nextTick()
      await tableQueryRef.value?.refreshCreate()
      await openDeepLink()
    },
    { flush: 'post' }
  )

  onActivated(() => void tableQueryRef.value?.getData())

  const genderOptions = computed(() => getDictMap.value.sex ?? [])
  const driverTypeOptions = computed(() => getDictMap.value.tmsDriverType ?? [])
  const ownershipOptions = computed(() => getDictMap.value.tmsDriverOwnership ?? [])
  const commonBooleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: item.value === 'true'
    }))
  )

  const withSelectedCarrierOption = async (result: unknown) => {
    const carrierResult = result as Awaited<ReturnType<typeof fetchCarrierOptions>>
    const selectedCarrierId = tableState.searchQuery.carrierId
    const options = carrierResult.data ?? []

    if (!selectedCarrierId || options.some((option) => option.id === selectedCarrierId)) {
      return carrierResult
    }

    const detailResult = await fetchCarrierDetail(selectedCarrierId)
    const carrier = detailResult.data
    if (!carrier?.id) return carrierResult

    return {
      ...carrierResult,
      data: [carrier as CarrierOption, ...options]
    }
  }

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '所属承运商',
      key: 'carrierId',
      type: 'select',
      api: fetchCarrierOptions,
      afterFetch: withSelectedCarrierOption,
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      labelFn: (option) => {
        const carrier = option as CarrierOption
        return carrier.carrierCode
          ? `${carrier.companyName}（${carrier.carrierCode}）`
          : carrier.companyName
      },
      props: {
        clearable: true,
        filterable: true,
        placeholder: '请选择承运商'
      }
    },
    {
      label: '性别',
      key: 'gender',
      type: 'select',
      props: { options: genderOptions.value, clearable: true }
    },
    {
      label: '司机类型',
      key: 'driverType',
      type: 'select',
      props: { options: driverTypeOptions.value, clearable: true }
    },
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
      label: '关键词',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '姓名或驾照类型'
      }
    }
  ])

  const columnsFactory = (): ColumnOption<Driver>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 72 },
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
          <span
            class="inline-flex h-9 w-9 items-center justify-center rounded bg-[var(--art-gray-100)] text-[var(--art-gray-600)]"
            aria-label="暂无照片"
          >
            —
          </span>
        )
    },
    {
      prop: 'driverName',
      label: '姓名',
      minWidth: 180,
      formatter: (row) => (
        <div class={row.isBlacklisted ? 'tms-driver__blocked' : undefined}>
          <BusinessRecordLink
            label={row.driverName || '未命名司机'}
            meta={row.isBlacklisted ? '黑名单' : ''}
            interactive={Boolean(row.id && hasAuth('TmsDriver:View'))}
            onClick={() => openDialog(row, true)}
            compact
          />
        </div>
      )
    },
    {
      prop: 'driverOwnership',
      label: '司机归属',
      width: 120,
      formatter: (row) =>
        ownershipOptions.value.find((item) => item.value === row.driverOwnership)?.label || '—'
    },
    {
      prop: 'companyName',
      label: '所属公司',
      minWidth: 210,
      showOverflowTooltip: true,
      formatter: (row) => row.companyName || row.carrier?.companyName || '—'
    },
    {
      prop: 'registrationStatus',
      label: '注册状态',
      width: 110,
      dict: {
        code: 'tmsDriverRegistrationStatus',
        display: 'tag',
        value: (row) => row.registrationStatus || 'unregistered'
      }
    },
    {
      prop: 'identityAuthStatus',
      label: '身份证状态',
      width: 120,
      dict: {
        code: 'tmsDriverAuthStatus',
        display: 'tag',
        value: (row) => row.identityAuthStatus || 'unverified'
      }
    },
    {
      prop: 'licenseAuthStatus',
      label: '驾驶证状态',
      width: 120,
      dict: {
        code: 'tmsDriverAuthStatus',
        display: 'tag',
        value: (row) => row.licenseAuthStatus || 'unverified'
      }
    },
    {
      prop: 'qualificationAuthStatus',
      label: '从业资格证状态',
      width: 140,
      dict: {
        code: 'tmsDriverAuthStatus',
        display: 'tag',
        value: (row) => row.qualificationAuthStatus || 'unverified'
      }
    },
    {
      prop: 'carrierName',
      label: '所属承运商',
      minWidth: 210,
      showOverflowTooltip: true,
      formatter: (row) => row.carrier?.companyName || '-'
    },
    {
      prop: 'driverType',
      label: '司机类型',
      width: 100,
      dict: { code: 'tmsDriverType', display: 'tag' }
    },
    {
      prop: 'assignedVehicles',
      label: '车牌号',
      minWidth: 240,
      formatter: (row) => renderAssignedVehicles(row)
    },
    ...(canViewField(driverFieldAccess.value, 'contactPhone')
      ? [
          {
            prop: 'phone',
            label: '手机号码',
            width: 150,
            formatter: (row: Driver) => row.phone || '-'
          } satisfies ColumnOption<Driver>
        ]
      : []),
    {
      prop: 'gender',
      label: '性别',
      width: 90,
      formatter: (row) => {
        const value = String(row.gender ?? '').trim()
        if (value === 'male') return '男'
        if (value === 'female') return '女'
        return getDictionaryDisplayLabel(
          genderOptions.value.find((option) => String(option.value) === value),
          value,
          { emptyText: '-', unknownText: '待核对' }
        )
      }
    },
    {
      prop: 'licenseType',
      label: '驾照类型',
      width: 100,
      dict: { code: 'tmsDriverLicenseType', display: 'text' }
    },
    {
      prop: 'licenseExpireDate',
      label: '驾照日期',
      width: 130,
      formatter: (row) => row.licenseExpireDate || '-'
    },
    ...(canViewField(driverFieldAccess.value, 'homeAddress')
      ? [
          {
            prop: 'homeAddress',
            label: '家庭住址',
            minWidth: 260,
            showOverflowTooltip: true,
            formatter: (row: Driver) => row.homeAddress || '-'
          } satisfies ColumnOption<Driver>
        ]
      : []),
    ...(canViewField(driverFieldAccess.value, 'emergencyContact')
      ? [
          {
            prop: 'emergencyContactName',
            label: '紧急联系人',
            minWidth: 125,
            formatter: (row: Driver) => row.emergencyContactName || '—'
          } satisfies ColumnOption<Driver>,
          {
            prop: 'emergencyContactPhone',
            label: '紧急联系人电话',
            width: 155,
            formatter: (row: Driver) => row.emergencyContactPhone || '—'
          } satisfies ColumnOption<Driver>
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
        <div>
          <ArtButtonTable type="edit" permission="TmsDriver:Edit" onClick={() => openDialog(row)} />
          <ArtButtonTable
            type="delete"
            permission="TmsDriver:Delete"
            onClick={() => handleDelete(row)}
          />
        </div>
      )
    }
  ]

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    { permission: 'TmsDriver:Add', type: 'add', onClick: () => openDialog() },
    {
      key: 'invite',
      label: '邀请司机',
      permission: 'TmsDriver:Invite',
      onClick: () => inviteRef.value?.open()
    },
    {
      type: 'import',
      permission: 'TmsDriver:Import',
      hidden: !hasAuth('TmsDriver:Add'),
      importColumns: [
        { key: 'driverName', title: '司机姓名' },
        { key: 'phone', title: '手机号码' },
        { key: 'idCardNo', title: '身份证号' },
        { key: 'gender', title: '性别' },
        { key: 'licenseType', title: '准驾车型' },
        { key: 'licenseExpireDate', title: '驾驶证有效期' },
        { key: 'remark', title: '备注' }
      ] satisfies ArtTableQueryExcelColumn[],
      importApi: async (rows) => {
        if (!rows.length) throw new Error('导入文件没有司机数据，请检查表头和内容。')
        const genderOptions = getDictMap.value.sex ?? []
        const payload = rows.map((row) => {
          const genderText = String(row.gender ?? '').trim()
          const gender =
            genderOptions.find((option) => option.label === genderText)?.value ?? genderText
          return {
            driverName: String(row.driverName ?? '').trim(),
            phone: String(row.phone ?? '').trim(),
            idCardNo: String(row.idCardNo ?? '').trim(),
            gender: String(gender),
            licenseType: String(row.licenseType ?? '').trim(),
            licenseExpireDate: normalizeNullableText(row.licenseExpireDate),
            driverType: 'primary',
            remark: String(row.remark ?? '').trim(),
            profile: { driverOwnership: 'self' }
          }
        })
        const response = await importDrivers(payload)
        const result = response.data
        await tableQueryRef.value?.refreshCreate()
        if (!result) throw new Error('导入结果未返回，请刷新列表核对。')
        if (result.failed) {
          const errors = result.records.filter((record) => !record.success).slice(0, 3)
          throw new Error(
            `已导入 ${result.succeeded} 条，失败 ${result.failed} 条。${errors.map((item) => `第 ${item.rowNumber} 行：${item.error && /[\u4e00-\u9fff]/.test(item.error) ? item.error : '请核对必填信息、证件号和所属租户'}`).join('；')}`
          )
        }
      }
    },
    {
      type: 'export',
      permission: 'TmsDriver:Export',
      exportFilename: '司机档案',
      exportSheetName: '司机档案',
      exportColumns: [
        { key: 'driverName', title: '司机姓名' },
        { key: 'phone', title: '手机号码' },
        {
          key: 'driverType',
          title: '司机类型',
          formatter: (value) =>
            getDictionaryDisplayLabel(
              userStore.getDictDisplayItemByValue('tmsDriverType', String(value ?? '')),
              value,
              { emptyText: '', unknownText: '待核对' }
            )
        },
        {
          key: 'licenseType',
          title: '准驾车型',
          formatter: (value) =>
            getDictionaryDisplayLabel(
              userStore.getDictDisplayItemByValue('tmsDriverLicenseType', String(value ?? '')),
              value,
              { emptyText: '', unknownText: '待核对' }
            )
        },
        { key: 'licenseExpireDate', title: '驾驶证有效期' },
        {
          key: 'enabled',
          title: '启用状态',
          formatter: (value) => (value === true ? '启用' : '停用')
        }
      ] satisfies ArtTableQueryExcelColumn[],
      exportApi: async ({ selectedIds, searchParams, maxRows }) => {
        await Promise.all(
          ['tmsDriverType', 'tmsDriverLicenseType'].map((code) => userStore.ensureDictLoaded(code))
        )
        return exportDriverList({
          ...(searchParams as SearchParams),
          ids: selectedIds.map(String),
          maxRows
        })
      }
    },
    {
      permission: 'TmsDriver:Delete',
      type: 'delete',
      confirm: false,
      onClick: ({ selectedRows }) => handleDeleteRows(selectedRows as Driver[])
    }
  ])

  const fetchTableData = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchDriverList({ ...params, from, to })
    driverFieldAccess.value = mergeFieldAccessMaps(
      result.fieldAccess,
      ...(result.data ?? []).map((record) => record.fieldAccess)
    )
    const portraitPaths = (result.data ?? [])
      .map((row) => row.portraitUrl)
      .filter((path): path is string => Boolean(path && isPrivateAttachmentPath(path)))
    if (portraitPaths.length) {
      try {
        const previews = await signPrivateAttachmentPaths('tms-driver-private', portraitPaths)
        for (const row of result.data ?? []) {
          row.portraitPreviewUrl = row.portraitUrl ? previews.get(row.portraitUrl) || null : null
        }
      } catch (error) {
        notifyFriendlyError(error, '司机照片加载失败，可点击姓名查看资料')
      }
    }
    return result
  }

  const renderAssignedVehicles = (row: Driver) => {
    const vehicles = row.assignedVehicles ?? []
    if (!vehicles.length) return <span class="tms-driver__vehicle-empty">-</span>

    return (
      <div class="tms-driver__vehicle-links">
        {vehicles.map((vehicle) => (
          <BusinessRecordLink
            key={vehicle.id}
            label={vehicle.plateNo}
            to={
              hasAuth('VehicleQuery:View') ? `/vms/vehicle-query/detail/${vehicle.id}` : undefined
            }
            title={`查看车辆 ${vehicle.plateNo} 详情`}
            compact
          />
        ))}
      </div>
    )
  }

  const openDialog = (row?: Driver, viewOnly = false): void => {
    void dialogRef.value?.handleOpen(row, undefined, undefined, undefined, viewOnly)
  }

  const lastDeepLink = ref('')
  const openDeepLink = async (): Promise<void> => {
    const commissionRuleId = String(route.query.commissionRuleId || '')
    const invitationId = String(route.query.invitationId || '')
    const driverId = String(route.query.driverId || route.query.recordId || '')
    const key = [driverId, commissionRuleId, invitationId].join(':')
    if ((!commissionRuleId && !invitationId) || key === lastDeepLink.value) return
    lastDeepLink.value = key
    if (invitationId) {
      await inviteRef.value?.open(invitationId)
      return
    }
    if (!driverId) return
    const result = await fetchDriverDetail(driverId)
    if (result.data)
      await dialogRef.value?.handleOpen(result.data, undefined, 'commission', commissionRuleId)
  }

  const handleInviteProfile = (initial: {
    phone: string
    driverOwnership: string
    carrierId: string | null
  }): void => {
    void dialogRef.value?.handleOpen(undefined, initial)
  }

  const handleSaveSuccess = (type: DialogType): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleDeleteGuardCleared = (): void => {
    void tableQueryRef.value?.getData()
  }

  const handleDeleteRows = async (rows: Driver[]): Promise<void> => {
    const resources = rows.map((row) => ({
      id: row.id ? String(row.id) : '',
      label: row.driverName || '未命名司机'
    }))
    const ids = resources.map((item) => item.id)
    await deleteRecords({
      resources,
      permission: 'TmsDriver:Delete',
      inspectReferences: async (snapshot) => {
        if (!deleteGuardRef.value) throw new Error('删除检查尚未就绪，请刷新列表后重试。')
        return deleteGuardRef.value.inspect({
          resourceType: 'driver',
          resourceLabel: '司机',
          resources: snapshot
        })
      },
      remove: () => (ids.length === 1 ? deleteDriver(ids[0]) : deleteDriverBatch(ids)),
      onDeleted: async () => {
        await tableQueryRef.value?.refreshRemove()
      }
    })
  }
  const handleDelete = (row: Driver): Promise<void> => handleDeleteRows([row])
</script>

<style lang="scss">
  .tms-driver {
    &__blocked .business-record-link__control,
    &__blocked .business-record-link__static {
      color: var(--el-color-danger);
    }

    &__blocked .business-record-link__control {
      background: var(--el-color-danger-light-9);
      border-color: var(--el-color-danger-light-7);
    }

    &__vehicle-links {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: center;
      min-width: 0;
      padding: 4px 0;
    }

    &__vehicle-empty {
      color: var(--el-text-color-placeholder);
    }
  }
</style>
