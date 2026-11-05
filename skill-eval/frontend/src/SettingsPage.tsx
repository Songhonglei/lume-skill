import { Pagination, usePagination } from './Pagination'
import { ChoiceSelect } from './ChoiceSelect'
import { useEffect, useState } from 'react'
import { api, message, post } from './api'
import { Badge, Button, date, Dialog, Empty, Loading } from './ui'
import type { Common, Model } from './types'
import { WorkerOnboarding } from './WorkerOnboarding'
import { agentConnectionLabel } from './presentation'

export function SettingsPage(common: Common) {
  const [model, setModel] = useState(common.settings?.model?.name || '')
  const [workerId, setWorkerId] = useState('')
  const [busy, setBusy] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [workerDetailId, setWorkerDetailId] = useState('')
  const [showRevoked, setShowRevoked] = useState(false)
  const workerDetail = common.workers.find(worker => worker.id === workerDetailId)
  const filteredWorkers = common.workers.filter(worker => showRevoked || !worker.revoked)
  const paging = usePagination(common.workersLoading ? undefined : filteredWorkers.length)
  const visibleWorkers = filteredWorkers.slice(paging.start, paging.end)
  const activeWorkers = common.workers.filter(worker => !worker.revoked)
  const available = activeWorkers.filter(worker => worker.capabilities.connection_fingerprint)
  useEffect(() => { if (!model && common.settings?.model?.name) setModel(common.settings.model.name) }, [common.settings?.model?.id])
  useEffect(() => { if (!workerId && available.length) setWorkerId(available.find(worker => worker.capabilities.connection_fingerprint === common.settings?.model?.connection_fingerprint)?.id || available[0].id) }, [common.workers, workerId, common.settings?.model?.id])
  const action = async (name: string, operation: () => Promise<void>) => { setBusy(name); try { await operation() } catch (error) { common.notify(message(error), true) } finally { setBusy('') } }
  const configured = common.settings?.model
  const loggedIn = activeWorkers.some(worker => worker.capabilities.login_configured)
  const matched = activeWorkers.find(worker => worker.online && worker.capabilities.connection_fingerprint === configured?.connection_fingerprint)
  const checked = !!matched?.probe_result?.success && matched.probe_result.model === configured?.name
  const steps = [
    { title: '接入 Worker', done: activeWorkers.length > 0, note: '复制安装指令，再授权接入' },
    { title: '登录 Agent', done: loggedIn, note: '在 Worker 所在电脑完成登录' },
    { title: '选择模型', done: !!configured, note: '保存连接与可用模型名称' },
    { title: '检查连接', done: checked, note: '明确点击后才会调用模型' },
  ]
  if (common.workersLoading || common.settingsLoading) return <><div className="page-heading"><div><h1>系统配置</h1></div></div><Loading label="正在读取执行配置…" /></>
  return <><div className="page-heading"><div><h1>系统配置</h1></div></div>
    <ol className="setup-steps" aria-label="配置步骤">{steps.map((step, index) => <li key={step.title} className={step.done ? 'done' : ''}><span className="step-number" aria-label={step.done ? '已完成' : '待完成'}>{step.done ? '✓' : index + 1}</span><div><strong>{step.title}</strong><small>{step.note}</small></div></li>)}</ol>
    <section className="panel"><div className="panel-head"><div className="inline"><h2>Worker</h2><span className="count">{activeWorkers.length}</span></div><Button variant="primary" disabled={!common.settings} onClick={() => setShowOnboarding(true)}>接入 Worker</Button></div>
      {activeWorkers.length > 0 && activeWorkers.every(worker => !worker.online) && <div className="callout in-panel" role="status">Worker 离线。请在执行电脑启动 Worker，检查网络和中心地址；恢复后自动领取排队任务。</div>}
      <div className="worker-list-options"><span className="muted">检查连接会调用一次模型。</span>{common.workers.some(worker => worker.revoked) && <label><input type="checkbox" checked={showRevoked} onChange={event => { setShowRevoked(event.target.checked); paging.setPage(0) }} />显示已撤销（{common.workers.filter(worker => worker.revoked).length}）</label>}</div>
      {!common.workers.length ? <Empty title="连接第一个 Worker" description="复制安装指令到执行电脑，安装后再授权接入。" /> : <div className="table-scroll worker-scroll"><table className="workers-table"><thead><tr><th>Worker</th><th>状态</th><th>Agent 登录</th><th>连接检查</th><th>最近连接</th><th className="align-right">操作</th></tr></thead><tbody>{visibleWorkers.map(worker => <tr key={worker.id}><td><strong title={worker.name}>{worker.name}</strong></td><td><Badge value={worker.revoked ? 'REVOKED' : worker.online ? 'ONLINE' : 'OFFLINE'} /></td><td>{worker.capabilities.login_configured ? '已配置' : '未配置'}</td><td><Badge value={worker.probe_request ? 'PROBE_PENDING' : worker.probe_result?.success === true ? 'PROBE_PASSED' : worker.probe_result?.success === false ? 'PROBE_FAILED' : 'UNCHECKED'} /></td><td className="muted">{date(worker.last_seen)}</td><td className="align-right"><div className="actions right"><Button variant="link" onClick={() => setWorkerDetailId(worker.id)}>详情</Button><Button variant="link" title="会调用一次模型" disabled={worker.revoked || !worker.online || !!worker.probe_request || !configured || !!busy} busy={busy === worker.id} onClick={() => action(worker.id, async () => { await post(`/api/workers/${worker.id}/probe`, undefined, crypto.randomUUID()); common.refresh(); common.notify('连接检查已提交，将调用一次模型。') })}>检查连接</Button>{!worker.revoked && <button className="text-button danger" disabled={!!busy} onClick={async () => { if (await common.confirm({ title: `撤销 ${worker.name}？`, description: '这个 Worker 将无法继续连接，正在执行的任务会中断。需要重新接入才能恢复。', confirmLabel: '撤销连接', cancelLabel: '保留连接', danger: true })) void action('revoke', async () => { await post(`/api/workers/${worker.id}/revoke`); common.refresh(); common.notify('Worker 已撤销。') }) }}>撤销</button>}</div></td></tr>)}</tbody></table></div>}
      <Pagination label="Worker 分页" total={filteredWorkers.length} page={paging.page} pageSize={paging.pageSize} onPage={paging.setPage} onPageSize={paging.setPageSize} />
    </section>
    <div className="settings-grid"><section className="panel"><div className="panel-head"><div><h2>模型与连接</h2></div></div><form className="settings-form" onSubmit={event => { event.preventDefault(); void action('model', async () => { await api<Model>('/api/settings/model', { method: 'PUT', body: JSON.stringify({ name: model, worker_id: workerId }) }); common.refresh(); common.notify('模型配置已保存。') }) }}>
      <div className="field"><span>Agent 连接</span><ChoiceSelect aria-label="Agent 连接" required disabled={!available.length} value={workerId} onValueChange={value => setWorkerId(value)}><option value="" disabled>选择已接入的 Worker 连接</option>{available.map(worker => <option key={worker.id} value={worker.id}>{worker.name} · {agentConnectionLabel(worker.capabilities.connection_label)}{worker.online ? '' : ' · 离线'}</option>)}</ChoiceSelect><small className="muted">{available.length ? '登录过期时，在该 Worker 所在电脑重新登录即可。' : '先接入 Worker，并在该电脑登录 Agent；检测到连接后即可选择。'}</small></div>
      <label className="field"><span>模型名称</span><input required maxLength={200} value={model} onChange={event => setModel(event.target.value)} placeholder="输入当前连接可用的模型名称" /></label>
      <div className="actions"><Button type="submit" variant="primary" busy={busy === 'model'} disabled={!workerId || !model.trim() || !!busy}>保存</Button>{configured && <span className="muted">当前：{configured.name}</span>}</div>
      <p className="muted">生成、评测和语义裁判共用此配置。登录保存在 Worker 本机，保存配置不调用模型。</p>
    </form></section>
</div>
    <details className="panel environment-panel"><summary>运行环境与账号</summary><dl className="config-list"><dt>执行引擎</dt><dd>Agent CLI {common.settings?.required_versions.codex}</dd><dt>评测工具</dt><dd>skill-up {common.settings?.required_versions.skill_up}</dd><dt>执行方式</dt><dd>标准评测 · 全部案例 · 单裁判</dd><dt>数据存储</dt><dd>PostgreSQL + 本机文件库</dd><dt>中心地址</dt><dd className="wrap-text">{common.settings?.public_url}</dd></dl><div className="settings-foot"><span>单管理员密码登录</span><button className="text-button" onClick={() => setShowPassword(true)}>修改密码</button></div></details>
    {showOnboarding && common.settings && <WorkerOnboarding settings={common.settings} onClose={() => setShowOnboarding(false)} notify={common.notify} />}
    {workerDetail && <Dialog drawer="regular" title="Worker 详情" onClose={() => setWorkerDetailId('')}><dl className="set-info-list"><dt>名称</dt><dd>{workerDetail.name}</dd><dt>平台</dt><dd>{workerDetail.builtin ? '内置 Worker' : workerDetail.capabilities.platform || '独立 Worker'}</dd><dt>Agent CLI</dt><dd>{workerDetail.capabilities.codex_version || '未检测到'}</dd><dt>skill-up</dt><dd>{workerDetail.capabilities.skill_up_version || '未检测到'}</dd><dt>检查模型</dt><dd>{workerDetail.probe_result?.model || '未检查'}</dd></dl>{workerDetail.probe_result?.message && <><h3 className="detail-section-title">检查详情</h3><pre>{workerDetail.probe_result.message}</pre></>}{workerDetail.capabilities.diagnostic && <><h3 className="detail-section-title">诊断</h3><pre>{workerDetail.capabilities.diagnostic}</pre></>}<div className="dialog-actions"><Button variant="link" onClick={() => setWorkerDetailId('')}>关闭</Button></div></Dialog>}
    {showPassword && <Dialog title="修改管理员密码" onClose={() => setShowPassword(false)}><form onSubmit={event => { event.preventDefault(); void action('password', async () => { await post('/api/settings/password', { password }); setPassword(''); setShowPassword(false); common.notify('密码已更新，其他登录会话已退出。') }) }}><label className="field"><span>新密码</span><input type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 10 个字符" /></label><div className="dialog-actions"><Button variant="link" onClick={() => setShowPassword(false)}>取消</Button><Button variant="primary" type="submit" busy={busy === 'password'}>保存</Button></div></form></Dialog>}
  </>
}
