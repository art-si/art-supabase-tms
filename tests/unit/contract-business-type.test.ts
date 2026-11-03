import assert from 'node:assert/strict'
import test from 'node:test'
import { usesCarrierParty } from '../../src/views/basic-data/contract/modules/contract-business-type'

test('承运商合同要求承运商', () => {
  assert.equal(usesCarrierParty('carrier'), true)
})

test('客户合同要求客户', () => {
  assert.equal(usesCarrierParty('customer'), false)
})
