import { Pagination, usePagination } from './Pagination'
import { pageWindow } from './pageWindow'
import { routeHash } from './workspaceRoute'
import { ChoiceSelect } from './ChoiceSelect'
import { useEffect, useRef, useState } from 'react'
import { message, post } from './api'
import { Badge, Button, date, Dialog, Empty, useData, Loading, LoadError } from './ui'
import type { CaseInfo, Common, Task, TaskDetail, TaskSummary } from './types'
import { assertionStatus, cancelNotice, isRunning as running, missingResult, statusOf, taskStates, taskView } from './presentation'

type EventRow = { attempt_id: string; sequence: number; payload: Record<string, unknown>; created_at: string }
function State({ task }: { task: Task }) { return <Badge value={task.state} context="execution" /> }
function canRetry(task: Task) {
  return ['FAILED', 'INTERRUPTED', 'CANCELLED'].includes(task.state) || (task.state === 'SUCCEEDED' && task.verdict === 'FAILED')
}
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
  const [pageSize, setPageSize] = useState(20)
  const retryKeys = useRef(new Map<string, string>())
  const changeFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); setSelected(''); setAttemptId('') }
  const changePage = (value: number) => { setPage(value); setSelected(''); setAttemptId('') }
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize), query, paginated: 'true' })
  for (const [key, value] of Object.entries({ kind, state, verdict, skill_id: skillId })) if (value) params.set(key, value)
  if (since) params.set('since', new Date(`${since}T00:00:00`).toISOString())
  if (until) { const end = new Date(`${until}T00:00:00`); end.setDate(end.getDate() + 1); params.set('until', end.toISOString()) }
  const tasks = useData<{ items: Task[]; total: number } | undefined>(`/api/tasks?${params}`, undefined, common.revision, 4000)
  useEffect(() => { if (tasks.data) { const next = pageWindow(tasks.data.total, page, pageSize).page; if (next !== page) setPage(next) } }, [tasks.data?.total, page, pageSize])
  const filtered = !!(kind || query || state || verdict || skillId || since || until)
  const resetFilters = () => { setKind(''); setQuery(''); setState(''); setVerdict(''); setSkillId(''); setSince(''); setUntil(''); setPage(0); setSelected(''); setAttemptId('') }
  const detail = useData<TaskDetail | undefined>(selected ? `/api/tasks/${selected}` : null, undefined, common.revision, 4000)
  const events = useData<EventRow[]>(selected ? `/api/tasks/${selected}/events` : null, [], common.revision, 4000)
  useEffect(() => { if (common.selection.taskId) setSelected(common.selection.taskId) }, [common.selection.taskId])
  const task = detail.data?.id === selected ? detail.data : undefined
  const openTask = (id: string) => { setSelected(id); setAttemptId('') }
  const view = task ? taskView(task, attemptId) : undefined
  const chosenAttempt = view?.attempt
  const summary = view?.summary
  const viewState = view?.state || ''
  const artifacts = view?.artifacts || []
  const artifactBar = <div className="artifact-bar"><strong>原始产物</strong>{artifacts.length ? artifacts.map(item => <div className="inline" key={item.id}>{item.html_available && <a className="text-link" target="_blank" rel="noopener noreferrer" href={`/api/artifacts/${item.id}/report`}>查看报告</a>}<a className="text-link" title="下载原始产物 ZIP" href={`/api/artifacts/${item.id}/download`}>下载 ZIP</a></div>) : <span className="muted">{running(viewState) ? '暂无产物' : '本次未保留产物'}</span>}</div>
  const visible = tasks.data?.items || []
  const action = async (type: 'cancel' | 'retry', target = task as Task | undefined) => {
    if (!target || busy) return
    if (type === 'cancel' && !await common.confirm({ title: '停止任务？', description: `${target.input.skill_name} 将停止等待或执行，已有记录与产物会保留。`, confirmLabel: '停止任务', cancelLabel: '保留任务', danger: true })) return
    if (type === 'retry') {
      const input = target.input
      const suite = input.set_name || (target.kind === 'generate' ? '新建评测集' : '原评测集')
      const revision = input.set_revision ? `，版本 ${input.set_revision}` : ''
      const scope = target.kind === 'generate' ? `目标 ${input.count ?? '原定数量'} 个生成案例` : `执行全部 ${input.cases?.length ?? 0} 个案例`
      if (!await common.confirm({
        title: '重跑本次配置？',
        description: `使用 ${input.skill_name}（修订 ${input.skill_revision}）、${suite}${revision}和模型 ${input.model.name}，${scope}。`,
        confirmLabel: '重新排队', cancelLabel: '取消',
      })) return
    }
    setBusy(true)
    try {
      let key = retryKeys.current.get(target.id)
      if (!key) { key = crypto.randomUUID(); retryKeys.current.set(target.id, key) }
      const result = await post<Task>(`/api/tasks/${target.id}/${type}`, undefined, type === 'retry' ? key : undefined)
      if (selected === target.id) setAttemptId('')
      if (type === 'retry') retryKeys.current.delete(target.id)
      common.refresh(); common.notify(type === 'retry' ? '已重新排队。' : cancelNotice(result.state))
    } catch (error) { common.notify(message(error), true) } finally { setBusy(false) }
  }
  return <><div className="page-heading"><div><h1>评测记录</h1></div><Button variant="link" onClick={() => common.navigate('skills')}>新建评测</Button></div>
    <section className="panel task-list" tabIndex={-1} aria-label="任务列表"><div className="panel-head"><div className="inline"><h2>任务列表</h2></div><div className="actions"><ChoiceSelect aria-label="任务类型" value={kind} onValueChange={value => { changeFilter(setKind, value) }}><option value="">全部任务</option><option value="evaluate">标准评测</option><option value="generate">案例生成</option></ChoiceSelect><input className="search" maxLength={200} value={query} onChange={event => { changeFilter(setQuery, event.target.value) }} placeholder="搜索 Skill 或任务 ID" aria-label="搜索任务" /></div></div>
      <div className="task-filters"><div className="control-field"><span>Skill</span><ChoiceSelect aria-label="筛选 Skill" value={skillId} onValueChange={value => { changeFilter(setSkillId, value) }}><option value="">全部 Skills</option>{common.skills.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</ChoiceSelect></div>
        <div className="control-field"><span>执行状态</span><ChoiceSelect aria-label="执行状态" value={state} onValueChange={value => { changeFilter(setState, value) }}><option value="">全部状态</option>{taskStates.map(value => <option key={value} value={value}>{statusOf(value, 'execution').label}</option>)}</ChoiceSelect></div>
        <details className="advanced-filters"><summary>更多筛选{verdict || since || until ? ' · 已设置' : ''}</summary><div className="advanced-fields"><div className="control-field"><span>评测结论</span><ChoiceSelect aria-label="评测结论" value={verdict} onValueChange={value => { changeFilter(setVerdict, value) }}><option value="">全部结论</option><option value="PASSED">全部通过</option><option value="FAILED">未通过</option><option value="INCOMPLETE">未完成</option></ChoiceSelect></div><label><span>开始日期</span><input aria-label="开始日期" type="date" value={since} onChange={event => { changeFilter(setSince, event.target.value) }} /></label><label><span>结束日期</span><input aria-label="结束日期" type="date" min={since || undefined} value={until} onChange={event => { changeFilter(setUntil, event.target.value) }} /></label></div></details>
        {filtered && <button className="text-button" onClick={resetFilters}>清除筛选</button>}<span className="filter-note">自动更新</span></div>
      {tasks.loading ? <Loading label="正在读取任务…" /> : tasks.error && !visible.length ? <LoadError message={tasks.error} retry={common.refresh} /> : visible.length ? <div className="table-scroll"><table className="tasks-table" role="table"><thead><tr><th>Skill</th><th>任务 ID</th><th>类型</th><th>执行状态</th><th>结论</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} role="row" className={item.id === selected ? 'selected' : ''} onClick={() => openTask(item.id)}><td><button className="row-title" aria-current={selected === item.id ? 'true' : undefined} onClick={event => { event.stopPropagation(); openTask(item.id) }} title={item.input.skill_name}>{item.input.skill_name}</button></td><td className="task-id mono" title={item.id}>{item.id.slice(0, 8)}</td><td className="task-type">{item.kind === 'evaluate' ? '标准评测' : '案例生成'}</td><td className="task-state"><State task={item} /></td><td className="task-verdict">{item.kind === 'evaluate' ? <Badge value={item.verdict || (item.state === 'QUEUED' ? 'PENDING' : running(item.state) ? 'WAITING_RESULT' : 'INCOMPLETE')} /> : item.state === 'SUCCEEDED' ? <span className="muted">草稿已保存</span> : '—'}</td><td className="task-date muted">{date(item.created_at)}</td><td className="task-actions"><button className="text-button" aria-label={`查看 ${item.input.skill_name} 任务 ${item.id.slice(0, 8)} 详情`} onClick={event => { event.stopPropagation(); openTask(item.id) }}>详情</button>{running(item.state) && <Button variant="link" disabled={busy || item.state === 'CANCEL_REQUESTED'} onClick={event => { event.stopPropagation(); void action('cancel', item) }}>停止</Button>}{canRetry(item) && <Button variant="link" disabled={busy} onClick={event => { event.stopPropagation(); void action('retry', item) }}>重跑</Button>}</td></tr>)}</tbody></table></div> : <Empty title={filtered ? '没有匹配的任务' : '还没有评测记录'} description={filtered ? '调整或清除筛选条件，再试一次。' : '选择 Skill 和版本，完成第一次评测。'}><Button variant="link" onClick={() => filtered ? resetFilters() : common.navigate('skills')}>{filtered ? '清除筛选' : '选择 Skill'}</Button></Empty>}
      <Pagination label="评测记录分页" total={tasks.data?.total} page={page} pageSize={pageSize} onPage={changePage} onPageSize={value => { setPageSize(value); changePage(0) }} disabled={tasks.loading} />
      {tasks.error && <p className="error-text padded">{tasks.error}</p>}
    </section>
    {selected && <Dialog drawer="large" title="评测详情" onClose={() => setSelected('')}>
    {detail.loading && <Loading label="正在读取任务详情…" />}
    {detail.error && <LoadError message={detail.error} retry={common.refresh} />}
    {task && <section className="task-detail" tabIndex={-1} aria-label="任务详情"><div className="panel-head"><div><div className="inline"><h2>{task.input.skill_name}</h2><State task={task} /><span className="subtle-chip">{task.kind === 'evaluate' ? '标准评测 · 全部案例' : '案例生成'}</span></div><p className="muted mono">{task.id}</p></div><div className="actions wrap">{running(task.state) && <Button busy={busy} disabled={task.state === 'CANCEL_REQUESTED'} onClick={() => action('cancel')}>停止</Button>}{canRetry(task) && <Button busy={busy} onClick={() => action('retry')}>重跑本次配置</Button>}{task.kind === 'evaluate' && common.skills.some(skill => skill.id === task.input.skill_id) && <Button variant="link" onClick={() => common.navigate('skills', { skillId: task.input.skill_id })}>用当前版本新建评测</Button>}</div></div>
      {task.waiting_reason && task.state === 'QUEUED' && <div className="callout in-panel actions wrap"><span>{task.waiting_reason}</span>{task.state === 'QUEUED' && task.waiting_reason !== '排队中' && <Button variant="link" onClick={() => common.navigate('settings')}>Worker 状态</Button>}</div>}
      <div className="task-context snapshot-grid" aria-label="本次输入与版本"><div><span>Skill 版本</span><strong>修订 {task.input.skill_revision}</strong></div><div><span>评测集</span><strong>{task.input.set_name || '生成新草稿'}{task.input.set_revision ? ` · 版本 ${task.input.set_revision}` : ''}</strong></div><div><span>请求模型</span><strong>{task.input.model.name}</strong></div><div><span>实际模型</span><strong>{summary?.actual_model || '未核实'}</strong></div></div>
      <p className="task-created muted">创建于 {date(task.created_at)}</p>
      <div className="attempt-bar"><div className="control-field">执行记录 <ChoiceSelect aria-label="执行记录" value={chosenAttempt?.id || ''} onValueChange={value => setAttemptId(value)}>{!task.current_attempt_id && <option value="">当前任务 · {statusOf(task.state, 'execution').label}</option>}{task.attempts.map(item => <option key={item.id} value={item.id}>第 {item.number} 次 · {item.worker_name} · {date(item.created_at)}</option>)}</ChoiceSelect></div>{chosenAttempt && <Badge value={chosenAttempt.state} />}</div>
      {!view?.current && <div className="callout in-panel">第 {chosenAttempt?.number} 次执行记录。<Button variant="link" onClick={() => setAttemptId('')}>当前任务</Button></div>}
      {viewState === 'CANCELLED' && <p className="task-status-note" role="status">任务已停止，已有记录已保留。</p>}
      {viewState === 'CANCEL_REQUESTED' && <p className="task-status-note" role="status">正在停止，已有记录会保留。</p>}

      {summary?.reason && <div className={`outcome-reason ${viewState === 'FAILED' || summary.verdict === 'FAILED' || summary.verdict === 'INCOMPLETE' ? 'attention' : ''}`}><strong>{viewState === 'FAILED' ? '失败原因' : '结果说明'}</strong><p>{summary.reason}</p></div>}
      {task.kind === 'generate' && artifactBar}
      {task.kind === 'generate' ? <div className="padded">{summary?.draft_id ? <><p>已保留 {summary.actual_count || 0} 个案例的草稿{summary.target_count ? `，目标 ${summary.target_count} 个` : ''}。</p>{summary.count_notice && <p className="small-note">{summary.count_notice}</p>}<p className="small-note">请审查案例、断言和附件，保存并启用后再评测。</p><a className="text-link" target="_blank" rel="noopener noreferrer" href={routeHash('sets', { setId: summary.set_id, setVersionId: summary.draft_id })}>维护草稿</a></> : <p className="muted">{viewState === 'CANCELLED' ? '任务已停止，未生成草稿。' : viewState === 'CANCEL_REQUESTED' ? '正在停止，尚无草稿。' : running(viewState) ? '等待生成草稿。' : '未生成草稿，请查看执行日志。'}</p>}</div> : <><div className="result-summary"><div><span>执行结论</span><Badge value={summary?.verdict || (view?.current ? task.verdict : undefined) || missingResult(viewState).status} /></div><div><strong>{summary?.passed ?? 0}<small> / {task.input.cases?.length ?? 0}</small></strong><span>案例通过</span></div><div><strong>{summary?.failed ?? 0}</strong><span>案例未通过</span></div><div className="muted">缺少完整结果的案例标为“未完成”。</div></div>
        {artifactBar}
        <CaseResults key={`${task.id}/${chosenAttempt?.id || 'pending'}`} cases={task.input.cases || []} summary={summary} state={viewState} /></>}
      <details className="event-log"><summary>执行日志 · {events.error ? '读取失败' : events.loading ? '读取中' : `${events.data.filter(item => item.attempt_id === chosenAttempt?.id).length} 条`}</summary>{events.error && <LoadError message={events.error} retry={common.refresh} />}<pre>{events.data.filter(item => item.attempt_id === chosenAttempt?.id).map(item => `${date(item.created_at)}  ${JSON.stringify(item.payload)}`).join('\n') || '暂无日志'}</pre></details>
    </section>}
    </Dialog>}
  </>
}

function CaseResults({ cases, summary, state }: { cases: CaseInfo[]; summary?: TaskSummary; state: string }) {
  const [expanded, setExpanded] = useState(cases.length <= 8)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const results = new Map(summary?.cases?.map(result => [result.case_id, result]))
  const missing = missingResult(state)
  const rows = cases.filter(item => `${item.title} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()) && (!filter || (results.get(item.id)?.verdict || 'INCOMPLETE') === filter))
  const paging = usePagination(rows.length)
  const { setPage } = paging
  return <div className="case-results"><div className="case-results-toolbar"><h3>案例结果 <span className="muted">{cases.length}</span></h3><div className="actions wrap">
    {(summary?.failed ?? 0) > 0 && <Button variant="link" aria-pressed={filter === 'FAILED'} onClick={() => { setFilter(filter === 'FAILED' ? '' : 'FAILED'); setExpanded(true); setPage(0) }}>{filter === 'FAILED' ? '显示全部案例' : '只看未通过案例'}</Button>}
    {cases.length > 8 && <Button variant="link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起' : '展开'}</Button>}</div></div>{expanded && <><div className="case-results-controls actions wrap"><input className="search" aria-label="搜索案例结果" placeholder="搜索案例名称或 ID" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /><ChoiceSelect aria-label="筛选案例结果" value={filter} onValueChange={value => { setFilter(value); setPage(0) }}><option value="">全部结果</option><option value="FAILED">未通过</option><option value="INCOMPLETE">未完成</option><option value="PASSED">已通过</option></ChoiceSelect></div>
    {rows.slice(paging.start, paging.end).map(item => {
      const result = results.get(item.id)
      return <details key={item.id}><summary><div><strong>{item.title || item.id}</strong><small className="muted">{item.id} · {item.judge}</small></div><Badge value={result?.verdict || missing.status}>{result?.verdict === 'PASSED' ? '已通过' : undefined}</Badge></summary><div className="case-result-body">{result?.reason && <p>{result.reason}</p>}{!result && <p className="muted">{missing.text}</p>}{result?.raw?.grading?.assertion_results?.map((assertion, index) => <div className="assertion" key={index}><Badge value={assertionStatus(assertion)}>{assertion.skipped ? '未执行' : assertion.passed ? '已通过' : '未通过'}</Badge><div><p>{assertion.text.startsWith('expect.') ? `前置条件 · ${assertion.text}` : assertion.text}</p>{(assertion.skipped || assertion.evidence) && <small className="muted">{assertion.skipped && assertion.evidence?.startsWith('not evaluated: expect gate failed') ? '前置条件未满足，未执行此项判分。' : assertion.evidence || '此项判分未执行。'}</small>}</div></div>)}{result?.raw?.response && <><h3>实际输出</h3><pre>{typeof result.raw.response === 'string' ? result.raw.response : JSON.stringify(result.raw.response, null, 2)}</pre></>}</div></details>
    })}
    {!rows.length && <p className="muted padded">{cases.length ? '没有匹配的案例。' : '没有案例。'}</p>}
    <Pagination label="案例结果分页" total={rows.length} page={paging.page} pageSize={paging.pageSize} onPage={paging.setPage} onPageSize={paging.setPageSize} /></>}
  </div>
}
