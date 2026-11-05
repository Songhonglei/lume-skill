import assert from 'node:assert/strict'
import test from 'node:test'
import { pageSizes, pageWindow } from '../src/pageWindow.ts'

test('supported sizes cover every record exactly once, including a partial last page', () => {
  assert.deepEqual(pageSizes, [20, 30, 50, 100])
  const rows = Array.from({ length: 126 }, (_, i) => i)
  for (const size of pageSizes) {
    const seen = []
    for (let page = 0; page < Math.ceil(rows.length / size); page++) {
      const { start, end } = pageWindow(rows.length, page, size)
      seen.push(...rows.slice(start, end))
    }
    assert.deepEqual(seen, rows)
  }
})
test('empty lists and shrinking results clamp to a reachable page', () => {
  assert.deepEqual(pageWindow(0, 5, 20), { page: 0, pages: 1, start: 0, end: 0 })
  assert.deepEqual(pageWindow(21, 5, 20), { page: 1, pages: 2, start: 20, end: 21 })
  assert.equal(pageWindow(20, 1, 20).page, 0)
})
