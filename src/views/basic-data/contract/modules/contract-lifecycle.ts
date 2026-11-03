import dayjs from 'dayjs'

type Contract = Api.Tms.BasicData.Contract
type LifecycleStatus = Api.Tms.BasicData.ContractLifecycleStatus

export const contractLifecycleMeta: Record<
  LifecycleStatus,
  { label: string; type: 'success' | 'warning' | 'danger' | 'info' }
> = {
  pending_effective: { label: '待生效', type: 'warning' },
  effective: { label: '生效中', type: 'success' },
  expired: { label: '已到期', type: 'danger' },
  terminated: { label: '已终止', type: 'info' }
}

export const getContractLifecycleStatus = (row: Contract): LifecycleStatus => {
  if (row.contractStatus === 'terminated') return 'terminated'
  if (row.contractStatus !== 'approved') return 'pending_effective'
  const today = dayjs().format('YYYY-MM-DD')
  if (row.expiryDate && row.expiryDate < today) return 'expired'
  if (row.effectiveDate && row.effectiveDate > today) return 'pending_effective'
  return 'effective'
}
