import { expect, test } from '@playwright/test'

const drivers = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    tenantId: '11111111-1111-4111-8111-111111111111',
    driverName: '测试司机甲',
    phone: '13800000001',
    portraitUrl:
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="36" height="36"%3E%3Crect width="36" height="36" fill="%2394a3b8"/%3E%3C/svg%3E',
    driverOwnership: 'self',
    identityAuthStatus: 'verified',
    licenseAuthStatus: 'verified',
    qualificationAuthStatus: 'verified',
    plateNo: '测A00001',
    vehicleId: '55555555-5555-4555-8555-555555555555',
    driverType: 'primary',
    carrierName: null,
    companyName: '测试物流公司',
    licenseType: 'A2',
    licenseExpireDate: '2028-12-31'
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    tenantId: '11111111-1111-4111-8111-111111111111',
    driverName: '测试司机乙',
    phone: '13800000002',
    portraitUrl: null,
    driverOwnership: 'carrier',
    identityAuthStatus: 'verified',
    licenseAuthStatus: 'verified',
    qualificationAuthStatus: 'verified',
    plateNo: '测B00002',
    vehicleId: null,
    driverType: 'secondary',
    carrierName: '测试承运商',
    companyName: '测试运输公司',
    licenseType: 'B2',
    licenseExpireDate: '2029-06-30'
  }
]

test('调度司机候选展示完整资格信息并带入选中司机', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const requestedKinds: string[] = []
  const dictionaryRows: Record<string, Array<[string, string]>> = {
    tmsDispatchOperatorMode: [
      ['carrier', '承运方'],
      ['self_operated', '自营司机'],
      ['individual_driver', '个体司机']
    ],
    tmsDriverOwnership: [
      ['self', '自营'],
      ['individual', '个体'],
      ['carrier', '承运商']
    ],
    tmsDriverType: [
      ['primary', '主驾'],
      ['secondary', '副驾']
    ],
    tmsDriverAuthStatus: [
      ['verified', '已认证'],
      ['unverified', '未认证']
    ],
    tmsTransportAgreementStatus: [
      ['signed', '已签署'],
      ['pending_signed', '待签署']
    ]
  }
  await page.route('**/rest/v1/sys_dictionary*', async (route) => {
    const url = new URL(route.request().url())
    const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '') || ''
    const value = url.searchParams.get('value')?.replace(/^eq\./, '')
    const rows = (dictionaryRows[code] || [])
      .filter(([entryValue]) => !value || entryValue === value)
      .map(([entryValue, label]) => ({
        code,
        value: entryValue,
        label,
        name: label,
        status: '1',
        sort: 0
      }))
    await route.fulfill({ status: 200, json: rows })
  })
  await page.route('**/rest/v1/rpc/tms_list_dispatch_candidates_secure', async (route) => {
    const body = route.request().postDataJSON() as { p_kind: string; p_tenant_id: string }
    requestedKinds.push(body.p_kind)
    expect(body.p_tenant_id).toBe('11111111-1111-4111-8111-111111111111')
    await route.fulfill({
      status: 200,
      json:
        body.p_kind === 'vehicle'
          ? {
              records: [
                {
                  id: drivers[0].vehicleId,
                  tenantId: drivers[0].tenantId,
                  plateNo: drivers[0].plateNo,
                  vehicleType: 'truck',
                  specLengthM: 9.6,
                  loadTons: 18
                }
              ],
              total: 1
            }
          : { records: drivers, total: 2 }
    })
  })

  await page.goto(
    process.env.DISPATCH_SELECTOR_URL ||
      '/modules/art-supabase-tms/tests/e2e/fixtures/dispatch-candidate-selector.html',
    { waitUntil: 'domcontentloaded' }
  )
  if (test.info().project.name.includes('dark')) {
    await page.evaluate(() => document.documentElement.classList.add('dark'))
  }
  await page.getByRole('button', { name: '打开调度配载' }).click()
  const eligibilityHint = page.getByText(
    '仅显示已启用、未列入黑名单且当前未占用的司机；证件风险将在提交前核验。'
  )
  await eligibilityHint.scrollIntoViewIfNeeded()
  await expect(eligibilityHint).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('eligibility-hint.png'), fullPage: true })
  await page.getByPlaceholder('请选择自营司机').click()
  const selector = page.locator('.art-data-select-dialog').last()
  await expect(selector.getByText('测试司机甲')).toBeVisible()
  await expect(selector.getByText('测试司机乙')).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '照片' })).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '司机归属' })).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '认证状态' })).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '车牌号' })).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '司机类型' })).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '所属承运商' })).toBeVisible()
  await expect(selector.getByRole('columnheader', { name: '所属公司' })).toBeVisible()
  await expect(selector.getByText('测B00002')).toBeVisible()
  await expect(selector.getByText('测试承运商')).toBeVisible()
  await expect(selector.getByText('测试运输公司')).toBeVisible()
  await expect(selector.getByRole('img', { name: '测试司机甲的照片' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('candidate-selector.png'), fullPage: true })
  expect(requestedKinds).toContain('driver')

  await selector.getByRole('row', { name: /测试司机甲/ }).click()
  await selector.getByRole('button', { name: '确定' }).click()
  await expect(page.getByPlaceholder('请选择车辆')).toHaveValue('测A00001')
  expect(requestedKinds).toContain('vehicle')

  await page.getByPlaceholder('请选择自营司机').click()
  const selectorAgain = page.locator('.art-data-select-dialog').last()
  await expect(selectorAgain.getByText('测试司机乙')).toBeVisible()
  await selectorAgain.getByRole('row', { name: /测试司机乙/ }).click()
  await selectorAgain.getByRole('button', { name: '确定' }).click()

  await expect(
    page.locator('.dispatch-dialog__selection').filter({ hasText: '测试司机乙' })
  ).toContainText('测B00002')
  await expect(
    page.locator('.dispatch-dialog__selection').filter({ hasText: '测试司机乙' })
  ).toContainText('测试承运商')
  await expect(page.getByPlaceholder('请选择自营司机')).toHaveValue('测试司机乙')
  await expect(page.getByPlaceholder('请选择车辆')).toBeEmpty()
  await page
    .locator('.dispatch-dialog__selection')
    .filter({ hasText: '测试司机乙' })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: test.info().outputPath('candidate-selected.png'), fullPage: true })

  await page.getByText('个体司机', { exact: true }).click()
  await page.getByPlaceholder('请选择个体司机').click()
  const individualSelector = page.locator('.art-data-select-dialog').last()
  await expect(individualSelector.getByText('测试司机甲')).toBeVisible()
  await expect(individualSelector.getByRole('columnheader', { name: '司机归属' })).toBeVisible()
  await expect(individualSelector.getByRole('columnheader', { name: '认证状态' })).toBeVisible()
  await expect(individualSelector.getByRole('columnheader', { name: '所属公司' })).toBeVisible()
  expect(requestedKinds).toContain('individual_driver')
  expect(pageErrors).toEqual([])
})
