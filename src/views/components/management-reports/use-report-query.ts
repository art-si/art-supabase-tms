import { nextTick, reactive, readonly, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { useRoute } from 'vue-router'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
import {
  fetchManagementReport,
  type ManagementReportResult,
  type ReportRow
} from '../../../api/modules/management-reports'
import type { ManagementReportSlug } from './catalog'
export interface ReportSearch {
  dates: string[]
  keyword: string
}
export function useReportQuery(
  report: ManagementReportSlug,
  period: 'two-months' | 'month' | 'week' | 'day',
  fetchReport: typeof fetchManagementReport = fetchManagementReport
) {
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const route = useRoute()
  const pageRouteName = route.name
  const scope = useTenantScopeStore()
  const overview = reactive<{
    loading: boolean
    error: string
    summary: ReportRow
    trend: ManagementReportResult['trend']
  }>({ loading: false, error: '', summary: {}, trend: [] })
  function initialSearch(): ReportSearch {
    const starts = {
      'two-months': dayjs().subtract(1, 'month').startOf('month'),
      month: dayjs().startOf('month'),
      week: dayjs().subtract(6, 'day'),
      day: dayjs()
    }
    return {
      dates: [
        typeof route.query.start === 'string'
          ? route.query.start
          : starts[period].format('YYYY-MM-DD'),
        typeof route.query.end === 'string' ? route.query.end : dayjs().format('YYYY-MM-DD')
      ],
      keyword: typeof route.query.keyword === 'string' ? route.query.keyword : ''
    }
  }
  const search = reactive(initialSearch())
  const appliedSearch = reactive(initialSearch())
  const searchItems: SearchFormItem[] = [
    {
      key: 'dates',
      label: '统计日期',
      type: 'date',
      span: 8,
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期',
        clearable: false
      }
    },
    {
      key: 'keyword',
      label: '关键词',
      type: 'input',
      span: 8,
      props: { placeholder: '订单 / 车牌 / 司机 / 客户', clearable: true }
    }
  ]
  const searchBarProps = { span: 8, labelWidth: 80, isExpand: true, showExpand: false }
  const tableProps = {
    rowKey: '_key',
    emptyText: '暂无符合条件的报表数据',
    emptyDescription: '请调整统计日期或关键词后重新查询。'
  }
  let generation = 0
  async function fetchRows(params: {
    current?: number
    size?: number
    dates?: string[]
    keyword?: string
  }) {
    const token = ++generation
    Object.assign(overview, { loading: true, error: '' })
    try {
      const dates = [...(params.dates ?? search.dates)]
      const keyword = params.keyword ?? ''
      const result = await fetchReport({
        report,
        start: dates[0],
        end: dates[1],
        keyword,
        current: params.current,
        size: params.size
      })
      if (token === generation) {
        Object.assign(overview, { summary: result.summary, trend: result.trend })
        Object.assign(appliedSearch, { dates, keyword })
      }
      return {
        records: result.records,
        total: result.total,
        current: params.current ?? 1,
        size: params.size ?? 20
      }
    } catch (cause) {
      if (token === generation)
        Object.assign(overview, { error: '报表读取失败，请检查权限后重试', summary: {}, trend: [] })
      throw cause
    } finally {
      if (token === generation) overview.loading = false
    }
  }
  function reload() {
    void tableQueryRef.value?.refreshContext()
  }
  watch(
    () => scope.effectiveTenantId,
    () => {
      generation++
      Object.assign(overview, { summary: {}, trend: [] })
      reload()
    }
  )
  watch(
    () => route.query,
    async () => {
      if (route.name !== pageRouteName) return
      Object.assign(search, initialSearch())
      await nextTick()
      void tableQueryRef.value?.getData()
    }
  )
  return {
    tableQueryRef,
    overview,
    search,
    appliedSearch: readonly(appliedSearch),
    searchItems,
    searchBarProps,
    tableProps,
    fetchRows,
    reload
  }
}
