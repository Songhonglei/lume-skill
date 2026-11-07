import assert from 'node:assert/strict'
import test from 'node:test'
import { assertionStatus, cancelNotice, connectionCheckStatus, missingResult, statusOf, taskView } from '../src/presentation.ts'

test('a skipped judge is distinct from a failed precondition or assertion', () => {
  assert.equal(assertionStatus({ passed: false, skipped: true }), 'SKIPPED')
  assert.equal(assertionStatus({ passed: false }), 'FAILED')
  assert.equal(assertionStatus({ passed: true }), 'PASSED')
})

test('connection checks are current only for the same saved model and connection', () => {
  const model = { id: 'current', name: 'model', connection_fingerprint: 'agent' }
  const result = { model_id: model.id, model: model.name, connection_fingerprint: 'agent', success: true }
  const worker = { capabilities: { connection_fingerprint: 'agent' }, probe_result: result }
  assert.equal(connectionCheckStatus(worker, model), 'PROBE_PASSED')
  assert.equal(connectionCheckStatus({ ...worker, probe_request: result }, model), 'PROBE_PENDING')
  assert.equal(connectionCheckStatus({ ...worker, probe_request: result }, { ...model, id: 'changed' }), 'PROBE_STALE')
  assert.equal(connectionCheckStatus(worker, { ...model, id: 'changed' }), 'PROBE_STALE')
  assert.equal(connectionCheckStatus({ ...worker, probe_result: { model: model.name, success: true } }, model), 'PROBE_STALE')
  assert.equal(connectionCheckStatus({ ...worker, capabilities: { connection_fingerprint: 'changed' } }, model), 'PROBE_STALE')
})
const old = { id: 'old', number: 1, state: 'COMPLETED', summary: { verdict: 'PASSED', cases: [{ case_id: 'a', verdict: 'PASSED' }] } }
const task = { state: 'QUEUED', current_attempt_id: null, summary: null, attempts: [old], artifacts: [{ id: 'report', attempt_id: 'old' }] }
test('a queued retry cannot inherit the preceding successful result or report', () => {
  const current = taskView(task, '')
  assert.equal(current.attempt, undefined)
  assert.equal(current.summary, null)
  assert.deepEqual(current.artifacts, [])
  const history = taskView(task, 'old')
  assert.equal(history.current, false)
  assert.equal(history.summary.verdict, 'PASSED')
  assert.equal(history.state, 'COMPLETED')
  assert.equal(history.artifacts[0].id, 'report')
})
test('the current cancelled attempt retains partial results without a wait message', () => {
  const stopped = { ...task, state: 'CANCELLED', current_attempt_id: 'now', summary: { verdict: 'INCOMPLETE' }, attempts: [old, { id: 'now', state: 'CANCELLED', summary: { verdict: 'INCOMPLETE', cases: [{ case_id: 'a', verdict: 'PASSED' }] } }], artifacts: [{ id: 'partial', attempt_id: 'now' }] }
  const view = taskView(stopped, '')
  assert.equal(view.summary.cases[0].verdict, 'PASSED')
  assert.equal(view.artifacts[0].id, 'partial')
  assert.equal(missingResult(view.state).status, 'INCOMPLETE')
  assert.doesNotMatch(missingResult(view.state).text, /等待|正在/)
  assert.equal(missingResult('CANCEL_REQUESTED').status, 'CANCEL_REQUESTED')
  assert.notEqual(cancelNotice('CANCELLED'), cancelNotice('CANCEL_REQUESTED'))
})
test('historical selection never falls back to the current successful summary', () => {
  const view = taskView({ ...task, state: 'SUCCEEDED', current_attempt_id: 'current', summary: { verdict: 'PASSED' }, attempts: [{ id: 'old', state: 'EXPIRED' }] }, 'old')
  assert.equal(view.summary, undefined)
  assert.equal(view.state, 'EXPIRED')
  assert.equal(statusOf('FAILED', 'execution').label, '执行失败')
  assert.equal(statusOf('FAILED').label, '未通过')
  assert.equal(statusOf('RUNNING').tone, 'info')
  assert.equal(statusOf('CANCELLED').tone, statusOf('REVOKED').tone)
})

test('a stale attempt selection from another task falls back to its current view', () => {
  const view = taskView({ ...task, state: 'RUNNING', current_attempt_id: 'new', attempts: [{ id: 'new', state: 'ACTIVE' }] }, 'unrelated')
  assert.equal(view.current, true)
  assert.equal(view.attempt.id, 'new')
  assert.equal(view.summary, null)
})
