import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ResourceCard } from '@/features/suite/resource-card'
import { useResourceSearch } from '@/shared/hooks/use-suite-queries'
import { useVisibleLabels } from '@/shared/hooks/use-label-queries'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { Input } from '@/shared/ui/input'
import { Button, buttonVariants } from '@/shared/ui/button'
import { buildReturnTo } from '@/shared/lib/auth-route'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'

const PAGE_SIZE = 12

export function SuitesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const location = useLocation()
  const { q = '', label = '', page = 0 } = useSearch({ from: '/suites' })
  const [input, setInput] = useState({ applied: q, text: q })
  if (input.applied !== q) setInput({ applied: q, text: q })
  const { data: labels, isLoading: isLoadingLabels } = useVisibleLabels()
  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useResourceSearch({
    q: q || undefined,
    resourceType: 'SUITE',
    labels: label ? [label] : undefined,
    sort: 'newest',
    page,
    size: PAGE_SIZE,
  })
  const totalPages = data ? Math.ceil(data.total / data.size) : 0
  const update = (next: { q?: string; label?: string; page?: number }) => {
    void navigate({ to: '/suites', search: { q: q || undefined, label: label || undefined, page: undefined, ...next } })
  }
  const clear = () => {
    setInput({ applied: q, text: '' })
    update({ q: undefined, label: undefined })
  }
  const createLink = (inEmptyState = false) => (
    <Link data-analytics-id="suite.create.open" to="/dashboard/suites/new" className={buttonVariants(inEmptyState ? { variant: 'outline', size: 'sm' } : {})}>{t('suite.create')}</Link>
  )

  return (
    <div className={APP_SHELL_PAGE_CLASS_NAME}>
      <DashboardPageHeader title={t('suite.listTitle')}
        actions={(isLoading || isError || q || label || page > 0 || !!data?.total) ? createLink() : undefined} />

      <form data-analytics-id="suite.query.submit" className="flex max-w-xl gap-2" onSubmit={event => {
        event.preventDefault()
        update({ q: input.text.trim() || undefined })
      }}>
        <Input
          aria-label={t('suite.searchPlaceholder')}
          value={input.text}
          placeholder={t('suite.searchPlaceholder')}
          onChange={event => setInput({ applied: q, text: event.target.value })}
        />
        <Button type="submit" variant="outline">{t('nav.search')}</Button>
      </form>

      <section className="space-y-2" aria-labelledby="suite-label-filter-title">
        <div id="suite-label-filter-title" className="text-sm font-medium text-foreground">
          {t('suite.labelFilterTitle')}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-analytics-id="suite.label.clear"
            type="button"
            size="sm"
            aria-pressed={!label}
            variant={!label ? 'soft' : 'outline'}
            onClick={() => update({ label: undefined })}
          >
            {t('suite.allLabels')}
          </Button>
          {isLoadingLabels ? (
            <span className="px-2 py-1 text-sm text-muted-foreground">{t('suite.loadingLabels')}</span>
          ) : labels?.map(item => (
            <Button data-analytics-id="suite.label.filter"
              key={item.slug}
              type="button"
              size="sm"
              aria-pressed={label === item.slug}
              variant={label === item.slug ? 'soft' : 'outline'}
              onClick={() => update({ label: label === item.slug ? undefined : item.slug })}
            >
              {item.displayName}
            </Button>
          ))}
        </div>
      </section>

      <div aria-busy={isFetching}>
        {isError ? (
          <div role="alert"><EmptyState title={t('suite.catalogLoadFailed')} action={<Button variant="outline" size="sm" onClick={() => void refetch()}>{t('reviewCenter.retry')}</Button>} /></div>
        ) : isLoading || isPlaceholderData ? (
          <SkeletonList count={PAGE_SIZE} />
        ) : data?.items.length ? (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {data.items.map((suite) => (
                <ResourceCard analyticsId="suite.card.open"
                  key={suite.id}
                  resource={suite}
                  onClick={() => navigate({
                    to: `/suite/${suite.namespace}/${encodeURIComponent(suite.slug)}`,
                    search: { returnTo: buildReturnTo(location) },
                  })}
                />
              ))}
            </div>
            <Pagination analyticsId="suite.list.paginate"
              page={page}
              totalPages={totalPages}
              onPageChange={next => update({ page: next || undefined })}
            />
          </>
        ) : (
          page > 0 && totalPages > 0 ? (
            <EmptyState title={t('reviewCenter.pageEmpty')} action={<Button variant="outline" size="sm" onClick={() => update({})}>{t('reviewCenter.firstPage')}</Button>} />
          ) : q || label ? (
            <EmptyState title={t('suite.workspace.noMatches')} action={<Button variant="outline" size="sm" onClick={clear}>{t('list.clearFilters')}</Button>} />
          ) : (
            <EmptyState title={t('suite.emptyTitle')} action={createLink(true)} />
          )
        )}
      </div>
    </div>
  )
}
