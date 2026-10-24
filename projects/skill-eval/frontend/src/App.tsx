import { useEffect, useState } from 'react'
import { api, message, post } from './api'
import { Button, Dialog, Icon, useData } from './ui'
import type { Common, Page, Selection, Settings, Skill, Worker } from './types'
import { SkillsPage } from './SkillsPage'
import { SetsPage } from './SetsPage'
import { TasksPage } from './TasksPage'
import { SettingsPage } from './SettingsPage'

const navigation: [Page, string][] = [['skills', 'Skills'], ['sets', '评测集管理'], ['tasks', '评测记录'], ['settings', '系统配置']]

function Login({ setup, remote, onSuccess }: { setup?: boolean; remote?: boolean; onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="login-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { await post(setup ? '/api/setup' : '/api/session', { password, setup_token: token }); onSuccess() }
    catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }}><h1>{setup ? '创建你的评测工作台' : '登录工作台'}</h1>
    <p className="muted">{setup ? '设置一个管理员密码，即可管理本地 Skill 和评测案例。' : '输入管理员密码继续。'}</p>
    <label className="field"><span>{setup ? '管理员密码' : '密码'}</span><input autoFocus required type="password" minLength={setup ? 10 : undefined} value={password} onChange={event => setPassword(event.target.value)} autoComplete={setup ? 'new-password' : 'current-password'} placeholder={setup ? '至少 10 个字符' : '输入密码'} /></label>
    {setup && remote && <label className="field"><span>初始化口令</span><input required type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="部署时设置的一次性口令" /></label>}
    {error && <p role="alert" className="error-text">{error}</p>}
    <Button type="submit" busy={busy} variant="primary">{setup ? '进入工作台' : '登录'}</Button>
  </form>
}

export default function App() {
  const [phase, setPhase] = useState('loading')
  const [remote, setRemote] = useState(false)
  const [expired, setExpired] = useState(false)
  const [initialError, setInitialError] = useState('')
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<Page>(() => navigation.some(([page]) => page === location.hash.slice(1)) ? location.hash.slice(1) as Page : 'skills')
  const [selection, setSelection] = useState<Selection>({})
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  const [dirty, setDirty] = useState(false)
  const refresh = () => setRevision(value => value + 1)
  const notify = (text: string, error = false) => setNotice({ message: text, error })
  useEffect(() => { if (notice && !notice.error) { const timer = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(timer) } }, [notice])
  useEffect(() => {
    let alive = true
    api<{ initialized: boolean; requires_setup_token: boolean }>('/api/setup').then(async status => {
      if (!alive) return
      setRemote(status.requires_setup_token)
      if (!status.initialized) setPhase('setup')
      else { try { await api('/api/session'); if (alive) setPhase('ready') } catch { if (alive) setPhase('login') } }
    }).catch(error => { if (alive) setInitialError(message(error)) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    const listener = () => { if (phase === 'ready') setExpired(true) }
    window.addEventListener('ose-auth-expired', listener)
    return () => window.removeEventListener('ose-auth-expired', listener)
  }, [phase])
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty])
  const navigate = (page: Page, values?: Selection) => {
    if (dirty && !window.confirm('草稿有未保存的修改，确定离开吗？')) return
    setDirty(false); setTab(page); location.hash = page; refresh()
    if (values) setSelection(previous => ({ ...previous, ...values }))
  }
  const skills = useData<Skill[]>(phase === 'ready' ? '/api/skills' : null, [], revision)
  const settings = useData<Settings | undefined>(phase === 'ready' ? '/api/settings' : null, undefined, revision)
  const workers = useData<Worker[]>(phase === 'ready' ? '/api/workers' : null, [], revision, phase === 'ready' ? 10000 : 0)
  const common: Common = { skills: skills.data, settings: settings.data, workers: workers.data, selection, navigate, refresh, revision, notify, setDirty }
  const online = workers.data.filter(worker => worker.online && !worker.revoked).length
  if (phase !== 'ready') return <div className="auth-page"><div className="auth-brand"><span className="brand-mark">S</span><strong>Skill 评测中心</strong></div><div className="auth-card">
    {phase === 'loading' ? <p>{initialError || '正在连接工作台…'}</p> : <Login setup={phase === 'setup'} remote={remote} onSuccess={() => { setPhase('ready'); refresh() }} />}
  </div><p className="auth-foot">本地资源 · Codex 执行 · 可维护的评测案例</p></div>
  return <div className="app-shell"><header className="topbar"><div className="brand-mark">S</div><strong>Skill 评测中心</strong><span className="topbar-note">本地工作台</span><div className="topbar-right"><span className={`signal ${online ? 'online' : ''}`} /><span>{online ? `${online} 个 Worker 在线` : 'Worker 待连接'}</span><span className="divider" /><span>管理员</span><button className="text-button muted" onClick={async () => {
      if (dirty && !window.confirm('草稿有未保存的修改，确定退出吗？')) return
      try { await api('/api/session', { method: 'DELETE' }); setDirty(false); setPhase('login') } catch (error) { notify(message(error), true) }
    }}>退出</button></div></header>
    <nav className="workspace-tabs" aria-label="主要导航">{navigation.map(([page, label]) => <button key={page} className={tab === page ? 'active' : ''} onClick={() => navigate(page)}><Icon name={page} />{label}</button>)}</nav>
    <main>{notice && <div className={`notice ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.message}</span><button className="close" onClick={() => setNotice(null)} aria-label="关闭提示">×</button></div>}
      {skills.error && <p className="error-text">{skills.error}</p>}
      {tab === 'skills' && <SkillsPage {...common} />}{tab === 'sets' && <SetsPage {...common} />}{tab === 'tasks' && <TasksPage {...common} />}{tab === 'settings' && <SettingsPage {...common} />}
    </main>
    {expired && <Dialog title="登录已过期" onClose={() => undefined}><Login onSuccess={() => { setExpired(false); refresh() }} /></Dialog>}
  </div>
}
