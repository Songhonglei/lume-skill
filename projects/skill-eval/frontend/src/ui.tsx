import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { api, message } from './api'
import type { Validation } from './types'

export function useData<T>(path: string | null, initial: T, revision = 0, poll = 0) {
  const [data, setData] = useState<T>(initial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    const load = async () => {
      if (!path) { setLoading(false); return }
      try {
        const result = await api<T>(path, { signal: controller.signal })
        if (alive) { setData(result); setError('') }
      } catch (error) {
        if (alive) setError(message(error))
      } finally { if (alive) setLoading(false) }
    }
    setLoading(true)
    void load()
    const timer = poll ? window.setInterval(load, poll) : undefined
    return () => { alive = false; controller.abort(); window.clearInterval(timer) }
  }, [path, revision, poll])
  return { data, loading, error, setData }
}

export function Button({ children, busy, variant = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: string }) {
  return <button type="button" {...props} disabled={busy || props.disabled} className={`button ${variant} ${props.className || ''}`}>
    {busy && <span className="spinner" aria-hidden="true" />}{children}
  </button>
}

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    skills: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    sets: <><path d="M8 5H4v16h16V5h-4" /><rect x="8" y="2" width="8" height="6" rx="1" /><path d="m8 13 2 2 5-5M8 18h8" /></>,
    tasks: <><path d="M3 12a9 9 0 1 0 3-7M3 3v6h6M12 7v5l3 2" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" /></>,
    play: <path d="m8 4 12 8-12 8Z" />,
    plus: <path d="M12 4v16M4 12h16" />,
  }
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.skills}</svg>
}

const labels: Record<string, string> = { QUEUED: '等待执行', RUNNING: '执行中', CANCEL_REQUESTED: '正在取消', SUCCEEDED: '已完成', FAILED: '未通过', CANCELLED: '已取消', INTERRUPTED: '已中断', PASSED: '全部通过', INCOMPLETE: '未完整完成', DRAFT: '草稿', SAVED: '已保存', ACTIVE: '执行中', COMPLETED: '已完成', EXPIRED: '已中断' }
export function Badge({ value, children }: { value?: string; children?: ReactNode }) {
  const tone = value === 'PASSED' || value === 'SUCCEEDED' ? 'good' : ['FAILED', 'INTERRUPTED'].includes(value || '') ? 'bad' : ['RUNNING', 'ACTIVE', 'QUEUED', 'CANCEL_REQUESTED', 'INCOMPLETE', 'DRAFT'].includes(value || '') ? 'warm' : 'muted'
  return <span className={`badge ${tone}`}>{children || labels[value || ''] || value || '—'}</span>
}

export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = ref.current; element?.showModal(); return () => element?.close() }, [])
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialog-head"><h2>{title}</h2><button className="close" onClick={onClose} aria-label="关闭">×</button></div>
    <div className="dialog-body">{children}</div>
  </dialog>
}

export function Empty({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Icon name="skills" /></span><strong>{title}</strong>{description && <p>{description}</p>}{children}</div>
}

export function ValidationView({ validation }: { validation?: Validation }) {
  if (!validation || validation.valid === undefined) return <p className="muted">修改后请重新校验。</p>
  return <div className="validation"><div className="inline"><Badge value={validation.valid ? 'PASSED' : 'INCOMPLETE'}>{validation.valid ? `校验通过 · ${validation.cases?.length || 0} 个案例` : '需要修复'}</Badge></div>
    {!!validation.issues?.length && <ul className="issues">{validation.issues.map((item, index) => <li key={index}><code>{item.path}</code><span>{item.message}</span></li>)}</ul>}
    {!!validation.warnings?.length && <details><summary>{validation.warnings.length} 条提示</summary><ul className="issues muted">{validation.warnings.map((item, index) => <li key={index}><code>{item.path}</code><span>{item.message}</span></li>)}</ul></details>}
  </div>
}

export function date(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }
