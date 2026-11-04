import { useEffect, useRef, useState } from 'react'
import { api, message, post } from './api'
import { Button, Dialog, ValidationView } from './ui'
import type { Common, EvalSet, Files, SetVersion, Skill, Validation } from './types'

type Preview = { files: Files; original_blob: string; notes: { path: string; message: string }[]; validation: Validation }
export function SetImportDialog({ common, skill, sets, onClose, onImported, onBusy }: {
  common: Common; skill: Skill; sets: EvalSet[]; onClose: () => void; onImported: (setId: string, versionId: string) => void; onBusy: (busy: boolean) => void
}) {
  const [importInto, setImportInto] = useState('')
  const [name, setName] = useState('默认评测集')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const directory = useRef<HTMLInputElement>(null)
  useEffect(() => { onBusy(busy); return () => onBusy(false) }, [busy, onBusy])
  const saveImport = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const body = { name, source_skill_version_id: skill.latest_version_id, ...preview }
      let target: string, version: SetVersion
      if (importInto) { target = importInto; version = await post<SetVersion>(`/api/sets/${importInto}/import`, body) }
      else { const result = await post<{ set_id: string; version: SetVersion }>(`/api/skills/${skill.id}/sets`, body); target = result.set_id; version = result.version }
      common.refresh(); common.notify('案例已导入草稿，校验并启用后即可评测。'); onImported(target, version.id)
    } catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
  }
  return <Dialog title={`导入评测集 · ${skill.name}`} wide onClose={() => { if (!busy) onClose() }}>
<p className="muted">支持包含 evals/eval.yaml 的 ZIP，或 evals.json。导入后保存为草稿。</p>
      <div className="form-row"><label className="field"><span>保存位置</span><select value={importInto} onChange={event => setImportInto(event.target.value)}><option value="">创建新评测集</option>{sets.map(item => <option key={item.id} value={item.id}>{item.name} · 新草稿</option>)}</select></label>{!importInto && <label className="field"><span>评测集名称</span><input value={name} maxLength={120} onChange={event => setName(event.target.value)} /></label>}</div>
      <input ref={input} type="file" accept=".zip,.json" aria-label="评测集文件" disabled={busy} onChange={async event => {
        const file = event.target.files?.[0]; if (!file) return
        setBusy(true); setPreview(null)
        try { const body = new FormData(); body.append('file', file); setPreview(await api<Preview>('/api/sets/preview-import', { method: 'POST', body })) }
        catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
      }} />
      <Button variant="link" disabled={busy} onClick={() => directory.current?.click()}>导入目录</Button>
      <input className="hidden" type="file" multiple ref={element => { directory.current = element; element?.setAttribute('webkitdirectory', '') }} onChange={async event => {
        const files = Array.from(event.target.files || []); if (!files.length) return
        setBusy(true); setPreview(null)
        try { const body = new FormData(); files.forEach(file => body.append('files', file)); body.append('paths', JSON.stringify(files.map(file => file.webkitRelativePath || file.name))); setPreview(await api<Preview>('/api/sets/preview-import-directory', { method: 'POST', body })) }
        catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
      }} />
      {preview && <div className="import-preview"><h3>导入预览 · {Object.keys(preview.files).length} 个文件</h3>{preview.notes.map((note, index) => <p className="small-note" key={index}>{note.path}：{note.message}</p>)}<ValidationView validation={preview.validation} /><details><summary>转换结果</summary><pre>{preview.files['evals/eval.yaml']?.content}</pre></details><p className="muted">有校验问题也可先存草稿，再继续修复。</p></div>}
      <div className="dialog-actions"><Button variant="link" disabled={busy} data-initial-focus="true" onClick={onClose}>取消</Button><Button variant="primary" busy={busy} disabled={!preview || !name.trim()} onClick={saveImport}>导入草稿</Button></div></Dialog>
}
