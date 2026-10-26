import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeSupabaseFunctionError } from '@/utils/supabase'
import { TENANT_SCOPE_HEADER } from '@/utils/tenant-scope-context'

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
  artifactId: string
}

const { supabase } = useSupabase()

export async function analyzeDriverDocumentByAi(params: {
  imageUrl: string
  imageSide: DriverDocumentImageSide
  driverId?: string
  tenantId: string
}) {
  const { data, error } = await supabase.functions.invoke<DriverDocumentOcrResult>(
    'ai-tms-driver-document-ocr',
    {
      body: {
        action: 'analyze',
        imageUrls: [params.imageUrl],
        imageSide: params.imageSide,
        driverId: params.driverId ?? null
      },
      headers: { [TENANT_SCOPE_HEADER]: params.tenantId }
    }
  )
  return { data: data ?? null, error: await normalizeSupabaseFunctionError(error) }
}
