import { prepareVehicleDriverPortraits } from '@/api/vehicle-driver-select'
import { useSupabase } from '@/hooks/core/useSupabase'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { normalizeNullableText } from '@/utils/form/normalize'
import {
  isPrivateAttachmentPath,
  privateAttachmentPathFromSignedUrl,
  signPrivateAttachmentPaths
} from '@/utils/supabase/private-attachment'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
import { resolveTenantWriteTargetId } from '@/utils/tenant-scope-context'
import { uniq } from 'lodash-es'

export interface TmsRecordAudit {
  id: string
  tenantId: string
  createBy: string
  createTime: string
  updateBy?: string | null
  updateTime: string
}

export interface DriverBlacklistRecord extends TmsRecordAudit {
  driverId?: string | null
  driverName: string
  phone?: string | null
  organizationName?: string | null
  driverOwnership?: string | null
  driverType?: string | null
  carrierName?: string | null
  companyName?: string | null
  plateNo?: string | null
  portraitUrl?: string | null
  portraitPreviewUrl?: string | null
  blacklistedAt: string
  reason: string
  remark: string | null
  previousEnabled?: boolean | null
  releasedAt?: string | null
  status: 'active' | 'released' | 'legacy'
}

export interface BlacklistDriverCandidate {
  id: string
  tenantId: string
  driverName: string
  phone?: string | null
  driverOwnership?: string | null
  driverType?: string | null
  carrierName?: string | null
  companyName?: string | null
  organizationName?: string | null
  plateNo?: string | null
  portraitUrl?: string | null
  enabled: boolean
}

export interface ServiceCaseRecord extends TmsRecordAudit {
  serviceNo: string
  organizationName: string
  serviceType: 'complaint' | 'consultation'
  complaintTypes: string[]
  title: string
  waybillNo: string | null
  waybillId?: string | null
  contactName: string
  contactPhone: string
  content: string
  attachments: string[]
  remark: string | null
  status: 'pending' | 'replied' | 'closed'
  submittedAt: string
  submittedBy: string
}

export interface ElectronicContractRecord extends TmsRecordAudit {
  customerId?: string | null
  contractNo: string
  contractName: string
  partyACompany: string
  partyARepresentative: string | null
  partyASubject: string
  partyBCarrierId: string
  partyBCompany: string
  partyBRepresentative: string | null
  partyBSubject: string
  startsOn: string
  endsOn: string
  contentHtml: string
  attachments: string[]
  settlementCycle: SettlementCycle
  cycleStartDay: number | null
  paymentTermDays: number
  taxRate: number
  approvalStatus: AgreementApprovalStatus
  partyASignatureUrl: string | null
  partyASealUrl: string | null
  partyBSignatureUrl: string | null
  partyBSealUrl: string | null
  partyASignedAt: string | null
  partyBSignedAt: string | null
  status: 'pending_signed' | 'signed' | 'terminated'
}

export type SettlementCycle = 'natural_month' | 'monthly' | 'quarterly'
export type AgreementApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface AgreementSignatureInput {
  partyASignatureUrl: string | null
  partyASealUrl: string | null
  partyBSignatureUrl: string | null
  partyBSealUrl: string | null
}

export interface TransportAgreementRecord extends TmsRecordAudit {
  customerId?: string | null
  agreementNo: string
  shipperName: string
  carrierId: string
  carrierName: string
  contactPhone: string
  vehicleId: string
  plateNo: string
  vehicleType: string | null
  vehicleLengthM: number | null
  driverId: string | null
  startsOn: string | null
  endsOn: string | null
  status: 'pending_signed' | 'signed' | 'revision_requested'
  contentHtml: string
  attachments: string[]
  idCardImages: string[]
  registrationImages: string[]
  driverLicenseImage: string | null
  roadPermitImage: string | null
  driverLicenseImages: string[]
  roadPermitImages: string[]
  approvalStatus: AgreementApprovalStatus
  partyASignatureUrl: string | null
  partyASealUrl: string | null
  partyBSignatureUrl: string | null
  partyBSealUrl: string | null
  partyASignedAt: string | null
  partyBSignedAt: string | null
  partyASeal: string
  partyARepresentative: string
  partyASignedOn: string
  partyBSeal: string
  partyBRepresentative: string | null
  partyBSignedOn: string
}

export type BlacklistInput = Pick<DriverBlacklistRecord, 'blacklistedAt' | 'reason' | 'remark'> & {
  driverId: string
}

export type ServiceCaseInput = Pick<
  ServiceCaseRecord,
  | 'serviceType'
  | 'complaintTypes'
  | 'title'
  | 'waybillNo'
  | 'waybillId'
  | 'contactName'
  | 'contactPhone'
  | 'content'
  | 'attachments'
  | 'remark'
  | 'status'
> & { tenantId?: string }

export type ElectronicContractInput = Pick<
  ElectronicContractRecord,
  | 'contractName'
  | 'partyACompany'
  | 'partyARepresentative'
  | 'partyASubject'
  | 'partyBCarrierId'
  | 'partyBRepresentative'
  | 'partyBSubject'
  | 'startsOn'
  | 'endsOn'
  | 'contentHtml'
  | 'attachments'
  | 'settlementCycle'
  | 'cycleStartDay'
  | 'paymentTermDays'
  | 'taxRate'
> & { tenantId?: string; customerId?: string | null }

export type TransportAgreementInput = Pick<
  TransportAgreementRecord,
  | 'shipperName'
  | 'carrierId'
  | 'contactPhone'
  | 'vehicleId'
  | 'startsOn'
  | 'endsOn'
  | 'contentHtml'
  | 'attachments'
  | 'idCardImages'
  | 'registrationImages'
  | 'driverLicenseImages'
  | 'roadPermitImages'
  | 'driverId'
  | 'partyBRepresentative'
> & { tenantId?: string; customerId?: string | null }

const AGREEMENT_DRIVER_PRIVATE_BUCKET = 'tms-driver-private'
const AGREEMENT_VEHICLE_PRIVATE_BUCKET = 'vms-vehicle-private'

function storedAgreementEvidenceUrl(url: string, bucket: string): string {
  return url.includes(`/storage/v1/object/sign/${bucket}/`)
    ? privateAttachmentPathFromSignedUrl(url, bucket)
    : url
}

function storedAgreementEvidenceInput(input: TransportAgreementInput): TransportAgreementInput {
  return {
    ...input,
    idCardImages: input.idCardImages.map((url) =>
      storedAgreementEvidenceUrl(url, AGREEMENT_DRIVER_PRIVATE_BUCKET)
    ),
    registrationImages: input.registrationImages.map((url) =>
      storedAgreementEvidenceUrl(url, AGREEMENT_VEHICLE_PRIVATE_BUCKET)
    ),
    driverLicenseImages: input.driverLicenseImages.map((url) =>
      storedAgreementEvidenceUrl(url, AGREEMENT_DRIVER_PRIVATE_BUCKET)
    ),
    roadPermitImages: input.roadPermitImages.map((url) =>
      storedAgreementEvidenceUrl(url, AGREEMENT_VEHICLE_PRIVATE_BUCKET)
    )
  }
}

async function previewAgreementEvidence<
  T extends Pick<
    TransportAgreementRecord,
    'idCardImages' | 'registrationImages' | 'driverLicenseImages' | 'roadPermitImages'
  >
>(data: T): Promise<T> {
  const driverPaths = uniq(
    [...data.idCardImages, ...data.driverLicenseImages].filter(isPrivateAttachmentPath)
  )
  const vehiclePaths = uniq(
    [...data.registrationImages, ...data.roadPermitImages].filter(isPrivateAttachmentPath)
  )
  if (!driverPaths.length && !vehiclePaths.length) return data
  const [signedDriver, signedVehicle] = await Promise.all([
    signPrivateAttachmentPaths(AGREEMENT_DRIVER_PRIVATE_BUCKET, driverPaths),
    signPrivateAttachmentPaths(AGREEMENT_VEHICLE_PRIVATE_BUCKET, vehiclePaths)
  ])
  const preview = (urls: string[], signed: Map<string, string>): string[] =>
    urls.map((url) => {
      if (!isPrivateAttachmentPath(url)) return url
      const signedUrl = signed.get(url)
      if (!signedUrl) throw new Error('认证证照预览暂不可用，请重试')
      return signedUrl
    })
  return {
    ...data,
    idCardImages: preview(data.idCardImages, signedDriver),
    registrationImages: preview(data.registrationImages, signedVehicle),
    driverLicenseImages: preview(data.driverLicenseImages, signedDriver),
    roadPermitImages: preview(data.roadPermitImages, signedVehicle)
  }
}

interface ListPage {
  from?: number
  to?: number
  tenantId?: string
}

export interface BlacklistSearch extends ListPage {
  driverName?: string
  phone?: string
  organizationName?: string
}

export interface ServiceCaseSearch extends ListPage {
  recordId?: string
  serviceNo?: string
  waybillNo?: string
  complaintType?: string
  serviceType?: string
  status?: string
}

export interface ElectronicContractSearch extends ListPage {
  recordId?: string
  customerId?: string
  contractNo?: string
  contractName?: string
  status?: string
}

export interface TransportAgreementSearch extends ListPage {
  recordId?: string
  customerId?: string
  agreementNo?: string
  shipperName?: string
  carrierId?: string
  plateNo?: string
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

function readTenantId(requested?: string): string | null {
  const effective = useTenantScopeStore().effectiveTenantId
  if (effective && requested && effective !== requested) return effective
  return requested || effective
}

function writeTenantId(requested?: string): string {
  const userStore = useUserStore()
  return resolveTenantWriteTargetId({
    explicitTenantId: requested,
    effectiveTenantId: useTenantScopeStore().effectiveTenantId,
    actorTenantId: userStore.getUserInfo.tenantId,
    canWriteToOtherTenant: userStore.isPlatformSuper
  })
}

const pageFrom = (params: ListPage): number => Math.max(params.from ?? 0, 0)
const pageTo = (params: ListPage): number =>
  Math.max(params.to ?? pageFrom(params) + 9, pageFrom(params))
const keyword = (value?: string): string | null => normalizeNullableText(value ?? '')

export interface BasicRecordCarrierOption {
  id: string
  tenantId: string
  companyName: string
  contactName: string | null
  legalRepresentative: string | null
}

export async function fetchBasicRecordCarrierOptions(tenantId?: string) {
  const resolvedTenantId = readTenantId(tenantId)
  return await responseHandle<BasicRecordCarrierOption[]>(
    () =>
      supabase.rpc('tms_list_basic_carrier_options_secure', {
        p_tenant_id: resolvedTenantId
      }),
    { showErrorMessage: true }
  )
}

export async function fetchDriverBlacklistList(params: BlacklistSearch) {
  const result = await responseHandle<{ records: DriverBlacklistRecord[]; total: number }>(
    () =>
      supabase.rpc('tms_list_driver_blacklist_secure', {
        p_from: pageFrom(params),
        p_to: pageTo(params),
        p_driver_name: keyword(params.driverName),
        p_phone: keyword(params.phone),
        p_organization_name: keyword(params.organizationName)
      }),
    { showErrorMessage: true }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

/** Read one blacklist history row through the same server-side View and tenant scope as the list. */
export async function fetchDriverBlacklistDetail(id: string) {
  return await responseHandle<DriverBlacklistRecord | null>(
    () => supabase.rpc('tms_get_driver_blacklist_secure', { p_id: id }),
    { showErrorMessage: false }
  )
}

export async function fetchBlacklistDriverCandidates(params: {
  from: number
  to: number
  keyword?: string
}) {
  const result = await responseHandle<{ records: BlacklistDriverCandidate[]; total: number }>(
    () =>
      supabase.rpc('tms_list_blacklist_driver_candidates_secure', {
        p_from: params.from,
        p_to: params.to,
        p_keyword: keyword(params.keyword)
      }),
    { showErrorMessage: true }
  )
  await prepareVehicleDriverPortraits(result.data?.records ?? [])
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function addDriverBlacklist(input: BlacklistInput) {
  return await responseHandle<{ id: string }>(
    () =>
      supabase.rpc('tms_add_driver_blacklist_secure', {
        p_driver_id: input.driverId,
        p_blacklisted_at: input.blacklistedAt,
        p_reason: input.reason,
        p_remark: input.remark
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function releaseDriverBlacklist(id: string) {
  return await responseHandle<{ id: string; driverId: string; restoredEnabled: boolean }>(
    () => supabase.rpc('tms_release_driver_blacklist_secure', { p_id: id }),
    { showMessage: true, breakReturn: true }
  )
}

export async function fetchServiceCaseList(params: ServiceCaseSearch) {
  let query = supabase
    .from('tms_service_case')
    .select('*', { count: 'exact' })
    .order('submitted_at', { ascending: false })
    .range(pageFrom(params), pageTo(params))
  const tenantId = readTenantId(params.tenantId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (params.recordId) query = query.eq('id', params.recordId)
  if (keyword(params.serviceNo)) query = query.ilike('service_no', `%${keyword(params.serviceNo)}%`)
  if (keyword(params.waybillNo)) query = query.ilike('waybill_no', `%${keyword(params.waybillNo)}%`)
  if (params.complaintType) query = query.contains('complaint_types', [params.complaintType])
  if (params.serviceType) query = query.eq('service_type', params.serviceType)
  if (params.status) query = query.eq('status', params.status)
  return await responseHandle<ServiceCaseRecord[]>(() => query, { showErrorMessage: true })
}

export async function addServiceCase(input: ServiceCaseInput) {
  return await responseHandle<ServiceCaseRecord>(
    () =>
      supabase
        .from('tms_service_case')
        .insert(
          keysToSnakeDeep({
            ...input,
            tenantId: writeTenantId(input.tenantId),
            organizationName: '',
            serviceNo: ''
          })
        )
        .select()
        .single(),
    { showMessage: true, breakReturn: true }
  )
}

export async function editServiceCase(id: string, input: ServiceCaseInput) {
  const payload = { ...input }
  delete payload.tenantId
  return await responseHandle<ServiceCaseRecord>(
    () =>
      supabase
        .from('tms_service_case')
        .update(keysToSnakeDeep(payload), { count: 'exact' })
        .eq('id', id)
        .select()
        .single(),
    { showMessage: true, breakReturn: true, requireAffected: true }
  )
}

export interface ServiceCaseMention {
  kind: 'user' | 'organization' | 'role'
  id: string
  label: string
}

export interface ServiceCaseReply {
  id: string
  tenantId: string
  serviceCaseId: string
  replyToId: string | null
  content: string
  attachments: string[]
  mentions: ServiceCaseMention[]
  authorUserId: string
  authorName: string
  createTime: string
}

export interface ServiceCaseReplyInput {
  tenantId: string
  serviceCaseId: string
  replyToId: string | null
  content: string
  attachments: string[]
  mentions: ServiceCaseMention[]
}

export interface ServiceCaseWaybillOption {
  id: string
  tenantId: string
  orderNo: string
  waybillNo: string
  dispatchMode: 'carrier' | 'self_operated' | 'individual_driver' | null
  originStation: string
  destinationStation: string
  dispatchPlateNo: string | null
  dispatchDriverName: string | null
  dispatchDriverPhone: string | null
}

export async function fetchServiceCaseWaybillOptions(
  tenantId: string,
  params: DataSelectFetchParams & { recordId?: string }
) {
  const from = Math.max((params.page - 1) * params.pageSize, 0)
  const result = await responseHandle<{ records: ServiceCaseWaybillOption[]; total: number }>(
    () =>
      supabase.rpc('tms_list_service_case_waybill_options_secure', {
        p_tenant_id: tenantId,
        p_keyword: normalizeNullableText(params.keyword),
        p_from: from,
        p_to: from + params.pageSize - 1,
        p_record_id: params.recordId || null
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '可选运单加载失败，请重试' }
  )
  return { data: result.data?.records ?? [], total: result.data?.total ?? 0, error: result.error }
}

export async function fetchServiceCaseReplies(serviceCaseId: string, tenantId: string) {
  return await responseHandle<ServiceCaseReply[]>(
    () =>
      supabase
        .from('tms_service_case_reply')
        .select('*')
        .eq('service_case_id', serviceCaseId)
        .eq('tenant_id', tenantId)
        .order('create_time')
        .order('id'),
    { breakReturn: true, showErrorMessage: false, errorMessage: '沟通记录加载失败，请重试' }
  )
}

export async function fetchServiceCaseReplyDependencies(serviceCaseIds: string[]) {
  if (!serviceCaseIds.length) return { data: [] as ServiceCaseReply[], error: null }
  return await responseHandle<ServiceCaseReply[]>(
    () => supabase.from('tms_service_case_reply').select('*').in('service_case_id', serviceCaseIds),
    { breakReturn: true, showErrorMessage: false, errorMessage: '服务单关联回复检查失败，请重试' }
  )
}

export async function addServiceCaseReply(input: ServiceCaseReplyInput) {
  return await responseHandle<ServiceCaseReply>(
    () =>
      supabase.from('tms_service_case_reply').insert(keysToSnakeDeep(input)).select('*').single(),
    {
      breakReturn: true,
      showMessage: true,
      showErrorMessage: false,
      errorMessage: '回复保存失败，请重试'
    }
  )
}

export async function fetchServiceCaseMentionOptions(serviceCaseId: string) {
  const result = await responseHandle<{
    users: { label: string; value: string }[]
    organizations: { label: string; value: string }[]
    roles: { label: string; value: string }[]
  }>(
    () =>
      supabase.rpc('tms_list_service_case_mention_targets_secure', { p_case_id: serviceCaseId }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '提及对象加载失败，请重试' }
  )
  if (result.error || !result.data) throw result.error ?? new Error('提及对象未返回')
  return result.data
}

export async function fetchElectronicContractList(params: ElectronicContractSearch) {
  let query = supabase
    .from('tms_electronic_contract')
    .select('*', { count: 'exact' })
    .order('create_time', { ascending: false })
    .range(pageFrom(params), pageTo(params))
  const tenantId = readTenantId(params.tenantId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (params.customerId) query = query.eq('customer_id', params.customerId)
  if (params.recordId) query = query.eq('id', params.recordId)
  if (keyword(params.contractNo))
    query = query.ilike('contract_no', `%${keyword(params.contractNo)}%`)
  if (keyword(params.contractName))
    query = query.ilike('contract_name', `%${keyword(params.contractName)}%`)
  if (params.status) query = query.eq('status', params.status)
  return await responseHandle<ElectronicContractRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchElectronicContractDetail(id: string) {
  let query = supabase.from('tms_electronic_contract').select('*').eq('id', id)
  const tenantId = readTenantId()
  if (tenantId) query = query.eq('tenant_id', tenantId)
  return await responseHandle<ElectronicContractRecord | null>(() => query.maybeSingle(), {
    showErrorMessage: true
  })
}

export async function addElectronicContract(input: ElectronicContractInput) {
  return await responseHandle<ElectronicContractRecord>(
    () =>
      supabase
        .from('tms_electronic_contract')
        .insert(
          keysToSnakeDeep({
            ...input,
            tenantId: writeTenantId(input.tenantId),
            contractNo: '',
            partyBCompany: ''
          })
        )
        .select()
        .single(),
    { showMessage: true, breakReturn: true }
  )
}

export async function editElectronicContract(id: string, input: ElectronicContractInput) {
  const payload = { ...input }
  delete payload.tenantId
  delete payload.customerId
  return await responseHandle<ElectronicContractRecord>(
    () =>
      supabase
        .from('tms_electronic_contract')
        .update(keysToSnakeDeep(payload), { count: 'exact' })
        .eq('id', id)
        .select()
        .single(),
    { showMessage: true, breakReturn: true, requireAffected: true }
  )
}

export async function submitElectronicContractForApproval(id: string) {
  return await responseHandle<ElectronicContractRecord>(
    () => supabase.rpc('tms_submit_electronic_contract_secure', { p_id: id }),
    { showMessage: true, breakReturn: true }
  )
}

export async function signElectronicContract(id: string, input: AgreementSignatureInput) {
  return await responseHandle<ElectronicContractRecord>(
    () =>
      supabase.rpc('tms_sign_electronic_contract_secure', {
        p_id: id,
        p_signatures: keysToSnakeDeep(input)
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function copyElectronicContract(id: string) {
  return await responseHandle<string>(
    () => supabase.rpc('tms_copy_electronic_contract', { p_id: id }),
    { showMessage: true, breakReturn: true }
  )
}

export async function terminateElectronicContract(id: string) {
  return await responseHandle<ElectronicContractRecord>(
    () =>
      supabase
        .from('tms_electronic_contract')
        .update({ status: 'terminated' }, { count: 'exact' })
        .eq('id', id)
        .select()
        .single(),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function fetchTransportAgreementList(params: TransportAgreementSearch) {
  let query = supabase
    .from('tms_transport_agreement')
    .select('*', { count: 'exact' })
    .order('create_time', { ascending: false })
    .range(pageFrom(params), pageTo(params))
  const tenantId = readTenantId(params.tenantId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (params.customerId) query = query.eq('customer_id', params.customerId)
  if (params.recordId) query = query.eq('id', params.recordId)
  if (keyword(params.agreementNo))
    query = query.ilike('agreement_no', `%${keyword(params.agreementNo)}%`)
  if (keyword(params.shipperName))
    query = query.ilike('shipper_name', `%${keyword(params.shipperName)}%`)
  if (params.carrierId) query = query.eq('carrier_id', params.carrierId)
  if (keyword(params.plateNo)) query = query.ilike('plate_no', `%${keyword(params.plateNo)}%`)
  return await responseHandle<TransportAgreementRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function addTransportAgreement(input: TransportAgreementInput) {
  return await responseHandle<TransportAgreementRecord>(
    () =>
      supabase
        .from('tms_transport_agreement')
        .insert(
          keysToSnakeDeep({
            ...storedAgreementEvidenceInput(input),
            tenantId: writeTenantId(input.tenantId),
            agreementNo: '',
            carrierName: '',
            plateNo: ''
          })
        )
        .select()
        .single(),
    { showMessage: true, breakReturn: true }
  )
}

export async function submitTransportAgreementForApproval(id: string) {
  return await responseHandle<TransportAgreementRecord>(
    () => supabase.rpc('tms_submit_transport_agreement_secure', { p_id: id }),
    { showMessage: true, breakReturn: true }
  )
}

export async function signTransportAgreement(id: string, input: AgreementSignatureInput) {
  return await responseHandle<TransportAgreementRecord>(
    () =>
      supabase.rpc('tms_sign_transport_agreement_secure', {
        p_id: id,
        p_signatures: keysToSnakeDeep(input)
      }),
    { showMessage: true, breakReturn: true }
  )
}

export interface TransportAgreementDriverOption {
  id: string
  driverName: string
}

export interface TransportAgreementDriverEvidence {
  driverName: string
  idCardImages: string[]
  registrationImages: string[]
  driverLicenseImages: string[]
  roadPermitImages: string[]
}

export async function fetchTransportAgreementDriverOptions(params: {
  carrierId: string
  vehicleId?: string
}) {
  return await responseHandle<TransportAgreementDriverOption[]>(
    () =>
      supabase.rpc('tms_list_agreement_driver_options_secure', {
        p_carrier_id: params.carrierId,
        p_vehicle_id: params.vehicleId || null
      }),
    { showErrorMessage: true }
  )
}

export async function fetchTransportAgreementDriverEvidence(driverId: string, vehicleId?: string) {
  const result = await responseHandle<TransportAgreementDriverEvidence>(
    () =>
      supabase.rpc('tms_get_agreement_driver_evidence_secure', {
        p_driver_id: driverId,
        p_vehicle_id: vehicleId || null
      }),
    { showErrorMessage: false }
  )
  return result.data ? { ...result, data: await previewAgreementEvidence(result.data) } : result
}

export async function fetchTransportAgreementDetail(id: string) {
  let query = supabase.from('tms_transport_agreement').select('*').eq('id', id)
  const tenantId = readTenantId()
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const result = await responseHandle<TransportAgreementRecord | null>(() => query.maybeSingle(), {
    showErrorMessage: false
  })
  return result.data ? { ...result, data: await previewAgreementEvidence(result.data) } : result
}

export async function editTransportAgreement(id: string, input: TransportAgreementInput) {
  const payload = storedAgreementEvidenceInput(input)
  delete payload.tenantId
  return await responseHandle<TransportAgreementRecord>(
    () =>
      supabase
        .from('tms_transport_agreement')
        .update(keysToSnakeDeep(payload), { count: 'exact' })
        .eq('id', id)
        .select()
        .single(),
    { showMessage: true, breakReturn: true, requireAffected: true }
  )
}

type DeletableBasicTable =
  'tms_service_case' | 'tms_electronic_contract' | 'tms_transport_agreement'

export async function deleteTmsBasicRecords(table: DeletableBasicTable, ids: string[]) {
  return await responseHandle(() => supabase.from(table).delete({ count: 'exact' }).in('id', ids), {
    showMessage: true,
    showErrorMessage: false,
    showReferenceFeedback: false,
    breakReturn: true,
    requireAffected: true
  })
}
