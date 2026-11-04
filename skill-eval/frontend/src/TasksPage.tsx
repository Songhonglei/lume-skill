import { useEffect, useRef, useState } from 'react'
import { message, post } from './api'
import { Badge, Button, date, Dialog, Empty, useData, Loading, LoadError, reveal } from './ui'
import type { Common, Task, TaskDetail } from './types'

type EventRow = { attempt_id: string; sequence: number; payload: Record<string, unknown>; created_at: string }
const running = (state: string) => ['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(state)
function State({ task }: { task: Task }) { return <Badge value={task.state}>{task.state === 'FAILED' ? '执行失败' : undefined}</Badge> }
export function TasksPage(common: Common) {
  const [selected, setSelected] = useState(common.selection.taskId || '')
  const [kind, setKind] = useState('')
  const [query, setQuery] = useState('')
  const [skillId, setSkillId] = useState('')
  const [state, setState] = useState('')
  const [verdict, setVerdict] = useState('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [page, setPage] = useState(0)
  const [attemptId, setAttemptId] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState('')
  const listPanel = useRef<HTMLElement>(null)
  const detailPanel = useRef<HTMLElement>(null)
  const pendingScroll = useRef(false)
  const retryKeys = useRef(new Map<string, string>())
  const changeFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); setSelected(''); setAttemptId('') }
  const changePage = (value: number) => { setPage(value); setSelected(''); setAttemptId('') }
  const params = new URLSearchParams({ limit: '25', offset: String(page * 25), query })
  for (const [key, value] of Object.entries({ kind, state, verdict, skill_id: skillId })) if (value) params.set(key, value)
  if (since) params.set('since', new Date(`${since}T00:00:00`).toISOString())
  if (until) { const end = new Date(`${until}T00:00:00`); end.setDate(end.getDate() + 1); params.set('until', end.toISOString()) }
  const tasks = useData<Task[]>(`/api/tasks?${params}`, [], common.revision, 4000)
  const filtered = !!(kind || query || state || verdict || skillId || since || until)
  const resetFilters = () => { setKind(''); setQuery(''); setState(''); setVerdict(''); setSkillId(''); setSince(''); setUntil(''); setPage(0); setSelected(''); setAttemptId('') }
  const detail = useData<TaskDetail | undefined>(selected ? `/api/tasks/${selected}` : null, undefined, common.revision, 4000)
  const events = useData<EventRow[]>(selected ? `/api/tasks/${selected}/events` : null, [], common.revision, 4000)
  useEffect(() => { if (common.selection.taskId) setSelected(common.selection.taskId) }, [common.selection.taskId])
  useEffect(() => { if (!selected && tasks.data.length) setSelected(tasks.data[0].id) }, [selected, tasks.data])
  const task = detail.data?.id === selected ? detail.data : undefined
  const openTask = (id: string) => { setSelected(id); setAttemptId(''); if (detail.data?.id === id) reveal(detailPanel.current, true); else pendingScroll.current = true }
  useEffect(() => { if (task && pendingScroll.current) { reveal(detailPanel.current, true); pendingScroll.current = false } }, [task?.id])
  const chosenAttempt = task?.attempts.find(item => item.id === attemptId) || task?.attempts.at(-1)
  const summary = chosenAttempt?.summary || (!chosenAttempt || chosenAttempt.id === task?.current_attempt_id ? task?.summary : undefined)
  const artifacts = task?.artifacts.filter(item => item.attempt_id === chosenAttempt?.id) || []
  const visible = tasks.data
  const action = async (type: 'cancel' | 'retry') => {
    if (!task) return
    if (type === 'cancel' && !await common.confirm({ title: '取消这次任务？', description: `${task.input.skill_name} 将停止等待或执行。已有执行记录与产物会保留。`, confirmLabel: '取消任务', cancelLabel: '保留任务', danger: true })) return
    setBusy(true)
    try {
      let key = retryKeys.current.get(task.id)
      if (!key) { key = crypto.randomUUID(); retryKeys.current.set(task.id, key) }
      await post(`/api/tasks/${task.id}/${type}`, undefined, type === 'retry' ? key : undefined)
      if (type === 'retry') retryKeys.current.delete(task.id)
      common.refresh(); common.notify(type === 'retry' ? '已重新排队，将创建新的执行记录。' : '取消请求已提交。')
    } catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
  }
  return <><div className="page-heading"><div><h1>评测记录</h1><p>查看执行进度、全部案例结论和原始报告。</p></div><Button variant="link" onClick={() => common.navigate('skills')}>新建评测</Button></div>
    <section ref={listPanel} className="panel task-list" tabIndex={-1} aria-label="任务列表"><div className="panel-head"><div className="inline"><h2>任务记录</h2><span className="muted">每页 25 条</span></div><div className="actions"><select aria-label="任务类型" value={kind} onChange={event => { changeFilter(setKind, event.target.value) }}><option value="">全部任务</option><option value="evaluate">标准评测</option><option value="generate">案例生成</option></select><input className="search" maxLength={200} value={query} onChange={event => { changeFilter(setQuery, event.target.value) }} placeholder="搜索 Skill 或任务 ID" aria-label="搜索任务" /></div></div>
      <div className="task-filters"><label><span>Skill</span><select aria-label="筛选 Skill" value={skillId} onChange={event => { changeFilter(setSkillId, event.target.value) }}><option value="">全部 Skills</option>{common.skills.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>执行状态</span><select aria-label="执行状态" value={state} onChange={event => { changeFilter(setState, event.target.value) }}><option value="">全部状态</option>{[['QUEUED', '等待执行'], ['RUNNING', '执行中'], ['SUCCEEDED', '已完成'], ['FAILED', '执行失败'], ['INTERRUPTED', '已中断'], ['CANCEL_REQUESTED', '正在取消'], ['CANCELLED', '已取消']].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <details className="advanced-filters"><summary>更多筛选{verdict || since || until ? ' · 已设置' : ''}</summary><div className="advanced-fields"><label><span>评测结论</span><select aria-label="评测结论" value={verdict} onChange={event => { changeFilter(setVerdict, event.target.value) }}><option value="">全部结论</option><option value="PASSED">全部通过</option><option value="FAILED">未通过</option><option value="INCOMPLETE">未完整完成</option></select></label><label><span>开始日期</span><input aria-label="开始日期" type="date" value={since} onChange={event => { changeFilter(setSince, event.target.value) }} /></label><label><span>结束日期</span><input aria-label="结束日期" type="date" min={since || undefined} value={until} onChange={event => { changeFilter(setUntil, event.target.value) }} /></label></div></details>
        {filtered && <button className="text-button" onClick={resetFilters}>清除筛选</button>}<span className="filter-note">按创建时间排序 · 自动更新</span></div>
      {tasks.loading ? <Loading label="正在读取任务…" /> : tasks.error && !visible.length ? <LoadError message={tasks.error} retry={common.refresh} /> : visible.length ? <div className="table-scroll"><table><thead><tr><th>任务 / Skill</th><th>类型</th><th>执行状态</th><th>结论</th><th>创建时间</th><th /></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={item.id === selected ? 'selected' : ''} onClick={() => openTask(item.id)}><td><button className="row-title" aria-current={selected === item.id ? 'true' : undefined} onClick={event => { event.stopPropagation(); openTask(item.id) }}>{item.input.skill_name}</button><small className="muted mono">{item.id.slice(0, 8)} · 修订 {item.input.skill_revision}</small></td><td>{item.kind === 'evaluate' ? '标准评测' : '案例生成'}</td><td><State task={item} /></td><td>{item.kind === 'evaluate' ? <Badge value={item.verdict} /> : item.state === 'SUCCEEDED' ? <span className="muted">草稿已保存</span> : '—'}</td><td className="muted">{date(item.created_at)}</td><td><button className="text-button" aria-label={`查看 ${item.input.skill_name} 任务 ${item.id.slice(0, 8)} 详情`} onClick={event => { event.stopPropagation(); openTask(item.id) }}>详情</button></td></tr>)}</tbody></table></div> : <Empty title={filtered ? '没有匹配的任务' : '还没有评测记录'} description={filtered ? '调整或清除筛选条件，再试一次。' : '选择 Skill 和版本，完成第一次评测。'}><Button variant="link" onClick={() => filtered ? resetFilters() : common.navigate('skills')}>{filtered ? '清除筛选' : '选择 Skill'}</Button></Empty>}
      {(page > 0 || tasks.data.length === 25) && <div className="artifact-bar"><span className="muted">第 {page + 1} 页 · 每页 25 条</span><Button variant="link" disabled={!page || tasks.loading} onClick={() => changePage(page - 1)}>上一页</Button><Button variant="link" disabled={tasks.data.length < 25 || tasks.loading} onClick={() => changePage(page + 1)}>下一页</Button></div>}
      {tasks.error && <p className="error-text padded">{tasks.error}</p>}
    </section>
    {selected && detail.loading && <Loading label="正在读取任务详情…" />}
    {selected && detail.error && <LoadError message={detail.error} retry={common.refresh} />}
    {task && <section ref={detailPanel} className="panel task-detail" tabIndex={-1} aria-label="任务详情"><div className="panel-head"><div><div className="inline"><h2>{task.input.skill_name}</h2><State task={task} /><span className="subtle-chip">{task.kind === 'evaluate' ? '标准评测 · 全部案例' : '案例生成'}</span></div><p className="muted mono">{task.id}</p></div><div className="actions wrap"><Button variant="link" onClick={() => reveal(listPanel.current, true)}>返回列表</Button>{running(task.state) && <Button busy={busy} disabled={task.state === 'CANCEL_REQUESTED'} onClick={() => action('cancel')}>取消任务</Button>}{(['FAILED', 'INTERRUPTED', 'CANCELLED'].includes(task.state) || (task.state === 'SUCCEEDED' && task.verdict === 'FAILED')) && <Button busy={busy} onClick={() => action('retry')}>手动重试</Button>}</div></div>
      {task.waiting_reason && running(task.state) && <div className="callout in-panel actions wrap"><span>{task.waiting_reason}</span>{task.state === 'QUEUED' && task.waiting_reason !== '排队中' && <Button variant="link" onClick={() => common.navigate('settings')}>Worker 状态</Button>}</div>}
      <details className="task-context"><summary>本次输入与版本</summary><div className="snapshot-grid"><div><span>Skill 版本</span><strong>修订 {task.input.skill_revision}</strong></div><div><span>评测集</span><strong>{task.input.set_name || '生成新草稿'}{task.input.set_revision ? ` · 版本 ${task.input.set_revision}` : ''}</strong></div><div><span>请求模型</span><strong>{task.input.model.name}</strong></div><div><span>实际模型</span><strong>{summary?.actual_model || '未核实'}</strong></div></div></details>
      <div className="attempt-bar"><label>执行记录 {task.attempts.length ? <select value={chosenAttempt?.id || ''} onChange={event => setAttemptId(event.target.value)}>{task.attempts.map(item => <option key={item.id} value={item.id}>第 {item.number} 次 · {item.worker_name} · {date(item.created_at)}</option>)}</select> : <span className="muted">尚未开始执行</span>}</label>{chosenAttempt && <Badge value={chosenAttempt.state} />}</div>
      {summary?.reason && <div className={`outcome-reason ${task.state === 'FAILED' || summary.verdict !== 'PASSED' ? 'attention' : ''}`}><strong>{task.state === 'FAILED' ? '执行失败原因' : '结果说明'}</strong><p>{summary.reason}</p></div>}
      {task.kind === 'generate' ? <div className="padded">{summary?.draft_id ? <><p>已生成 {summary.actual_count || 0} 个案例{summary.target_count ? `，目标 ${summary.target_count} 个` : ''}。</p>{summary.count_notice && <p className="small-note">{summary.count_notice}</p>}<p className="small-note">草稿待审查：核对实际输入、预期结果、断言和附件。生成完成不代表案例质量已确认；保存并启用后再手动评测。</p><Button variant="link" onClick={() => common.navigate('sets', { skillId: task.input.skill_id, setId: summary.set_id, setVersionId: summary.draft_id })}>维护草稿</Button></> : <p className="muted">{running(task.state) ? '正在等待或生成案例。完成后可在评测集管理中查看草稿。' : '本次未形成可用草稿，请查看执行记录。'}</p>}</div> : <><div className="result-summary"><div><span>本次结论</span><Badge value={summary?.verdict || (!chosenAttempt || chosenAttempt.id === task.current_attempt_id ? task.verdict : undefined)} /></div><div><strong>{summary?.passed ?? 0}<small> / {task.input.cases?.length ?? 0}</small></strong><span>案例通过</span></div><div><strong>{summary?.failed ?? 0}</strong><span>案例未通过</span></div><div className="muted">每个冻结案例都保留结果，未执行或缺少报告会标为未完整完成。</div></div>
        <div className="case-results">{(task.input.cases || []).map(item => {
          const result = summary?.cases?.find(value => value.case_id === item.id)
          return <details key={item.id}><summary><div><strong>{item.title || item.id}</strong><small className="muted">{item.id} · {item.judge}</small></div><Badge value={result?.verdict || 'INCOMPLETE'}>{!result && running(task.state) ? '等待结果' : undefined}</Badge></summary><div className="case-result-body">{result?.reason && <p>{result.reason}</p>}{!result && <p className="muted">尚未收到该案例的完整结果。</p>}{result?.raw?.grading?.assertion_results?.map((assertion, index) => <div className="assertion" key={index}><Badge value={assertion.passed ? 'PASSED' : 'FAILED'}>{assertion.passed ? '通过' : '未通过'}</Badge><div><p>{assertion.text}</p>{assertion.evidence && <small className="muted">{assertion.evidence}</small>}</div></div>)}{result?.raw?.response && <><h3>实际输出</h3><pre>{typeof result.raw.response === 'string' ? result.raw.response : JSON.stringify(result.raw.response, null, 2)}</pre></>}</div></details>
        })}</div></>}
      <div className="artifact-bar"><strong>原始产物</strong>{artifacts.length ? artifacts.map(item => <div className="inline" key={item.id}>{item.html_available && <Button variant="link" onClick={() => setReport(item.id)}>报告</Button>}<a className="text-link" title="下载原始产物 ZIP" href={`/api/artifacts/${item.id}/download`}>下载</a></div>) : <span className="muted">执行后保留可用产物</span>}</div>
      <details className="event-log"><summary>执行日志 · {events.error ? '读取失败' : events.loading ? '读取中' : `${events.data.filter(item => item.attempt_id === chosenAttempt?.id).length} 条`}</summary>{events.error && <LoadError message={events.error} retry={common.refresh} />}<pre>{events.data.filter(item => item.attempt_id === chosenAttempt?.id).map(item => `${date(item.created_at)}  ${JSON.stringify(item.payload)}`).join('\n') || '暂无执行事件'}</pre></details>
    </section>}
    {report && <Dialog title="原始评测报告" wide onClose={() => setReport('')}><iframe className="report-frame" title="原始评测报告" sandbox="allow-scripts" referrerPolicy="no-referrer" src={`/api/artifacts/${report}/report`} /></Dialog>}
  </>
}
