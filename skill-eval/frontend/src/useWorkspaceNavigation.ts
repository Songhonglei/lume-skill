import { useCallback, useEffect, useRef, useState } from 'react'
import { readRoute, routeHash } from './workspaceRoute'
import type { Common, Page, Selection } from './types'

type Gate = Pick<Common, 'confirm' | 'notify'> & { dirty: boolean; busy: boolean; refresh: () => void; clearDirty: () => void }
export function useWorkspaceNavigation(gate: Gate) {
  const [route, setRoute] = useState(() => readRoute(location.hash))
  const current = useRef({ hash: location.hash || '#skills', index: Number(history.state?.oseIndex) || 0 })
  const session = useRef(history.state?.oseSession || crypto.randomUUID())
  const options = useRef(gate)
  options.current = gate
  const restoring = useRef(false)
  const permitted = useRef(false)
  const pending = useRef(false)
  const apply = useCallback((hash: string, selection?: Selection) => {
    const next = readRoute(hash)
    setRoute({ page: next.page, selection: { ...selection, ...next.selection } })
    options.current.clearDirty(); options.current.refresh()
  }, [])
  useEffect(() => {
    history.replaceState({ ...history.state, oseIndex: current.current.index, oseSession: session.current }, '', current.current.hash)
    const pop = () => {
      const hash = location.hash || '#skills'
      if (restoring.current) { restoring.current = false; return }
      if (hash === '#workspace-content' || hash === current.current.hash) return
      const index = history.state?.oseSession === session.current ? Number(history.state?.oseIndex) : Number.NaN
      const delta = Number.isFinite(index) ? current.current.index - index : 0
      const { dirty, busy, confirm, notify } = options.current
      if (permitted.current || (!dirty && !busy)) {
        permitted.current = false; current.current = { hash, index: Number.isFinite(index) ? index : current.current.index }
        apply(hash, history.state?.oseSelection); return
      }
      if (delta) { restoring.current = true; history.go(delta) }
      else history.replaceState({ ...history.state, oseIndex: current.current.index, oseSession: session.current }, '', current.current.hash)
      if (busy) { notify('正在保存或读取附件，请稍候。', true); return }
      if (pending.current) return
      pending.current = true
      void confirm({ title: '离开当前草稿？', description: '还有未保存的修改。离开后，这些修改不会保留。' }).then(accepted => {
        pending.current = false
        if (!accepted) return
        if (delta) { permitted.current = true; history.go(-delta) }
        else { current.current.hash = hash; history.replaceState({ ...history.state, oseIndex: current.current.index, oseSession: session.current }, '', hash); apply(hash) }
      })
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [apply])
  const navigate = useCallback(async (page: Page, selection: Selection = {}, result?: { saved: true }) => {
    const { dirty, busy, confirm } = options.current
    // Only completed writes may bypass the in-progress/unsaved navigation guard.
    if (busy && !result?.saved) return
    if (dirty && !result?.saved && !await confirm({ title: '离开当前草稿？', description: '还有未保存的修改。离开后，这些修改不会保留。' })) return
    const hash = routeHash(page, selection)
    if (hash !== current.current.hash) {
      current.current = { hash, index: current.current.index + 1 }
      history.pushState({ oseIndex: current.current.index, oseSession: session.current, oseSelection: selection }, '', hash)
    }
    apply(hash, selection)
  }, [apply])
  return { ...route, navigate }
}
