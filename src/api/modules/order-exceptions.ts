import { useSupabase } from '@/hooks/core/useSupabase'

export type OrderExceptionAction = 'start' | 'resolve' | 'close' | 'reopen'
export type OrderExceptionStatus = 'pending' | 'in_progress' | 'resolved' | 'closed'

export interface OrderExceptionHistoryEntry {
  action: string
  status: string
  at: string
  note: string | null
  actorName: string
  damageAmount: number | null
  claimAmount: number | null
}

export async function getOrderExceptionHistory(id: string): Promise<OrderExceptionHistoryEntry[]> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_get_order_exception_history_secure', { p_id: id }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '处理历史加载失败，请重试' }
  )
  if (!Array.isArray(result.data)) throw new Error('处理历史格式异常，请刷新后重试')
  return result.data.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('处理历史格式异常，请刷新后重试')
    const row = entry as Record<string, unknown>
    if (
      typeof row.action !== 'string' ||
      typeof row.status !== 'string' ||
      typeof row.at !== 'string' ||
      typeof row.actorName !== 'string'
    ) {
      throw new Error('处理历史格式异常，请刷新后重试')
    }
    return {
      action: row.action,
      status: row.status,
      at: row.at,
      actorName: row.actorName,
      note: typeof row.note === 'string' ? row.note : null,
      damageAmount: typeof row.damageAmount === 'number' ? row.damageAmount : null,
      claimAmount: typeof row.claimAmount === 'number' ? row.claimAmount : null
    }
  })
}

export interface OrderExceptionCreate {
  orderId: string
  exceptionType: 'delay' | 'damage' | 'lost' | 'detained'
  stage: 'pickup' | 'transit' | 'delivery'
  description: string
  occurredAt: string
  estimatedLoss?: number | null
  responsibleUserId?: string | null
}

export async function createOrderException(input: OrderExceptionCreate): Promise<string> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_create_order_exception_secure', {
        p_order_id: input.orderId,
        p_payload: {
          exception_type: input.exceptionType,
          stage: input.stage,
          description: input.description,
          occurred_at: input.occurredAt,
          estimated_loss: input.estimatedLoss,
          responsible_user_id: input.responsibleUserId
        }
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '异常登记失败，请检查订单和填写内容后重试'
    }
  )
  if (typeof result.data !== 'string' || !result.data)
    throw new Error('未能确认登记结果，请刷新台账核实')
  return result.data
}

export interface OrderExceptionTransition {
  id: string
  expectedStatus: OrderExceptionStatus
  action: OrderExceptionAction
  note: string
  damageAmount?: number | null
  claimAmount?: number | null
}

export async function transitionOrderException(input: OrderExceptionTransition): Promise<string> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_transition_order_exception_secure', {
        p_id: input.id,
        p_expected_status: input.expectedStatus,
        p_action: input.action,
        p_note: input.note,
        p_damage_amount: input.damageAmount,
        p_claim_amount: input.claimAmount
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '异常处理失败，请刷新台账后重试'
    }
  )
  if (typeof result.data !== 'string' || result.data !== input.id) {
    throw new Error('未能确认处理结果，请刷新台账核实后再操作')
  }
  return result.data
}
