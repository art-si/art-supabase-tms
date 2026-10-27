import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeSupabaseFunctionError } from '@/utils/supabase'
import { TENANT_SCOPE_HEADER } from '@/utils/tenant-scope-context'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { recognizeImageTextLocally } from '@/utils/ocr/local-image-ocr'
import { parseLocalDriverDocumentOcr } from './driver-document-ocr-parser'

export type DriverDocumentImageSide =
  | 'idCardFrontUrl'
  | 'idCardBackUrl'
  | 'driverLicenseFrontUrl'
  | 'driverLicenseBackUrl'
  | 'licenseBackExtraUrl'
  | 'qualificationFrontUrl'
  | 'qualificationAssessmentUrl'

export interface DriverDocumentOcrResult {
  rawText: string
  summary: string
  confidence: number
  fieldConfidence: Record<string, number>
  missingFields: string[]
  warnings: string[]
  document: Record<string, string | string[] | null>
  artifactId?: string
}

const { supabase } = useSupabase()

export async function analyzeDriverDocumentByAi(params: {
  imagePath: string
  imageSide: DriverDocumentImageSide
  driverId?: string
  tenantId: string
}) {
  const selectedTenantId = useTenantScopeStore().effectiveTenantId
  const { data, error } = await supabase.functions.invoke<DriverDocumentOcrResult>(
    'ai-tms-driver-document-ocr',
    {
      body: {
        action: 'analyze',
        imageUrls: [params.imagePath],
        imageSide: params.imageSide,
        driverId: params.driverId ?? null,
        targetTenantId: params.tenantId
      },
      headers: selectedTenantId ? { [TENANT_SCOPE_HEADER]: selectedTenantId } : undefined
    }
  )
  return { data: data ?? null, error: await normalizeSupabaseFunctionError(error) }
}

export async function analyzeDriverDocumentLocally(params: {
  imagePath: string
  imageSide: DriverDocumentImageSide
}): Promise<DriverDocumentOcrResult> {
  const { data, error } = await supabase.storage
    .from('tms-driver-private')
    .download(params.imagePath)
  if (error) throw error
  if (!data) throw new Error('证件图片无法读取，请重新上传')
  const result = await recognizeImageTextLocally(data)
  if (!result.text) throw new Error('本地识别未找到文字，请换用清晰照片或手工填写')
  return parseLocalDriverDocumentOcr(result.text, params.imageSide, result.confidence)
}
