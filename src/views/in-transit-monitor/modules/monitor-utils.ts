import dayjs from 'dayjs'
import { clamp, meanBy } from 'lodash-es'
import { normalizeNullableNumber } from '@/utils/form/normalize'
import { normalizeCoordinatePair } from '@/utils/geo'
import { isValidDateTimeValue } from '@/utils/time'
import { createDateTimeFormatter } from '@/utils/ui/format'
import type { GeoCoord, InTransitRecord, MonitorOrder, TransitStatus } from './monitor-types'
import { stationGeoPositions } from './monitor-geo-config'

export const getMonitorRecordId = (row: InTransitRecord): string => String(row.id || row.waybillNo)

/** Cached routes belong to their endpoint pair, not just to the business record. */
export const getDrivingRouteKey = (
  order: Pick<MonitorOrder, 'id' | 'originGeo' | 'destinationGeo'>
): string | undefined =>
  order.originGeo && order.destinationGeo
    ? `${order.id}:${order.originGeo.join(',')}:${order.destinationGeo.join(',')}`
    : undefined

export const resolveEndpointGeo = (
  row: InTransitRecord,
  endpoint: 'origin' | 'destination',
  longitude: number | string | null | undefined,
  latitude: number | string | null | undefined,
  fallbackText: string
): GeoCoord | undefined => {
  const directGeo = toGeoCoord(longitude, latitude)
  if (directGeo) return directGeo

  const routePointGeo = getRoutePointGeo(row, endpoint)
  if (routePointGeo) return routePointGeo

  return resolveStationGeo(fallbackText)
}

export const toGeoCoord = (
  longitude: number | string | null | undefined,
  latitude: number | string | null | undefined
): GeoCoord | undefined => {
  const coordinate = normalizeCoordinatePair(longitude, latitude)
  if (!coordinate) return undefined
  return [Number(coordinate.longitude.toFixed(6)), Number(coordinate.latitude.toFixed(6))]
}

export const resolveActualTrackPath = (row: InTransitRecord): GeoCoord[] => {
  const routePoints = Array.isArray(row.routePoints) ? row.routePoints : []
  const gpsPoints = routePoints.filter((point) => {
    const sourceText = `${point.type || ''} ${point.source || ''}`.toLowerCase()
    return (
      Boolean(point.capturedAt || point.timestamp || point.recordedAt) ||
      /(gps|track|trajectory|telemetry|location)/.test(sourceText)
    )
  })
  return dedupeGeoPath(
    gpsPoints.flatMap((point) => {
      const coordinate = toGeoCoord(point.longitude ?? point.lng, point.latitude ?? point.lat)
      return coordinate ? [coordinate] : []
    })
  )
}

export const resolveProgress = (
  row: InTransitRecord,
  status: TransitStatus,
  now: number = Date.now()
): number | null => {
  if (status === 'pending') return 0
  if (status === 'arrived') return 100

  const departureValue =
    row.departedAt || row.loadedAt || row.plannedLoadTime || row.order?.plannedDepartureTime
  const arrivalValue = row.plannedUnloadTime || row.order?.plannedArrivalTime
  if (!isValidDateTimeValue(departureValue, false) || !isValidDateTimeValue(arrivalValue, false))
    return null
  const departure = dayjs(departureValue)
  const arrival = dayjs(arrivalValue)
  if (arrival.isAfter(departure) && Number.isFinite(now)) {
    const total = arrival.diff(departure)
    const elapsed = dayjs(now).diff(departure)
    return clamp(Math.round((elapsed / total) * 100), 0, 99)
  }

  return null
}

export const resolveCurrentLabel = (row: InTransitRecord): string => {
  const status = resolveTransitStatus(row, isDelayed(row))
  if (status === 'pending') return row.originCity || '待处理'
  if (status === 'arrived') return row.destinationCity || '已到达'
  return '在途'
}

export const isDelayed = (row: InTransitRecord): boolean => {
  const plannedUnloadTime = row.plannedUnloadTime || row.order?.plannedArrivalTime
  const waybillStatus = String(row.status ?? '').toLowerCase()
  const orderStatus = String(row.order?.orderStatus ?? '').toLowerCase()
  if (
    !plannedUnloadTime ||
    row.unloadedAt ||
    waybillStatus === 'completed' ||
    ['signed', 'completed'].includes(orderStatus)
  ) {
    return false
  }
  const arrival = dayjs(plannedUnloadTime)
  return arrival.isValid() && dayjs().isAfter(arrival)
}

export const getDelayText = (value?: string | null): string => {
  if (!isValidDateTimeValue(value, false)) return ''
  const arrival = dayjs(value)
  if (!dayjs().isAfter(arrival)) return ''
  const hours = Math.max(1, dayjs().diff(arrival, 'hour'))
  return `${hours}h`
}

export const resolveArrivalPerformance = (
  row: InTransitRecord
): { delayed: boolean | null; text: string } => {
  const plannedValue = row.plannedUnloadTime || row.order?.plannedArrivalTime
  const actualValue = row.unloadedAt || row.order?.signedAt
  if (!isValidDateTimeValue(plannedValue, false) || !isValidDateTimeValue(actualValue, false))
    return { delayed: null, text: '暂无到达时间' }
  const planned = dayjs(plannedValue)
  const actual = dayjs(actualValue)

  const delayedMinutes = actual.diff(planned, 'minute')
  if (delayedMinutes <= 0) return { delayed: false, text: '准时' }

  const delayText =
    delayedMinutes < 60 ? `${delayedMinutes}m` : `${Number((delayedMinutes / 60).toFixed(1))}h`
  return { delayed: true, text: `延误${delayText}` }
}

export const resolveTransitStatus = (row: InTransitRecord, delayed: boolean): TransitStatus => {
  if (delayed) return 'delayed'

  const rawStatus = String(row.status || row.order?.orderStatus || '')
    .trim()
    .toLowerCase()
  if (['completed', 'signed'].includes(rawStatus) || row.unloadedAt) return 'arrived'

  const runningStatuses = [
    'accepted',
    'loading',
    'transporting',
    'unloading',
    'in_transit',
    'running',
    'processing',
    'in_progress',
    'ongoing'
  ]
  return runningStatuses.includes(rawStatus) ? 'transporting' : 'pending'
}

export const isRouteVisibleStatus = (status: TransitStatus): boolean =>
  ['transporting', 'delayed'].includes(status)

export const resolveSpeed = (row: InTransitRecord): number | null => {
  const speed = normalizeNullableNumber(row.speedKmh)
  return speed !== null && speed >= 0 ? Math.round(speed) : null
}

/** Missing progress is excluded rather than treated as zero completion. */
export const getAverageProgress = (
  orders: readonly Pick<MonitorOrder, 'progress'>[]
): number | null => {
  const known = orders.filter((order) => order.progress !== null)
  return known.length ? Math.round(meanBy(known, 'progress')) : null
}

/** Adds a bounded alpha channel to six-digit hex colors while preserving CSS variables and keywords. */
export const withAlpha = (color: string, alpha: number): string => {
  if (!/^#[\da-f]{6}$/i.test(color)) return color
  const numeric = Number.parseInt(color.slice(1), 16)
  const boundedAlpha = Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1
  return `rgba(${(numeric >> 16) & 255}, ${(numeric >> 8) & 255}, ${numeric & 255}, ${boundedAlpha})`
}

export const estimateDistanceKm = (origin: GeoCoord, destination: GeoCoord): number => {
  const radius = 6371
  const toRad = (value: number) => (value * Math.PI) / 180
  const lngDiff = toRad(destination[0] - origin[0])
  const latDiff = toRad(destination[1] - origin[1])
  const startLat = toRad(origin[1])
  const endLat = toRad(destination[1])
  const factor =
    Math.sin(latDiff / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDiff / 2) ** 2

  return Math.round(radius * 2 * Math.atan2(Math.sqrt(factor), Math.sqrt(1 - factor)))
}

export const formatDateTime = createDateTimeFormatter({ format: 'HH:mm' })

export const formatRefreshTime = createDateTimeFormatter({ format: 'HH:mm:ss' })

export const formatText = (value?: string | number | null, fallback = '-'): string => {
  const text = String(value ?? '').trim()
  return text || fallback
}

export const normalizeVehicleTypeCode = (value?: string | number | null): string =>
  String(value ?? '').trim()

export const dedupeGeoPath = (path: GeoCoord[]): GeoCoord[] =>
  path.filter(
    (point, index) =>
      index === 0 || point[0] !== path[index - 1][0] || point[1] !== path[index - 1][1]
  )

export const percentOf = (value: number, total: number): number =>
  total > 0 ? clamp(Math.round((value / total) * 100), 0, 100) : 0

const getRoutePointGeo = (
  row: InTransitRecord,
  endpoint: 'origin' | 'destination'
): GeoCoord | undefined => {
  const point = row.routePoints?.find((item) => {
    const type = String(item.type ?? '').toLowerCase()
    if (endpoint === 'origin') return ['shipper', 'origin', 'start', 'load'].includes(type)
    return ['receiver', 'destination', 'end', 'unload'].includes(type)
  })
  if (!point) return undefined
  return toGeoCoord(point.longitude ?? point.lng, point.latitude ?? point.lat)
}

const resolveStationGeo = (text: string): GeoCoord | undefined => {
  const normalized = text.trim()
  const matched = stationGeoPositions.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword))
  )
  if (matched) return matched.coord

  return undefined
}
