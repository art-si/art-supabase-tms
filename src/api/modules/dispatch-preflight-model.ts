import { isPlainObjectRecord } from '@/utils/type-guards'

export interface DispatchPreflightInput {
  orderId: string
  tenantId?: string | null
  vehicleId?: string | null
  driverId?: string | null
}
export interface DispatchPreflightResult {
  requestId: string
  checkedAt: string
  advisories: Array<{ subjectLabel: string; message: string }>
  certificateRisks: Array<{
    riskKind: 'expired' | 'revoked'
    subjectType: 'vehicle' | 'driver'
    subjectId: string
    subjectLabel: string
    certificateType: string
    expiresOn: string | null
  }>
  certificateBlocked: boolean
  canOverrideCertificateRisk: boolean
}

export function parseDispatchPreflightResult(value: unknown): DispatchPreflightResult {
  if (
    !isPlainObjectRecord(value) ||
    typeof value.requestId !== 'string' ||
    typeof value.checkedAt !== 'string' ||
    typeof value.certificateBlocked !== 'boolean' ||
    typeof value.canOverrideCertificateRisk !== 'boolean' ||
    !Array.isArray(value.advisories) ||
    !Array.isArray(value.certificateRisks)
  )
    throw new Error('综合核验结果不完整，请重试')
  const advisories = value.advisories.map((item) => {
    if (
      !isPlainObjectRecord(item) ||
      typeof item.subjectLabel !== 'string' ||
      typeof item.message !== 'string'
    )
      throw new Error('调度提醒结果不完整，请重试')
    return { subjectLabel: item.subjectLabel, message: item.message }
  })
  const certificateRisks = value.certificateRisks.map<
    DispatchPreflightResult['certificateRisks'][number]
  >((item) => {
    if (
      !isPlainObjectRecord(item) ||
      (item.riskKind !== 'expired' && item.riskKind !== 'revoked') ||
      (item.subjectType !== 'vehicle' && item.subjectType !== 'driver') ||
      typeof item.subjectId !== 'string' ||
      typeof item.subjectLabel !== 'string' ||
      typeof item.certificateType !== 'string' ||
      (item.expiresOn !== null && typeof item.expiresOn !== 'string')
    )
      throw new Error('证照核验结果不完整，请重试')
    return {
      riskKind: item.riskKind,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      subjectLabel: item.subjectLabel,
      certificateType: item.certificateType,
      expiresOn: item.expiresOn
    }
  })
  return {
    requestId: value.requestId,
    checkedAt: value.checkedAt,
    advisories,
    certificateRisks,
    certificateBlocked: value.certificateBlocked,
    canOverrideCertificateRisk: value.canOverrideCertificateRisk
  }
}
