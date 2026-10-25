import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { normalizeNonNullableText } from '@/utils/form/normalize'

export interface ReceiptFollowup {
  orderId: string
  missingReason: string
  followupNote: string
  updatedAt: string
}

export interface ReceiptFollowupInput {
  orderId: string
  missingReason: string
  followupNote: string
  expectedUpdatedAt: string | null
}

function parseReview(value: unknown): ReceiptFollowup {
  if (
    !isPlainObjectRecord(value) ||
    typeof value.orderId !== 'string' ||
    typeof value.missingReason !== 'string' ||
    typeof value.followupNote !== 'string' ||
    typeof value.updatedAt !== 'string'
  )
    throw new Error('回单跟进数据不完整，请刷新后重试')
  return {
    orderId: value.orderId,
    missingReason: value.missingReason,
    followupNote: value.followupNote,
    updatedAt: value.updatedAt
  }
}

export async function getReceiptFollowup(orderId: string): Promise<ReceiptFollowup | null> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_get_receipt_followup_secure', {
        p_order_id: orderId
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '回单跟进加载失败，请重试' }
  )
  return result.data === null ? null : parseReview(result.data)
}

export async function saveReceiptFollowup(input: ReceiptFollowupInput): Promise<ReceiptFollowup> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_save_receipt_followup_secure', {
        p_order_id: input.orderId,
        p_missing_reason: normalizeNonNullableText(input.missingReason),
        p_followup_note: normalizeNonNullableText(input.followupNote),
        p_expected_updated_at: input.expectedUpdatedAt
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '回单跟进保存失败，请重试' }
  )
  return parseReview(result.data)
}
