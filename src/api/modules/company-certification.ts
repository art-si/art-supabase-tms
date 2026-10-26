import { useSupabase } from '@/hooks/core/useSupabase'

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

const { supabase, responseHandle } = useSupabase()

export async function fetchCompanyCertification(tenantId: string | null) {
  return await responseHandle<CertificationRequest[]>(
    () => supabase.rpc('tms_list_company_certification_secure', { p_tenant_id: tenantId }),
    { showErrorMessage: true }
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
        p_payload: payload
      }),
    { breakReturn: true }
  )
}
