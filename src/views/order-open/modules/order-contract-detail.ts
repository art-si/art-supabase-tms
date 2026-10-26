import { normalizeNullableNumber } from '@/utils/form/normalize'
import { differenceWith, round, uniqBy } from 'lodash-es'
import { createInitialCargoItem, textValue, type CargoItem } from './order-open-model'

type ContractDetail = Api.Tms.BasicData.ContractDetailSelectorItem

export interface MergeOrderContractDetailsResult {
  items: CargoItem[]
  addedCount: number
}

export interface ContractCargoFreightResult {
  hasContractCargo: boolean
  transportFee: number | null
}

export const createCargoItemFromContractDetail = (detail: ContractDetail): CargoItem => ({
  ...createInitialCargoItem(),
  cargoId: detail.cargoId ?? null,
  cargoName: detail.cargoDescription,
  cargoCode: detail.cargoCode,
  packageType: detail.unit,
  quantity: 1,
  unit: detail.unit,
  unitPrice: detail.transportUnitPrice,
  freight:
    detail.transportUnitPrice == null
      ? null
      : round(normalizeNullableNumber(detail.transportUnitPrice) ?? 0, 2),
  sourceContractId: detail.contractId,
  sourceContractNo: detail.contractNo,
  sourceContractName: detail.contractName,
  sourceContractDetailKey: detail.key
})

export const mergeOrderContractDetails = (
  currentItems: readonly CargoItem[],
  selectedDetails: readonly ContractDetail[]
): MergeOrderContractDetailsResult => {
  const detailKey = (item: ContractDetail): string => textValue(item.key)
  const itemKey = (item: CargoItem): string => textValue(item.sourceContractDetailKey)
  const uniqueSelections = uniqBy(selectedDetails.filter(detailKey), detailKey)
  const additions = differenceWith(
    uniqueSelections,
    currentItems,
    (detail, item) => detailKey(detail) === itemKey(item)
  ).map(createCargoItemFromContractDetail)

  if (!additions.length) return { items: [...currentItems], addedCount: 0 }
  const shouldReplacePlaceholder =
    currentItems.length === 1 && !textValue(currentItems[0].cargoName)
  return {
    items: shouldReplacePlaceholder ? additions : [...currentItems, ...additions],
    addedCount: additions.length
  }
}

export const calculateContractCargoFreight = (item: CargoItem): number =>
  round(
    (normalizeNullableNumber(item.quantity) ?? 0) * (normalizeNullableNumber(item.unitPrice) ?? 0),
    2
  )

export const calculateContractTransportFee = (items: readonly CargoItem[]): number | null => {
  const contractItems = items.filter((item) => item.sourceContractId)
  if (contractItems.some((item) => normalizeNullableNumber(item.unitPrice) == null)) return null
  return round(
    contractItems.reduce((sum, item) => sum + calculateContractCargoFreight(item), 0),
    2
  )
}

export const synchronizeContractCargoFreight = (
  items: readonly CargoItem[]
): ContractCargoFreightResult => {
  const contractItems = items.filter((item) => item.sourceContractId)
  contractItems.forEach((item) => {
    if (normalizeNullableNumber(item.unitPrice) != null)
      item.freight = calculateContractCargoFreight(item)
  })

  return {
    hasContractCargo: contractItems.length > 0,
    transportFee: calculateContractTransportFee(contractItems)
  }
}
