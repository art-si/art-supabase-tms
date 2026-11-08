import { omitNonEditableFieldGroups } from '@/utils/field-permission'

type DriverFieldKey = Api.Tms.BasicData.DriverFieldKey

/** Mirrors the existing driver/profile field groups enforced by the secure write RPC. */
const DRIVER_FIELD_GROUPS: Record<DriverFieldKey, readonly string[]> = {
  contactPhone: ['phone'],
  idCardNo: [
    'idCardNo',
    'idCardIssuer',
    'birthDate',
    'ethnicity',
    'idCardValidFrom',
    'idCardValidTo',
    'idCardLongTerm'
  ],
  homeAddress: ['homeAddress', 'homeRegionCode', 'homeAddressDetail'],
  emergencyContact: ['emergencyContactName', 'emergencyContactPhone'],
  identityDocuments: [
    'idCardFrontUrl',
    'idCardBackUrl',
    'driverLicenseFrontUrl',
    'driverLicenseBackUrl',
    'portraitUrl',
    'licenseArchiveNo',
    'licenseClasses',
    'licenseIssuer',
    'licenseValidFrom',
    'licenseLongTerm',
    'licenseBackExtraUrl',
    'qualificationType',
    'qualificationNo',
    'qualificationValidTo',
    'qualificationFrontUrl',
    'qualificationAssessmentUrl'
  ],
  financialAccount: [
    'financeInvoiceName',
    'financeTaxNo',
    'financeBankName',
    'financeBankAccount',
    'financeBankBranch',
    'financeDefaultAccount'
  ]
}

export function getDriverFormFieldPermission(key: string): DriverFieldKey | undefined {
  // Entries originate from the static, exhaustive permission map above.
  const groups = Object.entries(DRIVER_FIELD_GROUPS) as Array<[DriverFieldKey, readonly string[]]>
  return groups.find(([, fields]) => fields.includes(key))?.[0]
}

export function sanitizeDriverFormFields<
  T extends { id?: string; fieldAccess?: Api.Tms.BasicData.DriverFieldAccessMap }
>(record: T): T {
  return record.id
    ? omitNonEditableFieldGroups(record, record.fieldAccess, DRIVER_FIELD_GROUPS)
    : record
}
