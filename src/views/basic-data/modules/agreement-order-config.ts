import { createInitialOrderConfig } from '../../order-open/modules/order-open-model'
import { normalizeNullableNumber } from '@/utils/form/normalize'

/** Upgrade saved price conditions to the same transport configuration used by order entry. */
export function normalizeAgreementOrderConfig(price: {
  orderConfig?: Api.Tms.Order.OrderConfig | null
  transportType?: string | null
  vehicleType?: string | null
  vehicleLength?: string | null
  vehicleCount?: number | null
  billingMethod?: string | null
  cargoType?: string | null
}): Api.Tms.Order.OrderConfig {
  const initial = createInitialOrderConfig()
  if (price.orderConfig && Object.keys(price.orderConfig).length)
    return { ...initial, ...price.orderConfig }
  return {
    ...initial,
    loadType: price.transportType === 'truckload' ? 'ftl' : 'ltl',
    vehicleType: price.vehicleType || '',
    vehicleLengthM: normalizeNullableNumber(price.vehicleLength),
    truckCount: price.vehicleCount ?? null,
    billingMode:
      price.billingMethod === 'by_weight'
        ? 'weight'
        : price.billingMethod === 'by_volume'
          ? 'volume'
          : price.billingMethod === 'by_quantity'
            ? 'quantity'
            : '',
    cargoCategory: price.cargoType || initial.cargoCategory
  }
}
