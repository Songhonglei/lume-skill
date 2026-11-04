import { useEffect, useState } from 'react'
import { message, post } from './api'
import type { Settings } from './types'
import { Button, Dialog } from './ui'
import { canConnectCenter, centerNotice, connectionPrompt, installationPrompt } from './workerSetup'

export function WorkerOnboarding({ settings, onClose, notify }: { settings: Settings; onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const [phase, setPhase] = useState<'install' | 'connect'>('install')
  const [code, setCode] = useState('')
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])
  const connectable = canConnectCenter(settings.public_url)
  const expired = !!code && now >= expiresAt
  const text = phase === 'install' ? installationPrompt(settings.required_versions) : expired ? '接入码已过期，请重新生成。' : connectionPrompt(settings.public_url, code, settings.required_versions)
  const generate = async () => {
    if (busy || !connectable) return
    setBusy(true); setError('')
    const started = Date.now()
    try {
      const result = await post<{ code: string; expires_in_seconds: number }>('/api/worker-enrollment-codes')
      setCode(result.code); setExpiresAt(started + result.expires_in_seconds * 1000); setNow(Date.now()); setPhase('connect')
    } catch (error) { setError(message(error)) } finally { setBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify(phase === 'install' ? '安装指令已复制。' : '接入指令已复制。') }
    catch { notify('请选中指令后复制。', true) }
  }
  return <Dialog title="接入 Worker" wide onClose={onClose}>
    <ol className="onboarding-steps" aria-label="接入步骤"><li aria-current={phase === 'install' ? 'step' : undefined}>1 安装</li><li aria-current={phase === 'connect' ? 'step' : undefined}>2 接入</li></ol>
    <p>{phase === 'install' ? '在执行电脑打开 Codex 等 Agent，把安装指令发给它。安装完成后再生成接入码。' : '把接入指令发给刚完成安装的 Agent。启动后会自动领取匹配任务，可能产生模型费用。'}</p>
    {centerNotice(settings.public_url) && <div className="callout onboarding-address">{centerNotice(settings.public_url)}<span className="wrap-text">{settings.public_url}</span></div>}
    <label className="field onboarding-prompt"><span>{phase === 'install' ? '安装指令' : '接入指令'}</span><textarea readOnly rows={13} value={text} aria-label={phase === 'install' ? 'Worker 安装指令' : 'Worker 接入指令'} /></label>
    {phase === 'connect' && <p className={expired ? 'error-text' : 'muted'} role="status">{expired ? '接入码已过期，请重新生成。' : `接入码剩余 ${Math.max(1, Math.ceil((expiresAt - now) / 60000))} 分钟，仅可使用一次。`}</p>}
    {error && <p className="error-text" role="alert">{error} 可重试生成接入码。</p>}
    <div className="dialog-actions onboarding-actions">
      <Button variant="link" onClick={onClose}>关闭</Button>
      {phase === 'install' ? <><Button variant="primary" onClick={copy}>复制安装指令</Button><Button disabled={busy || !connectable} busy={busy} onClick={generate}>已安装，生成接入指令</Button></> : <><Button variant="link" onClick={() => setPhase('install')}>安装指令</Button><Button variant="link" disabled={!connectable} busy={busy} onClick={generate}>重新生成</Button><Button variant="primary" disabled={expired || busy} onClick={copy}>复制接入指令</Button></>}
    </div>
  </Dialog>
}
