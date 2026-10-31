import { useState } from 'react'
import { message, post } from './api'
import { Button, Dialog } from './ui'
import type { Common, Skill, Task } from './types'

export function TaskDialog({ common, skill, versionId, revision, kind, setId, onClose, onImport }: {
  common: Common; skill: Skill; versionId: string; revision: number; kind: 'generate' | 'evaluate'; setId?: string;
  onClose: () => void; onImport?: () => void
}) {
  const [model] = useState(common.settings?.model)
  const [key] = useState(() => crypto.randomUUID())
  const [count, setCount] = useState(5)
  const [requirements, setRequirements] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState<Record<string, unknown> | null>(null)
  const submit = async () => {
    const body = submission || { kind, skill_version_id: versionId, set_id: setId || skill.default_set_id || undefined,
      expected_set_version_id: kind === 'evaluate' ? skill.active_version_id : undefined,
      expected_model_id: model?.id, confirmed: kind === 'generate', count, requirements }
    setSubmission(body); setBusy(true); setError('')
    try {
      const result = await post<Task>('/api/tasks', body, key)
      common.refresh(); onClose(); common.navigate('tasks', { taskId: result.id })
    } catch (error) { setError(message(error)); common.refresh() }
    finally { setBusy(false) }
  }
  return <Dialog title={kind === 'generate' ? '生成案例草稿' : '开始标准评测'} onClose={onClose}>
    <dl className="review-list"><dt>Skill</dt><dd>{skill.name} <span className="muted">· 修订 {revision}</span></dd><dt>模型</dt><dd>{model?.name || '尚未配置'}</dd>
      {kind === 'evaluate' && <><dt>案例</dt><dd>{skill.default_set_name || '已选评测集'} · {skill.active_validation?.cases?.length || 0} 个 · 全部执行</dd></>}
    </dl>
    {!model && <div className="callout">请先选择可用的 Codex 连接与模型。<button className="text-button" onClick={() => { onClose(); common.navigate('settings') }}>去系统配置 →</button></div>}
    {kind === 'generate' ? <><p className="muted">生成后只保存为新草稿。请逐个审查实际输入、预期结果、断言和附件，再校验、保存并启用；已有版本继续保留，不会自动开始评测。</p>
      <div className="form-row"><label className="field narrow"><span>目标案例数</span><input type="number" min="1" max="30" value={count} disabled={busy || !!submission} onChange={event => setCount(Number(event.target.value))} /></label></div>
      <label className="field"><span>补充要求 <small>选填</small></span><textarea rows={3} value={requirements} maxLength={8000} disabled={busy || !!submission} onChange={event => setRequirements(event.target.value)} placeholder="例如：覆盖零长度字符串（非缺失输入）和中文；按 Skill 约定核对完整结果，保留大小写与标点。" /><small className="muted">说明具体输入和关注的 Skill 约定。目标数量不足时会提示，生成完成不代表案例质量已确认。</small></label>
    </> : <p className="muted">本次会固定当前 Skill、评测集和模型配置，逐一执行全部案例。</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="dialog-actions">{onImport && <Button onClick={onImport}>上传评测集</Button>}<Button onClick={onClose}>取消</Button><Button variant="primary" busy={busy} disabled={!model || (kind === 'generate' && (count < 1 || count > 30))} onClick={submit}>{kind === 'generate' ? '确认生成草稿' : '开始评测'}</Button></div>
  </Dialog>
}
