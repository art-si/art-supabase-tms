import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import type { QueryResult } from '@/types/api/response'
import { useSupabase } from '@/hooks/core/useSupabase'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import {
  applyCreateTimeRange,
  normalizeBooleanFilter,
  withRequestOptions,
  type SupabaseQueryLike
} from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'

type StationRecord = Api.Tms.Station.StationRecord
type StationSearchParams = Api.Tms.Station.StationSearchParams
type StationOptionSearchParams = Api.Tms.Station.StationOptionSearchParams
type StationSavePayload = Api.Tms.Station.StationSavePayload

interface WriteOptions {
  showMessage?: boolean
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const stationSelect = (withRoleFilter: boolean, fields = '*'): string => `
  ${fields},
  stationRoles:tms_station_role(role_type)
  ${withRoleFilter ? ', stationRoleFilter:tms_station_role!inner(role_type)' : ''}
`

const applyStationFilters = <TQuery extends SupabaseQueryLike>(
  query: TQuery,
  params: StationSearchParams
): TQuery => {
  const { stationType, enabled, keyword, createTimeRange } = params
  if (stationType) query = query.eq('stationRoleFilter.role_type', stationType)
  const enabledValue = normalizeBooleanFilter(enabled)
  if (enabledValue !== undefined) query = query.eq('enabled', enabledValue)
  if (keyword) {
    query = query.or(
      buildOrIlikeFilter(
        ['station_code', 'station_name', 'region_code', 'manager_name', 'contact_phone'],
        keyword
      )
    )
  }
  return applyCreateTimeRange(query, createTimeRange)
}

export async function fetchStationList(params: StationSearchParams, options?: ApiRequestOptions) {
  const { from = 0, to = 9 } = params
  let query = supabase
    .from('mdm_station')
    .select(stationSelect(Boolean(params.stationType)), { count: 'exact' })
    .order('sort', { ascending: true })
    .order('station_code', { ascending: true })
    .range(from, to)

  query = applyStationFilters(query, params)
  return await responseHandle<StationRecord[]>(() => withRequestOptions(query, options), {
    showErrorMessage: true
  })
}

export async function exportStationList(
  params: StationSearchParams & { ids?: string[]; maxRows?: number }
) {
  const { ids, maxRows = 10000 } = params
  const withRoleFilter = !ids?.length && Boolean(params.stationType)
  let query = supabase
    .from('mdm_station')
    .select(stationSelect(withRoleFilter))
    .order('sort', { ascending: true })
    .order('station_code', { ascending: true })
    .limit(maxRows)

  query = ids?.length ? query.in('id', ids) : applyStationFilters(query, params)
  return await responseHandle<StationRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchStationOptions(
  params: StationOptionSearchParams = {},
  options?: ApiRequestOptions
) {
  try {
    const data = await loadAllDocumentPages<
      Api.Tms.Order.StationOption,
      StationOptionSearchParams & { from?: number; to?: number }
    >(async ({ from = 0, to = 499, tenantId, stationType, keyword }) => {
      const withRoleFilter = Boolean(stationType)
      let query = supabase
        .from('mdm_station')
        .select(
          stationSelect(
            withRoleFilter,
            'id, station_code, station_name, station_type, region_code, region, address_detail, longitude, latitude'
          ),
          { count: 'exact' }
        )
        .eq('enabled', true)
        .order('sort', { ascending: true })
        .order('station_code', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)

      if (tenantId) query = query.eq('tenant_id', tenantId)
      if (stationType) query = query.eq('stationRoleFilter.role_type', stationType)
      if (keyword) {
        query = query.or(
          buildOrIlikeFilter(['station_code', 'station_name', 'region_code'], keyword)
        )
      }

      return await responseHandle<Api.Tms.Order.StationOption[]>(
        () => withRequestOptions(query, options),
        {
          showErrorMessage: true
        }
      )
    }, params)
    return { data, total: data.length, error: null } satisfies QueryResult<
      Api.Tms.Order.StationOption[]
    >
  } catch (error) {
    return { data: null, error } satisfies QueryResult<Api.Tms.Order.StationOption[]>
  }
}

export async function fetchStationDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const { data, error } = await fetchAllRangePages<MasterDataDeleteDependencyDetail>(
    ({ from, to }) =>
      responseHandle<MasterDataDeleteDependencyDetail[]>(
        () =>
          supabase.rpc('get_tms_station_delete_dependency_details', { p_ids: ids }).range(from, to),
        { showErrorMessage: false }
      )
  )
  if (error || !data) throw new Error('站点关联订单检查失败，请重试', { cause: error })
  return data
}

const createSaveRpcParams = (params: StationSavePayload) => {
  const { stationTypes, ...station } = params
  return {
    p_station: keysToSnakeDeep(station),
    p_role_types: stationTypes
  }
}

export async function addStation(params: StationSavePayload, options: WriteOptions = {}) {
  return await responseHandle<StationRecord>(
    () => supabase.rpc('save_tms_station', createSaveRpcParams(params)),
    { showMessage: options.showMessage ?? true, breakReturn: true }
  )
}

export async function editStation(params: StationSavePayload) {
  return await responseHandle<StationRecord>(
    () => supabase.rpc('save_tms_station', createSaveRpcParams(params)),
    { showMessage: true, breakReturn: true }
  )
}

export async function updateStationEnabled(id: string, enabled: boolean) {
  return await responseHandle(() => supabase.from('mdm_station').update({ enabled }).eq('id', id), {
    showMessage: true,
    breakReturn: true
  })
}

export async function deleteStation(id: string) {
  return await responseHandle(
    () => supabase.from('mdm_station').delete({ count: 'exact' }).eq('id', id),
    {
      showMessage: true,
      showErrorMessage: false,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: '站点已不存在或当前账号无权删除，请刷新列表后重试。'
    }
  )
}

export async function deleteStationBatch(ids: string[]) {
  return await responseHandle(
    () => supabase.from('mdm_station').delete({ count: 'exact' }).in('id', ids),
    {
      showMessage: true,
      showErrorMessage: false,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: '部分站点未删除，请刷新列表核对权限、关联和状态后重试。'
    }
  )
}

export async function importStations(rows: StationSavePayload[]) {
  return await responseHandle(
    () => supabase.rpc('import_tms_stations', { p_rows: keysToSnakeDeep(rows) }),
    { breakReturn: true }
  )
}
