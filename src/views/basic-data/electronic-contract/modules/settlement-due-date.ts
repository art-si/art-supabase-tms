import dayjs from 'dayjs'

/** 合同账期按每月 30 天计算，整 30 天落在对应月份最后一天。 */
export function calculateSettlementDueDate(
  periodEnd: string,
  paymentTermDays: number
): string | null {
  const end = dayjs(periodEnd)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ||
    !end.isValid() ||
    end.format('YYYY-MM-DD') !== periodEnd ||
    !Number.isInteger(paymentTermDays) ||
    paymentTermDays < 1 ||
    paymentTermDays > 3600
  ) {
    return null
  }

  const firstDay = end.add(1, 'month').startOf('month')
  const fullMonths = Math.floor(paymentTermDays / 30)
  const remainingDays = paymentTermDays % 30

  return remainingDays === 0
    ? firstDay
        .add(fullMonths - 1, 'month')
        .endOf('month')
        .format('YYYY-MM-DD')
    : firstDay.add(fullMonths, 'month').date(remainingDays).format('YYYY-MM-DD')
}
