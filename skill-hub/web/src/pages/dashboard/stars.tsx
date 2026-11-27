import { Link, useLocation, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { SkillCard } from '@/features/skill/skill-card'
import { Pagination } from '@/shared/components/pagination'
import { useMyStarsPage } from '@/shared/hooks/use-user-queries'
import { EmptyState } from '@/shared/components/empty-state'
import { Button, buttonVariants } from '@/shared/ui/button'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { getSkillSquareSearch } from '@/shared/lib/skill-navigation'
import { buildReturnTo } from '@/shared/lib/auth-route'

const PAGE_SIZE = 12

export function MyStarsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const search = useSearch({ from: '/dashboard/stars' })
  const page = search.page ?? 0
  const { data, isLoading, isError, refetch } = useMyStarsPage({ page, size: PAGE_SIZE })
  const skills = data?.items ?? []
  const totalPages = data ? Math.max(Math.ceil(data.total / data.size), 1) : 1

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-up">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-shimmer rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <DashboardPageHeader title={t('stars.title')} />

      {isError ? (
        <div role="alert"><EmptyState title={t('list.loadFailed')} action={<Button variant="outline" size="sm" onClick={() => void refetch()}>{t('reviewCenter.retry')}</Button>} /></div>
      ) : skills.length === 0 ? (
        <EmptyState title={t('stars.empty')} action={page > 0 && totalPages > 0
          ? <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/dashboard/stars', search: { page: undefined } })}>{t('reviewCenter.firstPage')}</Button>
          : <Link to="/search" search={getSkillSquareSearch()} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('home.browseSkills')}</Link>} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {skills.map((skill) => (
              <SkillCard analyticsId="skill.card.open"
                key={skill.id}
                skill={skill}
                onClick={() => navigate({
                  to: `/space/${skill.namespace}/${encodeURIComponent(skill.slug)}`,
                  search: { returnTo: buildReturnTo(location) },
                })}
              />
            ))}
          </div>
          {data && data.total > PAGE_SIZE ? (
            <Pagination analyticsId="skill.starred.paginate"
              page={page}
              totalPages={totalPages}
              onPageChange={(nextPage) => navigate({
                to: '/dashboard/stars',
                search: { page: nextPage > 0 ? nextPage : undefined },
              })}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
