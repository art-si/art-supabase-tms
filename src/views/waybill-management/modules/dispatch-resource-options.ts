import { defineComponent, h } from 'vue'
import { uniq } from 'lodash-es'
import type {
  DataSelectColumn,
  DataSelectFetchParams
} from '@/components/core/forms/art-data-select/types'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import {
  isPrivateAttachmentPath,
  signPrivateAttachmentPaths
} from '@/utils/supabase/private-attachment'
import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
import {
  fetchDispatchCandidates,
  type DispatchMode,
  type DispatchDriverCandidate,
  type DispatchVehicleCandidate
} from '@tms/api'

export function dispatchResourceKind(mode: DispatchMode, resource: 'vehicle' | 'driver') {
  if (resource === 'vehicle') {
    return mode === 'carrier'
      ? 'carrier_vehicle'
      : mode === 'individual_driver'
        ? 'individual_vehicle'
        : 'vehicle'
  }
  return mode === 'carrier'
    ? 'carrier_driver'
    : mode === 'individual_driver'
      ? 'individual_driver'
      : 'self_driver'
}

export async function fetchDispatchResourceOptions(
  mode: DispatchMode,
  resource: 'vehicle' | 'driver',
  tenantId: string | undefined,
  params: DataSelectFetchParams
) {
  if (!tenantId) throw new Error('运单缺少所属租户，请刷新列表后重试')
  const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  const result = await fetchDispatchCandidates<DispatchVehicleCandidate | DispatchDriverCandidate>({
    kind: dispatchResourceKind(mode, resource),
    tenantId,
    keyword: params.keyword,
    from,
    to
  })
  const drivers = result.data.flatMap((row) => {
    const driver = 'driverName' in row ? row : row.primaryDriver
    return driver ? [driver] : []
  })
  const paths = uniq(
    drivers
      .map((driver) => driver.portraitUrl)
      .filter((path): path is string => Boolean(path && isPrivateAttachmentPath(path)))
  )
  if (paths.length) {
    try {
      const previews = await signPrivateAttachmentPaths('tms-driver-private', paths)
      for (const driver of drivers) {
        if (driver.portraitUrl) driver.portraitPreviewUrl = previews.get(driver.portraitUrl) ?? null
      }
    } catch (error) {
      notifyFriendlyError(error, '司机照片暂时无法预览，仍可按姓名和车牌选择')
    }
  }
  return result
}

function driverPortrait(driver?: DispatchDriverCandidate | null) {
  const url =
    driver?.portraitPreviewUrl ||
    (driver?.portraitUrl && !isPrivateAttachmentPath(driver.portraitUrl)
      ? driver.portraitUrl
      : null)
  return defineComponent({
    render: () =>
      url
        ? h('img', {
            src: url,
            alt: `${driver?.driverName || '司机'}的照片`,
            width: 36,
            height: 36,
            class: 'h-9 w-9 rounded-[var(--el-border-radius-base)] object-cover'
          })
        : h(
            'span',
            {
              class:
                'inline-flex h-9 w-9 items-center justify-center text-[var(--el-text-color-secondary)]',
              'aria-label': '暂无照片'
            },
            '—'
          )
  })
}

/** Both pickers show the same decision fields; only the authoritative resource scope differs. */
export function dispatchResourceColumns(
  resource: 'vehicle' | 'driver',
  includeAgreement = false
): DataSelectColumn[] {
  const driver = resource === 'vehicle' ? 'primaryDriver.' : ''
  const vehicle = resource === 'driver' ? 'vehicle.' : ''
  const columns: DataSelectColumn[] = [
    { prop: 'plateNo', label: '车牌号', minWidth: 130 },
    {
      prop: `${vehicle}vehicleOwnership`,
      label: '车辆归属',
      minWidth: 110,
      dict: { code: 'vehicleOwnership', display: 'text' }
    },
    {
      prop: `${driver}portraitUrl`,
      label: '照片',
      width: 72,
      formatter: (row) =>
        driverPortrait(
          resource === 'driver'
            ? (row as DispatchDriverCandidate)
            : (row as DispatchVehicleCandidate).primaryDriver
        )
    },
    { prop: `${driver}driverName`, label: '司机', minWidth: 120 },
    { prop: `${driver}phone`, label: '联系电话', minWidth: 135 },
    { prop: `${driver}gender`, label: '性别', width: 80, dict: { code: 'sex', display: 'text' } },
    {
      prop: `${driver}licenseType`,
      label: '驾照类型',
      minWidth: 110,
      dict: { code: 'tmsDriverLicenseType', display: 'text' }
    },
    {
      prop: `${driver}driverOwnership`,
      label: '司机归属',
      minWidth: 110,
      dict: { code: 'tmsDriverOwnership', display: 'text' }
    },
    { prop: 'companyName', label: '所属公司', minWidth: 180 },
    { prop: 'carrierName', label: '所属承运商', minWidth: 180 },
    {
      prop: `${vehicle}vehicleType`,
      label: '车型',
      minWidth: 110,
      dict: { code: 'vehicleType', display: 'text' }
    },
    { prop: `${vehicle}specLengthM`, label: '车长（米）', minWidth: 110 },
    { prop: `${vehicle}loadTons`, label: '载重（吨）', minWidth: 110 },
    {
      prop: `${driver}driverStatus`,
      label: '司机状态',
      minWidth: 110,
      dict: { code: 'tmsDriverStatus', display: 'text' }
    },
    {
      prop: `${driver}driverType`,
      label: '司机类型',
      minWidth: 110,
      dict: { code: 'tmsDriverType', display: 'text' }
    },
    { prop: `${driver}licenseExpireDate`, label: '驾照到期日期', minWidth: 125 },
    {
      prop: `${driver}identityAuthStatus`,
      label: '认证状态',
      minWidth: 200,
      formatter: (row) => {
        const person =
          resource === 'driver'
            ? (row as DispatchDriverCandidate)
            : (row as DispatchVehicleCandidate).primaryDriver
        return defineComponent({
          render: () =>
            h('div', { class: 'grid gap-1' }, [
              h('span', [
                '身份：',
                h(ArtDictDisplay, {
                  dictCode: 'tmsDriverAuthStatus',
                  value: person?.identityAuthStatus || 'unverified'
                })
              ]),
              h('span', [
                '驾驶证：',
                h(ArtDictDisplay, {
                  dictCode: 'tmsDriverAuthStatus',
                  value: person?.licenseAuthStatus || 'unverified'
                })
              ]),
              h('span', [
                '从业资格：',
                h(ArtDictDisplay, {
                  dictCode: 'tmsDriverAuthStatus',
                  value: person?.qualificationAuthStatus || 'unverified'
                })
              ])
            ])
        })
      }
    }
  ]
  if (includeAgreement)
    columns.push({
      prop: `${driver}agreementStatus`,
      label: '协议状态',
      minWidth: 110,
      dict: { code: 'tmsTransportAgreementStatus', display: 'text' }
    })
  return columns
}
