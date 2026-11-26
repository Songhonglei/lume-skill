import { PRODUCT_NAME } from '@/shared/lib/product-brand'
import { useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { SearchBar } from '@/features/search/search-bar'
import { SkillCard } from '@/features/skill/skill-card'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { QuickStartSection } from '@/shared/components/quick-start'
import { useSearchSkills } from '@/shared/hooks/use-skill-queries'
import { normalizeSearchQuery } from '@/shared/lib/search-query'
import { BrandMark } from '@/shared/components/brand-mark'
import { Button } from '@/shared/ui/button'

export function HomePage() {
  const { settings } = useSitePresentation()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: popularSkills, isLoading: isLoadingPopular } = useSearchSkills({
    source: 'all',
    sort: 'downloads',
    size: 6,
  })

  const { data: latestSkills, isLoading: isLoadingLatest } = useSearchSkills({
    source: 'all',
    sort: 'newest',
    size: 6,
  })

  const handleSearch = (query: string) => {
    navigate({ to: '/search', search: { q: normalizeSearchQuery(query), sort: 'relevance', page: 0, starredOnly: false } })
  }

  const handleSkillClick = (namespace: string, slug: string) => {
    navigate({ to: `/space/${namespace}/${encodeURIComponent(slug)}` })
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="rounded-xl border border-border border-t-[3px] border-t-primary bg-card p-5 sm:p-7 space-y-4 animate-fade-up">
        <div className="flex items-center gap-3">
          <BrandMark className="size-8 shrink-0" />
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl" style={{ color: 'hsl(var(--foreground))' }}>
            {settings.siteName ?? PRODUCT_NAME}
          </h1>
        </div>

        <div className="max-w-xl">
          <SearchBar analyticsId="search.query.submit" onSearch={handleSearch} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button data-analytics-id="navigation.skills.open" variant="outline"
            onClick={() => navigate({ to: '/search', search: { q: '', sort: 'relevance', page: 0, starredOnly: false } })}
          >
            {t('home.browseSkills')}
          </Button>
          <Button data-analytics-id="skill.publish.open" variant="soft"
            onClick={() => navigate({ to: '/dashboard/publish' })}
          >
            {t('home.publishSkill')}
          </Button>
        </div>
      </div>

      {/* Popular Downloads Section */}
      {(isLoadingPopular || !!popularSkills?.items.length) && <section className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'hsl(var(--foreground))' }}>
              {t('home.popularTitle')}
            </h2>
          </div>
          <Button data-analytics-id="discovery.popular.open"
            variant="ghost"
            onClick={() => navigate({ to: '/search', search: { q: '', sort: 'downloads', page: 0, starredOnly: false } })}
          >
            {t('home.viewAll')}
          </Button>
        </div>
        {isLoadingPopular ? (
          <SkeletonList count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {popularSkills?.items.map((skill, idx) => (
              <div key={skill.id} className={`animate-fade-up delay-${Math.min(idx + 1, 6)}`}>
                <SkillCard analyticsId="skill.card.open"
                  skill={skill}
                  onClick={() => handleSkillClick(skill.namespace, skill.slug)}
                />
              </div>
            ))}
          </div>
        )}
      </section>}

      {/* Latest Releases Section */}
      {(isLoadingLatest || !!latestSkills?.items.length) && <section className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'hsl(var(--foreground))' }}>
              {t('home.latestTitle')}
            </h2>
          </div>
          <Button data-analytics-id="discovery.latest.open"
            variant="ghost"
            onClick={() => navigate({ to: '/search', search: { q: '', sort: 'newest', page: 0, starredOnly: false } })}
          >
            {t('home.viewAll')}
          </Button>
        </div>
        {isLoadingLatest ? (
          <SkeletonList count={6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {latestSkills?.items.map((skill, idx) => (
              <div key={skill.id} className={`animate-fade-up delay-${Math.min(idx + 1, 6)}`}>
                <SkillCard analyticsId="skill.card.open"
                  skill={skill}
                  onClick={() => handleSkillClick(skill.namespace, skill.slug)}
                />
              </div>
            ))}
          </div>
        )}
      </section>}

      {/* Quick Start Section */}
      <QuickStartSection ns="home" />
    </div>
  )
}
