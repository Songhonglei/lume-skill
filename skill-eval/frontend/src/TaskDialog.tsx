import { useState } from 'react'
import { message, post, validationIssue } from './api'
import { Button, Dialog } from './ui'
import type { Common, Skill, Task } from './types'

export function TaskDialog({ common, skill, versionId, revision, kind, setId, onClose, onImport }: {
  common: Common; skill: Skill; versionId: string; revision: number; kind: 'generate' | 'evaluate'; setId?: string;
  onClose: () => void; onImport?: () => void
}) {
  const [model] = useState(common.settings?.model)
  const ready = common.workers.some(worker => worker.online && !worker.revoked && worker.capabilities.login_configured && worker.capabilities.connection_fingerprint === model?.connection_fingerprint)
  const [key] = useState(() => crypto.randomUUID())
  const [count, setCount] = useState(5)
  const [requirements, setRequirements] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('')
  const [submission, setSubmission] = useState<Record<string, unknown> | null>(null)
  const submit = async () => {
    const body = submission || { kind, skill_version_id: versionId, set_id: setId || skill.default_set_id || undefined,
      expected_set_version_id: kind === 'evaluate' ? skill.active_version_id : undefined,
      expected_model_id: model?.id, confirmed: kind === 'generate', count, requirements }
    setSubmission(body); setBusy(true); setError('')
    try {
      const result = await post<Task>('/api/tasks', body, key)
      common.refresh(); onClose(); common.navigate('tasks', { taskId: result.id })
    } catch (error) { const issue = validationIssue(error); if (issue) { setError(issue.message); setErrorField(issue.field); setSubmission(null) } else common.notify(message(error), true); common.refresh() }
    finally { setBusy(false) }
  }
  return <Dialog title={kind === 'generate' ? '生成草稿' : '标准评测'} onClose={onClose}>
    <dl className="review-list"><dt>Skill</dt><dd>{skill.name} <span className="muted">· 修订 {revision}</span></dd><dt>模型</dt><dd>{model?.name || '尚未配置'}</dd>
      {kind === 'evaluate' && <><dt>案例</dt><dd>{skill.default_set_name || '已选评测集'} · {skill.active_validation?.cases?.length || 0} 个 · 全部执行</dd></>}
    </dl>
    {!model && <div className="callout">请先配置模型。<button className="text-button" onClick={() => { onClose(); common.navigate('settings') }}>系统配置</button></div>}
    {model && !ready && <div className="callout" role="status">Worker 尚未就绪，任务将排队等待。无需重复提交。</div>}
    {kind === 'generate' ? <><p className="muted">仅生成草稿，不自动评测。请审查案例、断言和附件，再保存并启用。</p>
      <div className="form-row"><label className="field narrow"><span>目标案例数</span><input type="number" min="1" max="30" value={count} disabled={busy || !!submission} onChange={event => { setCount(Number(event.target.value)); setError('') }} />{(!Number.isInteger(count) || count < 1 || count > 30) ? <span className="field-error" role="alert">填写 1–30 的整数。</span> : error && errorField === 'count' && <span className="field-error" role="alert">{error}</span>}</label></div>
      <label className="field"><span>补充要求 <small>选填</small></span><textarea rows={3} value={requirements} maxLength={8000} disabled={busy || !!submission} onChange={event => { setRequirements(event.target.value); setError('') }} placeholder="例如：覆盖空字符串和中文，核对大小写与标点。" /><small className="muted">数量不足时会提示；生成后仍需审查。</small>{error && errorField !== 'count' && <span className="field-error" role="alert">{error}</span>}</label>
    </> : <p className="muted">按当前版本和模型执行全部案例。</p>}
    {error && kind !== 'generate' && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions">{onImport && <Button variant="link" onClick={onImport}>导入案例</Button>}<Button variant="link" data-initial-focus="true" onClick={onClose}>取消</Button><Button variant="primary" busy={busy} disabled={!model || (kind === 'generate' && (!Number.isInteger(count) || count < 1 || count > 30))} onClick={submit}>{!ready && model ? '加入队列' : kind === 'generate' ? '生成草稿' : '开始评测'}</Button></div>
  </Dialog>
}
