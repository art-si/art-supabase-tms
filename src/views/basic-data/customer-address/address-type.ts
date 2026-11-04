export const isSupportedAddressType = (
  value: string
): value is Api.Tms.BasicData.CustomerAddressType => value === 'shipping' || value === 'receiving'
