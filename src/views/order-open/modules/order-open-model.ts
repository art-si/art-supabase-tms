import { normalizeNullableNumber, normalizeNullableText } from '@/utils/form/normalize'
import { cloneDeep, omit, round, trim } from 'lodash-es'
import dayjs from 'dayjs'
import { isReadableFieldAccess, getFieldAccess } from '@/utils/field-permission'

export type OrderRecord = Api.Tms.Order.OrderRecord
export type CargoItem = Api.Tms.Order.CargoItem
export type CustomerPrice = Api.Tms.BasicData.CustomerPrice
export type FavoriteRoute = Api.Tms.BasicData.FavoriteRoute
export type CustomerAddress = Api.Tms.BasicData.CustomerAddress

export type OrderForm = Omit<OrderRecord, 'orderConfig'> & {
  imageUrls: string[]
  shippingCustomerName: string
  receivingCustomerName: string
  orderConfig: Api.Tms.Order.OrderConfig
}

export function createInitialOrderConfig(): Api.Tms.Order.OrderConfig {
  return {
    loadType: 'ltl',
    allowConsolidation: false,
    vehicleType: '',
    vehicleLengthM: null,
    vehicleVolumeM3: null,
    vehicleLoadTons: null,
    truckCount: null,
    billingMode: '',
    billingUnit: '',
    cargoCategory: 'general',
    tempMinC: null,
    tempMaxC: null,
    packaging: 'bulk',
    selfPickup: false,
    insured: false,
    transportRequirements: [],
    trackingMethod: '',
    trackingNumber: '',
    remark: '',
    attachmentUrls: []
  }
}

export interface OrderCargoSummary {
  quantity: number
  weight: number
  volume: number
}

interface NormalizeOrderPayloadOptions {
  form: OrderForm
  stationNames: {
    origin?: string
    destination?: string
    transfer?: string
  }
}

const feeFields: Array<keyof OrderForm> = [
  'transportFee',
  'deliveryFee',
  'unloadingFee',
  'collectPaymentFee',
  'transferFee',
  'insuranceFee',
  'packageFee',
  'otherFee'
]

const paymentFields: Array<keyof OrderForm> = [
  'cashAmount',
  'collectAmount',
  'monthlyAmount',
  'codAmount',
  'handlingFee'
]

export function createInitialCargoItem(): CargoItem {
  return {
    cargoId: null,
    cargoName: '',
    cargoCode: '',
    specModel: '',
    remark: '',
    packageType: '',
    quantity: null,
    unit: '',
    weightKg: null,
    volumeM3: null,
    unitPrice: null,
    freight: null,
    sourceContractId: null,
    sourceContractNo: null,
    sourceContractName: null,
    sourceContractDetailKey: null
  }
}

export function createInitialForm(): OrderForm {
  return {
    orderNo: '',
    orderStatus: 'pending_load',
    originStationId: null,
    destinationStationId: null,
    transferStationId: null,
    transferStationIds: [],
    originStation: '',
    destinationStation: '',
    transferStation: '',
    deliveryMethod: 'door',
    shippingCustomerId: null,
    contractId: null,
    receivingCustomerId: null,
    shippingCustomerName: '',
    receivingCustomerName: '',
    shippingAddressId: null,
    receivingAddressId: null,
    shippingContactName: '',
    shippingContactPhone: '',
    shippingAddressDetail: '',
    shippingRegionPath: [],
    shippingLongitude: null,
    shippingLatitude: null,
    receivingContactName: '',
    receivingContactPhone: '',
    receivingAddressDetail: '',
    receivingRegionPath: [],
    receivingLongitude: null,
    receivingLatitude: null,
    distanceKm: null,
    departureAt: dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
    arrivalAt: null,
    orderConfig: createInitialOrderConfig(),
    cargoItems: [createInitialCargoItem()],
    cargoQuantityTotal: 0,
    cargoWeightTotal: 0,
    cargoVolumeTotal: 0,
    transportFee: 0,
    deliveryFee: 0,
    unloadingFee: 0,
    collectPaymentFee: 0,
    transferFee: 0,
    declaredValue: 0,
    insuranceFee: 0,
    packageFee: 0,
    otherFee: 0,
    totalFee: 0,
    paymentMethod: 'collect',
    cashAmount: 0,
    collectAmount: 0,
    monthlyAmount: 0,
    codAmount: 0,
    handlingFee: 0,
    paymentTotal: 0,
    transportMode: 'road',
    orderRemark: '',
    imageUrls: []
  }
}

export function textValue(value?: string | null): string {
  return trim(String(value ?? ''))
}

export function formatOrderAddress(region?: string | null, address?: string | null): string {
  const regionText = textValue(region)
  const addressText = textValue(address)
  if (!regionText) return addressText
  if (!addressText) return regionText
  const normalizedRegion = regionText.replace(/[\s,，/／]+/g, '')
  const normalizedAddress = addressText.replace(/[\s,，/／]+/g, '')
  if (normalizedRegion && normalizedAddress.startsWith(normalizedRegion)) return addressText
  return `${regionText} ${addressText}`
}

export function parseOrderRegionPath(region?: string | null): string[] {
  return textValue(region)
    .split(/[/／,，]/)
    .map(textValue)
    .filter(Boolean)
}

export function stripOrderRegionPrefix(address: string, path: string[]): string {
  const prefix = path.join('')
  const normalized = textValue(address)
  return prefix && normalized.startsWith(prefix)
    ? textValue(normalized.slice(prefix.length))
    : normalized
}

function resolveEndpointCustomer(
  route: FavoriteRoute,
  address?: CustomerAddress | null
): Api.Tms.BasicData.CustomerOption | null {
  if (address?.customer) return address.customer
  if (!address?.customerId || address.customerId === route.customerId) return route.customer ?? null
  return null
}

export function createFavoriteRouteContactPatch(route: FavoriteRoute): Partial<OrderForm> {
  const origin = route.originAddress
  const destination = route.destinationAddress
  const originCustomer = resolveEndpointCustomer(route, origin)
  const destinationCustomer = resolveEndpointCustomer(route, destination)
  const originPhoneAccess = getFieldAccess(origin?.fieldAccess, 'contactPhone')
  const originAddressAccess = getFieldAccess(origin?.fieldAccess, 'addressDetail')
  const destinationPhoneAccess = getFieldAccess(destination?.fieldAccess, 'contactPhone')
  const destinationAddressAccess = getFieldAccess(destination?.fieldAccess, 'addressDetail')
  const canReadOriginPhone = isReadableFieldAccess(originPhoneAccess)
  const canReadOriginAddress = isReadableFieldAccess(originAddressAccess)
  const canReadDestinationPhone = isReadableFieldAccess(destinationPhoneAccess)
  const canReadDestinationAddress = isReadableFieldAccess(destinationAddressAccess)

  return {
    shippingCustomerId: origin?.customerId || route.customerId || null,
    shippingCustomerName: originCustomer?.customerName || '',
    shippingAddressId: origin?.id || route.originAddressId || null,
    shippingContactName: textValue(origin?.contactName) || originCustomer?.customerName || '',
    shippingContactPhone: canReadOriginPhone ? textValue(origin?.contactPhone) : '',
    shippingRegionPath: canReadOriginAddress ? parseOrderRegionPath(origin?.region) : [],
    shippingAddressDetail: canReadOriginAddress ? textValue(origin?.addressDetail) : '',
    shippingLongitude: canReadOriginAddress ? (origin?.longitude ?? null) : null,
    shippingLatitude: canReadOriginAddress ? (origin?.latitude ?? null) : null,
    receivingCustomerId: destination?.customerId || route.customerId || null,
    receivingCustomerName: destinationCustomer?.customerName || '',
    receivingAddressId: destination?.id || route.destinationAddressId || null,
    receivingContactName:
      textValue(destination?.contactName) || destinationCustomer?.customerName || '',
    receivingContactPhone: canReadDestinationPhone ? textValue(destination?.contactPhone) : '',
    receivingRegionPath: canReadDestinationAddress ? parseOrderRegionPath(destination?.region) : [],
    receivingAddressDetail: canReadDestinationAddress ? textValue(destination?.addressDetail) : '',
    receivingLongitude: canReadDestinationAddress ? (destination?.longitude ?? null) : null,
    receivingLatitude: canReadDestinationAddress ? (destination?.latitude ?? null) : null
  }
}

export function moneyValue(value?: number | string | null): number {
  return round(normalizeNullableNumber(value) ?? 0, 2)
}

export function createCustomerPriceBusinessPatch(
  price: CustomerPrice,
  currentRemark?: string | null
): Partial<OrderForm> {
  return {
    transportFee: moneyValue(price.transportFee),
    unloadingFee: moneyValue(price.loadingFee),
    transferFee: moneyValue(price.transferFee),
    insuranceFee: moneyValue(price.insuranceFee),
    packageFee: moneyValue(price.packageFee),
    otherFee: moneyValue(price.otherFee) + moneyValue(price.fuelFee) + moneyValue(price.serviceFee),
    cashAmount: moneyValue(price.cashAmount) + moneyValue(price.prepaidAmount),
    collectAmount: moneyValue(price.collectAmount),
    monthlyAmount: moneyValue(price.periodicAmount),
    orderRemark: price.remark ? textValue(price.remark) : textValue(currentRemark)
  }
}

export function normalizeCargoItems(items?: CargoItem[]): CargoItem[] {
  return (items ?? [])
    .map((item) => ({
      cargoId: normalizeNullableText(item.cargoId),
      cargoName: textValue(item.cargoName),
      cargoCode: normalizeNullableText(item.cargoCode),
      specModel: normalizeNullableText(item.specModel),
      remark: normalizeNullableText(item.remark),
      packageType: textValue(item.packageType),
      quantity: normalizeNullableNumber(item.quantity),
      unit: textValue(item.unit),
      weightKg: normalizeNullableNumber(item.weightKg),
      volumeM3: normalizeNullableNumber(item.volumeM3),
      unitPrice: normalizeNullableNumber(item.unitPrice),
      freight: normalizeNullableNumber(item.freight),
      sourceContractId: normalizeNullableText(item.sourceContractId),
      sourceContractNo: normalizeNullableText(item.sourceContractNo),
      sourceContractName: normalizeNullableText(item.sourceContractName),
      sourceContractDetailKey: normalizeNullableText(item.sourceContractDetailKey)
    }))
    .filter(
      (item) =>
        item.cargoName || item.packageType || item.quantity || item.weightKg || item.volumeM3
    )
}

export function calculateOrderCargoSummary(items?: CargoItem[]): OrderCargoSummary {
  return {
    quantity: round(
      (items ?? []).reduce((sum, item) => sum + (normalizeNullableNumber(item.quantity) ?? 0), 0),
      0
    ),
    weight: round(
      (items ?? []).reduce((sum, item) => sum + (normalizeNullableNumber(item.weightKg) ?? 0), 0),
      2
    ),
    volume: round(
      (items ?? []).reduce((sum, item) => sum + (normalizeNullableNumber(item.volumeM3) ?? 0), 0),
      3
    )
  }
}

function sumOrderFields(form: OrderForm, fields: Array<keyof OrderForm>): number {
  return round(
    fields.reduce((sum, field) => sum + (normalizeNullableNumber(form[field] as number) ?? 0), 0),
    2
  )
}

export function normalizeOrderPayload({
  form,
  stationNames
}: NormalizeOrderPayloadOptions): OrderRecord {
  const raw = cloneDeep(form)
  const payload = omit(raw, [
    'tenantId',
    'shippingCustomer',
    'receivingCustomer',
    'shippingCustomerName',
    'receivingCustomerName',
    'originStationRef',
    'destinationStationRef',
    'transferStationRef',
    'createBy',
    'createTime',
    'updateBy',
    'updateTime'
  ]) as OrderRecord
  const cargoItems = normalizeCargoItems(raw.cargoItems)
  const cargoSummary = calculateOrderCargoSummary(cargoItems)

  Object.assign(payload, {
    cargoItems,
    cargoQuantityTotal: cargoSummary.quantity,
    cargoWeightTotal: cargoSummary.weight,
    cargoVolumeTotal: cargoSummary.volume,
    transportFee: moneyValue(raw.transportFee),
    deliveryFee: moneyValue(raw.deliveryFee),
    unloadingFee: moneyValue(raw.unloadingFee),
    collectPaymentFee: moneyValue(raw.collectPaymentFee),
    transferFee: moneyValue(raw.transferFee),
    declaredValue: moneyValue(raw.declaredValue),
    insuranceFee: moneyValue(raw.insuranceFee),
    packageFee: moneyValue(raw.packageFee),
    otherFee: moneyValue(raw.otherFee),
    totalFee: sumOrderFields(raw, feeFields),
    cashAmount: moneyValue(raw.cashAmount),
    collectAmount: moneyValue(raw.collectAmount),
    monthlyAmount: moneyValue(raw.monthlyAmount),
    codAmount: moneyValue(raw.codAmount),
    handlingFee: moneyValue(raw.handlingFee),
    paymentTotal: sumOrderFields(raw, paymentFields),
    originStationId: normalizeNullableText(raw.originStationId),
    destinationStationId: normalizeNullableText(raw.destinationStationId),
    transferStationId: normalizeNullableText(raw.transferStationId),
    transferStationIds:
      raw.transferStationIds ?? (raw.transferStationId ? [raw.transferStationId] : []),
    shippingAddressId: normalizeNullableText(raw.shippingAddressId),
    receivingAddressId: normalizeNullableText(raw.receivingAddressId),
    shippingLongitude: normalizeNullableNumber(raw.shippingLongitude),
    shippingLatitude: normalizeNullableNumber(raw.shippingLatitude),
    receivingLongitude: normalizeNullableNumber(raw.receivingLongitude),
    receivingLatitude: normalizeNullableNumber(raw.receivingLatitude),
    shippingRegionPath: raw.shippingRegionPath ?? [],
    receivingRegionPath: raw.receivingRegionPath ?? [],
    shippingAddressDetail: formatOrderAddress(
      (raw.shippingRegionPath ?? []).join(''),
      raw.shippingAddressDetail
    ),
    receivingAddressDetail: formatOrderAddress(
      (raw.receivingRegionPath ?? []).join(''),
      raw.receivingAddressDetail
    ),
    distanceKm: normalizeNullableNumber(raw.distanceKm),
    departureAt: raw.departureAt || null,
    arrivalAt: raw.arrivalAt || null,
    orderConfig: raw.orderConfig ?? createInitialOrderConfig(),
    originStation: stationNames.origin || textValue(raw.originStation),
    destinationStation: stationNames.destination || textValue(raw.destinationStation),
    transferStation: stationNames.transfer || normalizeNullableText(raw.transferStation),
    transportMode: textValue(raw.transportMode),
    orderRemark: textValue(raw.orderRemark),
    orderNo: textValue(raw.orderNo),
    imageUrls: raw.imageUrls ?? []
  })

  return payload
}

export function getDictLabel(
  options: Pick<Api.DataCenter.DictListItem, 'label' | 'value'>[],
  value?: string | null
): string {
  if (!value) return ''
  return options.find((item) => item.value === value)?.label || value
}
