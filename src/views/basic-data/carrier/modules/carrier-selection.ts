import { uniq } from 'lodash-es'
import { getDictionaryDisplayLabel } from '@/utils/form/option'

/** Older carrier records expose only the primary value. */
export function carrierSelections(
  values: readonly string[] | undefined,
  primary: string | undefined
): string[] {
  return values?.length ? [...values] : primary ? [primary] : []
}

/** Use visible labels for current taxonomy and a clear marker for historical unknown values. */
export function carrierSelectionLabels(
  values: readonly string[],
  options: readonly { value: string; label?: string; name?: string }[],
  unknownText = '待核对'
): string {
  return (
    values
      .map((value) =>
        getDictionaryDisplayLabel(
          options.find((option) => option.value === value),
          value,
          { unknownText }
        )
      )
      .join('、') || '—'
  )
}

/** Import accepts dictionary codes or visible labels separated by commas. */
export function parseCarrierSelections(
  input: unknown,
  options: readonly { value: string | number | boolean; label: string }[],
  fieldName: string
): string[] {
  const entries = String(input ?? '')
    .split(/[,，、;；]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const resolved = entries.map((entry) => {
    const option = options.find((item) => String(item.value) === entry || item.label === entry)
    if (!option) throw new Error(`${fieldName}包含无效选项：${entry}`)
    return String(option.value)
  })
  return uniq(resolved)
}
