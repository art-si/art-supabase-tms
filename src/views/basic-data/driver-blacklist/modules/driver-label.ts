import type { DictionarySelectOption } from '@/hooks/core/useDictionaryOptions'
import { getDictionaryDisplayLabel } from '@/utils/form/option'

export function driverOwnershipLabel(
  value: string | null | undefined,
  options: readonly DictionarySelectOption[]
): string {
  return getDictionaryDisplayLabel(
    options.find((item) => item.value === value),
    value,
    {
      emptyText: '—'
    }
  )
}

export function driverTypeLabel(
  value: string | null | undefined,
  options: readonly DictionarySelectOption[]
): string {
  return getDictionaryDisplayLabel(
    options.find((item) => item.value === value),
    value,
    {
      emptyText: '—'
    }
  )
}
