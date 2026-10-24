export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    const data = detail as { message?: string }
    super(typeof detail === 'string' ? detail : data?.message || '操作未完成，请检查填写内容后重试')
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
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
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
