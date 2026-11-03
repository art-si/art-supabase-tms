import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNullableText } from '@/utils/form/normalize'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import { buildSupabasePageRange, fetchAllRangePages } from '@/utils/supabase/pagination'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import type {
  MaterialSelectCategory,
  MaterialSelectRecord
} from '@/components/business/art-material-select/types'
import {
  applyCreateTimeRange,
  normalizeBooleanFilter,
  withRequestOptions,
  type SupabaseQueryLike
} from '@/api/providers/supabase/query'
import type { ApiRequestOptions } from '@/types/api/request'

type Cargo = Api.Tms.BasicData.Cargo
type CargoSearchParams = Api.Tms.BasicData.CargoSearchParams

export interface CargoMaterialOption extends MaterialSelectRecord {
  id: string
  tenantId: string
  materialCode: string
  materialName: string
  specificationModel?: string | null
  basicUnit: string
  materialGroupId?: string | null
  categoryId?: string | null
  description?: string | null
  category?: { categoryName: string } | null
  baseUnit?: { unitName: string; symbol?: string | null } | null
}

export async function fetchCargoMaterialPage(
  params: DataSelectFetchParams,
  tenantId: string,
  categoryIds?: string[]
): Promise<{ data: CargoMaterialOption[]; total: number }> {
  const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  let query = supabase
    .from('mdm_material')
    .select(
      'id,tenant_id,material_code,material_name,description,specification_model,basic_unit,material_group_id,category_id,category:mdm_material_category(category_name),baseUnit:mdm_unit_of_measure!mdm_material_base_unit_fkey(unit_name,symbol)',
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'enabled')
    .order('material_code')
    .order('id')
    .range(from, to)
  if (categoryIds?.length) query = query.in('category_id', categoryIds)
  if (params.keyword) {
    query = query.or(
      buildOrIlikeFilter(
        ['material_code', 'material_name', 'description', 'specification_model'],
        params.keyword
      )
    )
  }
  const result = await responseHandle<CargoMaterialOption[]>(() => query, {
    breakReturn: true,
    showErrorMessage: false,
    errorMessage: '物料编码加载失败，请重试'
  })
  return { data: result.data ?? [], total: result.total ?? 0 }
}

export async function fetchCargoMaterialCategories(
  tenantId: string
): Promise<MaterialSelectCategory[]> {
  const result = await fetchAllRangePages<MaterialSelectCategory>(({ from, to }) =>
    responseHandle<MaterialSelectCategory[]>(
      () =>
        supabase
          .from('mdm_material_category')
          .select('id,parent_id,category_code,category_name')
          .eq('tenant_id', tenantId)
          .eq('status', 'enabled')
          .order('sort')
          .order('id')
          .range(from, to),
      { breakReturn: true, showErrorMessage: false, errorMessage: '物料分类加载失败，请重试' }
    )
  )
  if (result.error) throw result.error
  return result.data ?? []
}

interface WriteOptions {
  showMessage?: boolean
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()
const cargoSelect =
  '*,material:mdm_material!mdm_cargo_material_tenant_fkey(id,material_code,material_name,specification_model,basic_unit,material_group_id,baseUnit:mdm_unit_of_measure!mdm_material_base_unit_fkey(unit_name,symbol))'
const cargoWriteKeys = [
  'tenantId',
  'materialId',
  'materialGroupId',
  'lengthM',
  'widthM',
  'heightM',
  'volumeM3',
  'weightKg',
  'valueAmount',
  'enabled',
  'remark'
] as const satisfies readonly (keyof Cargo)[]

const cargoPayload = (cargo: Cargo): Record<string, unknown> => {
  const payload = Object.fromEntries(
    cargoWriteKeys.filter((key) => cargo[key] !== undefined).map((key) => [key, cargo[key]])
  )
  // ArtForm keeps a cleared treeSelect as ''; PostgreSQL UUID columns require null.
  if ('materialGroupId' in payload) {
    payload.materialGroupId = normalizeNullableText(cargo.materialGroupId)
  }
  return keysToSnakeDeep(payload)
}

export async function fetchCargoMaterialOptions(tenantId: string): Promise<CargoMaterialOption[]> {
  return loadAllDocumentPages<CargoMaterialOption, { from?: number; to?: number }>(
    ({ from = 0, to = 499 }) =>
      responseHandle<CargoMaterialOption[]>(
        () =>
          supabase
            .from('mdm_material')
            .select(
              'id,tenant_id,material_code,material_name,specification_model,basic_unit,material_group_id,baseUnit:mdm_unit_of_measure!mdm_material_base_unit_fkey(unit_name,symbol)',
              { count: 'exact' }
            )
            .eq('tenant_id', tenantId)
            .eq('status', 'enabled')
            .order('material_code')
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: false }
      ),
    {}
  )
}

const applyCargoFilters = <TQuery extends SupabaseQueryLike>(
  query: TQuery,
  params: CargoSearchParams
): TQuery => {
  const { tenantId, materialGroupIds, enabled, keyword, createTimeRange, recordId } = params
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (recordId) query = query.eq('id', recordId)
  if (materialGroupIds?.length) query = query.in('material_group_id', materialGroupIds)
  const enabledValue = normalizeBooleanFilter(enabled)
  if (enabledValue !== undefined) query = query.eq('enabled', enabledValue)
  if (keyword) {
    query = query.or(
      buildOrIlikeFilter(['cargo_name', 'cargo_code', 'spec_model', 'remark'], keyword)
    )
  }
  return applyCreateTimeRange(query, createTimeRange)
}

export async function fetchCargoList(params: CargoSearchParams, options?: ApiRequestOptions) {
  const { from = 0, to = 9 } = params
  let query = supabase
    .from('mdm_cargo')
    .select(cargoSelect, { count: 'exact' })
    .order('create_time', { ascending: false })
    .range(from, to)
  query = applyCargoFilters(query, params)
  return await responseHandle<Cargo[]>(() => withRequestOptions(query, options), {
    showErrorMessage: true
  })
}

export async function exportCargoList(
  params: CargoSearchParams & { ids?: string[]; maxRows?: number }
) {
  const { ids, maxRows = 10000 } = params
  let query = supabase
    .from('mdm_cargo')
    .select(cargoSelect)
    .order('create_time', { ascending: false })
    .limit(maxRows)
  query = ids?.length ? query.in('id', ids) : applyCargoFilters(query, params)
  return await responseHandle<Cargo[]>(() => query, {
    showErrorMessage: true
  })
}

export async function addCargo(params: Cargo, options: WriteOptions = {}) {
  return await responseHandle<Cargo>(
    () => supabase.from('mdm_cargo').insert(cargoPayload(params)).select(cargoSelect).single(),
    { showMessage: options.showMessage ?? true, breakReturn: true }
  )
}

export async function addCargoBatch(params: Cargo[]) {
  if (!params.length) throw new Error('请先选择物料编码')
  return await responseHandle<Cargo[]>(
    () => supabase.from('mdm_cargo').insert(params.map(cargoPayload)).select(cargoSelect),
    { showMessage: true, breakReturn: true }
  )
}

export async function editCargo(params: Cargo) {
  const { id, ...data } = params
  if (!id) throw new Error('货物 ID 不能为空')
  return await responseHandle(
    () => supabase.from('mdm_cargo').update(cargoPayload(data)).eq('id', id).select('id').single(),
    { showMessage: true, breakReturn: true, requireAffected: true }
  )
}

export async function deleteCargo(id: string) {
  return await responseHandle(
    () => supabase.from('mdm_cargo').delete({ count: 'exact' }).eq('id', id),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function deleteCargoBatch(ids: string[]) {
  return await responseHandle(
    () => supabase.from('mdm_cargo').delete({ count: 'exact' }).in('id', ids),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function importCargoes(rows: Cargo[], tenantId: string) {
  const materials = await fetchCargoMaterialOptions(tenantId)
  const byCode = new Map(materials.map((material) => [material.materialCode, material]))
  const payloads = rows.map((row) => {
    const material = byCode.get(String(row.cargoCode ?? '').trim())
    if (!material) throw new Error(`物料编码“${row.cargoCode || ''}”不存在或未启用`)
    return cargoPayload({
      ...row,
      tenantId,
      materialId: material.id,
      materialGroupId: row.materialGroupId || material.materialGroupId || null
    })
  })
  return await responseHandle(() => supabase.from('mdm_cargo').insert(payloads), {
    breakReturn: true
  })
}
