import { computed, type ComputedRef, type Ref } from 'vue'
import { ElLink, ElMessage, ElTag } from 'element-plus'
import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
import type {
  ArtTableQueryExcelColumn,
  ArtTableQueryHeaderAction
} from '@/components/core/tables/art-table-query/index.vue'
import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
import ArtButtonMore, {
  type ButtonMoreItem
} from '@/components/core/forms/art-button-more/index.vue'
import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
import { ColumnOption } from '@/types'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { formatWithDayjs } from '@/utils/time'
import { formatArtValue, formatCompactNumberValue } from '@/utils/ui/format'
import { canViewField, formatSensitiveNumber, mergeFieldAccessMaps } from '@/utils/field-permission'
import { useUserStore } from '@/store/modules/user'
import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
import { useArtFeedback } from '@/hooks/core/useArtFeedback'
import { formatTransferStationRoute } from '@tms/views/modules/transfer-station-route'
import { printLoadedWaybill } from '../../modules/waybill-print'
import {
  cancelAssignedWaybill,
  cancelWaybillOrder,
  confirmWaybillAcceptance,
  exportWaybillList,
  fetchStationOptions,
  fetchWaybillList,
  type WaybillExportScope,
  type WaybillListScope
} from '@tms/api'

const { confirmAction, promptReason } = useArtFeedback()

export type WaybillMode = 'pending' | 'loaded'
export type WaybillRecord = Api.Tms.Waybill.WaybillRecord
export type WaybillSearchParams = Api.Tms.Waybill.WaybillSearchParams
export type TableParams = WaybillSearchParams &
  Pick<Api.Common.PaginationParams, 'current' | 'size'>

export interface WaybillDialogExpose {
  handleOpen: (data: { rows: WaybillRecord[]; mode: 'single' | 'batch' | 'merge' }) => Promise<void>
}

export interface SplitDialogExpose {
  handleOpen: (row: WaybillRecord) => Promise<void>
}

export interface CargoOperationDialogExpose {
  handleOpen: (data: {
    row: WaybillRecord
    operationType: Api.Tms.Waybill.CargoOperationType
    checkinOnly?: boolean
  }) => Promise<void>
}

export interface ExecutionOperationDialogExpose {
  handleOpen: (data: {
    row: WaybillRecord
    action: Api.Tms.Waybill.ExecutionAction
  }) => Promise<void>
}

export interface PickupAppointmentDrawerExpose {
  handleOpen: (row: WaybillRecord) => Promise<void>
}

export interface WaybillListContext {
  mode: WaybillMode
  fieldAccess: Ref<Api.Tms.Waybill.WaybillFieldAccessMap>
  router: RouteNavigator
  tableQueryRef: Ref<
    { refreshData: () => Promise<void>; refreshUpdate: () => Promise<void> } | undefined
  >
  dispatchDialogRef: Ref<WaybillDialogExpose | undefined>
  splitDialogRef?: Ref<SplitDialogExpose | undefined>
  cargoOperationDialogRef?: Ref<CargoOperationDialogExpose | undefined>
  executionOperationDialogRef?: Ref<ExecutionOperationDialogExpose | undefined>
  pickupAppointmentDrawerRef?: Ref<PickupAppointmentDrawerExpose | undefined>
  openOrderDetail?: (id: string, orderNo?: string) => void
  canPickupAppointment?: boolean
  canAccept?: boolean
  canLoading?: boolean
  canDepart?: boolean
  canArrive?: boolean
  canUnloading?: boolean
  canSign?: boolean
  canComplete?: boolean
  canCancel?: boolean
}

interface RouteNavigator {
  push: (target: { name: string; params?: Record<string, string> }) => Promise<unknown>
  resolve: (target: { name: string; params: Record<string, string> }) => { href: string }
}

export const WAYBILL_STATUS_ALL = '__all__'
export const loadedWaybillStatusTabValues = [
  'pending',
  'accepted',
  'loading',
  'transporting',
  'unloading',
  'signed',
  'completed',
  'cancelled'
]

const waybillDispatchStatusFallbackMap: Record<string, Api.DataCenter.DictListItem> = {
  pending: {
    name: '待配载',
    code: 'pending',
    status: '1',
    label: '待配载',
    value: 'pending',
    color: 'var(--el-color-primary)'
  },
  partial: {
    name: '部分调度',
    code: 'partial',
    status: '1',
    label: '部分调度',
    value: 'partial',
    color: 'var(--el-color-warning)'
  },
  loaded: {
    name: '已配载',
    code: 'loaded',
    status: '1',
    label: '已配载',
    value: 'loaded',
    color: 'var(--el-color-primary)'
  },
  transporting: {
    name: '运输中',
    code: 'transporting',
    status: '1',
    label: '运输中',
    value: 'transporting',
    color: 'var(--el-color-primary)'
  },
  completed: {
    name: '已完成',
    code: 'completed',
    status: '1',
    label: '已完成',
    value: 'completed',
    color: 'var(--el-color-success)'
  },
  cancelled: {
    name: '已取消',
    code: 'cancelled',
    status: '1',
    label: '已取消',
    value: 'cancelled',
    color: 'var(--el-color-danger)'
  }
}

export const createInitialWaybillSearch = (): WaybillSearchParams => ({
  cargoKeyword: '',
  shippingKeyword: '',
  receivingKeyword: '',
  paymentMethod: '',
  originStationId: '',
  destinationStationId: '',
  transferStationId: '',
  vehicleKeyword: '',
  plannedTimeRange: [],
  createTimeRange: [],
  waybillStatus: WAYBILL_STATUS_ALL
})

const createWaybillExcelColumns = (context: WaybillListContext): ArtTableQueryExcelColumn[] => [
  {
    key: context.mode === 'pending' ? 'orderNo' : 'waybillNo',
    title: context.mode === 'pending' ? '原始运单号' : '调度运单号'
  },
  ...(context.mode === 'loaded' ? [{ key: 'sourceOrderNos', title: '原始运单号' }] : []),
  { key: 'shippingContactName', title: '发货人' },
  { key: 'shippingCustomerName', title: '发货单位' },
  ...(canViewField(context.fieldAccess.value, 'shipperContact')
    ? [{ key: 'shippingContactPhone', title: '发货人电话' }]
    : []),
  ...(canViewField(context.fieldAccess.value, 'shipperAddress')
    ? [{ key: 'shippingAddressDetail', title: '发货人地址' }]
    : []),
  { key: 'originStation', title: '发货站' },
  { key: 'receivingContactName', title: '收货人' },
  { key: 'receivingCustomerName', title: '收货单位' },
  { key: 'destinationStation', title: '到货站' },
  {
    key: 'transferStation',
    title: '中转站',
    formatter: (value, row) => formatTransferStationRoute(row.transferStationNames, value)
  },
  { key: 'dispatchPlateNo', title: '配载车辆' },
  { key: 'dispatchDriverName', title: '司机' },
  ...(context.mode === 'loaded'
    ? [
        { key: 'driverOwnership', title: '司机归属' },
        { key: 'carrierName', title: '所属承运商' },
        { key: 'companyName', title: '所属公司' }
      ]
    : []),
  ...(canViewField(context.fieldAccess.value, 'driverPhone')
    ? [{ key: 'dispatchDriverPhone', title: '司机电话' }]
    : []),
  { key: 'plannedDepartureTime', title: '计划发车时间' },
  { key: 'plannedArrivalTime', title: '计划到达时间' },
  ...createFeeExcelColumns(context),
  { key: 'dispatchStatus', title: '配载状态' },
  { key: 'createTime', title: '开单时间' }
]

const feeFields = [
  ['transportFee', '基础运费'],
  ['deliveryFee', '配送费'],
  ['unloadingFee', '卸货费'],
  ['collectPaymentFee', '回款费'],
  ['transferFee', '中转费'],
  ['declaredValue', '声明价值'],
  ['insuranceFee', '保费'],
  ['packageFee', '包装费'],
  ['otherFee', '其他费用'],
  ['totalFee', '运费合计']
] as const

function createFeeExcelColumns(context: WaybillListContext): ArtTableQueryExcelColumn[] {
  return feeFields
    .filter(([field]) =>
      canViewField(
        context.fieldAccess.value,
        field === 'declaredValue' ? 'settlementAmounts' : 'freightAmounts'
      )
    )
    .map(([key, title]) => ({ key, title }))
}

export const createWaybillSearchItems = (
  paymentMethodOptions: ComputedRef<Api.DataCenter.DictListItem[]>,
  includeLoadedFilters = false
): ComputedRef<SearchFormItem[]> =>
  computed<SearchFormItem[]>(() => {
    const items: SearchFormItem[] = [
      {
        label: '运单号',
        key: 'cargoKeyword',
        type: 'input',
        props: { clearable: true, placeholder: '请输入运单号' }
      },
      {
        label: '发货人',
        key: 'shippingKeyword',
        type: 'input',
        props: { clearable: true, placeholder: '发货人姓名、电话或地址' }
      },
      {
        label: '收货人',
        key: 'receivingKeyword',
        type: 'input',
        props: { clearable: true, placeholder: '收货人姓名、电话或地址' }
      },
      {
        label: '付款方式',
        key: 'paymentMethod',
        type: 'select',
        props: { options: paymentMethodOptions.value, clearable: true, placeholder: '请选择' }
      },
      {
        label: '发货站',
        key: 'originStationId',
        type: 'select',
        api: fetchStationOptions,
        resultField: 'data',
        labelField: 'stationName',
        valueField: 'id',
        beforeFetch: (params) => ({ ...params, stationType: 'shipping' }),
        props: { filterable: true, clearable: true, placeholder: '请选择' }
      },
      {
        label: '到货站',
        key: 'destinationStationId',
        type: 'select',
        api: fetchStationOptions,
        resultField: 'data',
        labelField: 'stationName',
        valueField: 'id',
        beforeFetch: (params) => ({ ...params, stationType: 'arrival' }),
        props: { filterable: true, clearable: true, placeholder: '请选择' }
      },
      {
        label: '中转站',
        key: 'transferStationId',
        type: 'select',
        api: fetchStationOptions,
        resultField: 'data',
        labelField: 'stationName',
        valueField: 'id',
        beforeFetch: (params) => ({ ...params, stationType: 'transfer' }),
        props: { filterable: true, clearable: true, placeholder: '请选择' }
      },
      {
        label: '开单日期',
        key: 'createTimeRange',
        type: 'date',
        props: {
          type: 'daterange',
          valueFormat: 'YYYY-MM-DD',
          startPlaceholder: '开始日期',
          endPlaceholder: '结束日期',
          rangeSeparator: '至'
        }
      }
    ]

    if (includeLoadedFilters) {
      items.splice(
        4,
        0,
        {
          label: '车辆司机',
          key: 'vehicleKeyword',
          type: 'input',
          props: { clearable: true, placeholder: '车牌号、车型、司机或电话' }
        },
        {
          label: '发车日期',
          key: 'plannedTimeRange',
          type: 'date',
          props: {
            type: 'daterange',
            valueFormat: 'YYYY-MM-DD',
            startPlaceholder: '计划发车开始',
            endPlaceholder: '计划发车结束',
            rangeSeparator: '至'
          }
        }
      )
    }

    return items
  })

export const createWaybillModeParams = (
  params: WaybillSearchParams,
  mode: WaybillMode
): Partial<WaybillSearchParams> => {
  if (mode === 'pending') {
    const dispatchStatus = params.dispatchStatus
    return {
      dispatchStatus: undefined,
      dispatchStatuses:
        dispatchStatus === WAYBILL_STATUS_ALL ? undefined : [dispatchStatus || 'pending'],
      waybillStatus: undefined
    }
  }

  return {
    dispatchStatus: 'loaded',
    dispatchStatuses: undefined,
    waybillStatus:
      params.waybillStatus === WAYBILL_STATUS_ALL ? undefined : params.waybillStatus || undefined
  }
}

const getWaybillListScope = (mode: WaybillMode): WaybillListScope =>
  mode === 'pending' ? 'pending_waybill_list' : 'loaded_waybill_list'

const getWaybillExportScope = (mode: WaybillMode): WaybillExportScope =>
  mode === 'pending' ? 'pending_waybill_export' : 'loaded_waybill_export'

interface SecureWaybillListResult {
  data?: WaybillRecord[] | null
  fieldAccess?: Api.Tms.Waybill.WaybillFieldAccessMap
}

const syncWaybillFieldAccess = (
  context: Pick<WaybillListContext, 'fieldAccess'>,
  result: SecureWaybillListResult
): void => {
  context.fieldAccess.value = mergeFieldAccessMaps(
    result.fieldAccess,
    ...(result.data ?? []).map((row) => row.fieldAccess)
  )
}

export function fetchWaybillTableData(params: TableParams, mode: WaybillMode) {
  const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
  const modeParams = createWaybillModeParams(params, mode)
  return fetchWaybillList({ ...params, ...modeParams, from, to }, getWaybillListScope(mode))
}

export const createWaybillHeaderActions = (
  context: WaybillListContext
): ComputedRef<ArtTableQueryHeaderAction[]> =>
  computed<ArtTableQueryHeaderAction[]>(() => {
    const actions: ArtTableQueryHeaderAction[] = [
      {
        key: 'batch-dispatch',
        permission: 'TmsPendingWaybillList:Dispatch',
        label: '批量配载',
        icon: 'ri:truck-line',
        selectionRequired: true,
        buttonProps: { type: 'primary' },
        hidden: context.mode !== 'pending',
        onClick: async ({ selectedRows }) => {
          if ((selectedRows as WaybillRecord[]).some((row) => row.dispatchStatus !== 'pending')) {
            ElMessage.warning('部分调度的原始单请使用“继续拆单配载”')
            return
          }
          await context.dispatchDialogRef.value?.handleOpen({
            rows: selectedRows as WaybillRecord[],
            mode: 'batch'
          })
        }
      },
      {
        key: 'merge-dispatch',
        permission: 'TmsPendingWaybillList:Merge',
        label: '合单配载',
        icon: 'ri:git-merge-line',
        selectionRequired: true,
        hidden: context.mode !== 'pending',
        onClick: async ({ selectedRows }) => {
          const rows = selectedRows as WaybillRecord[]
          if (rows.length < 2) {
            ElMessage.warning('请至少选择两张原始运输单')
            return
          }
          if (rows.some((row) => row.dispatchStatus !== 'pending')) {
            ElMessage.warning('合单仅支持尚未调度的原始运输单')
            return
          }
          if (rows.some((row) => row.orderConfig?.allowConsolidation !== true)) {
            ElMessage.warning('所选原始单中存在未获客户允许合单的订单')
            return
          }
          await context.dispatchDialogRef.value?.handleOpen({ rows, mode: 'merge' })
        }
      },
      {
        permission:
          context.mode === 'pending'
            ? 'TmsPendingWaybillList:Export'
            : 'TmsLoadedWaybillList:Export',
        type: 'export',
        exportFilename: context.mode === 'pending' ? '待配载派车运单' : '运输运单',
        exportSheetName: context.mode === 'pending' ? '待配载派车运单' : '运输运单',
        exportColumns: () => createWaybillExcelColumns(context),
        exportApi: async ({ selectedIds, searchParams, maxRows }) => {
          const waybillSearchParams = searchParams as WaybillSearchParams
          const result = await exportWaybillList(
            {
              ...waybillSearchParams,
              ...createWaybillModeParams(waybillSearchParams, context.mode),
              ids: selectedIds.map(String),
              maxRows
            },
            getWaybillExportScope(context.mode)
          )
          syncWaybillFieldAccess(context, result)
          return result
        }
      }
    ]

    return actions
  })

export const createWaybillColumns = (
  context: WaybillListContext
): ColumnOption<WaybillRecord>[] => {
  const orderColumns: ColumnOption<WaybillRecord>[] = [
    { prop: 'shippingContactName', label: '发货人', width: 110, showOverflowTooltip: true },
    { prop: 'shippingCustomerName', label: '发货单位', minWidth: 150, showOverflowTooltip: true },
    ...(canViewField(context.fieldAccess.value, 'shipperContact')
      ? [
          {
            prop: 'shippingContactPhone',
            label: '发货人电话',
            width: 140,
            showOverflowTooltip: true
          }
        ]
      : []),
    ...(canViewField(context.fieldAccess.value, 'shipperAddress')
      ? [
          {
            prop: 'shippingAddressDetail',
            label: '发货人地址',
            minWidth: 220,
            showOverflowTooltip: true
          }
        ]
      : []),
    { prop: 'originStation', label: '发货站', width: 110, showOverflowTooltip: true },
    {
      prop: 'transferStation',
      label: '中转站',
      minWidth: 170,
      showOverflowTooltip: true,
      formatter: (row) => formatTransferStationRoute(row.transferStationNames, row.transferStation)
    },
    { prop: 'destinationStation', label: '到达站', width: 110, showOverflowTooltip: true },
    { prop: 'receivingContactName', label: '收货人', width: 110, showOverflowTooltip: true },
    { prop: 'receivingCustomerName', label: '收货单位', minWidth: 150, showOverflowTooltip: true },
    ...(canViewField(context.fieldAccess.value, 'receiverContact')
      ? [
          {
            prop: 'receivingContactPhone',
            label: '收货人电话',
            width: 140,
            showOverflowTooltip: true
          }
        ]
      : []),
    ...(canViewField(context.fieldAccess.value, 'receiverAddress')
      ? [
          {
            prop: 'receivingAddressDetail',
            label: '收货人地址',
            minWidth: 220,
            showOverflowTooltip: true
          }
        ]
      : []),
    {
      prop: 'cargoItems',
      label: '货物类型',
      width: 120,
      formatter: (row) =>
        formatArtValue(
          row.cargoItems
            ?.map((item) => item.cargoName)
            .find(Boolean)
            ?.trim(),
          'text',
          {
            emptyText: '-'
          }
        )
    },
    {
      prop: 'cargoQuantityTotal',
      label: '总数量',
      width: 100,
      formatter: (row) => formatCompactNumberValue(row.cargoQuantityTotal, 0)
    },
    {
      prop: 'cargoVolumeTotal',
      label: '总体积(方)',
      width: 120,
      formatter: (row) => formatCompactNumberValue(row.cargoVolumeTotal)
    },
    {
      prop: 'cargoWeightTotal',
      label: '总重量(KG)',
      width: 120,
      formatter: (row) => formatCompactNumberValue(row.cargoWeightTotal)
    },
    {
      prop: 'paymentMethod',
      label: '付款方式',
      width: 110,
      dict: { code: 'tmsOrderPaymentMethod', display: 'tag' }
    },
    ...feeFields
      .filter(([field]) =>
        canViewField(
          context.fieldAccess.value,
          field === 'declaredValue' ? 'settlementAmounts' : 'freightAmounts'
        )
      )
      .map(([prop, label]) => ({
        prop,
        label,
        width: 112,
        align: 'right' as const,
        formatter: (row: WaybillRecord) => formatSensitiveNumber(row[prop])
      })),
    { prop: 'createdByName', label: '开单人', width: 110, showOverflowTooltip: true },
    {
      prop: 'createTime',
      label: '开单时间',
      width: 170,
      formatter: (row) => formatWithDayjs(row.createTime) || '-'
    }
  ]
  const columns: ColumnOption<WaybillRecord>[] = [
    { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
    {
      prop: 'waybillNo',
      label: context.mode === 'pending' ? '原始运单号' : '调度运单号',
      fixed: 'left',
      width: 140,
      formatter: (row) => (
        <div class="flex min-w-0 items-center gap-1.5">
          <ElLink
            type="primary"
            underline="never"
            href={resolveDetailHref(context, row)}
            onClick={(event: MouseEvent) => {
              if (
                context.mode === 'pending' &&
                context.openOrderDetail &&
                !isModifiedLinkClick(event)
              ) {
                event.preventDefault()
                openDetail(context, row)
              }
            }}
          >
            {context.mode === 'pending' ? row.orderNo : row.waybillNo || row.orderNo}
          </ElLink>
          {row.hasReturnTrip && (
            <ElTag size="small" type="warning">
              返程
            </ElTag>
          )}
        </div>
      )
    }
  ]

  if (context.mode === 'pending') {
    columns.push(...orderColumns)
  } else {
    columns.push(
      {
        prop: 'sourceOrderNos',
        label: '原始运单',
        minWidth: 190,
        showOverflowTooltip: true,
        formatter: (row) => renderSourceOrders(context, row)
      },
      {
        prop: 'executionKind',
        label: '调度方式',
        minWidth: 130,
        showOverflowTooltip: true,
        formatter: (row) => {
          return row.hasReturnTrip
            ? '返程配货'
            : { single: '正向货配载', merge: '合单', split: '拆单' }[row.executionKind ?? 'single']
        }
      },
      {
        prop: 'dispatchMode',
        label: '调度对象',
        width: 100,
        formatter: (row) =>
          row.dispatchMode ? (
            <ArtDictDisplay dictCode="tmsDispatchOperatorMode" value={row.dispatchMode} />
          ) : (
            '-'
          )
      },
      ...orderColumns,
      { prop: 'dispatchDriverName', label: '司机', width: 100, showOverflowTooltip: true },
      {
        prop: 'driverOwnership',
        label: '司机归属',
        width: 110,
        formatter: (row) =>
          row.driverOwnership ? (
            <ArtDictDisplay dictCode="tmsDriverOwnership" value={row.driverOwnership} />
          ) : (
            '-'
          )
      },
      { prop: 'carrierName', label: '所属承运商', minWidth: 150, showOverflowTooltip: true },
      { prop: 'companyName', label: '所属公司', minWidth: 150, showOverflowTooltip: true },
      ...(canViewField(context.fieldAccess.value, 'driverPhone')
        ? [
            {
              prop: 'dispatchDriverPhone',
              label: '司机电话',
              width: 130,
              showOverflowTooltip: true
            }
          ]
        : []),
      {
        prop: 'originStation',
        label: '线路',
        width: 140,
        formatter: (row) => formatRoute(row)
      },
      { prop: 'dispatchPlateNo', label: '车牌', width: 130, showOverflowTooltip: true },
      {
        prop: 'plannedDepartureTime',
        label: '发车时间',
        width: 170,
        formatter: (row) => formatWithDayjs(row.plannedDepartureTime) || '-'
      }
    )
  }

  columns.push(
    {
      prop: 'dispatchStatus',
      label: context.mode === 'pending' ? '配载状态' : '运单状态',
      width: 100,
      fixed: 'right',
      formatter: (row) =>
        context.mode === 'pending' ? formatWaybillDispatchStatus(row) : formatWaybillStatus(row)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 120,
      fixed: 'right',
      formatter: (row) => (
        <div class="flex items-center">
          <ArtButtonTable
            type="view"
            permission={
              context.mode === 'pending'
                ? 'TmsPendingWaybillList:View'
                : 'TmsLoadedWaybillList:View'
            }
            onClick={() => openDetail(context, row)}
          />
          <ArtButtonMore
            list={getMoreActions(context, row)}
            onClick={(item: ButtonMoreItem) => handleMoreAction(context, row, item)}
          />
        </div>
      )
    }
  )

  return columns
}

function formatWaybillDispatchStatus(row: WaybillRecord) {
  const status = String(row.dispatchStatus || '').trim()
  const userStore = useUserStore()
  const fallbackItem = userStore.getDictItemByValue('tmsWaybillDispatchStatus', status)
    ? undefined
    : waybillDispatchStatusFallbackMap[status]

  return (
    <ArtDictDisplay
      dictCode="tmsWaybillDispatchStatus"
      value={status}
      item={fallbackItem}
      display="badge"
    />
  )
}

function formatWaybillStatus(row: WaybillRecord) {
  return <ArtDictDisplay dictCode="tmsWaybillStatus" value={row.waybillStatus} display="badge" />
}

function getMoreActions(context: WaybillListContext, row: WaybillRecord): ButtonMoreItem[] {
  const actions: ButtonMoreItem[] = []

  if (context.mode === 'pending') {
    if (['pending', 'partial'].includes(String(row.dispatchStatus))) {
      if (row.dispatchStatus === 'pending') {
        actions.push({
          key: 'dispatch',
          label: '配载',
          icon: 'ri:truck-line',
          auth: 'TmsPendingWaybillList:Dispatch'
        })
      }
      actions.push({
        key: 'split',
        label: row.dispatchStatus === 'partial' ? '继续拆单配载' : '拆单配载',
        icon: 'ri:git-branch-line',
        auth: 'TmsPendingWaybillList:Split'
      })
    }
    if (canCancelWaybillOrder(row)) {
      actions.push({
        key: 'cancel-order',
        label: '取消订单',
        icon: 'ri:close-circle-line',
        color: 'var(--el-color-danger)',
        auth: 'TmsPendingWaybillList:Cancel'
      })
    }

    return actions
  }

  if (context.canAccept && row.waybillStatus === 'pending') {
    actions.push({
      key: 'confirm-acceptance',
      label: '确认接单',
      icon: 'ri:checkbox-circle-line',
      auth: 'TmsWaybill:Accept'
    })
  }
  if (context.canPickupAppointment && row.waybillStatus === 'accepted') {
    actions.push({
      key: 'pickup-appointment',
      label: '提货预约',
      icon: 'ri:calendar-check-line',
      auth: 'TmsLoadedWaybillList:PickupAppointment'
    })
  }
  if (context.canDepart && row.waybillStatus === 'loading') {
    actions.push({
      key: 'confirm-departure',
      label: '确认发车',
      icon: 'ri:send-plane-line',
      auth: 'TmsWaybill:Depart'
    })
  }
  if (context.canLoading && ['accepted', 'loading'].includes(String(row.waybillStatus))) {
    actions.push({
      key: 'loading-operation',
      label: '装货',
      icon: 'ri:upload-cloud-2-line',
      auth: 'TmsWaybill:Loading'
    })
  }
  if (context.canArrive && row.waybillStatus === 'transporting') {
    actions.push({
      key: 'arrival-operation',
      label: '确认到达',
      icon: 'ri:map-pin-user-line',
      auth: 'TmsWaybill:Arrive'
    })
  }
  if (context.canUnloading && row.waybillStatus === 'unloading') {
    actions.push({
      key: 'unloading-operation',
      label: '卸货',
      icon: 'ri:download-cloud-2-line',
      auth: 'TmsWaybill:Unloading'
    })
  }
  if (
    context.canSign &&
    ((row.waybillStatus === 'unloading' &&
      row.driverWaybillUnloadingStatus === 'completed' &&
      !row.driverWaybillSignedAt) ||
      (['signed', 'completed'].includes(String(row.waybillStatus)) && row.hasReceiptException))
  ) {
    actions.push({
      key: 'signature-operation',
      label: row.driverWaybillSignedAt ? '复核签收' : '签收',
      icon: 'ri:quill-pen-line',
      auth: 'TmsWaybill:Sign'
    })
  }
  if (
    context.canComplete &&
    ['signed', 'completed'].includes(String(row.waybillStatus)) &&
    row.driverWaybillSignedAt &&
    !row.driverWaybillReturnTime
  ) {
    actions.push({
      key: 'completion-operation',
      label: row.waybillStatus === 'completed' ? '补录回场' : '确认回场',
      icon: row.waybillStatus === 'completed' ? 'ri:history-line' : 'ri:home-4-line',
      auth: 'TmsWaybill:Complete',
      color: row.waybillStatus === 'completed' ? 'var(--el-color-warning)' : undefined
    })
  }
  actions.push({
    key: 'print',
    label: '打印',
    icon: 'ri:printer-line',
    auth: 'TmsLoadedWaybillList:Print'
  })
  if (context.canCancel && canCancelWaybillOrder(row)) {
    actions.push({
      key: 'cancel-order',
      label: '取消订单',
      icon: 'ri:close-circle-line',
      color: 'var(--el-color-danger)',
      auth: 'TmsWaybill:Cancel'
    })
  }

  return actions
}

function handleMoreAction(
  context: WaybillListContext,
  row: WaybillRecord,
  item: ButtonMoreItem
): void {
  const actionMap: Record<string, () => void> = {
    dispatch: () => openDispatch(context, row),
    split: () => void context.splitDialogRef?.value?.handleOpen(row),
    'confirm-acceptance': () => void handleConfirmAcceptance(context, row),
    'pickup-appointment': () => void context.pickupAppointmentDrawerRef?.value?.handleOpen(row),
    'confirm-departure': () =>
      void context.executionOperationDialogRef?.value?.handleOpen({ row, action: 'departure' }),
    'loading-operation': () =>
      void context.cargoOperationDialogRef?.value?.handleOpen({ row, operationType: 'loading' }),
    'unloading-operation': () =>
      void context.cargoOperationDialogRef?.value?.handleOpen({ row, operationType: 'unloading' }),
    'arrival-operation': () =>
      void context.cargoOperationDialogRef?.value?.handleOpen({
        row,
        operationType: 'unloading',
        checkinOnly: true
      }),
    'signature-operation': () =>
      void context.executionOperationDialogRef?.value?.handleOpen({ row, action: 'signature' }),
    'completion-operation': () =>
      void context.executionOperationDialogRef?.value?.handleOpen({ row, action: 'completion' }),
    print: () => handlePrint(context, row),
    'cancel-order': () => void handleCancelOrder(context, row)
  }

  actionMap[String(item.key)]?.()
}

function openDispatch(context: WaybillListContext, row: WaybillRecord): void {
  void context.dispatchDialogRef.value?.handleOpen({ rows: [row], mode: 'single' })
}

function openDetail(context: WaybillListContext, row: WaybillRecord): void {
  if (context.mode === 'loaded' && row.driverWaybillId) {
    void context.router.push({
      name: 'TmsWaybillDetail',
      params: { id: row.driverWaybillId }
    })
    return
  }
  if (!row.id) return
  if (context.openOrderDetail) {
    context.openOrderDetail(row.id, row.orderNo)
    return
  }
  void context.router.push({
    name: 'TmsOrderDetail',
    params: { id: row.id }
  })
}

function resolveDetailHref(context: WaybillListContext, row: WaybillRecord): string | undefined {
  if (context.mode === 'loaded' && row.driverWaybillId) {
    return context.router.resolve({ name: 'TmsWaybillDetail', params: { id: row.driverWaybillId } })
      .href
  }
  return row.id
    ? context.router.resolve({ name: 'TmsOrderDetail', params: { id: row.id } }).href
    : undefined
}

function isModifiedLinkClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
}

function renderSourceOrders(context: WaybillListContext, row: WaybillRecord) {
  const refs = row.sourceOrderRefs?.length
    ? row.sourceOrderRefs
    : (row.sourceOrderNos?.length ? row.sourceOrderNos : [row.orderNo]).map((orderNo) => ({
        id: (row.sourceOrderNos?.length ?? 1) === 1 ? row.sourceOrderId : null,
        orderNo
      }))
  return (
    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {refs.map((source, index) =>
        source.id ? (
          <ElLink
            key={`${source.id}-${index}`}
            onClick={(event: MouseEvent) => {
              if (context.openOrderDetail && source.id && !isModifiedLinkClick(event)) {
                event.preventDefault()
                context.openOrderDetail(source.id, source.orderNo)
              }
            }}
            type="primary"
            underline="never"
            href={
              context.router.resolve({ name: 'TmsOrderDetail', params: { id: source.id } }).href
            }
          >
            {source.orderNo}
          </ElLink>
        ) : (
          <span key={`${source.orderNo}-${index}`}>{source.orderNo}</span>
        )
      )}
    </div>
  )
}

async function handleCancelOrder(context: WaybillListContext, row: WaybillRecord): Promise<void> {
  if (!row.id || !canCancelWaybillOrder(row)) return
  try {
    if (context.mode === 'loaded' && row.driverWaybillId) {
      const reason = await promptReason(
        `取消运单“${row.orderNo}”后不可继续执行，请填写取消原因。`,
        '取消运单',
        {
          confirmButtonText: '确认取消',
          cancelButtonText: '关闭',
          placeholder: '例如：客户取消发运，调度已核实',
          minLength: 4,
          minLengthMessage: '至少填写 4 个字'
        }
      )
      await cancelAssignedWaybill(row.driverWaybillId, reason)
    } else {
      await confirmAction(`确定取消运单“${row.orderNo}”吗？`, '取消运单', {
        confirmButtonText: '取消运单',
        cancelButtonText: '关闭',
        confirmButtonType: 'danger'
      })
      await cancelWaybillOrder(row.id)
    }
    await context.tableQueryRef.value?.refreshUpdate()
  } catch {
    // 用户取消操作时不提示。
  }
}

function canCancelWaybillOrder(row: WaybillRecord): boolean {
  return !['signed', 'completed', 'cancelled'].includes(
    String(row.waybillStatus || row.orderStatus || '')
  )
}

async function handleConfirmAcceptance(
  context: WaybillListContext,
  row: WaybillRecord
): Promise<void> {
  if (!row.driverWaybillId || row.waybillStatus !== 'pending') return
  try {
    await confirmAction(
      `确认接收运单“${row.orderNo}”吗？确认后 Web 端和司机端都会进入待提货状态。`,
      '确认接单',
      {
        confirmButtonText: '确认接单',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await confirmWaybillAcceptance(row.driverWaybillId)
    await context.tableQueryRef.value?.refreshUpdate()
  } catch {
    // 用户取消操作时不需要提示。
  }
}

function handlePrint(context: WaybillListContext, row: WaybillRecord): void {
  const { brandName, websiteConfig } = useWebsiteConfig()
  const detailId = row.driverWaybillId || row.id
  const detailUrl = detailId
    ? new URL(
        context.router.resolve({
          name: row.driverWaybillId ? 'TmsWaybillDetail' : 'TmsOrderDetail',
          params: { id: detailId }
        }).href,
        window.location.href
      ).href
    : undefined
  const userStore = useUserStore()
  printLoadedWaybill(row, {
    brandName: brandName.value,
    logoUrl: websiteConfig.value.logoUrl,
    detailUrl,
    label: (dictCode, value) =>
      userStore.getDictItemByValue(dictCode, value ?? undefined)?.label || value || ''
  })
}

function formatRoute(row: WaybillRecord): string {
  return [
    row.originStation,
    formatTransferStationRoute(row.transferStationNames, row.transferStation, ''),
    row.destinationStation
  ]
    .filter(Boolean)
    .join(' → ')
}
