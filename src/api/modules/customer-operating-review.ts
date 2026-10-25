import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { normalizeNonNullableText } from '@/utils/form/normalize'

export interface CustomerOperatingReview {
  id: string
  customerId: string
  periodStart: string
  periodEnd: string
  strategy: string
  improvement: string
  updatedAt: string
}

export interface CustomerOperatingReviewInput {
  customerId: string
  periodStart: string
  periodEnd: string
  strategy: string
  improvement: string
  expectedUpdatedAt: string | null
}

function parseReview(value: unknown): CustomerOperatingReview {
  if (
    !isPlainObjectRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.customerId !== 'string' ||
    typeof value.periodStart !== 'string' ||
    typeof value.periodEnd !== 'string' ||
    typeof value.strategy !== 'string' ||
    typeof value.improvement !== 'string' ||
    typeof value.updatedAt !== 'string'
  )
    throw new Error('客户经营复盘数据不完整，请刷新后重试')
  return {
    id: value.id,
    customerId: value.customerId,
    periodStart: value.periodStart,
    periodEnd: value.periodEnd,
    strategy: value.strategy,
    improvement: value.improvement,
    updatedAt: value.updatedAt
  }
}

export async function getCustomerOperatingReview(
  customerId: string,
  periodStart: string,
  periodEnd: string
): Promise<CustomerOperatingReview | null> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_get_customer_operating_review_secure', {
        p_customer_id: customerId,
        p_start: periodStart,
        p_end: periodEnd
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '客户经营复盘加载失败，请重试' }
  )
  return result.data === null ? null : parseReview(result.data)
}

export async function saveCustomerOperatingReview(
  input: CustomerOperatingReviewInput
): Promise<CustomerOperatingReview> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_save_customer_operating_review_secure', {
        p_customer_id: input.customerId,
        p_start: input.periodStart,
        p_end: input.periodEnd,
        p_strategy: normalizeNonNullableText(input.strategy),
        p_improvement: normalizeNonNullableText(input.improvement),
        p_expected_updated_at: input.expectedUpdatedAt
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '客户经营复盘保存失败，请重试' }
  )
  return parseReview(result.data)
}
