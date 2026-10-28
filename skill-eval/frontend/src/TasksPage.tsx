import { useEffect, useRef, useState } from 'react'
import { message, post } from './api'
import { Badge, Button, date, Dialog, Empty, useData } from './ui'
import type { Common, Task, TaskDetail } from './types'

type EventRow = { attempt_id: string; sequence: number; payload: Record<string, unknown>; created_at: string }
const running = (state: string) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(state)
function State({ task }: { task: Task }) { return <Badge value={task.state}>{task.state === 'FAILED' ? '执行失败' : undefined}</Badge> }
export function TasksPage(common: Common) {
  const [selected, setSelected] = useState(common.selection.taskId || '')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [attemptId, setAttemptId] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState('')
  const retryKeys = useRef(new Map<string, string>())
  const tasks = useData<Task[]>(`/api/tasks?limit=25&offset=${page * 25}${kind ? `&kind=${kind}` : ''}&query=${encodeURIComponent(query)}`, [], common.revision, 4000)
  const detail = useData<TaskDetail | undefined>(selected ? `/api/tasks/${selected}` : null, undefined, common.revision, 4000)
  const events = useData<EventRow[]>(selected ? `/api/tasks/${selected}/events` : null, [], common.revision, 4000)
  useEffect(() => { if (common.selection.taskId) setSelected(common.selection.taskId) }, [common.selection.taskId])
  useEffect(() => { if (!selected && tasks.data.length) setSelected(tasks.data[0].id) }, [selected, tasks.data])
  const task = detail.data?.id === selected ? detail.data : undefined
  const chosenAttempt = task?.attempts.find(item => item.id === attemptId) || task?.attempts.at(-1)
  const summary = chosenAttempt?.summary || (chosenAttempt?.id === task?.current_attempt_id ? task?.summary : undefined)
  const artifacts = task?.artifacts.filter(item => item.attempt_id === chosenAttempt?.id) || []
  const visible = tasks.data
  const action = async (type: 'cancel' | 'retry') => {
    if (!task) return
    if (type === 'cancel' && !window.confirm('确定取消这次任务吗？已产生的执行记录会保留。')) return
    setBusy(true)
    try {
      let key = retryKeys.current.get(task.id)
      if (!key) { key = crypto.randomUUID(); retryKeys.current.set(task.id, key) }
      await post(`/api/tasks/${task.id}/${type}`, undefined, type === 'retry' ? key : undefined)
      if (type === 'retry') retryKeys.current.delete(task.id)
      common.refresh(); common.notify(type === 'retry' ? '已重新排队，将创建新的执行记录。' : '取消请求已提交。')
    } catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
  }
  return <><div className="page-heading"><div><h1>评测记录</h1><p>查看执行进度、全部案例结论和原始报告。</p></div><Button onClick={() => common.navigate('skills')}>发起新评测</Button></div>
    <section className="panel"><div className="panel-head"><div className="inline"><h2>任务记录</h2><span className="count">{tasks.data.length}</span></div><div className="actions"><select aria-label="任务类型" value={kind} onChange={event => { setKind(event.target.value); setPage(0) }}><option value="">全部任务</option><option value="evaluate">标准评测</option><option value="generate">案例生成</option></select><input className="search" maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="搜索 Skill 或任务 ID" aria-label="搜索任务" /></div></div>
      {visible.length ? <div className="table-scroll"><table><thead><tr><th>任务 / Skill</th><th>类型</th><th>执行状态</th><th>结论</th><th>创建时间</th><th /></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={item.id === selected ? 'selected' : ''} onClick={() => { setSelected(item.id); setAttemptId('') }}><td><button className="row-title" onClick={() => { setSelected(item.id); setAttemptId('') }}>{item.input.skill_name}</button><small className="muted mono">{item.id.slice(0, 8)} · 修订 {item.input.skill_revision}</small></td><td>{item.kind === 'evaluate' ? '标准评测' : '案例生成'}</td><td><State task={item} /></td><td>{item.kind === 'evaluate' ? <Badge value={item.verdict} /> : item.state === 'SUCCEEDED' ? <span className="muted">草稿已保存</span> : '—'}</td><td className="muted">{date(item.created_at)}</td><td><button className="text-button" onClick={() => setSelected(item.id)}>详情 →</button></td></tr>)}</tbody></table></div> : <Empty title={query || kind ? '没有匹配的任务' : '还没有评测记录'} description="从 Skills 选择版本，即可开始标准评测。" />}
      {(page > 0 || tasks.data.length === 25) && <div className="artifact-bar"><span className="muted">第 {page + 1} 页 · 每页 25 条</span><Button variant="small" disabled={!page || tasks.loading} onClick={() => setPage(value => value - 1)}>上一页</Button><Button variant="small" disabled={tasks.data.length < 25 || tasks.loading} onClick={() => setPage(value => value + 1)}>下一页</Button></div>}
      {tasks.error && <p className="error-text padded">{tasks.error}</p>}
    </section>
    {task && <section className="panel task-detail"><div className="panel-head"><div><div className="inline"><h2>{task.input.skill_name}</h2><State task={task} /><span className="subtle-chip">{task.kind === 'evaluate' ? '标准评测 · 全部案例' : '案例生成'}</span></div><p className="muted mono">{task.id}</p></div><div className="actions">{running(task.state) && <Button busy={busy} disabled={task.state === 'CANCEL_REQUESTED'} onClick={() => action('cancel')}>取消任务</Button>}{(['FAILED', 'INTERRUPTED', 'CANCELLED'].includes(task.state) || (task.state === 'SUCCEEDED' && task.verdict === 'FAILED')) && <Button busy={busy} onClick={() => action('retry')}>手动重试</Button>}</div></div>
      {task.waiting_reason && running(task.state) && <div className="callout in-panel actions wrap"><span>{task.waiting_reason}</span>{task.state === 'QUEUED' && task.waiting_reason !== '排队中' && <Button variant="small" onClick={() => common.navigate('settings')}>查看 Worker 状态</Button>}</div>}
      <div className="snapshot-grid"><div><span>Skill 版本</span><strong>修订 {task.input.skill_revision}</strong></div><div><span>评测集</span><strong>{task.input.set_name || '生成新草稿'}{task.input.set_revision ? ` · 版本 ${task.input.set_revision}` : ''}</strong></div><div><span>请求模型</span><strong>{task.input.model.name}</strong></div><div><span>实际模型</span><strong>{summary?.actual_model || '未核实'}</strong></div></div>
      <div className="attempt-bar"><label>执行记录 <select value={chosenAttempt?.id || ''} onChange={event => setAttemptId(event.target.value)}>{task.attempts.map(item => <option key={item.id} value={item.id}>第 {item.number} 次 · {item.worker_name} · {date(item.created_at)}</option>)}</select></label>{chosenAttempt && <Badge value={chosenAttempt.state} />}</div>
      {summary?.reason && <div className="callout in-panel">{summary.reason}</div>}
      {task.kind === 'generate' ? <div className="padded">{summary?.draft_id ? <><p>已生成 {summary.actual_count || 0} 个案例{summary.target_count ? `，目标 ${summary.target_count} 个` : ''}。</p>{summary.count_notice && <p className="small-note">{summary.count_notice}</p>}<Button variant="primary" onClick={() => common.navigate('sets', { skillId: task.input.skill_id, setId: summary.set_id })}>查看并维护草稿</Button></> : <p className="muted">{running(task.state) ? '正在等待或生成案例。完成后可在评测集管理中查看草稿。' : '本次未形成可用草稿，请查看执行记录。'}</p>}</div> : <><div className="result-summary"><div><span>本次结论</span><Badge value={summary?.verdict || (chosenAttempt?.id === task.current_attempt_id ? task.verdict : undefined)} /></div><div><strong>{summary?.passed ?? 0}<small> / {task.input.cases?.length ?? 0}</small></strong><span>案例通过</span></div><div><strong>{summary?.failed ?? 0}</strong><span>案例未通过</span></div><div className="muted">每个冻结案例都保留结果，未执行或缺少报告会标为未完整完成。</div></div>
        <div className="case-results">{(task.input.cases || []).map(item => {
          const result = summary?.cases?.find(value => value.case_id === item.id)
          return <details key={item.id}><summary><div><strong>{item.title || item.id}</strong><small className="muted">{item.id} · {item.judge}</small></div><Badge value={result?.verdict || 'INCOMPLETE'}>{!result && running(task.state) ? '等待结果' : undefined}</Badge></summary><div className="case-result-body">{result?.reason && <p>{result.reason}</p>}{!result && <p className="muted">尚未收到该案例的完整结果。</p>}{result?.raw?.grading?.assertion_results?.map((assertion, index) => <div className="assertion" key={index}><Badge value={assertion.passed ? 'PASSED' : 'FAILED'}>{assertion.passed ? '通过' : '未通过'}</Badge><div><p>{assertion.text}</p>{assertion.evidence && <small className="muted">{assertion.evidence}</small>}</div></div>)}{result?.raw?.response && <><h3>实际输出</h3><pre>{typeof result.raw.response === 'string' ? result.raw.response : JSON.stringify(result.raw.response, null, 2)}</pre></>}</div></details>
        })}</div></>}
      <div className="artifact-bar"><strong>原始产物</strong>{artifacts.length ? artifacts.map(item => <div className="inline" key={item.id}>{item.html_available && <Button variant="small" onClick={() => setReport(item.id)}>查看原始报告</Button>}<a className="button small" href={`/api/artifacts/${item.id}/download`}>下载产物 ZIP</a></div>) : <span className="muted">执行后保留可用产物</span>}</div>
      <details className="event-log"><summary>执行日志 · {events.data.filter(item => item.attempt_id === chosenAttempt?.id).length} 条</summary><pre>{events.data.filter(item => item.attempt_id === chosenAttempt?.id).map(item => `${date(item.created_at)}  ${JSON.stringify(item.payload)}`).join('\n') || '暂无执行事件'}</pre></details>
    </section>}
    {report && <Dialog title="原始 skill-up 报告" wide onClose={() => setReport('')}><iframe className="report-frame" title="原始评测报告" sandbox="allow-scripts" referrerPolicy="no-referrer" src={`/api/artifacts/${report}/report`} /></Dialog>}
  </>
}
