import assert from 'node:assert/strict'
import test from 'node:test'
import { readRoute, routeHash } from '../src/workspaceRoute.ts'
import { setRows } from '../src/setDirectory.ts'

test('detail/history links survive reload without confusing Skill and set versions', () => {
  const route = readRoute(routeHash('sets', { setId: '11111111-1111-4111-8111-111111111111', setVersionId: '22222222-2222-4222-8222-222222222222', versionId: '99999999-9999-4999-8999-999999999999' }))
  assert.equal(route.selection.setVersionId, '22222222-2222-4222-8222-222222222222')
  assert.equal(route.selection.versionId, undefined)
  assert.equal(route.selection.setId, '11111111-1111-4111-8111-111111111111')
  assert.equal(readRoute(routeHash('sets', { setId: '11111111-1111-4111-8111-111111111111', setsView: 'history' })).selection.setsView, 'history')
  assert.equal(readRoute('#sets/%ZZ').selection.setId, undefined)
  assert.equal(readRoute('#sets/..%2Fapi%2Fsettings').selection.setId, undefined)
  assert.deepEqual(readRoute('#unknown'), { page: 'skills', selection: {} })
})
test('import entry keeps its owning Skill without implicitly choosing a set', () => {
  const route = readRoute(routeHash('sets', { skillId: '33333333-3333-4333-8333-333333333333', action: 'import' }))
  assert.equal(route.selection.skillId, '33333333-3333-4333-8333-333333333333')
  assert.equal(route.selection.action, 'import')
  assert.equal(route.selection.setId, undefined)
})
const skills = Array.from({ length: 125 }, (_, i) => ({ id: `skill-${i}`, name: `Skill ${i}`, description: i === 124 ? '中文尾部目标' : '' }))
const suites = [
  { id: 'suite-a', skill_id: 'skill-124', name: '边界回归', draft_count: 2, active_version_id: 'v1' },
  { id: 'suite-b', skill_id: 'skill-124', name: '独立草稿集', draft_count: 1 },
]
test('global search finds late Skills, descriptions and every set before display pagination', () => {
  assert.equal(setRows(skills, suites, '中文尾部', 'all').length, 2)
  assert.equal(setRows(skills, suites, '边界回归', 'all')[0].key, 'suite-a')
  assert.equal(setRows(skills, suites, '  SKILL 124  ', 'all').length, 2)
  assert.equal(setRows(skills, suites, 'Skill 123', 'all')[0].suite, undefined)
})
test('pending and draft filters preserve real enabled state and unprepared Skills', () => {
  assert.equal(setRows(skills, suites, '', 'all').length, 126)
  assert.deepEqual(setRows(skills, suites, 'Skill 124', 'pending').map(row => row.key), ['suite-b'])
  assert.deepEqual(setRows(skills, suites, '', 'active').map(row => row.key), ['suite-a'])
  assert.equal(setRows(skills, suites, '', 'drafts').length, 2)
  assert.equal(setRows(skills, suites, 'not present', 'all').length, 0)
})
