import assert from 'node:assert/strict'
import test from 'node:test'
import { browserFile } from '../src/editorFiles.ts'
import { canEditCase, formDocument } from '../src/editorYaml.ts'
import { shouldSyncVersion } from '../src/editorState.ts'

for (const [name, bytes, encoding] of [
  ['UTF-8 with BOM', [0xef, 0xbb, 0xbf, 0x41, 0x0d, 0x0a], 'utf-8'],
  ['UTF-8 text', [...new TextEncoder().encode('中文\r\n')], 'utf-8'],
  ['empty file', [], 'utf-8'],
  ['invalid UTF-8', [0xff, 0xfe, 0x80], 'base64'],
  ['NUL in binary', [0x41, 0, 0x42], 'base64'],
  ['large binary', Array.from({ length: 200000 }, (_, index) => index % 256), 'base64'],
]) {
  test(`attachment round trip preserves ${name}`, async () => {
    const file = await browserFile(new File([Uint8Array.from(bytes)], 'fixture'))
    assert.equal(file.encoding, encoding)
    const restored = file.encoding === 'utf-8' ? new TextEncoder().encode(file.content) : Buffer.from(file.content, 'base64')
    assert.deepEqual([...restored], bytes)
  })
}

const entry = formDocument('cases:\n  files: [evals/cases/example.yaml]\n')
for (const source of [
  'judge:\n  type: rule_based\n  success: [null]',
  'judge:\n  success: [false]',
  'judge:\n  success: invalid',
  'judge: null',
  'input: [unexpected]',
  'expect: scalar',
  '[unexpected]',
  'broken: [',
]) {
  test(`malformed case stays available for source editing: ${source}`, () => {
    assert.equal(canEditCase(entry, formDocument(source)), false)
  })
}
test('valid cases and inherited judges remain editable', () => {
  const item = formDocument('id: example\ninput: {prompt: test}\nx-custom: {keep: true}\n')
  assert.equal(canEditCase(entry, item), true)
  assert.equal(canEditCase(formDocument('judge: {type: rule_based, success: [{output_contains: {all: [OK]}}]}'), item), true)
  assert.deepEqual(item.value['x-custom'], { keep: true })
})
test('malformed inherited rules also use source editing', () => {
  assert.equal(canEditCase(formDocument('judge: {success: [null]}'), formDocument('id: example')), false)
})

const savedDraft = { edit_number: 2, blob: 'new-attachment', archived: false, kind: 'DRAFT' }
test('a stale fetch cannot replace files immediately after a successful save', () => {
  const stale = { ...savedDraft, edit_number: 1, blob: 'before-upload' }
  assert.equal(shouldSyncVersion(savedDraft, stale, false), false)
})
test('a newer draft refreshes only when there are no local edits', () => {
  const newer = { ...savedDraft, edit_number: 3, blob: 'remote-update' }
  assert.equal(shouldSyncVersion(savedDraft, newer, false), true)
  assert.equal(shouldSyncVersion(savedDraft, newer, true), false)
})
test('archiving a draft updates the editor without changing its edit number', () => {
  assert.equal(shouldSyncVersion(savedDraft, { ...savedDraft, archived: true }, false), true)
  assert.equal(shouldSyncVersion({ ...savedDraft, archived: true }, savedDraft, false), false)
})
