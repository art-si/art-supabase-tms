import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createInitialCustomerPriceForm,
  normalizeCustomerPricePayload
} from '../../src/views/basic-data/customer-price-edit/modules/customer-price-model'
import {
  createEmptyCarrierPriceFeeSummary,
  createInitialCarrierPriceForm,
  normalizeCarrierPricePayload
} from '../../src/views/basic-data/carrier-price-edit/modules/carrier-price-model'
import { normalizeAgreementOrderConfig } from '../../src/views/basic-data/modules/agreement-order-config'

const cargo = {
  cargoId: 'cargo-1',
  cargoName: '钢材',
  cargoCode: 'G-001',
  specModel: 'Q235',
  packageType: 'ton',
  quantity: 2,
  unit: 'ton',
  weightKg: 2000,
  volumeM3: 1.5,
  unitPrice: 120,
  freight: 240,
  sourceContractId: 'contract-1',
  sourceContractNo: 'HT-001',
  sourceContractName: '运输合同',
  sourceContractDetailKey: 'contract-1:1',
  remark: '需防潮'
}

test('customer agreement saves contract, validity, order config, and full cargo details', () => {
  const form = createInitialCustomerPriceForm()
  Object.assign(form, {
    customerId: 'customer-1',
    contractId: 'contract-1',
    agreementStatus: 'effective',
    effectiveFrom: '2026-11-01',
    effectiveTo: '2026-11-30',
    distanceKm: 123.5,
    originRegionPath: ['河南省', '许昌市', '禹州市'],
    destinationRegionPath: ['山西省', '长治市', '潞州区'],
    cargoItems: [cargo]
  })
  form.orderConfig.loadType = 'ftl'
  form.orderConfig.billingMode = 'weight'
  form.orderConfig.vehicleType = 'long_haul_truck'

  const payload = normalizeCustomerPricePayload(form)
  assert.equal(payload.contractId, 'contract-1')
  assert.equal(payload.agreementStatus, 'effective')
  assert.equal(payload.effectiveFrom, '2026-11-01')
  assert.equal(payload.effectiveTo, '2026-11-30')
  assert.equal(payload.distanceKm, 123.5)
  assert.equal(payload.transportType, 'truckload')
  assert.equal(payload.billingMethod, 'by_weight')
  assert.equal(payload.orderConfig?.vehicleType, 'long_haul_truck')
  assert.deepEqual(payload.cargoItems?.[0], cargo)
})

test('carrier agreement keeps order cargo fields alongside legacy cost splits', () => {
  const form = createInitialCarrierPriceForm()
  Object.assign(form, {
    carrierId: 'carrier-1',
    contractId: 'contract-1',
    agreementStatus: 'pending',
    effectiveFrom: '2026-11-01',
    effectiveTo: '2027-10-31',
    distanceKm: 80,
    shippingContactName: '发货人',
    receivingContactName: '收货人',
    cargoItems: [{ ...cargo, splitTransportFee: 150, loadingFee: 10, packageFee: 5 }]
  })
  form.orderConfig.loadType = 'ftl'
  form.orderConfig.billingMode = 'weight'

  const payload = normalizeCarrierPricePayload(form, {
    cargoSummary: { quantity: 2, volume: 1.5, weight: 2000 },
    feeSummary: createEmptyCarrierPriceFeeSummary(),
    editableFields: {
      contactPhones: true,
      addressDetails: true,
      costAmounts: true,
      paymentAmounts: true
    }
  })
  assert.equal(payload.contractId, 'contract-1')
  assert.equal(payload.agreementStatus, 'pending')
  assert.equal(payload.distanceKm, 80)
  assert.equal(payload.billingMethod, 'by_weight')
  assert.equal(payload.orderConfig?.loadType, 'ftl')
  assert.equal(payload.shippingContactName, '发货人')
  assert.equal(payload.cargoItems?.[0]?.sourceContractDetailKey, 'contract-1:1')
  assert.equal(payload.cargoItems?.[0]?.unitPrice, 120)
  assert.equal(payload.cargoItems?.[0]?.splitTransportFee, 150)
})

test('agreement payloads map order billing and load modes to price dictionary values', () => {
  for (const [billingMode, billingMethod] of [
    ['weight', 'by_weight'],
    ['volume', 'by_volume'],
    ['quantity', 'by_quantity']
  ] as const) {
    const customer = createInitialCustomerPriceForm()
    customer.orderConfig.loadType = 'ftl'
    customer.orderConfig.billingMode = billingMode
    const customerPayload = normalizeCustomerPricePayload(customer)
    assert.equal(customerPayload.transportType, 'truckload')
    assert.equal(customerPayload.billingMethod, billingMethod)

    customer.orderConfig.loadType = 'ltl'
    assert.equal(normalizeCustomerPricePayload(customer).transportType, 'less_than_truckload')

    const carrier = createInitialCarrierPriceForm()
    carrier.orderConfig.billingMode = billingMode
    const carrierPayload = normalizeCarrierPricePayload(carrier, {
      cargoSummary: { quantity: 0, volume: 0, weight: 0 },
      feeSummary: createEmptyCarrierPriceFeeSummary(),
      editableFields: {
        contactPhones: true,
        addressDetails: true,
        costAmounts: true,
        paymentAmounts: true
      }
    })
    assert.equal(carrierPayload.billingMethod, billingMethod)
  }
})

test('legacy vehicle billing is not silently treated as quantity billing', () => {
  const legacy = normalizeAgreementOrderConfig({
    transportType: 'truckload',
    billingMethod: 'by_vehicle'
  })
  assert.equal(legacy.loadType, 'ftl')
  assert.equal(legacy.billingMode, '')
  assert.equal(
    normalizeAgreementOrderConfig({ billingMethod: 'by_quantity' }).billingMode,
    'quantity'
  )
})

test('carrier payload omits masked phones and addresses without edit access', () => {
  const form = createInitialCarrierPriceForm()
  Object.assign(form, {
    contactPhone: '138****0000',
    driverPhone: '139****0000',
    shippingContactPhone: '137****0000',
    receivingContactPhone: '136****0000',
    shippingAddressId: 'address-1',
    receivingAddressId: 'address-2',
    shippingAddressDetail: '已遮罩地址',
    receivingAddressDetail: '已遮罩地址',
    shippingLongitude: 100,
    shippingLatitude: 20,
    receivingLongitude: 101,
    receivingLatitude: 21,
    distanceKm: 120
  })
  const payload = normalizeCarrierPricePayload(form, {
    cargoSummary: { quantity: 0, volume: 0, weight: 0 },
    feeSummary: createEmptyCarrierPriceFeeSummary(),
    editableFields: {
      contactPhones: false,
      addressDetails: false,
      costAmounts: true,
      paymentAmounts: true
    }
  })
  for (const key of [
    'contactPhone',
    'driverPhone',
    'shippingContactPhone',
    'receivingContactPhone',
    'shippingAddressId',
    'receivingAddressId',
    'shippingAddressDetail',
    'receivingAddressDetail',
    'shippingLongitude',
    'shippingLatitude',
    'receivingLongitude',
    'receivingLatitude',
    'distanceKm'
  ] as const) {
    assert.equal(key in payload, false, `${key} must be omitted`)
  }
})
