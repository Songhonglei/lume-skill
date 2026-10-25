import { useEffect, useRef, useState } from 'react'
import { parseDocument, stringify } from 'yaml'
import { api, message, post } from './api'
import { Badge, Button, Dialog, ValidationView } from './ui'
import type { Common, EditorFile, Files, SetVersion, Validation } from './types'
import { browserFile } from './editorFiles'
import { canEditCase, formDocument, mapping } from './editorYaml'
import { shouldSyncVersion } from './editorState'

const textFile = (content: string): EditorFile => ({ encoding: 'utf-8', content, mode: 0o644 })

export function CaseEditor({ version: initial, common, onVersion, active, onDirty, onBusy }: {
  version: SetVersion & { files: Files }; common: Common; onVersion: (id: string) => void; active: boolean; onDirty: (value: boolean) => void; onBusy: (value: boolean) => void
}) {
  const [version, setVersion] = useState(initial)
  const [files, setFiles] = useState<Files>(initial.files)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<'form' | 'source'>('form')
  const [selected, setSelected] = useState('')
  const [sourceFile, setSourceFile] = useState('evals/eval.yaml')
  const [validation, setValidation] = useState<Validation>(initial.validation)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [newFile, setNewFile] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<File[] | null>(null)
  const fixture = useRef<HTMLInputElement>(null)
  const readonly = version.kind !== 'DRAFT' || version.archived
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  useEffect(() => { onBusy(!!busy); return () => onBusy(false) }, [busy, onBusy])
  useEffect(() => {
    if (shouldSyncVersion(version, initial, dirty)) { setVersion(initial); setFiles(initial.files); setValidation(initial.validation) }
  }, [initial, dirty, version.blob, version.edit_number, version.archived, version.kind])
  const entry = formDocument(files['evals/eval.yaml']?.content || '')
  const entryValue = entry.value
  const entries: string[] = Array.isArray(entryValue.cases?.files) ? entryValue.cases.files.filter((value: unknown) => typeof value === 'string') : []
  useEffect(() => { if (!entries.includes(selected)) setSelected(entries[0] || '') }, [files, selected])
  const caseDocument = formDocument(files[selected]?.encoding === 'utf-8' ? files[selected].content : '')
  const item = caseDocument.value
  const canForm = canEditCase(entry, caseDocument) && files[selected]?.encoding === 'utf-8' && !!selected
  const judge = { ...mapping(entryValue.judge), ...mapping(item.judge) }
  const localJudge = !!mapping(item.judge).type
  const must = item.expect?.must_contain || []
  const rules: Record<string, any>[] = Array.isArray(judge.success) ? judge.success : []
  const ruleIndex = rules.findIndex(rule => Array.isArray(rule?.output_contains?.all))
  const ruleValues = ruleIndex >= 0 ? rules[ruleIndex].output_contains.all : []
  const simpleLines = (value: unknown): value is string[] => Array.isArray(value) && value.every(line => typeof line === 'string' && !line.includes('\n'))
  const mutate = (path: string, update: (document: ReturnType<typeof parseDocument>) => void) => {
    if (readonly) return
    const document = parseDocument(files[path]?.content || '')
    if (document.errors.length) { setError('这个文件有 YAML 错误，请先在源码中修复。'); return }
    try { update(document) }
    catch { setError('这个字段无法安全映射到表单，请在源码中编辑。'); return }
    setFiles(previous => ({ ...previous, [path]: { ...(previous[path] || textFile('')), content: document.toString() } }))
    setDirty(true); setValidation({}); setError('')
  }
  const setValue = (path: (string | number)[], value: unknown) => mutate(selected, document => document.setIn(path, value))
  const lines = (value: string) => value.split('\n').filter(line => line.length > 0)
  const saveDraft = async () => {
    if (!dirty) return version
    const result = await api<SetVersion>(`/api/set-versions/${version.id}`, { method: 'PUT', body: JSON.stringify({ expected_edit_number: version.edit_number, files }) })
    const updated = { ...result, files }
    setVersion(updated); setDirty(false); onDirty(false); setValidation({}); common.refresh()
    return updated
  }
  const action = async (name: string, operation: () => Promise<void>) => {
    setBusy(name); setError('')
    try { await operation() } catch (error) { setError(message(error)) }
    finally { setBusy('') }
  }
  const saveVersion = (enable: boolean) => action(enable ? 'enable' : 'version', async () => {
    const current = await saveDraft()
    const saved = await post<SetVersion>(`/api/set-versions/${current.id}/save`, { expected_edit_number: current.edit_number })
    if (enable) await post(`/api/sets/${current.set_id}/activate`, { version_id: saved.id })
    common.notify(enable ? '新版本已保存并启用。' : '新版本已保存，可以随时启用。'); common.refresh(); onVersion(saved.id)
  })
  const addCase = () => {
    let index = 1
    while (files[`evals/cases/case-${index}.yaml`]) index++
    const id = `case-${index}`, path = `evals/cases/${id}.yaml`
    const document = parseDocument(files['evals/eval.yaml']?.content || '')
    if (!entry.editable || ('cases' in entryValue && entryValue.cases !== mapping(entryValue.cases))) { setError('请先修复入口 YAML，再添加案例。'); setMode('source'); return }
    document.setIn(['cases', 'files'], [...entries, path])
    setFiles(previous => ({ ...previous, 'evals/eval.yaml': textFile(document.toString()), [path]: textFile(stringify({ id, title: '新案例', input: { prompt: '' }, judge: { type: 'rule_based', success: [{ output_contains: { all: ['请填写预期结果'] } }] } })) }))
    setSelected(path); setDirty(true); setValidation({})
  }
  const removeCase = () => {
    const document = parseDocument(files['evals/eval.yaml'].content)
    document.setIn(['cases', 'files'], entries.filter(path => path !== selected))
    setFiles(previous => { const result: Files = { ...previous, 'evals/eval.yaml': { ...previous['evals/eval.yaml'], content: document.toString() } }; delete result[selected]; return result })
    setDirty(true); setValidation({})
  }
  const moveCase = (direction: number) => {
    const index = entries.indexOf(selected), next = index + direction
    if (next < 0 || next >= entries.length) return
    const ordered = [...entries]; [ordered[index], ordered[next]] = [ordered[next], ordered[index]]
    mutate('evals/eval.yaml', document => document.setIn(['cases', 'files'], ordered))
  }
  const updateRules = (value: string) => mutate(selected, document => {
    if (ruleIndex >= 0) document.setIn(['judge', 'success', ruleIndex, 'output_contains', 'all'], lines(value))
    else { if (!document.hasIn(['judge', 'success'])) document.setIn(['judge', 'success'], []); document.addIn(['judge', 'success'], { output_contains: { all: lines(value) } }) }
  })
  const uploadAttachments = (selected: File[]) => action('attachment', async () => {
    const additions: Files = {}
    try { for (const file of selected) additions[`evals/fixtures/${file.name}`] = await browserFile(file) }
    catch { throw new Error('附件读取失败，请重试。') }
    setFiles(previous => ({ ...previous, ...additions }))
    setSourceFile(Object.keys(additions)[0] || sourceFile); setDirty(true); setValidation({})
  })
  return <div className="case-editor"><div className="editor-toolbar"><div className="inline"><Badge value={version.kind}>{version.kind === 'DRAFT' ? '草稿' : `版本 ${version.revision}`}</Badge>{active && <span className="subtle-chip blue">正在启用</span>}{dirty && <span className="small-note">有未保存修改</span>}</div><div className="actions wrap">
    {readonly ? <><Button disabled={!!busy} busy={busy === 'fork'} onClick={() => action('fork', async () => { const created = await post<SetVersion>(`/api/sets/${version.set_id}/drafts`, { source_version_id: version.id }); common.refresh(); onVersion(created.id) })}>创建草稿后编辑</Button>{!active && !version.archived && <Button disabled={!!busy} variant="primary" busy={busy === 'activate'} onClick={() => action('activate', async () => { await post(`/api/sets/${version.set_id}/activate`, { version_id: version.id }); common.refresh(); common.notify('这个版本已启用。') })}>启用这个版本</Button>}</> : <><Button busy={busy === 'draft'} disabled={!dirty || !!busy} onClick={() => action('draft', async () => { await saveDraft(); common.notify('草稿已保存。') })}>保存草稿</Button><Button busy={busy === 'validate'} disabled={!!busy} onClick={() => action('validate', async () => { const current = await saveDraft(); const result = await post<Validation>(`/api/set-versions/${current.id}/validate`); setValidation(result); common.refresh() })}>校验</Button><Button busy={busy === 'version'} disabled={!!busy} onClick={() => saveVersion(false)}>保存版本</Button><Button variant="primary" busy={busy === 'enable'} disabled={!!busy} onClick={() => saveVersion(true)}>保存并启用</Button></>}
    <a className="button" href={`/api/set-versions/${version.id}/export`}>导出</a>
  </div></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    <fieldset className="editor-content" aria-label="案例内容" disabled={!!busy}>
    <div className="segmented"><button className={mode === 'form' ? 'active' : ''} onClick={() => setMode('form')}>案例表单</button><button className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')}>源码与附件</button></div>
    {mode === 'form' ? <div className="case-layout"><aside className="case-list"><div className="case-list-head"><span>入口案例 · {entries.length}</span>{!readonly && <button className="text-button" onClick={addCase}>＋ 添加</button>}</div>{entries.map(path => {
      let title = path.split('/').pop() || path
      try { title = mapping(parseDocument(files[path]?.content || '').toJS()).title || title } catch { /* Invalid source remains editable. */ }
      return <button key={path} className={selected === path ? 'active' : ''} onClick={() => setSelected(path)}><strong>{String(title)}</strong><small>{path.split('/').pop()}</small></button>
    })}{!entries.length && <p className="muted padded">还没有入口案例，可以添加或在源码中修复。</p>}</aside><div className="case-form">
      {!canForm ? <div className="callout">当前 YAML 无法安全映射到表单，请在“源码与附件”中编辑。</div> : <><div className="form-top"><code>{String(item.id || selected.split('/').pop())}</code>{!readonly && <div className="actions"><button className="text-button muted" disabled={entries.indexOf(selected) === 0} onClick={() => moveCase(-1)}>上移</button><button className="text-button muted" disabled={entries.indexOf(selected) === entries.length - 1} onClick={() => moveCase(1)}>下移</button><button className="text-button danger" onClick={removeCase}>移除案例</button></div>}</div>
        <label className="field"><span>案例名称</span><input disabled={readonly} value={String(item.title || '')} onChange={event => setValue(['title'], event.target.value)} /></label>
        <label className="field"><span>任务描述</span><textarea rows={5} disabled={readonly} value={String(item.input?.prompt || '')} onChange={event => setValue(['input', 'prompt'], event.target.value)} /></label>
        <label className="field"><span>前置条件：输出需包含 <small>每行一条，选填</small></span>{simpleLines(must) ? <textarea rows={2} disabled={readonly} value={must.join('\n')} onChange={event => setValue(['expect', 'must_contain'], lines(event.target.value))} placeholder="输入必须出现在结果中的文字" /> : <span className="small-note">包含复杂或多行断言，请使用源码编辑，原条件仍会保留。</span>}</label>
        <div className="form-section"><h3>判分方式</h3>{!localJudge ? <div className="callout">这个案例继承入口的裁判。<Button disabled={readonly} onClick={() => setValue(['judge'], judge)}>为此案例单独设置</Button></div> : <><label className="field"><span>裁判</span><select disabled={readonly} value={judge.type || 'rule_based'} onChange={event => mutate(selected, document => {
          for (const key of ['criteria', 'model', 'pass_threshold', 'script_path', 'success', 'failure']) document.deleteIn(['judge', key])
          document.setIn(['judge', 'type'], event.target.value)
          if (event.target.value === 'agent_judge') { document.setIn(['judge', 'model'], '__SELECT_MODEL__'); document.setIn(['judge', 'criteria'], []) }
          if (event.target.value === 'rule_based') document.setIn(['judge', 'success'], [{ output_contains: { all: [] } }])
        })}><option value="rule_based">规则判分</option><option value="script">脚本判分</option><option value="agent_judge">Codex 语义裁判</option></select></label>
          {judge.type === 'rule_based' && <label className="field"><span>成功条件：输出需包含 <small>每行一条</small></span>{simpleLines(ruleValues) ? <textarea rows={3} disabled={readonly} value={ruleValues.join('\n')} onChange={event => updateRules(event.target.value)} /> : <span className="small-note">复杂规则请使用源码编辑。</span>}<small className="muted">其他已有规则会保留，可在源码中查看。</small></label>}
          {judge.type === 'agent_judge' && <label className="field"><span>评判标准 <small>每行一条</small></span>{simpleLines(judge.criteria || []) ? <textarea rows={4} disabled={readonly} value={(judge.criteria || []).join('\n')} onChange={event => setValue(['judge', 'criteria'], lines(event.target.value))} /> : <span className="small-note">多行标准请使用源码编辑。</span>}<small className="muted">使用任务选定模型的独立会话。</small></label>}
          {judge.type === 'script' && <label className="field"><span>脚本路径</span><input disabled={readonly} value={judge.script_path || ''} onChange={event => setValue(['judge', 'script_path'], event.target.value)} placeholder="evals/fixtures/scripts/check.py" /><small className="muted">在“源码与附件”中添加脚本；退出码 0 表示通过。</small></label>}
        </>}</div>
      </>}
    </div></div> : <div className="source-layout"><aside className="file-list"><div className="case-list-head">文件 · {Object.keys(files).length}</div>{Object.keys(files).sort().map(path => <button key={path} className={path === sourceFile ? 'active' : ''} onClick={() => setSourceFile(path)} title={path}>{path.replace(/^evals\//, '')}</button>)}{!readonly && <div className="padded"><input aria-label="新文件路径" value={newFile} onChange={event => setNewFile(event.target.value)} placeholder="evals/fixtures/check.py" /><Button variant="small" disabled={!newFile || !!files[newFile]} onClick={() => { setFiles(previous => ({ ...previous, [newFile]: textFile('') })); setSourceFile(newFile); setNewFile(''); setDirty(true); setValidation({}) }}>新建文件</Button><Button variant="small" onClick={() => fixture.current?.click()}>上传附件</Button></div>}</aside>
      <div className="source-editor"><div className="source-head"><code>{sourceFile}</code>{!readonly && files[sourceFile] && <button className="text-button danger" onClick={() => { setFiles(previous => { const result = { ...previous }; delete result[sourceFile]; return result }); setSourceFile('evals/eval.yaml'); setDirty(true); setValidation({}) }}>删除文件</button>}</div>{!files[sourceFile] ? <p className="muted">从左侧选择文件。</p> : files[sourceFile].encoding === 'utf-8' ? <textarea className="code-editor" spellCheck={false} aria-label="文件源码" readOnly={readonly} value={files[sourceFile].content} onChange={event => { setFiles(previous => ({ ...previous, [sourceFile]: { ...previous[sourceFile], content: event.target.value } })); setDirty(true); setValidation({}) }} /> : <div className="binary-file"><strong>二进制附件</strong><p className="muted">原始字节已保留，可以导出整个评测集后查看。</p></div>}</div>
    </div>}
    <input className="hidden" ref={fixture} type="file" multiple onChange={event => {
      const selected = Array.from(event.target.files || [])
      event.target.value = ''
      if (!selected.length || readonly || busy) return
      if (selected.some(file => files[`evals/fixtures/${file.name}`])) setPendingAttachments(selected)
      else void uploadAttachments(selected)
    }} />
    </fieldset>
    {pendingAttachments && <Dialog title="替换同名附件" onClose={() => setPendingAttachments(null)}>
      <p>以下附件已存在，替换后将使用新文件内容：</p>
      <ul>{pendingAttachments.filter(file => files[`evals/fixtures/${file.name}`]).map(file => <li key={file.name}>{file.name}</li>)}</ul>
      <div className="dialog-actions"><Button onClick={() => setPendingAttachments(null)}>取消</Button><Button variant="primary" onClick={() => { const selected = pendingAttachments; setPendingAttachments(null); void uploadAttachments(selected) }}>替换附件</Button></div>
    </Dialog>}
    <div className="editor-validation"><h3>校验结果</h3><ValidationView validation={validation} /></div>
  </div>
}
