type ContractBusinessType = Api.Tms.BasicData.ContractBusinessType

// 业务合同分类决定必选的签约主体。
export const usesCarrierParty = (businessType: ContractBusinessType): boolean =>
  businessType === 'carrier'
