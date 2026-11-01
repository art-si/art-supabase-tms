import { useSupabase } from '@/hooks/core/useSupabase'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { normalizeNullableText } from '@/utils/form/normalize'
import { resolveTenantWriteTargetId } from '@/utils/tenant-scope-context'

export interface TmsRecordAudit {
  id: string
  tenantId: string
  createBy: string
  createTime: string
  updateBy?: string | null
  updateTime: string
}

export interface DriverBlacklistRecord extends TmsRecordAudit {
  driverName: string
  phone: string
  organizationName: string
  blacklistedAt: string
  reason: string
  remark: string | null
}

export interface ServiceCaseRecord extends TmsRecordAudit {
  serviceNo: string
  organizationName: string
  serviceType: 'complaint' | 'consultation'
  complaintTypes: string[]
  title: string
  waybillNo: string | null
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
  status: 'pending_signed' | 'signed' | 'terminated'
}

export interface TransportAgreementRecord extends TmsRecordAudit {
  agreementNo: string
  shipperName: string
  carrierId: string
  carrierName: string
  contactPhone: string
  vehicleId: string
  plateNo: string
  vehicleType: string | null
  vehicleLengthM: number | null
  startsOn: string | null
  endsOn: string | null
  status: 'pending_signed' | 'signed' | 'revision_requested'
  contentHtml: string
  idCardImages: string[]
  registrationImages: string[]
  driverLicenseImage: string | null
  roadPermitImage: string | null
  partyASeal: string
  partyARepresentative: string
  partyASignedOn: string
  partyBSeal: string
  partyBRepresentative: string
  partyBSignedOn: string
}

export type BlacklistInput = Pick<
  DriverBlacklistRecord,
  'driverName' | 'phone' | 'organizationName' | 'blacklistedAt' | 'reason' | 'remark'
> & { tenantId?: string }

export type ServiceCaseInput = Pick<
  ServiceCaseRecord,
  | 'serviceType'
  | 'complaintTypes'
  | 'title'
  | 'waybillNo'
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
> & { tenantId?: string }

export type TransportAgreementInput = Pick<
  TransportAgreementRecord,
  | 'shipperName'
  | 'carrierId'
  | 'contactPhone'
  | 'vehicleId'
  | 'startsOn'
  | 'endsOn'
  | 'status'
  | 'contentHtml'
  | 'idCardImages'
  | 'registrationImages'
  | 'driverLicenseImage'
  | 'roadPermitImage'
  | 'partyASeal'
  | 'partyARepresentative'
  | 'partyASignedOn'
  | 'partyBSeal'
  | 'partyBRepresentative'
  | 'partyBSignedOn'
> & { tenantId?: string }

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
  serviceNo?: string
  waybillNo?: string
  complaintType?: string
  serviceType?: string
  status?: string
}

export interface ElectronicContractSearch extends ListPage {
  contractNo?: string
  contractName?: string
  status?: string
}

export interface TransportAgreementSearch extends ListPage {
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
  let query = supabase
    .from('tms_driver_blacklist')
    .select('*', { count: 'exact' })
    .order('blacklisted_at', { ascending: false })
    .range(pageFrom(params), pageTo(params))
  const tenantId = readTenantId(params.tenantId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (keyword(params.driverName))
    query = query.ilike('driver_name', `%${keyword(params.driverName)}%`)
  if (keyword(params.phone)) query = query.ilike('phone', `%${keyword(params.phone)}%`)
  if (keyword(params.organizationName))
    query = query.ilike('organization_name', `%${keyword(params.organizationName)}%`)
  return await responseHandle<DriverBlacklistRecord[]>(() => query, { showErrorMessage: true })
}

export async function addDriverBlacklist(input: BlacklistInput) {
  return await responseHandle<DriverBlacklistRecord>(
    () =>
      supabase
        .from('tms_driver_blacklist')
        .insert(keysToSnakeDeep({ ...input, tenantId: writeTenantId(input.tenantId) }))
        .select()
        .single(),
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

export async function fetchElectronicContractList(params: ElectronicContractSearch) {
  let query = supabase
    .from('tms_electronic_contract')
    .select('*', { count: 'exact' })
    .order('create_time', { ascending: false })
    .range(pageFrom(params), pageTo(params))
  const tenantId = readTenantId(params.tenantId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
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
    { showMessage: true, breakReturn: true, requireAffected: true }
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
            ...input,
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

export async function editTransportAgreement(id: string, input: TransportAgreementInput) {
  const payload = { ...input }
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
  | 'tms_driver_blacklist'
  | 'tms_service_case'
  | 'tms_electronic_contract'
  | 'tms_transport_agreement'

export async function deleteTmsBasicRecords(table: DeletableBasicTable, ids: string[]) {
  return await responseHandle(() => supabase.from(table).delete({ count: 'exact' }).in('id', ids), {
    showMessage: true,
    showErrorMessage: false,
    showReferenceFeedback: false,
    breakReturn: true,
    requireAffected: true
  })
}
