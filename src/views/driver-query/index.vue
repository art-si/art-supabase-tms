<template>
  <div class="business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      eyebrow="DRIVER TRACE"
      title="司机综合查询"
      description="以司机档案为主线，核对驾驶资质、车辆分配和实际承运订单。"
      icon="ri:steering-2-line"
      :tags="[
        { label: '一人一档', type: 'primary' },
        { label: '承运关系按执行运单追踪', type: 'info' }
      ]"
      :metrics="workspaceMetrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="search"
      :search-items="searchItems"
      :api-fn="fetchRows"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 86, showExpand: false }"
      :table-props="{
        rowKey: 'id',
        emptyText: '暂无符合条件的司机',
        emptyDescription: '可调整姓名、所属承运商或状态后重新查询。'
      }"
      :on-success="handleTableSuccess"
      focusable
    />
  </div>
</template>

<script setup lang="tsx">
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryExcelColumn,
    ArtTableQueryProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { canViewField, mergeFieldAccessMaps } from '@/utils/field-permission'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { exportDriverList, fetchCarrierOptions, fetchDriverList } from '@tms/api'

  defineOptions({ name: 'TmsDriverQuery' })

  type Driver = Api.Tms.BasicData.Driver
  type Search = Api.Tms.BasicData.DriverSearchParams
  type TableParams = Search & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const { hasAuth } = useAuth()
  const enabledOptions = useDictionaryOptions('commonEnabledStatus', (value) => value === 'enabled')
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const search = reactive<Search>({ carrierId: '', enabled: undefined, keyword: '' })
  const overview = reactive<{ total: number; rows: Driver[] }>({ total: 0, rows: [] })
  const fieldAccess = ref<Api.Tms.BasicData.DriverFieldAccessMap>({})
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: overview.total,
      description: '随筛选条件更新',
      icon: 'ri:steering-2-line'
    },
    {
      label: '本页启用司机',
      value: overview.rows.filter((row) => row.enabled).length,
      description: '档案启用状态',
      icon: 'ri:user-follow-line',
      tone: 'success'
    },
    {
      label: '本页已分配车辆',
      value: overview.rows.filter((row) => Boolean(row.assignedVehicles?.length)).length,
      description: '档案分配；实际承运见详情',
      icon: 'ri:truck-line',
      tone: 'primary'
    }
  ])
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'export',
      permission: 'TmsDriverQuery:Export',
      exportFilename: '司机综合查询',
      exportSheetName: '司机综合查询',
      exportColumns: [
        { key: 'driverName', title: '司机姓名' },
        { key: 'driverType', title: '司机类型' },
        { key: 'licenseType', title: '驾照类型' },
        { key: 'licenseExpireDate', title: '驾照到期' },
        {
          key: 'enabled',
          title: '启用状态',
          formatter: (value) => (value === true ? '启用' : '停用')
        }
      ] satisfies ArtTableQueryExcelColumn[],
      exportApi: ({ selectedIds, searchParams, maxRows }) =>
        exportDriverList({
          ...(searchParams as Search),
          ids: selectedIds.map(String),
          maxRows
        })
    }
  ]

  const searchItems: SearchFormItem[] = [
    {
      label: '姓名',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入司机姓名' }
    },
    {
      label: '所属承运商',
      key: 'carrierId',
      type: 'select',
      api: fetchCarrierOptions,
      resultField: 'data',
      labelField: 'companyName',
      valueField: 'id',
      props: { clearable: true, filterable: true }
    },
    {
      label: '状态',
      key: 'enabled',
      type: 'select',
      props: {
        clearable: true,
        options: enabledOptions
      }
    }
  ]

  const fetchRows = async (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    const result = await fetchDriverList({ ...params, from, to })
    fieldAccess.value = mergeFieldAccessMaps(
      result.fieldAccess,
      ...(result.data ?? []).map((row) => row.fieldAccess)
    )
    return result
  }

  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    overview.rows = rows as Driver[]
    overview.total = response.total ?? rows.length
  }

  const columnsFactory = (): ColumnOption<Driver>[] => [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    {
      prop: 'driverName',
      label: '司机姓名',
      minWidth: 170,
      fixed: 'left',
      formatter: (row) => (
        <BusinessRecordLink
          label={row.driverName || '未命名司机'}
          to={
            row.id && hasAuth('TmsDriverQuery:View')
              ? `/tms/driver-query/detail/${row.id}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'carrierName',
      label: '所属承运商',
      minWidth: 180,
      formatter: (row) => row.carrier?.companyName || '—'
    },
    {
      prop: 'driverType',
      label: '司机类型',
      width: 110,
      dict: { code: 'tmsDriverType', display: 'tag' }
    },
    {
      prop: 'assignedVehicles',
      label: '关联车辆',
      minWidth: 240,
      formatter: (row) =>
        row.assignedVehicles?.length ? (
          <div class="flex flex-wrap gap-2">
            {row.assignedVehicles.map((vehicle) => (
              <BusinessRecordLink
                key={vehicle.id}
                label={vehicle.plateNo}
                to={
                  hasAuth('VehicleQuery:View')
                    ? `/vms/vehicle-query/detail/${vehicle.id}`
                    : undefined
                }
                compact
              />
            ))}
          </div>
        ) : (
          '—'
        )
    },
    ...(canViewField(fieldAccess.value, 'contactPhone')
      ? [
          {
            prop: 'phone',
            label: '联系电话',
            width: 150,
            formatter: (row: Driver) =>
              canViewField(row.fieldAccess, 'contactPhone') ? row.phone || '—' : '—'
          } satisfies ColumnOption<Driver>
        ]
      : []),
    {
      prop: 'licenseType',
      label: '驾照类型',
      width: 120,
      dict: { code: 'tmsDriverLicenseType', display: 'text' }
    },
    {
      prop: 'licenseExpireDate',
      label: '驾照到期',
      width: 130,
      formatter: (row) => row.licenseExpireDate || '—'
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 90,
      dict: {
        code: 'commonEnabledStatus',
        display: 'tag',
        value: (row) => (row.enabled == null ? '' : row.enabled ? 'enabled' : 'disabled')
      }
    }
  ]
</script>
