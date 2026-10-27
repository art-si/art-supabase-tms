export function formatTransferStationRoute(
  stationNames: unknown,
  legacyStationName: unknown,
  emptyText = '-'
): string {
  const names = Array.isArray(stationNames)
    ? stationNames.filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0
      )
    : []

  if (names.length) return names.join(' → ')
  return typeof legacyStationName === 'string' && legacyStationName.trim()
    ? legacyStationName.trim()
    : emptyText
}
