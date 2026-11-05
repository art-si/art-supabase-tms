import { useSupabase } from '@/hooks/core/useSupabase'
import TreeUtils from '@/utils/tree'
import { fetchAllRangePages } from '@/utils/supabase/pagination'

export interface AbnormalFreightExpenseItem {
  id: string
  parentId: string | null
  itemCode: string
  itemName: string
  isSelectable: boolean
  isEnabled: boolean
  sort: number
  children?: AbnormalFreightExpenseItem[]
}

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
  status: 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'rejected'
  approvalAppliedAt: string | null
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const expenseItemTree = new TreeUtils({ parentKey: 'parentId' })

export async function fetchAbnormalFreightExpenseItems(tenantId: string) {
  const result = await fetchAllRangePages((range) =>
    responseHandle<AbnormalFreightExpenseItem[]>(
      () =>
        supabase
          .from('tms_expense_item')
          .select('id, parent_id, item_code, item_name, is_selectable, is_enabled, sort')
          .eq('tenant_id', tenantId)
          .eq('is_enabled', true)
          .order('sort', { ascending: true })
          .order('item_code', { ascending: true })
          .range(range.from, range.to),
      { breakReturn: true, showErrorMessage: false, errorMessage: '费用项目加载失败，请重试' }
    )
  )
  if (result.error) throw result.error
  return {
    ...result,
    data: expenseItemTree.listToTree(
      result.data ?? [],
      (left, right) =>
        left.sort - right.sort || left.itemCode.localeCompare(right.itemCode, 'zh-CN')
    )
  }
}

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
    () =>
      supabase.rpc('tms_save_abnormal_freight_secure', {
        p_order_id: input.orderId,
        p_payload: keysToSnakeDeep({ ownership: input.ownership, lines: input.lines }),
        p_submit: true
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '异常运费保存失败，请核对费用项后重试'
    }
  )
}
