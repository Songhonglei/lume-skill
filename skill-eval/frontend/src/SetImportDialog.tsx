import { useEffect, useRef, useState } from 'react'
import { api, message, post, validationIssue } from './api'
import { Button, Dialog, ValidationView } from './ui'
import { ChoiceSelect } from './ChoiceSelect'
import type { Common, EvalSet, Files, SetVersion, Skill, Validation } from './types'

type Preview = { files: Files; original_blob: string; notes: { path: string; message: string }[]; validation: Validation }
export function SetImportDialog({ common, skill, sets, onClose, onImported, onBusy }: {
  common: Common; skill: Skill; sets: EvalSet[]; onClose: () => void; onImported: (setId: string, versionId: string) => void; onBusy: (busy: boolean) => void
}) {
  const [targetMode, setTargetMode] = useState('new')
  const [importInto, setImportInto] = useState(sets[0]?.id || '')
  const [name, setName] = useState('默认评测集')
  const [source, setSource] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const directory = useRef<HTMLInputElement>(null)
  const errorPanel = useRef<HTMLDivElement>(null)
  const existing = targetMode === 'existing'
  const target = sets.find(item => item.id === importInto)
  const ready = !!preview && (existing ? !!target : !!name.trim())
  useEffect(() => { onBusy(busy); return () => onBusy(false) }, [busy, onBusy])
  useEffect(() => { if (error) errorPanel.current?.focus() }, [error])
  const read = async (files: File[], folder: boolean) => {
    if (!files.length || busy) return
    setBusy(true); setPreview(null); setError('')
    setSource(folder ? `${files[0].webkitRelativePath.split('/')[0] || '所选目录'} · ${files.length} 个文件` : files[0].name)
    try {
      const body = new FormData()
      if (folder) { files.forEach(file => body.append('files', file)); body.append('paths', JSON.stringify(files.map(file => file.webkitRelativePath || file.name))) }
      else body.append('file', files[0])
      setPreview(await api<Preview>(`/api/sets/preview-import${folder ? '-directory' : ''}`, { method: 'POST', body }))
    } catch (error) { if (validationIssue(error)) setError(message(error)); else common.notify(message(error), true) }
    finally { setBusy(false); if (input.current) input.current.value = ''; if (directory.current) directory.current.value = '' }
  }
  const saveImport = async () => {
    if (!preview || !ready || busy) return
    setBusy(true); setError('')
    try {
      const body = { name: existing ? target!.name : name.trim(), source_skill_version_id: skill.latest_version_id, ...preview }
      let targetId: string, version: SetVersion
      if (existing) { targetId = importInto; version = await post<SetVersion>(`/api/sets/${importInto}/import`, body) }
      else { const result = await post<{ set_id: string; version: SetVersion }>(`/api/skills/${skill.id}/sets`, body); targetId = result.set_id; version = result.version }
      common.refresh(); common.notify('案例已导入草稿，校验并启用后即可评测。'); onImported(targetId, version.id)
    } catch (error) { if (validationIssue(error)) setError(message(error)); else common.notify(message(error), true) } finally { setBusy(false) }
  }
  return <Dialog title={`导入评测集 · ${skill.name}`} wide onClose={() => { if (!busy) onClose() }}>
    <p className="muted">导入后保存为草稿，不切换已启用版本。</p>
    <div className="form-row import-target"><div className="field"><span>保存位置</span>{sets.length ? <ChoiceSelect aria-label="保存位置" value={targetMode} disabled={busy} onValueChange={value => { setTargetMode(value); if (value === 'existing' && !sets.some(item => item.id === importInto)) setImportInto(sets[0]?.id || '') }}><option value="new">新建评测集</option><option value="existing">已有评测集</option></ChoiceSelect> : <span className="single-choice">新建评测集</span>}</div>
      {existing ? <div className="field"><span>目标评测集</span><ChoiceSelect aria-label="目标评测集" value={target ? importInto : ''} disabled={busy} onValueChange={setImportInto}><option value="" disabled>选择评测集</option>{sets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</ChoiceSelect></div> : <label className="field"><span>评测集名称</span><input value={name} disabled={busy} maxLength={120} onChange={event => setName(event.target.value)} /></label>}
    </div>
    <div className="import-sources"><section><Button aria-describedby="import-file-format" disabled={busy} onClick={() => input.current?.click()}>选择文件</Button><p id="import-file-format">ZIP：包含 evals/eval.yaml 或 evals.json，附上引用文件。<br />JSON：evals.json，含 evals 数组。</p><details><summary>JSON 示例</summary><pre>{JSON.stringify({ evals: [{ prompt: '只输出 OK', expected_output: 'OK' }] }, null, 2)}</pre></details></section><section><Button aria-describedby="import-directory-format" disabled={busy} onClick={() => directory.current?.click()}>导入目录</Button><p id="import-directory-format">选择包含 evals/eval.yaml 或 evals.json 的目录。<br />每次导入一个评测集，避免混放多个入口。</p></section></div>
    <input className="hidden" ref={input} type="file" accept=".zip,.json" aria-label="评测集文件" aria-describedby="import-file-format" disabled={busy} onChange={event => void read(Array.from(event.target.files || []), false)} />
    <input className="hidden" type="file" multiple aria-label="评测集目录" aria-describedby="import-directory-format" disabled={busy} ref={element => { directory.current = element; element?.setAttribute('webkitdirectory', '') }} onChange={event => void read(Array.from(event.target.files || []), true)} />
    {source && <p className="import-source-name" title={source}>{source}{busy && !preview ? ' · 正在读取…' : ''}</p>}
    {error && <div ref={errorPanel} tabIndex={-1} className="import-error" role="alert"><strong>导入未完成</strong><p>{error}</p><span>{preview ? '预览和填写内容已保留，可重试导入。' : '请选择符合上述格式的文件或目录后重试。'}</span></div>}
    {preview && <div className="import-preview"><h3>导入预览 · {Object.keys(preview.files).length} 个文件</h3>{preview.notes.length > 5 ? <details><summary>转换提示 · {preview.notes.length} 条</summary>{preview.notes.map((note, index) => <p className="small-note" key={index}>{note.path}：{note.message}</p>)}</details> : preview.notes.map((note, index) => <p className="small-note" key={index}>{note.path}：{note.message}</p>)}<ValidationView validation={preview.validation} /><details><summary>转换结果</summary><pre>{preview.files['evals/eval.yaml']?.content}</pre></details><p className="muted">有校验问题也可先存草稿，再继续修复。</p></div>}
    <div className="dialog-actions"><Button variant="link" disabled={busy} data-initial-focus="true" onClick={onClose}>取消</Button><Button variant="primary" busy={busy} disabled={!ready} onClick={saveImport}>导入草稿</Button></div>
  </Dialog>
}
