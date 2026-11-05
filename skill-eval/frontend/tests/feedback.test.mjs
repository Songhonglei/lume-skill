import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, message, validationIssue } from '../src/api.ts'

test('validation failures keep their field and readable bounds instead of becoming generic toasts', () => {
  const issue = validationIssue(new ApiError(422, [{ loc: ['body', 'count'], type: 'less_than_equal', ctx: { le: 30 } }]))
  assert.deepEqual(issue, { field: 'count', message: '不能超过 30。' })
  assert.deepEqual(validationIssue(new ApiError(422, [{ loc: ['body', 'password'], type: 'string_too_short', ctx: { min_length: 10 } }])), { field: 'password', message: '至少填写 10 个字符。' })
})
test('package format errors preserve the server explanation while action failures stay transient', () => {
  const text = '需要唯一的 evals/eval.yaml 或 evals.json'
  assert.deepEqual(validationIssue(new ApiError(422, text)), { field: '', message: text })
  for (const error of [new ApiError(409, '版本已改变'), new ApiError(500, '服务暂时不可用'), new Error('无法连接')]) {
    assert.equal(validationIssue(error), undefined)
    assert.ok(message(error))
  }
})
