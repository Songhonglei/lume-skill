export const pageSizes = [20, 30, 50, 100] as const
export function pageWindow(total: number, page: number, size: number) {
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.max(0, Math.min(page, pages - 1))
  return { page: current, pages, start: current * size, end: Math.min((current + 1) * size, total) }
}
