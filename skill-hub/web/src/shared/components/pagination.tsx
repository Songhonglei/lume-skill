import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

interface PaginationProps {
  analyticsId?: string
  page: number
  totalPages?: number
  hasNext?: boolean
  previousAnalyticsId?: string
  nextAnalyticsId?: string
  className?: string
  onPageChange: (page: number) => void
  disabled?: boolean
  mobileCompact?: boolean
  compact?: boolean
}

type PageItem = number | 'ellipsis'

/**
 * Builds the list of page slots to render. Always shows the first and last page,
 * the current page, and one neighbour on each side, collapsing the rest into
 * ellipsis markers. Pages are 0-indexed internally; labels are 1-indexed.
 */
export function buildPageItems(
  current: number,
  totalPages: number,
): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i)
  }

  const items: PageItem[] = []
  const first = 0
  const last = totalPages - 1
  const start = Math.max(first + 1, current - 1)
  const end = Math.min(last - 1, current + 1)

  items.push(first)
  if (start > first + 1) {
    items.push('ellipsis')
  }
  for (let i = start; i <= end; i += 1) {
    items.push(i)
  }
  if (end < last - 1) {
    items.push('ellipsis')
  }
  items.push(last)

  return items
}

export function Pagination({
  page,
  totalPages,
  hasNext,
  previousAnalyticsId,
  nextAnalyticsId,
  className,
  onPageChange,
  compact = false,
  disabled = false,
  mobileCompact = true,
  analyticsId,
}: PaginationProps) {
  const { t } = useTranslation()
  if (page === 0 && (totalPages === undefined ? !hasNext : totalPages <= 1)) return null

  const pageItems = totalPages === undefined ? [] : buildPageItems(Math.max(0, Math.min(page, totalPages - 1)), totalPages)
  const indicator = totalPages === undefined
    ? t('pagination.currentPage', { page: page + 1 })
    : t('pagination.pageIndicator', { page: page + 1, total: totalPages })
  const buttonClass = 'min-h-9 shrink-0 whitespace-nowrap sm:min-h-0'

  return (
    <nav
      aria-label={t('pagination.label')}
      className={cn('flex flex-wrap items-center justify-center gap-2 max-sm:w-full sm:ml-auto sm:justify-end',
        compact ? 'py-2' : 'py-3', className)}
    >
      <Button
        type="button"
        data-analytics-id={previousAnalyticsId ? previousAnalyticsId : analyticsId}
        variant="outline"
        size="sm"
        className={buttonClass}
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 0}
      >
        {t('pagination.prev')}
      </Button>
      <span
        className={cn('px-1 text-xs tabular-nums text-muted-foreground', totalPages !== undefined && (mobileCompact ? 'sm:hidden' : 'hidden'))}
        aria-current="page"
      >
        {indicator}
      </span>
      {totalPages !== undefined && (
        <div className={cn('flex flex-wrap items-center justify-center gap-1', mobileCompact ? 'hidden sm:flex' : 'order-last w-full sm:order-none sm:w-auto')}>
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted-foreground" aria-hidden="true">…</span>
            ) : (
              <Button
                data-analytics-id={analyticsId}
                key={item}
                type="button"
                disabled={disabled}
                variant={item === page ? 'soft' : 'ghost'}
                size="sm"
                className={cn(buttonClass, 'min-w-7 px-1.5 tabular-nums')}
                onClick={() => { if (item !== page) onPageChange(item) }}
                aria-label={t('pagination.goToPage', { page: item + 1 })}
                aria-current={item === page ? 'page' : undefined}
              >
                {item + 1}
              </Button>
            ),
          )}
        </div>
      )}
      <Button
        type="button"
        data-analytics-id={nextAnalyticsId ? nextAnalyticsId : analyticsId}
        variant="outline"
        size="sm"
        className={buttonClass}
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || (totalPages === undefined ? !hasNext : page >= totalPages - 1)}
      >
        {t('pagination.next')}
      </Button>
    </nav>
  )
}
