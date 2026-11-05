import { useEffect, useState } from 'react'
import { pageSizes, pageWindow } from './pageWindow'
import { Button } from './ui'

export function usePagination(total?: number) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const bounds = pageWindow(total ?? 0, page, pageSize)
  useEffect(() => { if (total !== undefined && bounds.page !== page) setPage(bounds.page) }, [total, pageSize, page, bounds.page])
  return { ...bounds, page: total === undefined ? page : bounds.page, pageSize, setPage,
    setPageSize: (value: number) => { setPageSize(value); setPage(0) } }
}

export function Pagination({ total, page, pageSize, onPage, onPageSize, disabled = false, label = '列表分页' }: {
  total?: number; page: number; pageSize: number; onPage: (value: number) => void; onPageSize: (value: number) => void; disabled?: boolean; label?: string
}) {
  const { pages } = pageWindow(total ?? 0, page, pageSize)
  const locked = disabled || total === undefined
  return <nav className="pagination" aria-label={label}>
    <span className="pagination-total">{total === undefined ? '共 — 条' : `共 ${total} 条`}</span>
    <label>每页 <select aria-label="每页条数" value={pageSize} disabled={disabled} onChange={event => onPageSize(Number(event.target.value))}>{pageSizes.map(value => <option key={value} value={value}>{value}</option>)}</select> 条</label>
    <div className="pagination-pages"><Button variant="link" aria-label="上一页" disabled={locked || page <= 0} onClick={() => onPage(page - 1)}>上一页</Button><span aria-live="polite">{page + 1} / {total === undefined ? '—' : pages}</span><Button variant="link" aria-label="下一页" disabled={locked || page >= pages - 1} onClick={() => onPage(page + 1)}>下一页</Button></div>
  </nav>
}
