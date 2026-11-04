import { useSupabase } from '@/hooks/core/useSupabase'

export type AbnormalFreightOwnership = 'customer_receivable' | 'carrier_deduction' | 'own'

export interface AbnormalFreightLine {
  expenseItemId: string
  amount: number
  description: string
  occurredAt: string
  attachments: string[]
}

export interface AbnormalFreightDocument {
  id: string
  documentNo: string
  orderId: string
  ownership: AbnormalFreightOwnership
  lines: AbnormalFreightLine[]
  totalAmount: number
  orderNoSnapshot: string
  waybillNoSnapshot: string
  routeSnapshot: string
  driverNameSnapshot: string
  plateNoSnapshot: string
  createTime: string
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

export async function fetchAbnormalFreightDocuments(orderId: string) {
  return await responseHandle<AbnormalFreightDocument[]>(
    () => supabase.rpc('tms_list_abnormal_freight_secure', { p_order_id: orderId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '异常运费记录加载失败，请重试' }
  )
}

export async function saveAbnormalFreightDocument(input: {
  orderId: string
  ownership: AbnormalFreightOwnership
  lines: AbnormalFreightLine[]
}) {
  return await responseHandle<AbnormalFreightDocument>(
    () => supabase.rpc('tms_save_abnormal_freight_secure', {
      p_order_id: input.orderId,
      p_payload: keysToSnakeDeep({ ownership: input.ownership, lines: input.lines })
    }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '异常运费保存失败，请核对费用项后重试' }
  )
}
