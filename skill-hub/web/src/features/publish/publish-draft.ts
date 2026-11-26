import type { PresentationSource } from './presentation-source'

export interface PublishDraft {
  namespace: string
  visibility: string
  visibilityEdited: boolean
  displayName?: string
  shortDescription: string
  overview: string
  shortSource: PresentationSource
  overviewSource: PresentationSource
  shortTouched: boolean
  overviewTouched: boolean
  hadPackage: boolean
  externalSourceUrl?: string
}

export function readPublishDraft(key: string): PublishDraft | undefined {
  if (!key) return undefined
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) as PublishDraft : undefined
  } catch {
    return undefined
  }
}

export function savePublishDraft(key: string, draft?: PublishDraft) {
  if (!key) return
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft))
    else sessionStorage.removeItem(key)
  } catch {
    // Browser storage can be disabled. The active form still keeps its state.
  }
}
