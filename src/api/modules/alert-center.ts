import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabaseRpcRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'

export type ContractAlertLifecycle = 'pending_effective' | 'effective' | 'expired' | 'terminated'
export type ContractAlertStatus = 'active' | 'resolved' | 'cancelled'

export interface ContractAlertRecord {
  subjectId: string
  tenantId: string
  tenantName: string
  contractId: string
  contractNo: string
  contractName: string
  customerId: string | null
  carrierId: string | null
  partyName: string
  lifecycleStatus: ContractAlertLifecycle
  alertStatus: ContractAlertStatus
  expiryDate: string | null
  lastDeliveredAt: string | null
}

export interface ContractAlertSearch {
  lifecycleStatus?: ContractAlertLifecycle
  alertStatus?: ContractAlertStatus
  dueRange?: string[]
  keyword?: string
  from?: number
  to?: number
}

interface ContractAlertPage {
  records: ContractAlertRecord[]
  total: number
}

const { supabase, responseHandle } = useSupabase()

export async function fetchContractAlertList(params: ContractAlertSearch) {
  const result = await responseHandle<ContractAlertPage>(
    () =>
      supabase.rpc('tms_list_contract_alerts_secure', {
        ...buildSupabaseRpcRange(params.from ?? 0, params.to ?? 9),
        p_lifecycle_status: params.lifecycleStatus || null,
        p_alert_status: params.alertStatus || null,
        p_due_from: params.dueRange?.[0] || null,
        p_due_to: params.dueRange?.[1] || null,
        p_keyword: normalizeNullableText(params.keyword ?? '')
      }),
    { showErrorMessage: false }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}
