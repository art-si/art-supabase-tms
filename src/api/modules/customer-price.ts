import { buildSupabaseRpcRange } from '@/utils/supabase'
import { toDateStartTimestamp, toDateEndTimestamp } from '@/utils/time/date-boundary'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import { pickDefinedPayload } from './payload'

type CustomerPrice = Api.Tms.BasicData.CustomerPrice
type CustomerPriceSearchParams = Api.Tms.BasicData.CustomerPriceSearchParams

interface SecureListPayload<TRecord, TAccess extends Record<string, string>> {
  records: TRecord[]
  total: number
  fieldAccess?: TAccess
}

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const CUSTOMER_PRICE_PAYLOAD_KEYS = [
  'customerId',
  'originRegion',
  'destinationRegion',
  'transportType',
  'cargoType',
  'shippingAddressId',
  'receivingAddressId',
  'shippingContactName',
  'shippingContactPhone',
  'shippingAddressDetail',
  'shippingLongitude',
  'shippingLatitude',
  'receivingContactName',
  'receivingContactPhone',
  'receivingAddressDetail',
  'receivingLongitude',
  'receivingLatitude',
  'cargoItems',
  'cargoQuantityTotal',
  'cargoVolumeTotal',
  'cargoWeightTotal',
  'vehicleType',
  'vehicleLength',
  'vehicleCount',
  'billingMethod',
  'transportFee',
  'insuranceFee',
  'packageFee',
  'loadingFee',
  'transferFee',
  'fuelFee',
  'serviceFee',
  'otherFee',
  'totalFee',
  'cashAmount',
  'prepaidAmount',
  'collectAmount',
  'periodicAmount',
  'paymentTotal',
  'remark'
] as const satisfies readonly (keyof CustomerPrice)[]

const toListRpcParams = (
  params: CustomerPriceSearchParams & { ids?: string[]; maxRows?: number },
  purpose: 'list' | 'export'
) => {
  const from = purpose === 'export' ? 0 : Math.max(params.from ?? 0, 0)
  const requestedTo = purpose === 'export' ? Math.max((params.maxRows ?? 10000) - 1, 0) : params.to
  return {
    ...buildSupabaseRpcRange(from, requestedTo ?? 9),
    p_customer_id: params.customerId || null,
    p_record_id: params.recordId || null,
    p_origin_region: params.originRegion || null,
    p_destination_region: params.destinationRegion || null,
    p_transport_type: params.transportType || null,
    p_cargo_type: params.cargoType || null,
    p_billing_method: params.billingMethod || null,
    p_keyword: normalizeNullableText(String(params.keyword ?? '')),
    p_create_time_from: params.createTimeRange?.[0]
      ? toDateStartTimestamp(params.createTimeRange[0])
      : null,
    p_create_time_to: params.createTimeRange?.[1]
      ? toDateEndTimestamp(params.createTimeRange[1])
      : null,
    p_ids: params.ids?.length ? params.ids : null,
    p_purpose: purpose
  }
}

export async function fetchCustomerPriceList(params: CustomerPriceSearchParams) {
  const result = await responseHandle<
    SecureListPayload<CustomerPrice, Api.Tms.BasicData.CustomerPriceFieldAccessMap>
  >(() => supabase.rpc('tms_list_customer_prices_secure', toListRpcParams(params, 'list')), {
    showErrorMessage: true
  })
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function exportCustomerPriceList(
  params: CustomerPriceSearchParams & { ids?: string[]; maxRows?: number }
) {
  const result = await responseHandle<
    SecureListPayload<CustomerPrice, Api.Tms.BasicData.CustomerPriceFieldAccessMap>
  >(() => supabase.rpc('tms_list_customer_prices_secure', toListRpcParams(params, 'export')), {
    showErrorMessage: true
  })
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: result.data?.fieldAccess ?? {}
  }
}

export async function fetchCustomerPriceDetail(id: string) {
  return await responseHandle<CustomerPrice | null>(
    () => supabase.rpc('tms_get_customer_price_secure', { p_id: id }),
    { showErrorMessage: true }
  )
}

export async function addCustomerPrice(params: CustomerPrice) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('tms_create_customer_price_secure', {
        p_payload: keysToSnakeDeep(pickDefinedPayload(params, CUSTOMER_PRICE_PAYLOAD_KEYS))
      }),
    { showMessage: true, breakReturn: true }
  )
  return { ...result, data: result.data ? { id: result.data } : null }
}

export async function editCustomerPrice(params: CustomerPrice) {
  const { id, ...data } = params
  if (!id) throw new Error('客户价格 ID 不能为空')
  return await responseHandle<CustomerPrice>(
    () =>
      supabase.rpc('tms_update_customer_price_secure', {
        p_id: id,
        p_payload: keysToSnakeDeep(pickDefinedPayload(data, CUSTOMER_PRICE_PAYLOAD_KEYS))
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function deleteCustomerPrice(id: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('tms_delete_customer_price_secure', { p_id: id }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}

export async function deleteCustomerPriceBatch(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('tms_delete_customer_prices_secure', { p_ids: ids }),
    { showMessage: true, showErrorMessage: false, breakReturn: true, requireAffected: true }
  )
}
