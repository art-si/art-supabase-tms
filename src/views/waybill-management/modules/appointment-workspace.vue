<template>
  <div class="business-workspace-page art-full-height appointment-workspace">
    <BusinessWorkspaceHeader
      :eyebrow="kind === 'pickup' ? 'PICKUP BOOKING' : 'DELIVERY BOOKING'"
      :title="title"
      :description="
        kind === 'pickup'
          ? '按调度子单安排提货车辆与进场时间，并跟进到场、装货和离场。'
          : '按调度子单安排送货车辆与进场时间，并跟进到场和月台信息。'
      "
      :icon="kind === 'pickup' ? 'ri:truck-line' : 'ri:calendar-check-line'"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="searchQuery"
      :search-items="searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :search-bar-props="{ span: 6, labelWidth: 90 }"
      :table-props="{
        rowKey: 'id',
        tableLayout: 'fixed',
        emptyText: `暂无${title}运单`,
        emptyDescription: '可调整运单号、联系人或时间条件后重新查询。'
      }"
      focusable
    />

    <AppointmentDrawer ref="drawerRef" :kind="kind" :permissions="permissions" @success="refresh" />
  </div>
</template>

<script setup lang="tsx">
  import { ElLink, ElMessage } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import { fetchAppointmentList } from '@tms/api'
  import type { AppointmentKind, AppointmentListRow, AppointmentSearchParams } from '@tms/api'
  import AppointmentDrawer from './appointment-drawer.vue'

  interface AppointmentPermissions {
    add: string
    edit: string
    delete: string
    confirm: string
    complete: string
    arrival: string
  }

  interface DrawerExpose {
    handleOpen: (row: Api.Tms.Waybill.WaybillRecord) => Promise<void>
  }

  type TableParams = AppointmentSearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const props = defineProps<{
    kind: AppointmentKind
    title: string
    permissions: AppointmentPermissions
  }>()

  const router = useRouter()
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<DrawerExpose>()
  const statusOptions = useDictionaryOptions('tmsAppointmentStatus')
  const searchQuery = ref<AppointmentSearchParams>({
    cargoKeyword: '',
    shippingKeyword: '',
    receivingKeyword: '',
    plannedTimeRange: [],
    waybillStatus: '__all__',
    appointmentStatus: ''
  })

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '运单号',
      key: 'cargoKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '原始单或调度子单号' }
    },
    {
      label: '发货方',
      key: 'shippingKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '姓名、电话或地址' }
    },
    {
      label: '收货方',
      key: 'receivingKeyword',
      type: 'input',
      props: { clearable: true, placeholder: '姓名、电话或地址' }
    },
    {
      label: '预约状态',
      key: 'appointmentStatus',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: statusOptions
      }
    },
    {
      label: props.kind === 'pickup' ? '发货时间' : '到货时间',
      key: 'plannedTimeRange',
      type: 'date',
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期',
        rangeSeparator: '至'
      }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      key: 'book-selected',
      permission: props.permissions.add,
      label: props.kind === 'pickup' ? '新增提货预约' : '按单预约',
      icon: 'ri:calendar-check-line',
      selectionRequired: true,
      buttonProps: { type: 'primary' },
      onClick: ({ selectedRows }) => {
        if (selectedRows.length !== 1) {
          ElMessage.warning('请只选择一张调度子单')
          return
        }
        const row = (selectedRows as AppointmentListRow[])[0]
        if (row) void drawerRef.value?.handleOpen(row)
      }
    }
  ])

  const displayTime = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '-',
    invalidText: '-',
    allowTimeOnly: false
  })

  const displayPair = (primary?: string | null, secondary?: string | null) => (
    <div class="min-w-0 leading-5">
      <strong class="block truncate font-medium" title={primary || ''}>
        {primary || '-'}
      </strong>
      {secondary ? (
        <span class="block truncate text-[var(--el-text-color-secondary)]" title={secondary}>
          {secondary}
        </span>
      ) : null}
    </div>
  )

  const columnsFactory = (): ColumnOption<AppointmentListRow>[] => [
    { type: 'selection', width: 48, fixed: 'left', reserveSelection: true },
    {
      prop: 'waybillNo',
      label: '调度运单号（子单号）',
      fixed: 'left',
      width: 190,
      formatter: (row) => (
        <ElLink
          type="primary"
          underline="never"
          onClick={() => void router.push({ name: 'TmsWaybillDetail', params: { id: row.id } })}
        >
          {row.waybillNo || '-'}
        </ElLink>
      )
    },
    {
      prop: 'sourceOrderNos',
      label: '原始运单',
      width: 180,
      formatter: (row) =>
        displayPair(
          (row.sourceOrderNos ?? [row.orderNo]).join('、'),
          (row.sourceOrderCount ?? row.sourceOrderNos?.length ?? 1) > 1
            ? `共 ${row.sourceOrderCount ?? row.sourceOrderNos?.length} 张原始单`
            : ''
        )
    },
    {
      prop: 'mergeNo',
      label: '合单号 / 合单信息',
      width: 160,
      formatter: (row) =>
        displayPair(
          row.executionKind === 'merge' ? row.waybillNo : '-',
          row.executionKind === 'merge'
            ? `${row.sourceOrderCount ?? row.sourceOrderNos?.length ?? 1} 张原始单`
            : row.executionKind === 'split'
              ? '拆单调度'
              : '普通调度'
        )
    },
    {
      prop: 'shippingContactName',
      label: '发货方信息',
      minWidth: 230,
      formatter: (row) =>
        displayPair(row.shippingContactName, row.shippingAddressDetail || row.shippingContactPhone)
    },
    {
      prop: 'receivingContactName',
      label: '收货方信息',
      minWidth: 230,
      formatter: (row) =>
        displayPair(
          row.receivingContactName,
          row.receivingAddressDetail || row.receivingContactPhone
        )
    },
    {
      prop: 'waybillInfo',
      label: '运单信息',
      width: 180,
      formatter: (row) =>
        displayPair(
          [row.originStation, row.destinationStation].filter(Boolean).join(' → '),
          `${row.cargoQuantityTotal ?? 0} 件 · ${row.cargoWeightTotal ?? 0} kg`
        )
    },
    {
      prop: 'plannedDepartureTime',
      label: '发货时间',
      width: 155,
      formatter: (row) => displayTime(row.plannedDepartureTime)
    },
    {
      prop: 'plannedArrivalTime',
      label: '到货时间',
      width: 155,
      formatter: (row) => displayTime(row.plannedArrivalTime)
    },
    {
      prop: 'appointmentStatus',
      label: `${props.title}状态`,
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="tmsAppointmentStatus"
          value={row.appointmentStatus}
          display="tag"
        />
      )
    },
    {
      prop: 'appointmentNo',
      label: '预约单号',
      width: 170,
      formatter: (row) => row.appointments[0]?.appointmentNo || '待预约'
    },
    {
      prop: 'appointmentInfo',
      label: '预约信息',
      width: 280,
      formatter: (row) => {
        const item = row.appointments[0]
        return item
          ? displayPair(
              `${item.driverName} · ${item.plateNo}`,
              `${item.vehicleType || '车型待补'} · ${item.loadCapacityTon ?? '-'} 吨 · ${item.vehicleLengthM ?? '-'} 米${row.appointments.length > 1 ? ` · 共 ${row.appointments.length} 条` : ''}`
            )
          : '待安排司机、车辆和预约时间'
      }
    },
    {
      prop: 'appointmentEntryTime',
      label: '预约进场时间',
      width: 155,
      formatter: (row) => displayTime(row.appointments[0]?.scheduledAt)
    },
    {
      prop: 'arrivalInfo',
      label: '到场信息',
      width: 230,
      formatter: (row) => {
        const item = row.appointments.find((record) => record.arrivedAt)
        return item
          ? displayPair(
              `${item.arrivalPlateNo || item.plateNo} · ${displayTime(item.arrivedAt)}`,
              props.kind === 'pickup'
                ? `装货 ${displayTime(item.loadingStartedAt)} 至 ${displayTime(item.loadingFinishedAt)} · 离场 ${displayTime(item.departedAt)}`
                : `月台 ${item.dockName || '未记录'}`
            )
          : '暂未记录到场'
      }
    },
    {
      prop: 'waybillStatus',
      label: '运单状态',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay
          dictCode="tmsWaybillStatus"
          value={row.waybillStatus || 'pending'}
          display="tag"
        />
      )
    },
    {
      prop: 'dispatchRemark',
      label: '备注',
      minWidth: 180,
      showOverflowTooltip: true,
      formatter: (row) =>
        row.appointments.find((item) => item.remark)?.remark || row.dispatchRemark || '-'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 86,
      fixed: 'right',
      formatter: (row) => (
        <ArtButtonTable
          type={row.appointments.length ? 'edit' : 'add'}
          permission={row.appointments.length ? props.permissions.edit : props.permissions.add}
          onClick={() => void drawerRef.value?.handleOpen(row)}
        />
      )
    }
  ]

  const fetchTableData = (params: TableParams) => fetchAppointmentList(props.kind, params)

  function refresh(): void {
    void tableQueryRef.value?.refreshData()
  }

  onActivated(refresh)
</script>
