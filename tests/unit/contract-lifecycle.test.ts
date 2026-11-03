import assert from 'node:assert/strict'
import test from 'node:test'
import dayjs from 'dayjs'
import { getContractLifecycleStatus } from '../../src/views/basic-data/contract/modules/contract-lifecycle'

const contract = (overrides: Partial<Api.Tms.BasicData.Contract>) =>
  ({
    contractName: '测试运输合同',
    businessContractType: 'customer',
    contractCategory: 'annual_framework',
    transportMode: 'road',
    billingMethod: 'by_weight',
    signTime: new Date().toISOString(),
    handler: '经办人',
    ...overrides
  }) as Api.Tms.BasicData.Contract

test('审批中的合同保持待生效，已审核合同按独立有效期计算履约状态', () => {
  const future = dayjs().add(2, 'day').format('YYYY-MM-DD')
  const past = dayjs().subtract(2, 'day').format('YYYY-MM-DD')
  assert.equal(
    getContractLifecycleStatus(contract({ contractStatus: 'draft', expiryDate: past })),
    'pending_effective'
  )
  assert.equal(
    getContractLifecycleStatus(contract({ contractStatus: 'approved', effectiveDate: future })),
    'pending_effective'
  )
  assert.equal(
    getContractLifecycleStatus(
      contract({ contractStatus: 'approved', effectiveDate: past, expiryDate: future })
    ),
    'effective'
  )
  assert.equal(
    getContractLifecycleStatus(contract({ contractStatus: 'approved', expiryDate: past })),
    'expired'
  )
  assert.equal(
    getContractLifecycleStatus(contract({ contractStatus: 'terminated', expiryDate: future })),
    'terminated'
  )
})
