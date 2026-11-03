import { createDateTimeFormatter, formatCompactNumberValue } from '@/utils/ui/format'

const formatRateDate = createDateTimeFormatter({ format: 'YYYY-MM-DD', emptyText: '-' })

export function formatRateAddress(region?: string | null, address?: string | null): string {
  return [region, address].filter(Boolean).join(' ') || '--'
}

export function formatRateDistanceKm(value: number | string | null | undefined): string {
  return value == null || value === '' ? '-' : `${formatCompactNumberValue(value, 2)} km`
}

export function formatRateEffectivePeriod(row: {
  effectiveFrom?: string | null
  effectiveTo?: string | null
}): string {
  return row.effectiveFrom || row.effectiveTo
    ? `${formatRateDate(row.effectiveFrom)} 至 ${formatRateDate(row.effectiveTo)}`
    : '-'
}
