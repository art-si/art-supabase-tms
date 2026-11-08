import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test('综合核验展示 TMS/VMS 风险，支持重试并在窄屏保持可读', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let failNext = true
  let requests = 0
  await page.route('**/rest/v1/rpc/tms_check_dispatch_advisories_secure', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route(
    'http://localhost:3010/api/integrations/pro/dispatch-preflight**',
    async (route) => {
      const origin = route.request().headers().origin
      const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true'
      }
      requests++
      const url = new URL(route.request().url())
      expect(url.searchParams.get('proSubject')).toBe('11111111-1111-4111-8111-111111111111')
      expect(url.searchParams.get('tenantScope')).toBe('55555555-5555-4555-8555-555555555555')
      if (failNext) {
        failNext = false
        await route.fulfill({ status: 503, headers, json: { message: 'temporary' } })
        return
      }
      await route.fulfill({
        headers,
        json: {
          requestId: '66666666-6666-4666-8666-666666666666',
          checkedAt: '2026-11-08T00:00:00Z',
          advisories: [{ subjectLabel: '测试车辆 测A00001', message: '保养资料需要核对' }],
          certificateBlocked: true,
          canOverrideCertificateRisk: false,
          certificateRisks: [
            {
              riskKind: 'revoked',
              subjectType: 'vehicle',
              subjectId: '33333333-3333-4333-8333-333333333333',
              subjectLabel: '测试车辆 测A00001',
              certificateType: 'road_transport',
              expiresOn: null
            }
          ]
        }
      })
    }
  )
  await page.goto('/modules/art-supabase-tms/tests/e2e/fixtures/dispatch-preflight.html')
  await page.getByRole('button', { name: '调度资源综合核验', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '调度资源综合核验' })
  await expect(drawer.getByText('综合核验未完成', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '重新核验' }).click()
  await expect(drawer.getByText('发现证照风险，请先核实处置')).toBeVisible()
  await expect(drawer.getByText('保养资料需要核对')).toBeVisible()
  await drawer.getByRole('tab', { name: '证照风险（1）' }).click()
  await expect(drawer.getByText('测试车辆 测A00001 · 证照已撤销')).toBeVisible()
  await expect(drawer.getByText('道路运输证', { exact: true })).toBeVisible()
  expect(requests).toBe(2)
  const output = path.resolve('.artifacts/pro-transport-pilot')
  mkdirSync(output, { recursive: true })
  await page.screenshot({ path: path.join(output, 'preflight-light-1440.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () => {
      const bounds = await drawer.boundingBox()
      return bounds ? bounds.x >= 0 && bounds.width <= 390 : false
    })
    .toBe(true)
  await page.screenshot({ path: path.join(output, 'preflight-mobile-390.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  expect(errors).toEqual([])
})

test('无综合核验权限时不显示业务入口', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/rpc/tms_check_dispatch_advisories_secure', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('http://localhost:3010/api/integrations/pro/dispatch-preflight**', (route) => {
    calls++
    return route.fulfill({ json: {} })
  })
  await page.goto('/modules/art-supabase-tms/tests/e2e/fixtures/dispatch-preflight.html?readonly=1')
  await expect(page.getByRole('heading', { name: '配载调度 · 综合核验验收' })).toBeVisible()
  await expect(page.getByRole('button', { name: '调度资源综合核验', exact: true })).toHaveCount(0)
  expect(calls).toBe(0)
})

test('未登录 BFF 时保留可操作的统一登录入口', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_check_dispatch_advisories_secure', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('http://localhost:3010/api/integrations/pro/dispatch-preflight**', (route) =>
    route.fulfill({
      status: 401,
      headers: {
        'Access-Control-Allow-Origin': route.request().headers().origin,
        'Access-Control-Allow-Credentials': 'true'
      },
      json: { code: 'UNAUTHENTICATED' }
    })
  )
  await page.goto('/modules/art-supabase-tms/tests/e2e/fixtures/dispatch-preflight.html')
  await page.getByRole('button', { name: '调度资源综合核验', exact: true }).click()
  await expect(
    page.getByText('请先使用相同账号登录业务集成工作空间，再重新核验', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '登录业务集成工作空间' })).toHaveAttribute(
    'href',
    /\/api\/auth\/login\?returnTo=%2Fapplications&force_login=1$/
  )
})
