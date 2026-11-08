import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'

import {
  parseDispatchPreflightResult,
  type DispatchPreflightInput,
  type DispatchPreflightResult
} from './dispatch-preflight-model'
export type { DispatchPreflightInput, DispatchPreflightResult } from './dispatch-preflight-model'

export function proTransportIntegrationOrigin(): string {
  const configured =
    import.meta.env.VITE_BFF_ORIGIN || (import.meta.env.DEV ? 'http://localhost:3010' : '')
  if (!configured) throw new Error('业务集成服务尚未配置，请联系管理员')
  let origin: URL
  try {
    origin = new URL(configured)
  } catch (cause) {
    throw new Error('业务集成服务地址无效，请联系管理员', { cause })
  }
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== 'https:' &&
      !(
        import.meta.env.DEV &&
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname)
      ))
  )
    throw new Error('业务集成服务地址无效，请联系管理员')
  return origin.origin
}

export async function fetchDispatchPreflight(
  input: DispatchPreflightInput
): Promise<DispatchPreflightResult> {
  let subject = useUserStore().getUserInfo.authUserId
  if (!subject) {
    const { supabase } = useSupabase()
    const result = await supabase.auth.getSession()
    subject = result.data.session?.user.id
  }
  if (!subject) throw new Error('请先登录 pro，再执行综合核验')
  const url = new URL('/api/integrations/pro/dispatch-preflight', proTransportIntegrationOrigin())
  url.searchParams.set('orderId', input.orderId)
  url.searchParams.set('proSubject', subject)
  if (input.vehicleId) url.searchParams.set('vehicleId', input.vehicleId)
  if (input.driverId) url.searchParams.set('driverId', input.driverId)
  const selectedTenantId = useTenantScopeStore().effectiveTenantId
  if (selectedTenantId && input.tenantId && selectedTenantId !== input.tenantId)
    throw new Error('当前租户范围与原始运输单不一致，请刷新订单后重试')
  const tenantId = selectedTenantId || input.tenantId
  if (!tenantId) throw new Error('原始运输单所属租户缺失，请刷新订单后重试')
  url.searchParams.set('tenantScope', tenantId)
  let response: Response
  try {
    response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(20000) })
  } catch (cause) {
    throw new Error('业务集成服务暂时无法连接，请稍后重试', { cause })
  }
  if (response.status === 401) throw new Error('请先使用相同账号登录业务集成工作空间，再重新核验')
  if (response.status === 403) throw new Error('缺少综合核验权限或应用授权，请联系管理员')
  if (response.status === 409)
    throw new Error('pro 与业务集成工作空间账号不一致，请使用同一账号登录')
  if (response.status === 400)
    throw new Error('所选租户或业务资源已变化，请刷新范围后重新选择车辆或司机')
  if (response.status === 503) {
    const failure: unknown = await response.json().catch(() => null)
    if (isPlainObjectRecord(failure) && failure.code === 'AUTH_SESSION_UNAVAILABLE')
      throw new Error('统一身份会话暂时无法续期，请重新登录业务集成工作空间后重试')
  }
  if (!response.ok) throw new Error('综合核验暂时不可用，请稍后重试')
  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new Error('综合核验结果无法读取，请重试', { cause })
  }
  return parseDispatchPreflightResult(body)
}
