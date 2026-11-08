import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDispatchPreflightResult } from '../../src/api/modules/dispatch-preflight-model'

test('调度核验只接收完整的只读结果', () => {
  assert.throws(() => parseDispatchPreflightResult({ requestId: 'fixture' }))
  const result = parseDispatchPreflightResult({
    requestId: 'fixture',
    checkedAt: '2026-11-08T00:00:00Z',
    advisories: [],
    certificateRisks: [],
    certificateBlocked: false,
    canOverrideCertificateRisk: false,
    accessToken: 'must-not-escape'
  })
  assert.ok(!JSON.stringify(result).includes('must-not-escape'))
  assert.equal(result.certificateBlocked, false)
})
