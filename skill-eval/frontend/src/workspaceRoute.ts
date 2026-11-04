import type { Page, Selection } from './types.ts'

const identifier = (value: string | null | undefined) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined
const pages = ['skills', 'sets', 'tasks', 'settings']
export type WorkspaceRoute = { page: Page; selection: Selection }
export function readRoute(hash: string): WorkspaceRoute {
  const [path, query] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/')
  const page = (pages.includes(parts[0]) ? parts[0] : 'skills') as Page
  if (page !== 'sets') return { page, selection: {} }
  const params = new URLSearchParams(query)
  let setId: string | undefined
  try { setId = parts[1] ? identifier(decodeURIComponent(parts[1])) : undefined } catch { /* Invalid links return to the directory. */ }
  return { page, selection: { setId, setVersionId: setId ? identifier(params.get('version')) : undefined, setsView: setId && parts[2] === 'history' ? 'history' : undefined,
    skillId: identifier(params.get('skill')), action: params.get('action') === 'import' ? 'import' : undefined } }
}
export function routeHash(page: Page, selection: Selection = {}) {
  if (page !== 'sets') return `#${page}`
  const params = new URLSearchParams()
  if (selection.setVersionId && selection.setsView !== 'history') params.set('version', selection.setVersionId)
  if (selection.skillId && (!selection.setId || selection.action)) params.set('skill', selection.skillId)
  if (selection.action) params.set('action', selection.action)
  const path = selection.setId ? `/${encodeURIComponent(selection.setId)}${selection.setsView === 'history' ? '/history' : ''}` : ''
  return `#sets${path}${params.size ? `?${params}` : ''}`
}
