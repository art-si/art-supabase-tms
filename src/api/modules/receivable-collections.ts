import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'

export interface ReceivableCollectionRecord {
  id: string
  contactedAt: string
  method: string
  note: string
  nextFollowUp: string | null
  actorName: string
}

export interface ReceivableCollectionInput {
  documentId: string
  contactedAt: string
  method: string
  note: string
  nextFollowUp?: string | null
}

export async function listReceivableCollections(
  documentId: string
): Promise<ReceivableCollectionRecord[]> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_list_receivable_collections_secure', { p_document_id: documentId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '催收记录读取失败，请重试' }
  )
  if (!Array.isArray(result.data)) throw new Error('催收记录格式异常，请刷新后重试')
  return result.data.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('催收记录格式异常，请刷新后重试')
    const row = entry as Record<string, unknown>
    if (
      typeof row.id !== 'string' ||
      typeof row.contactedAt !== 'string' ||
      typeof row.method !== 'string' ||
      typeof row.note !== 'string' ||
      typeof row.actorName !== 'string' ||
      (row.nextFollowUp !== null && typeof row.nextFollowUp !== 'string')
    ) {
      throw new Error('催收记录字段不完整，请刷新后重试')
    }
    return {
      id: row.id,
      contactedAt: row.contactedAt,
      method: row.method,
      note: row.note,
      nextFollowUp: row.nextFollowUp,
      actorName: row.actorName
    }
  })
}

export async function addReceivableCollection(input: ReceivableCollectionInput): Promise<string> {
  const { supabase, responseHandle } = useSupabase()
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_add_receivable_collection_secure', {
        p_document_id: input.documentId,
        p_payload: {
          contacted_at: input.contactedAt,
          method: normalizeNonNullableText(input.method),
          note: normalizeNonNullableText(input.note),
          next_follow_up: normalizeNullableText(input.nextFollowUp)
        }
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '催收记录保存失败，请检查内容后重试'
    }
  )
  if (typeof result.data !== 'string' || !result.data)
    throw new Error('未能确认保存结果，请刷新历史核实')
  return result.data
}
