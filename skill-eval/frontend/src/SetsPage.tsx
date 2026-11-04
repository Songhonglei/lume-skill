import { useCallback, useEffect, useRef, useState } from 'react'
import { message, api, post } from './api'
import { Badge, Button, Dialog, Empty, Icon, useData, ValidationView, Loading, LoadError } from './ui'
import { CaseEditor } from './CaseEditor'
import { TaskDialog } from './TaskDialog'
import type { Common, EvalSet, Files, SetDetail, SetVersion, Validation } from './types'

type Preview = { files: Files; original_blob: string; notes: { path: string; message: string }[]; validation: Validation }
export function SetsPage(common: Common) {
  const [skillId, setSkillId] = useState(common.selection.skillId || '')
  const [setId, setSetId] = useState(common.selection.setId || '')
  const [versionId, setVersionId] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showImport, setShowImport] = useState(common.selection.action === 'import')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [name, setName] = useState('默认评测集')
  const [importInto, setImportInto] = useState('')
  const [generating, setGenerating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editorBusy, setEditorBusy] = useState(false)
  const updateEditorBusy = useCallback((value: boolean) => { setEditorBusy(value); common.setEditingBusy(value) }, [common.setEditingBusy])
  const updateDirty = useCallback((value: boolean) => { setDirty(value); common.setDirty(value) }, [common.setDirty])
  useEffect(() => () => common.setEditingBusy(false), [common.setEditingBusy])
  const input = useRef<HTMLInputElement>(null)
  const directory = useRef<HTMLInputElement>(null)
  const skill = common.skills.find(item => item.id === skillId)
  const sets = useData<EvalSet[]>(skillId ? `/api/sets?skill_id=${skillId}` : null, [], common.revision)
  const detail = useData<SetDetail | undefined>(setId ? `/api/sets/${setId}` : null, undefined, common.revision)
  const version = useData<(SetVersion & { files: Files }) | undefined>(versionId ? `/api/set-versions/${versionId}` : null, undefined, common.revision)
  useEffect(() => { if (!skillId && common.skills.length) setSkillId(common.skills[0].id) }, [common.skills, skillId])
  useEffect(() => { if (common.selection.skillId) setSkillId(common.selection.skillId); if (common.selection.setId) { setSetId(common.selection.setId); setVersionId('') } }, [common.selection.skillId, common.selection.setId])
  useEffect(() => {
    if (sets.loading) return
    if (!sets.data.some(item => item.id === setId)) { setSetId(sets.data.find(item => item.is_default)?.id || sets.data[0]?.id || ''); setVersionId('') }
  }, [sets.data, sets.loading, setId])
  useEffect(() => {
    if (detail.data?.id !== setId) return
    if (!versionId) setVersionId(detail.data.versions.find(item => item.kind === 'DRAFT' && !item.archived)?.id || detail.data.active_version_id || detail.data.versions[0]?.id || '')
  }, [detail.data, setId, versionId])
  const leave = async (action: () => void) => { if (editorBusy) return; if (dirty && !await common.confirm({ title: '切换当前草稿？', description: '还有未保存的修改。切换后，这些修改不会保留。' })) return; setDirty(false); common.setDirty(false); action() }
  const openImport = () => { setImportInto(setId); setPreview(null); setShowImport(true) }
  const saveImport = async () => {
    if (!skill || !preview) return
    setBusy(true)
    try {
      const body = { name, source_skill_version_id: skill.latest_version_id, ...preview }
      if (importInto) { const result = await post<SetVersion>(`/api/sets/${importInto}/import`, body); setSetId(importInto); setVersionId(result.id) }
      else { const result = await post<{ set_id: string; version: SetVersion }>(`/api/skills/${skill.id}/sets`, body); setSetId(result.set_id); setVersionId(result.version.id) }
      common.refresh(); setShowImport(false); setPreview(null); common.notify('案例已导入草稿，校验并启用后即可评测。')
    } catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
  }
  return <><div className="page-heading"><div><h1>评测集管理</h1><p>案例按 Skill 保存，启用版本供后续评测复用。</p></div><div className="actions"><Button disabled={!skill || editorBusy} onClick={() => setGenerating(true)}>生成新草稿</Button><Button variant="primary" disabled={!skill || editorBusy} onClick={openImport}><Icon name="upload" />导入评测集</Button></div></div>
    <div className="collection-toolbar"><label className="field"><span>Skill</span><select aria-label="选择 Skill" disabled={editorBusy} value={skillId} onChange={event => { const next = event.target.value; void leave(() => { setSkillId(next); setSetId(''); setVersionId('') }) }}>{common.skills.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>评测集 <small>{sets.loading ? '读取中' : `${sets.data.length} 个`}</small></span><select aria-label="选择评测集" value={setId} disabled={editorBusy || sets.loading || !sets.data.length} onChange={event => { const next = event.target.value; void leave(() => { setSetId(next); setVersionId('') }) }}>{!sets.data.length && <option value="">尚无评测集</option>}{sets.data.map(item => <option key={item.id} value={item.id}>{item.name}{item.is_default ? ' · 默认' : ''}{item.active_version_id ? ` · ${item.active_validation?.cases?.length || 0} 个启用案例` : ' · 待启用'}</option>)}</select></label>
      <span className="collection-hint">先维护草稿，再保存并启用。已有任务继续使用原版本。</span></div>
    {common.skillsLoading ? <Loading label="正在读取 Skills…" /> : common.skillsError ? <LoadError message={common.skillsError} retry={common.refresh} /> : !skill ? <section className="panel"><Empty title="先添加一个 Skill" description="案例需要关联到一个具体 Skill。"><Button onClick={() => common.navigate('skills')}>去添加 Skill</Button></Empty></section> : <div className="sets-layout">
      <section className="panel set-workspace">{sets.loading || (setId && detail.loading) ? <Loading label="正在读取评测集…" /> : sets.error || detail.error ? <LoadError message={sets.error || detail.error} retry={common.refresh} /> : detail.data?.id === setId ? <><div className="panel-head"><div><h2>{detail.data.name}</h2><p className="muted">{detail.data.skill_name} · {detail.data.active_version_id ? '已有启用版本' : '尚未启用'}</p></div><div className="actions"><select aria-label="评测集版本" disabled={editorBusy} value={versionId} onChange={event => { const next = event.target.value; void leave(() => setVersionId(next)) }}>{detail.data.versions.map(item => <option key={item.id} value={item.id}>{item.kind === 'DRAFT' ? '草稿' : '版本'} {item.revision}{item.id === detail.data?.active_version_id ? ' · 启用中' : ''}{item.archived ? ' · 已归档' : ''} · 源修订 {item.source_skill_revision}</option>)}</select>{skill.default_set_id !== setId && <Button variant="small" onClick={async () => { try { await post(`/api/skills/${skill.id}/default-set`, { set_id: setId }); common.refresh(); common.notify('默认评测集已更新。') } catch (error) { common.notify(message(error), true) } }}>设为默认</Button>}</div></div>
        {version.data?.id === versionId ? <CaseEditor key={versionId} version={version.data} common={common} onVersion={setVersionId} active={detail.data.active_version_id === versionId} onBusy={updateEditorBusy} onDirty={updateDirty} /> : <>{version.error ? <LoadError message={version.error} retry={common.refresh} /> : <Loading label="正在读取案例…" />}</>}
      </> : <Empty title="准备一份评测集" description="可以导入原生 ZIP 或 evals.json，也可以让 Codex 生成草稿。"><Button onClick={openImport}>导入案例</Button></Empty>}</section></div>}
    {sets.error && <p className="error-text">{sets.error}</p>}
    {showImport && <Dialog title="导入评测集" wide onClose={() => setShowImport(false)}><p className="muted">支持包含 evals/eval.yaml 的 ZIP，或 evals.json。导入后保存为草稿。</p>
      <div className="form-row"><label className="field"><span>保存位置</span><select value={importInto} onChange={event => setImportInto(event.target.value)}><option value="">创建新评测集</option>{sets.data.map(item => <option key={item.id} value={item.id}>{item.name} · 新草稿</option>)}</select></label>{!importInto && <label className="field"><span>评测集名称</span><input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>}</div>
      <input ref={input} type="file" accept=".zip,.json" aria-label="评测集文件" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return
        setBusy(true); setPreview(null)
        try { const body = new FormData(); body.append('file', file); setPreview(await api<Preview>('/api/sets/preview-import', { method: 'POST', body })) }
        catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
      }} />
      <Button disabled={busy} onClick={() => directory.current?.click()}>选择案例目录</Button>
      <input className="hidden" type="file" multiple ref={element => { directory.current = element; element?.setAttribute('webkitdirectory', '') }} onChange={async event => {
        const files = Array.from(event.target.files || []); if (!files.length) return
        setBusy(true); setPreview(null)
        try { const body = new FormData(); files.forEach(file => body.append('files', file)); body.append('paths', JSON.stringify(files.map(file => file.webkitRelativePath || file.name))); setPreview(await api<Preview>('/api/sets/preview-import-directory', { method: 'POST', body })) }
        catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
      }} />
      {preview && <div className="import-preview"><h3>导入预览 · {Object.keys(preview.files).length} 个文件</h3>{preview.notes.map((note, index) => <p className="small-note" key={index}>{note.path}：{note.message}</p>)}<ValidationView validation={preview.validation} /><details><summary>查看转换后的入口</summary><pre>{preview.files['evals/eval.yaml']?.content}</pre></details><p className="muted">有校验问题也可先存草稿，再继续修复。</p></div>}
      <div className="dialog-actions"><Button onClick={() => setShowImport(false)}>取消</Button><Button variant="primary" busy={busy} disabled={!preview || !name.trim()} onClick={saveImport}>导入草稿</Button></div></Dialog>}
    {generating && skill && <TaskDialog common={common} skill={skill} versionId={skill.latest_version_id} revision={skill.latest_revision} kind="generate" setId={setId || undefined} onClose={() => setGenerating(false)} />}
  </>
}
