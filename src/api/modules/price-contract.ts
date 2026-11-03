import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'

const { supabase, responseHandle } = useSupabase()

export interface PriceContractOption {
  id: string
  contractNo: string
  contractName: string
  contractStatus?: string | null
  customerId: string | null
  carrierId: string | null
  effectiveDate: string | null
  expiryDate: string | null
}

export interface PriceContractOptionParams {
  kind: 'customer' | 'carrier'
  subjectId: string
  keyword?: string
  page: number
  pageSize: number
  tenantId?: string | null
}

export async function fetchPriceContractOptions(params: PriceContractOptionParams) {
  const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  const result = await responseHandle<{ records: PriceContractOption[]; total: number }>(
    () =>
      supabase.rpc('tms_list_price_contract_options_secure', {
        p_kind: params.kind,
        p_subject_id: params.subjectId,
        p_keyword: normalizeNullableText(params.keyword),
        p_from: from,
        p_to: to,
        p_tenant_id: params.tenantId ?? null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '可选合同加载失败，请重试' }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0 }
}

export async function fetchPriceContractDetails(
  kind: 'customer' | 'carrier',
  contractId: string,
  keyword = ''
): Promise<Api.Tms.BasicData.ContractDetailSelectorItem[]> {
  const result = await responseHandle<Api.Tms.BasicData.ContractDetailSelectorItem[]>(
    () =>
      supabase.rpc('tms_list_price_contract_details_secure', {
        p_kind: kind,
        p_contract_id: contractId,
        p_keyword: normalizeNullableText(keyword)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '合同明细加载失败，请重试' }
  )
  return result.data ?? []
}
