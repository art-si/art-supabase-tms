import { getDictionaryDisplayLabel } from '@/utils/form/option'
import { formatWithDayjs } from '@/utils/time'

const statusLabels: Record<string, string> = {
  pending: '待发运',
  pending_load: '待配载',
  pending_order: '待发车',
  pending_pickup: '待提货',
  accepted: '已接单',
  loading: '装货中',
  loaded: '已配载',
  partial: '部分调度',
  transporting: '运输中',
  in_transit: '运输中',
  running: '运输中',
  unloading: '卸货中',
  signed: '待结案',
  completed: '已完成',
  cancelled: '已取消',
  canceled: '已取消',
  closed: '已关闭'
}

const waybillStatusLabels: Record<string, string> = {
  ...statusLabels,
  pending: '待接单',
  signed: '已签收'
}
const dispatchStatusLabels: Record<string, string> = { ...statusLabels, pending: '待配载' }

/** Evidence is generated with raw order, waybill and dispatch states by the rules service. */
export function formatTransportAnomalyEvidence(value: string): string {
  return value
    .replace(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
      (date) => formatWithDayjs(date, 'YYYY-MM-DD HH:mm') || date
    )
    .replace(
      /(当前运输状态|当前订单状态|订单状态|配载状态|运单状态)：\s*([a-z][a-z0-9_-]*)/gi,
      (_match, label: string, status: string) => {
        const normalized = status.toLowerCase()
        const labels =
          label === '配载状态'
            ? dispatchStatusLabels
            : label === '运单状态'
              ? waybillStatusLabels
              : statusLabels
        const knownLabel = Object.hasOwn(labels, normalized) ? labels[normalized] : undefined
        return `${label}：${getDictionaryDisplayLabel({ label: knownLabel }, status)}`
      }
    )
    .replace(/：\s+/g, '：')
}
