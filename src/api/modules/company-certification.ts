import { useSupabase } from '@/hooks/core/useSupabase'
import { uniq } from 'lodash-es'
import {
  isPrivateAttachmentPath,
  privateAttachmentPathFromSignedUrl,
  signPrivateAttachmentPaths,
  uploadPrivateAttachment
} from '@/utils/supabase/private-attachment'

const CERTIFICATION_BUCKET = 'tms-company-certification-private'
const MAX_CERTIFICATION_FILE_BYTES = 15 * 1024 * 1024
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const

export type CertificationSection =
  'enterprise' | 'authorization' | 'account' | 'road_permit' | 'e_signature'

export type CertificationStatus = 'pending' | 'approved' | 'rejected'

export interface EnterprisePayload {
  companyName: string
  shortName: string
  socialCreditCode: string
  registeredCapital: string
  legalRepresentative: string
  legalRepresentativeIdNo: string
  businessLicenseExpiresOn: string | null
  businessLicenseLongTerm: boolean
  businessLicenseUrl: string
  idFrontUrl: string
  idBackUrl: string
  legalIdExpiresOn: string | null
  legalIdLongTerm: boolean
  invitationCode: string
  legalAddress: string
}

export interface AuthorizationPayload {
  authorizerName: string
  authorizedPersonIdNo: string
  authorizationUrl: string
  idFrontUrl: string
  idBackUrl: string
}

export interface AccountPayload {
  openingPermitUrls: string[]
  agreementUrls: string[]
  email: string
  agreementMode: 'upload'
}

export interface RoadPermitPayload {
  operatorName: string
  permitNo: string
  expiresOn: string | null
  longTerm: boolean
  permitImageUrl: string
}

export interface ESignaturePayload {
  legalIsDelegate: boolean
  companyName: string
  socialCreditCode: string
  legalName: string
  legalIdNo: string
  authMethod: 'phone' | 'face'
  legalPhone: string
}

export interface CertificationPayloadBySection {
  enterprise: EnterprisePayload
  authorization: AuthorizationPayload
  account: AccountPayload
  road_permit: RoadPermitPayload
  e_signature: ESignaturePayload
}

export interface CertificationRequest {
  id: string
  tenantId: string
  tenantName?: string
  section: CertificationSection
  status: CertificationStatus
  effectiveCertified: boolean
  payload: Partial<
    EnterprisePayload &
      AuthorizationPayload &
      AccountPayload &
      RoadPermitPayload &
      ESignaturePayload
  >
  submittedAt: string
  reviewedAt: string | null
  reviewNote: string | null
}

export type CertificationHistoryEntry = Omit<
  CertificationRequest,
  'effectiveCertified' | 'tenantName'
>

const { supabase, responseHandle } = useSupabase()

export async function uploadCompanyCertificationAttachment(
  file: File,
  tenantId: string,
  kind: 'image' | 'document'
): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
  return uploadPrivateAttachment(file, {
    bucket: CERTIFICATION_BUCKET,
    tenantId,
    allowedMimeTypes: kind === 'image' ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES,
    maxBytes: MAX_CERTIFICATION_FILE_BYTES
  })
}

const attachmentValues = (payload: CertificationRequest['payload']): string[] => [
  payload.businessLicenseUrl ?? '',
  payload.idFrontUrl ?? '',
  payload.idBackUrl ?? '',
  payload.authorizationUrl ?? '',
  payload.permitImageUrl ?? '',
  ...(payload.openingPermitUrls ?? []),
  ...(payload.agreementUrls ?? [])
]

async function signReadableAttachments(
  records: CertificationRequest[]
): Promise<CertificationRequest[]> {
  const paths = uniq(records.flatMap((record) => attachmentValues(record.payload))).filter(
    isPrivateAttachmentPath
  )
  const signed = await signPrivateAttachmentPaths(CERTIFICATION_BUCKET, paths)
  const preview = (path?: string): string =>
    path && isPrivateAttachmentPath(path) ? (signed.get(path) ?? '') : ''
  return records.map((record) => {
    const payload = { ...record.payload }
    payload.businessLicenseUrl = preview(payload.businessLicenseUrl)
    payload.idFrontUrl = preview(payload.idFrontUrl)
    payload.idBackUrl = preview(payload.idBackUrl)
    payload.authorizationUrl = preview(payload.authorizationUrl)
    payload.permitImageUrl = preview(payload.permitImageUrl)
    payload.openingPermitUrls = (payload.openingPermitUrls ?? []).map(preview).filter(Boolean)
    payload.agreementUrls = (payload.agreementUrls ?? []).map(preview).filter(Boolean)
    return { ...record, payload }
  })
}

function normalizeAttachmentPayload(
  section: CertificationSection,
  payload: CertificationPayloadBySection[CertificationSection]
): CertificationPayloadBySection[CertificationSection] {
  if (section === 'enterprise') {
    const value = payload as EnterprisePayload
    return {
      ...value,
      businessLicenseUrl: privateAttachmentPathFromSignedUrl(
        value.businessLicenseUrl,
        CERTIFICATION_BUCKET
      ),
      idFrontUrl: privateAttachmentPathFromSignedUrl(value.idFrontUrl, CERTIFICATION_BUCKET),
      idBackUrl: privateAttachmentPathFromSignedUrl(value.idBackUrl, CERTIFICATION_BUCKET)
    }
  }
  if (section === 'authorization') {
    const value = payload as AuthorizationPayload
    return {
      ...value,
      authorizationUrl: privateAttachmentPathFromSignedUrl(
        value.authorizationUrl,
        CERTIFICATION_BUCKET
      ),
      idFrontUrl: privateAttachmentPathFromSignedUrl(value.idFrontUrl, CERTIFICATION_BUCKET),
      idBackUrl: privateAttachmentPathFromSignedUrl(value.idBackUrl, CERTIFICATION_BUCKET)
    }
  }
  if (section === 'account') {
    const value = payload as AccountPayload
    return {
      ...value,
      openingPermitUrls: value.openingPermitUrls.map((url) =>
        privateAttachmentPathFromSignedUrl(url, CERTIFICATION_BUCKET)
      ),
      agreementUrls: value.agreementUrls.map((url) =>
        privateAttachmentPathFromSignedUrl(url, CERTIFICATION_BUCKET)
      )
    }
  }
  if (section === 'road_permit') {
    const value = payload as RoadPermitPayload
    return {
      ...value,
      permitImageUrl: privateAttachmentPathFromSignedUrl(value.permitImageUrl, CERTIFICATION_BUCKET)
    }
  }
  return payload
}

export async function fetchCompanyCertification(tenantId: string | null) {
  const response = await responseHandle<CertificationRequest[]>(
    () => supabase.rpc('tms_list_company_certification_secure', { p_tenant_id: tenantId }),
    { showErrorMessage: true }
  )
  if (response.error || !response.data) return response
  return { ...response, data: await signReadableAttachments(response.data) }
}

export async function fetchCompanyCertificationHistory(
  tenantId: string,
  section: CertificationSection
) {
  return responseHandle<CertificationHistoryEntry[]>(
    () =>
      supabase.rpc('tms_list_company_certification_history_secure', {
        p_tenant_id: tenantId,
        p_section: section
      }),
    { showErrorMessage: false }
  )
}

export async function reviewCompanyCertification(
  requestId: string,
  decision: 'approved' | 'rejected',
  note: string
) {
  return responseHandle<CertificationRequest>(
    () =>
      supabase.rpc('tms_review_company_certification_secure', {
        p_request_id: requestId,
        p_decision: decision,
        p_note: note
      }),
    { breakReturn: true }
  )
}

export async function submitCompanyCertification<K extends CertificationSection>(
  tenantId: string,
  section: K,
  payload: CertificationPayloadBySection[K]
) {
  return await responseHandle<CertificationRequest>(
    () =>
      supabase.rpc('tms_submit_company_certification_secure', {
        p_tenant_id: tenantId,
        p_section: section,
        p_payload: normalizeAttachmentPayload(section, payload)
      }),
    { breakReturn: true }
  )
}
