<template>
  <ArtPermissionGuard permission="TmsTransportEvent:View">
    <div class="transport-event-page business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="TRANSPORT EVENT STREAM"
        title="运输事件中心"
        description="集中检索运单接单、装货、发车、到达、签收等全链路事件，快速定位延误与异常状态变更。"
        icon="ri:route-line"
        :tags="[
          { label: '全链路轨迹', type: 'primary' },
          { label: '租户数据隔离', type: 'success' },
          { label: '异常优先', type: 'warning' }
        ]"
        :metrics="metrics"
        refreshable
        refresh-label="刷新运输事件"
        :refresh-loading="summaryLoading"
        @refresh="refreshAll"
      />

      <ElAlert
        v-if="summaryError"
        type="warning"
        show-icon
        :closable="false"
        :title="summaryError"
      />

      <section class="transport-event-page__workspace art-card-xs">
        <ArtTableQuery
          ref="tableRef"
          v-model="table.search"
          :search-items="searchItems"
          :api-fn="fetchTableData"
          :columns-factory="columnsFactory"
          :search-bar-props="{ span: 8, labelWidth: 82 }"
          :table-props="{
            rowKey: 'id',
            tableLayout: 'fixed',
            emptyText: '暂无运输事件',
            emptyDescription: '调整事件类型或日期范围后重试。'
          }"
          focusable
        />
      </section>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ElTag } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { fetchTransportEventList, fetchTransportEventOverview } from '@tms/api'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'TmsTransportEvent' })

  type EventRecord = Api.Tms.TransportEvent.Record
  type SearchParams = Api.Tms.TransportEvent.SearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const { hasAnyAuth } = useAuth()
  const tableRef = ref<ArtTableQueryExpose>()
  const summaryLoading = ref(false)
  const summaryError = ref('')
  const overview = ref<Api.Tms.TransportEvent.Overview>({
    eventCount7d: 0,
    activeWaybillCount: 0,
    delayedWaybillCount: 0,
    exceptionEventCount: 0
  })
  const table = reactive<{ search: SearchParams }>({
    search: { keyword: '', eventType: '', eventTimeRange: [] }
  })
  const canViewWaybill = computed(() =>
    hasAnyAuth(['TmsPendingWaybillList:View', 'TmsLoadedWaybillList:View'])
  )

  const eventOptions = useDictionaryOptions('tmsTransportEventType')
  const eventLabels = computed(() =>
    Object.fromEntries(eventOptions.map((item) => [item.value, item.label]))
  )
  const searchItems: SearchFormItem[] = [
    {
      label: '事件类型',
      key: 'eventType',
      type: 'select',
      props: { options: eventOptions, clearable: true, placeholder: '全部事件' }
    },
    {
      label: '发生日期',
      key: 'eventTimeRange',
      type: 'daterange',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    {
      label: '关键字',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '操作人、地点或备注' }
    }
  ]
  const metrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      key: 'events',
      label: '近 7 日事件',
      value: overview.value.eventCount7d,
      description: '运输节点留痕',
      icon: 'ri:pulse-line',
      tone: 'primary',
      loading: summaryLoading.value
    },
    {
      key: 'active',
      label: '活跃运单',
      value: overview.value.activeWaybillCount,
      description: '待接单至卸货中',
      icon: 'ri:truck-line',
      tone: 'success',
      loading: summaryLoading.value
    },
    {
      key: 'delayed',
      label: '预计延误',
      value: overview.value.delayedWaybillCount,
      description: '已超过计划卸货时间',
      icon: 'ri:timer-flash-line',
      tone: overview.value.delayedWaybillCount ? 'danger' : 'info',
      loading: summaryLoading.value
    },
    {
      key: 'exception',
      label: '状态异常变更',
      value: overview.value.exceptionEventCount,
      description: '近 7 日需复核',
      icon: 'ri:error-warning-line',
      tone: overview.value.exceptionEventCount ? 'warning' : 'info',
      loading: summaryLoading.value
    }
  ])

  function eventTagType(eventType: string): 'success' | 'warning' | 'danger' | 'info' {
    if (['signed', 'completed'].includes(eventType)) return 'success'
    if (eventType === 'status_changed') return 'danger'
    if (['departed', 'arrived'].includes(eventType)) return 'warning'
    return 'info'
  }

  function columnsFactory(): ColumnOption<EventRecord>[] {
    return [
      {
        prop: 'waybill',
        label: '运单',
        minWidth: 190,
        fixed: 'left',
        formatter: (row) => (
          <BusinessRecordLink
            label={row.waybill?.waybillNo || '--'}
            description={
              row.waybill
                ? `${row.waybill.originCity || '--'} → ${row.waybill.destinationCity || '--'}`
                : '运单信息不可用'
            }
            title={`查看运单 ${row.waybill?.waybillNo || ''} 详情`}
            to={
              canViewWaybill.value && row.waybill?.id
                ? `/tms/waybill-management/detail/${row.waybill.id}`
                : undefined
            }
            compact
          />
        )
      },
      {
        prop: 'eventType',
        label: '事件',
        width: 125,
        formatter: (row) => (
          <ElTag type={eventTagType(row.eventType)} effect="light" size="small" round>
            {Object.hasOwn(eventLabels.value, row.eventType)
              ? eventLabels.value[row.eventType]
              : '事件待核对'}
          </ElTag>
        )
      },
      {
        prop: 'eventTime',
        label: '发生时间',
        width: 165,
        formatter: (row) => formatWithDayjs(row.eventTime)
      },
      {
        prop: 'operatorName',
        label: '操作人',
        width: 120,
        formatter: (row) => row.operatorName || '--'
      },
      {
        prop: 'locationText',
        label: '地点',
        minWidth: 180,
        formatter: (row) => row.locationText || '--'
      },
      { prop: 'remark', label: '事件说明', minWidth: 210, formatter: (row) => row.remark || '--' },
      {
        prop: 'risk',
        label: '时效状态',
        width: 120,
        formatter: (row) =>
          row.delayed ? (
            <ElTag type="danger" effect="light" size="small" round>
              <ArtSvgIcon icon="ri:timer-flash-line" />
              预计延误
            </ElTag>
          ) : row.waybill?.plannedUnloadTime ? (
            <span>{formatTableDateTime(row.waybill.plannedUnloadTime)}</span>
          ) : (
            <span>--</span>
          )
      }
    ]
  }

  function fetchTableData(params: TableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchTransportEventList({ ...params, from, to })
  }

  async function loadOverview(): Promise<void> {
    summaryLoading.value = true
    summaryError.value = ''
    try {
      overview.value = await fetchTransportEventOverview()
    } catch (error) {
      summaryError.value = getFriendlySupabaseErrorMessage(error, '运输事件统计加载失败')
    } finally {
      summaryLoading.value = false
    }
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([loadOverview(), tableRef.value?.getData()])
  }

  onMounted(() => void loadOverview())
</script>

<style scoped lang="scss">
  .transport-event-page {
    &__workspace {
      min-width: 0;
      padding: 18px;
    }
  }
</style>
