import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDriverFormFieldPermission,
  sanitizeDriverFormFields
} from '../../src/views/basic-data/driver/modules/driver-dialog-model'

for (const driverOwnership of ['individual', 'self', 'carrier']) {
  test(driverOwnership + ' driver edit omits readonly/hidden base and profile fields', () => {
    const input = {
      id: 'driver',
      driverOwnership,
      driverStatus: 'on_duty',
      licenseExpireDate: '2031-11-30',
      phone: '138****0001',
      idCardNo: '***',
      idCardIssuer: '',
      birthDate: null,
      idCardLongTerm: false,
      homeAddress: '',
      homeRegionCode: '',
      homeAddressDetail: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      financeInvoiceName: '',
      financeTaxNo: '',
      financeBankName: '',
      financeBankAccount: '',
      financeBankBranch: '',
      financeDefaultAccount: false,
      licenseClasses: ['A2'],
      licenseIssuer: '可编辑发证机关',
      fieldAccess: {
        contactPhone: 'masked',
        idCardNo: 'read',
        homeAddress: 'hidden',
        emergencyContact: 'hidden',
        identityDocuments: 'edit',
        financialAccount: 'hidden'
      } as const
    }
    const payload = sanitizeDriverFormFields(input)
    for (const key of [
      'phone',
      'idCardNo',
      'idCardIssuer',
      'birthDate',
      'idCardLongTerm',
      'homeAddress',
      'homeRegionCode',
      'homeAddressDetail',
      'emergencyContactName',
      'emergencyContactPhone',
      'financeInvoiceName',
      'financeTaxNo',
      'financeBankName',
      'financeBankAccount',
      'financeBankBranch',
      'financeDefaultAccount'
    ])
      assert.equal(Object.hasOwn(payload, key), false, key)
    assert.deepEqual(payload.licenseClasses, ['A2'])
    assert.equal(payload.licenseExpireDate, '2031-11-30')
    assert.equal(payload.driverOwnership, driverOwnership)
    assert.equal(Object.hasOwn(input, 'financeDefaultAccount'), true, 'must not mutate form state')
  })
}

test('readonly documents are absent rather than sent as null or empty defaults', () => {
  const payload = sanitizeDriverFormFields({
    id: 'driver',
    licenseExpireDate: '2031-11-30',
    idCardFrontUrl: null,
    idCardBackUrl: null,
    driverLicenseFrontUrl: null,
    driverLicenseBackUrl: null,
    portraitUrl: null,
    licenseArchiveNo: '',
    licenseClasses: ['A2'],
    licenseIssuer: '',
    licenseValidFrom: null,
    licenseLongTerm: false,
    licenseBackExtraUrl: null,
    qualificationType: null,
    qualificationNo: '',
    qualificationValidTo: null,
    qualificationFrontUrl: null,
    qualificationAssessmentUrl: null,
    fieldAccess: { identityDocuments: 'read' } as const
  })
  for (const key of [
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
  ])
    assert.equal(Object.hasOwn(payload, key), false, key)
  assert.equal(payload.licenseExpireDate, '2031-11-30')
})

test('editable fields retain explicit clears and false values', () => {
  const input = {
    id: 'driver',
    driverLicenseFrontUrl: null,
    qualificationType: null,
    licenseLongTerm: false,
    licenseClasses: [],
    financeBankAccount: '',
    financeDefaultAccount: false,
    fieldAccess: { identityDocuments: 'edit', financialAccount: 'edit' } as const
  }
  assert.deepEqual(sanitizeDriverFormFields(input), input)
})

test('create input keeps the existing server-validated create contract', () => {
  const input = {
    id: undefined,
    driverOwnership: 'individual',
    qualificationType: null,
    financeDefaultAccount: false
  }
  assert.equal(sanitizeDriverFormFields(input), input)
})

test('form metadata uses the same permission groups as its payload', () => {
  assert.equal(getDriverFormFieldPermission('financeBankAccount'), 'financialAccount')
  assert.equal(getDriverFormFieldPermission('licenseClasses'), 'identityDocuments')
  assert.equal(getDriverFormFieldPermission('birthDate'), 'idCardNo')
  assert.equal(getDriverFormFieldPermission('homeRegionCode'), 'homeAddress')
  assert.equal(getDriverFormFieldPermission('licenseExpireDate'), undefined)
  assert.equal(getDriverFormFieldPermission('driverStatus'), undefined)
})
