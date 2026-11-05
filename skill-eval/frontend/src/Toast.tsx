import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type Notice = { id: string; message: string; error: boolean }

function activeDialog() {
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
  return dialogs.filter(dialog => dialog.matches(':modal')).at(-1) || document.body
}

// Popovers enter the browser top layer. Staying inside the active modal also
// keeps the dismiss control interactive while the rest of the page is inert.
export function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState(activeDialog)
  useLayoutEffect(() => {
    const sync = () => setTarget(previous => { const next = activeDialog(); return previous === next ? previous : next })
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    sync()
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const element = ref.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showPopover()
    return () => {
      if (element?.contains(document.activeElement) && previous?.isConnected) previous.focus({ preventScroll: true })
      if (element?.matches(':popover-open')) element.hidePopover()
    }
  }, [target, notice.id])
  return createPortal(<div ref={ref} popover="manual" className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'} aria-atomic="true">
    <span className="toast-icon" aria-hidden="true">{notice.error ? '!' : '✓'}</span><span className="toast-message">{notice.message}</span><button type="button" className="toast-close" aria-label="关闭提示" onClick={onDismiss}>×</button>
  </div>, target)
}
