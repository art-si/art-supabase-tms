import { useSupabase } from '@/hooks/core/useSupabase'
import type { ApiFeedbackOptions } from '@/types/api/request'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export interface OrderQuoteExpenseItem {
  id: string
  itemCode: string
  itemName: string
}

export async function fetchOrderQuoteExpenseItems(tenantId: string) {
  return await responseHandle<OrderQuoteExpenseItem[]>(
    () =>
      supabase
        .from('tms_expense_item')
        .select('id, item_code, item_name')
        .eq('tenant_id', tenantId)
        .eq('is_enabled', true)
        .eq('is_selectable', true)
        .order('sort', { ascending: true })
        .order('item_code', { ascending: true }),
    { showErrorMessage: false, breakReturn: true, errorMessage: '费用项目加载失败，请重试' }
  )
}

export async function fetchOrderQuote(orderId: string, options: ApiFeedbackOptions = {}) {
  return await responseHandle<Api.Tms.Order.OrderQuoteContext>(
    () => supabase.rpc('tms_get_order_quote_secure', { p_order_id: orderId }),
    { showErrorMessage: options.showErrorMessage ?? true, breakReturn: true }
  )
}

export async function saveOrderQuote(
  orderId: string,
  payload: Api.Tms.Order.OrderQuotePayload,
  submit: boolean,
  options: ApiFeedbackOptions = {}
) {
  return await responseHandle<Api.Tms.Order.OrderQuoteRecord>(
    () =>
      supabase.rpc('tms_save_order_quote_secure', {
        p_order_id: orderId,
        p_payload: keysToSnakeDeep(payload),
        p_submit: submit
      }),
    { showErrorMessage: options.showErrorMessage ?? true, breakReturn: true }
  )
}
