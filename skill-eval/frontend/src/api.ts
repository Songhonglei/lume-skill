export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    const data = detail as { message?: string }
    super(typeof detail === 'string' ? detail : data?.message || validationText(detail) || '操作未完成，请检查填写内容后重试')
    this.status = status; this.detail = detail
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const method = options.method || 'GET'
  if (!(options.body instanceof FormData) && options.body) headers.set('Content-Type', 'application/json')
  if (method !== 'GET') {
    const csrf = document.cookie.split('; ').find(value => value.startsWith('ose_csrf='))?.split('=')[1]
    if (csrf) headers.set('X-CSRF-Token', decodeURIComponent(csrf))
  }
  let response: Response
  try {
    response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new Error('无法连接评测中心，请检查中心服务和网络，恢复后重试。')
  }
  const data = await response.json().catch(() => ({ detail: '服务暂时没有响应，请稍后重试' }))
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('ose-auth-expired'))
    throw new ApiError(response.status, data.detail)
  }
  return data as T
}

export const post = <T>(path: string, body?: unknown, key?: string) => api<T>(path, {
  method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
  headers: key ? { 'Idempotency-Key': key } : undefined,
})

export function message(error: unknown) {
  return error instanceof Error ? error.message : '操作未完成，请稍后重试'
}

function validationText(detail: unknown): string | undefined {
  if (!Array.isArray(detail) || !detail[0]) return
  const { type, ctx = {} } = detail[0]
  if (type === 'missing') return '请填写此项。'
  if (type === 'string_too_short') return `至少填写 ${ctx.min_length} 个字符。`
  if (type === 'string_too_long') return `最多填写 ${ctx.max_length} 个字符。`
  if (type === 'greater_than_equal') return `不能少于 ${ctx.ge}。`
  if (type === 'less_than_equal') return `不能超过 ${ctx.le}。`
  return '请检查此项的格式和取值。'
}

export function validationIssue(error: unknown): { field: string; message: string } | undefined {
  if (!(error instanceof ApiError) || error.status !== 422) return
  const detail = Array.isArray(error.detail) ? error.detail[0] : undefined
  return { field: Array.isArray(detail?.loc) ? String(detail.loc.at(-1)) : '', message: error.message }
}
