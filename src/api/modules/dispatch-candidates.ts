import { buildSupabaseRpcRange } from '@/utils/supabase'
import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeNullableText } from '@/utils/form/normalize'

export type DispatchMode = 'carrier' | 'self_operated' | 'individual_driver'
export type DispatchCandidateKind =
  | 'carrier'
  | 'driver'
  | 'vehicle'
  | 'return_vehicle'
  | 'individual_driver'
export type DispatchAgreementStatus = 'pending_signed' | 'signed' | 'revision_requested'

export interface DispatchCarrierCandidate {
  id: string
  tenantId: string
  companyName: string
  dispatchChannel: 'online' | 'offline'
  dispatchChannels?: ('online' | 'offline')[]
  contactName: string | null
  contactPhone: string | null
}

export interface DispatchDriverCandidate {
  id: string
  tenantId: string
  carrierId: string | null
  driverName: string
  phone: string | null
  licenseType: string | null
  licenseExpireDate: string | null
  driverType?: 'primary' | 'secondary'
  driverOwnership?: 'self' | 'individual' | 'carrier' | 'partner' | 'other' | null
  driverStatus?: string | null
  portraitUrl?: string | null
  identityAuthStatus?: string | null
  licenseAuthStatus?: string | null
  qualificationAuthStatus?: string | null
  carrierName?: string | null
  companyName?: string | null
  plateNo?: string | null
  vehicleId?: string | null
  contactName?: string | null
  agreementId?: string | null
  agreementStartsOn?: string | null
  agreementEndsOn?: string | null
  agreementStatus?: DispatchAgreementStatus
}

export interface DispatchVehicleCandidate {
  id: string
  tenantId: string
  plateNo: string
  vehicleType: string | null
  specLengthM: number | null
  loadTons: number | null
  carrierId: string | null
  vehicleOwnership: 'self_operated' | 'carrier' | null
  primaryDriverId: string | null
  companyName: string | null
}

export interface DispatchAgreementDetail {
  id: string
  agreementNo: string
  shipperName: string
  carrierName: string
  contactPhone: string
  plateNo: string
  vehicleType: string | null
  startsOn: string | null
  endsOn: string | null
  status: DispatchAgreementStatus
  contentHtml: string
  idCardImages: string[]
  registrationImages: string[]
  driverLicenseImage: string | null
  roadPermitImage: string | null
  partyASeal: string
  partyASignedOn: string
  partyBSeal: string
  partyBSignedOn: string
}

export interface DispatchCandidateSearch {
  kind: DispatchCandidateKind
  tenantId: string
  keyword?: string
  from?: number
  to?: number
}

const { supabase, responseHandle } = useSupabase()

export async function fetchDispatchCandidates<T extends object>(params: DispatchCandidateSearch) {
  const from = Math.max(params.from ?? 0, 0)
  const result = await responseHandle<{ records: T[]; total: number }>(
    () =>
      supabase.rpc('tms_list_dispatch_candidates_secure', {
        p_kind: params.kind,
        p_tenant_id: params.tenantId,
        p_keyword: normalizeNullableText(params.keyword ?? ''),
        ...buildSupabaseRpcRange(from, params.to ?? from + 9)
      }),
    { showErrorMessage: false }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error
  }
}

export async function fetchDispatchAgreement(agreementId: string) {
  return await responseHandle<DispatchAgreementDetail>(
    () =>
      supabase.rpc('tms_get_dispatch_agreement_secure', {
        p_agreement_id: agreementId
      }),
    { showErrorMessage: true, breakReturn: true }
  )
}

export async function remindDispatchAgreement(driverId: string, action: 'signature' | 'revision') {
  return await responseHandle<{
    recipientCount: number
    deliveryMode: 'driver' | 'internal_followup'
  }>(
    () =>
      supabase.rpc('tms_remind_dispatch_agreement_secure', {
        p_driver_id: driverId,
        p_action: action
      }),
    { showErrorMessage: true, breakReturn: true }
  )
}
