import { cloneDeep, omit } from 'lodash-es'
import {
  createInitialOrderConfig,
  normalizeCargoItems
} from '../../../order-open/modules/order-open-model'
import { normalizeNullableNumber, normalizeNullableText } from '@/utils/form/normalize'
import {
  joinRegionPath,
  normalizeMoney,
  roundNumber,
  toNumber,
  type CargoSummary
} from '../../modules/price-form-utils'

export type CarrierPrice = Api.Tms.BasicData.CarrierPrice
export type CarrierPriceCargoItem = Api.Tms.BasicData.CarrierPriceCargoItem

export type CarrierPriceForm = CarrierPrice & {
  orderConfig: Api.Tms.Order.OrderConfig
  cargoItems: CarrierPriceCargoItem[]
  originRegionPath: string[]
  destinationRegionPath: string[]
}

export interface CarrierPriceFeeSummary {
  splitTransportFee: number
  loadingFee: number
  packageFee: number
  totalFee: number
}

interface NormalizeCarrierPriceOptions {
  cargoSummary: CargoSummary
  feeSummary: CarrierPriceFeeSummary
  editableFields: {
    addressDetails: boolean
    contactPhones: boolean
    costAmounts: boolean
    paymentAmounts: boolean
  }
}

const paymentFields: Array<keyof CarrierPriceForm> = [
  'cashAmount',
  'prepaidAmount',
  'collectAmount',
  'periodicAmount'
]

export function createInitialCarrierPriceCargoItem(): CarrierPriceCargoItem {
  return {
    orderNo: '',
    originRegion: '',
    destinationRegion: '',
    cargoName: '',
    quantity: null,
    unit: 'box',
    volumeM3: null,
    weightKg: null,
    splitTransportFee: 0,
    loadingFee: 0,
    packageFee: 0
  }
}

export function createInitialCarrierPriceForm(): CarrierPriceForm {
  return {
    id: undefined,
    quoteNo: '',
    contractId: null,
    effectiveFrom: null,
    effectiveTo: null,
    agreementStatus: 'draft',
    distanceKm: null,
    orderConfig: createInitialOrderConfig(),
    shippingAddressDetail: '',
    receivingAddressDetail: '',
    shippingLongitude: null,
    shippingLatitude: null,
    receivingLongitude: null,
    receivingLatitude: null,
    carrierId: '',
    carrier: null,
    driverId: null,
    driver: null,
    vehicleId: null,
    vehicle: null,
    originRegion: '',
    destinationRegion: '',
    originRegionPath: [],
    destinationRegionPath: [],
    transportMode: '',
    contactName: '',
    contactPhone: '',
    driverName: '',
    driverPhone: '',
    plateNo: '',
    vehicleType: '',
    vehicleLength: '',
    cargoItems: [createInitialCarrierPriceCargoItem()],
    cargoQuantityTotal: 0,
    cargoVolumeTotal: 0,
    cargoWeightTotal: 0,
    billingMethod: '',
    transportCost: 0,
    splitTransportFee: 0,
    loadingFee: 0,
    packageFee: 0,
    otherFee: 0,
    totalFee: 0,
    cashAmount: 0,
    prepaidAmount: 0,
    collectAmount: 0,
    periodicAmount: 0,
    paymentTotal: 0,
    remark: ''
  }
}

export function createEmptyCarrierPriceFeeSummary(): CarrierPriceFeeSummary {
  return { splitTransportFee: 0, loadingFee: 0, packageFee: 0, totalFee: 0 }
}

export function normalizeCarrierPriceCargoItems(
  items: CarrierPriceCargoItem[] | undefined
): CarrierPriceCargoItem[] {
  return (items ?? [])
    .map((item) => ({
      ...normalizeCargoItems([item])[0],
      orderNo: normalizeNullableText(item.orderNo),
      originRegion: normalizeNullableText(item.originRegion),
      destinationRegion: normalizeNullableText(item.destinationRegion),
      cargoName: normalizeNullableText(item.cargoName),
      quantity: normalizeNullableNumber(item.quantity),
      unit: normalizeNullableText(item.unit),
      volumeM3: normalizeNullableNumber(item.volumeM3),
      weightKg: normalizeNullableNumber(item.weightKg),
      splitTransportFee: normalizeMoney(item.splitTransportFee),
      loadingFee: normalizeMoney(item.loadingFee),
      packageFee: normalizeMoney(item.packageFee)
    }))
    .filter(
      (item) =>
        item.orderNo ||
        item.cargoName ||
        item.quantity ||
        item.volumeM3 ||
        item.weightKg ||
        item.splitTransportFee ||
        item.loadingFee ||
        item.packageFee
    )
}

export function normalizeCarrierPricePayload(
  form: CarrierPriceForm,
  options: NormalizeCarrierPriceOptions
): CarrierPrice {
  const raw = cloneDeep(form)
  const payload = omit(raw, [
    'tenantId',
    'carrier',
    'contract',
    'driver',
    'vehicle',
    'originRegionPath',
    'destinationRegionPath',
    'createBy',
    'createTime',
    'updateBy',
    'updateTime',
    'fieldAccess',
    'isRecordOwner'
  ]) as CarrierPrice

  Object.assign(payload, {
    originRegion: joinRegionPath(raw.originRegionPath),
    destinationRegion: joinRegionPath(raw.destinationRegionPath),
    contractId: normalizeNullableText(raw.contractId),
    effectiveFrom: normalizeNullableText(raw.effectiveFrom),
    effectiveTo: normalizeNullableText(raw.effectiveTo),
    distanceKm: normalizeNullableNumber(raw.distanceKm),
    orderConfig: cloneDeep(raw.orderConfig),
    billingMethod: raw.orderConfig.billingMode
      ? `by_${raw.orderConfig.billingMode}`
      : raw.billingMethod,
    driverId: normalizeNullableText(raw.driverId),
    vehicleId: normalizeNullableText(raw.vehicleId),
    contactName: normalizeNullableText(raw.contactName),
    contactPhone: normalizeNullableText(raw.contactPhone),
    driverName: normalizeNullableText(raw.driverName),
    driverPhone: normalizeNullableText(raw.driverPhone),
    plateNo: normalizeNullableText(raw.plateNo),
    vehicleType: raw.orderConfig.vehicleType || null,
    vehicleLength:
      raw.orderConfig.vehicleLengthM == null ? null : String(raw.orderConfig.vehicleLengthM),
    cargoItems: normalizeCarrierPriceCargoItems(raw.cargoItems),
    cargoQuantityTotal: options.cargoSummary.quantity,
    cargoVolumeTotal: options.cargoSummary.volume,
    cargoWeightTotal: options.cargoSummary.weight,
    transportCost: normalizeMoney(raw.transportCost),
    splitTransportFee: options.feeSummary.splitTransportFee,
    loadingFee: options.feeSummary.loadingFee,
    packageFee: options.feeSummary.packageFee,
    otherFee: normalizeMoney(raw.otherFee),
    totalFee: options.feeSummary.totalFee,
    cashAmount: normalizeMoney(raw.cashAmount),
    prepaidAmount: normalizeMoney(raw.prepaidAmount),
    collectAmount: normalizeMoney(raw.collectAmount),
    periodicAmount: normalizeMoney(raw.periodicAmount),
    paymentTotal: roundNumber(
      paymentFields.reduce((total, field) => total + toNumber(raw[field] as number), 0),
      2
    ),
    remark: normalizeNullableText(raw.remark)
  })

  if (!options.editableFields.contactPhones) {
    removePayloadFields(payload, [
      'carrierId',
      'contactName',
      'contactPhone',
      'shippingContactPhone',
      'receivingContactPhone',
      'driverId',
      'driverName',
      'driverPhone'
    ])
  }
  if (!options.editableFields.addressDetails) {
    removePayloadFields(payload, [
      'shippingAddressId',
      'receivingAddressId',
      'shippingAddressDetail',
      'receivingAddressDetail',
      'shippingLongitude',
      'shippingLatitude',
      'receivingLongitude',
      'receivingLatitude',
      'distanceKm'
    ])
  }
  if (!options.editableFields.costAmounts) {
    removePayloadFields(payload, [
      'cargoItems',
      'cargoQuantityTotal',
      'cargoVolumeTotal',
      'cargoWeightTotal',
      'transportCost',
      'splitTransportFee',
      'loadingFee',
      'packageFee',
      'otherFee',
      'totalFee'
    ])
  }
  if (!options.editableFields.paymentAmounts) {
    removePayloadFields(payload, [
      'cashAmount',
      'prepaidAmount',
      'collectAmount',
      'periodicAmount',
      'paymentTotal'
    ])
  }

  return payload
}

function removePayloadFields(payload: CarrierPrice, fields: Array<keyof CarrierPrice>): void {
  fields.forEach((field) => Reflect.deleteProperty(payload, field))
}
