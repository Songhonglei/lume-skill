import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Clock, Flame, GitBranch, LayoutGrid, PackageOpen, Search as SearchIcon, Settings, Shield, Terminal, Upload, Users } from 'lucide-react'
import { normalizeSearchQuery } from '@/shared/lib/search-query'
import { HomepageRecommendations } from '@/features/recommendation/recommendation-preview'
import { SkillCard } from '@/features/skill/skill-card'
import { useSearchSkills } from '@/shared/hooks/use-skill-queries'
import { Button, buttonVariants } from '@/shared/ui/button'
import { presentationCommonLinks, presentationText, useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { presentationItemVisible, presentationNavigationUrl } from '@/shared/lib/presentation-content'
import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'
import { PRODUCT_NAME } from '@/shared/lib/product-brand'

function LandingSkillSection({ section }: { section: 'popular' | 'latest' }) {
  const { t, i18n } = useTranslation()
  const { settings } = useSitePresentation()
  const navigate = useNavigate()
  const isPopular = section === 'popular'
  const sort = isPopular ? 'downloads' : 'newest'
  const enabled = settings.sections[section].enabled
  const { data, isLoading, isError } = useSearchSkills({ source: 'all', sort, size: 6 }, enabled)
  const items = data?.items ?? []
  if (!enabled || (!items.length && !isLoading && !isError)) return null

  const Icon = isPopular ? Flame : Clock
  const title = presentationText(settings, section, 'title', i18n.resolvedLanguage, t)
  const viewAllLabel = presentationText(settings, section, 'viewAllLabel', i18n.resolvedLanguage, t)
  return (
    <section aria-labelledby={`landing-${section}`} className="min-w-0 space-y-3 rounded-xl border border-border bg-card/40 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`landing-${section}`} className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          {title}
        </h2>
        <Link data-analytics-id={isPopular ? 'discovery.popular.open' : 'discovery.latest.open'}
          to="/search"
          search={{ q: '', sort, page: 0, starredOnly: false }}
          className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-auto min-h-8 whitespace-normal' })}
        >
          {viewAllLabel}
        </Link>
      </header>
      {isLoading ? (
        <div role="status" className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="h-28 animate-shimmer rounded-lg border border-border bg-card" />)}
        </div>
      ) : items.length ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {items.map(skill => <SkillCard key={skill.id} analyticsId="skill.card.open" variant="compact" skill={skill}
            onClick={() => navigate({ to: `/space/${skill.namespace}/${encodeURIComponent(skill.slug)}` })} />)}
        </div>
      ) : (
        <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t('search.source.loadFailed')}
        </p>
      )}
    </section>
  )
}

const heroActionClass = buttonVariants({ variant: 'outline', size: 'icon', className: 'h-10 w-10' })
const heroTooltipClass = 'invisible pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-44 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-center text-xs text-background shadow-sm group-hover:visible group-focus-within:visible max-sm:left-auto max-sm:right-0 max-sm:translate-x-0'

export function LandingPage() {
  const { t, i18n } = useTranslation()
  const { settings } = useSitePresentation()
  const text = (section: Parameters<typeof presentationText>[1], slot: string) => presentationText(settings, section, slot, i18n.resolvedLanguage, t)
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const commonLinks = presentationCommonLinks(settings, i18n.resolvedLanguage, t).flatMap(link => {
    const href = presentationNavigationUrl(link.url)
    return href && link.title?.trim() ? [{ title: link.title.trim(), href }] : []
  })
  const browseLabel = text('hero', 'secondaryActionLabel')
  const publishLabel = text('hero', 'primaryActionLabel')

  const features = [
    {
      icon: <Shield className="h-5 w-5" strokeWidth={1.75} />,
      id: 'secure',
      title: text('capabilities', 'secureTitle'),
      description: text('capabilities', 'secureDescription'),
    },
    {
      icon: <Users className="h-5 w-5" strokeWidth={1.75} />,
      id: 'community',
      title: text('capabilities', 'communityTitle'),
      description: text('capabilities', 'communityDescription'),
    },
    {
      icon: <PackageOpen className="h-5 w-5" strokeWidth={1.75} />,
      id: 'integration',
      title: text('capabilities', 'integrationTitle'),
      description: text('capabilities', 'integrationDescription'),
    },
    {
      icon: <GitBranch className="h-5 w-5" strokeWidth={1.75} />,
      id: 'versionControl',
      title: text('capabilities', 'versionControlTitle'),
      description: text('capabilities', 'versionControlDescription'),
    },
    {
      icon: <Terminal className="h-5 w-5" strokeWidth={1.75} />,
      id: 'cli',
      title: text('capabilities', 'cliTitle'),
      description: text('capabilities', 'cliDescription'),
    },
    {
      icon: <Settings className="h-5 w-5" strokeWidth={1.75} />,
      id: 'governance',
      title: text('capabilities', 'governanceTitle'),
      description: text('capabilities', 'governanceDescription'),
    },
  ]

  const visibleFeatures = features.filter(feature => presentationItemVisible(settings, 'capabilities', feature.id))
  const featureColumns = visibleFeatures.length === 1
    ? 'md:grid-cols-1 lg:grid-cols-1'
    : [2, 4].includes(visibleFeatures.length) ? 'md:grid-cols-2 lg:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="flex min-h-[calc(100svh-var(--app-header-height,65px))] flex-col">
      {settings.sections.hero.enabled && (
        <section aria-labelledby="hub-title" className="border-b border-border bg-card bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/.07),transparent_72%)]">
          <div className={`${APP_FRAME_CLASS_NAME} flex flex-col items-center gap-4 py-9 text-center sm:gap-5 sm:py-11`}>
            <h1 id="hub-title" className="max-w-3xl text-balance text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
              {text('hero', 'title')}
            </h1>
            <div className="flex w-full max-w-[48rem] items-center justify-center gap-2 empty:hidden sm:gap-3">
              {presentationItemVisible(settings, 'hero', 'preview') && (
                <form
                  aria-label={t('nav.marketplace')}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background p-1.5 text-left shadow-sm transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15 sm:gap-3"
                  onSubmit={event => {
                    event.preventDefault()
                    navigate({ to: '/search', search: { q: normalizeSearchQuery(searchQuery), sort: 'relevance', page: 0, starredOnly: false } })
                  }}
                >
                  <SearchIcon aria-hidden="true" className="ml-2 size-[18px] shrink-0 text-muted-foreground max-[359px]:hidden" />
                  <input
                    data-analytics-id="discovery.query.enter"
                    type="search"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder={text('hero', 'searchPlaceholder')}
                    aria-label={text('hero', 'searchPlaceholder')}
                    className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground max-[359px]:pl-2"
                  />
                  <Button className="shrink-0" size="lg" type="submit" aria-label={t('nav.search')}>
                    <SearchIcon aria-hidden="true" className="size-4 min-[360px]:hidden" />
                    <span className="max-[359px]:hidden">{t('nav.search')}</span>
                  </Button>
                </form>
              )}
              <div className="flex shrink-0 gap-1.5 empty:hidden sm:gap-2">
                {presentationItemVisible(settings, 'hero', 'secondaryAction') && (
                  <span className="group relative">
                    <Link data-analytics-id="navigation.skills.open" aria-label={browseLabel}
                      to="/search" search={{ q: '', sort: 'relevance', page: 0, starredOnly: false }} className={heroActionClass}>
                      <LayoutGrid aria-hidden="true" className="size-[18px]" />
                    </Link>
                    <span aria-hidden="true" className={heroTooltipClass}>{browseLabel}</span>
                  </span>
                )}
                {presentationItemVisible(settings, 'hero', 'primaryAction') && (
                  <span className="group relative">
                    <Link data-analytics-id="skill.publish.open" aria-label={publishLabel} to="/dashboard/publish" className={heroActionClass}>
                      <Upload aria-hidden="true" className="size-[18px]" />
                    </Link>
                    <span aria-hidden="true" className={heroTooltipClass}>{publishLabel}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className={`${APP_FRAME_CLASS_NAME} grid gap-4 py-6 empty:hidden lg:grid-cols-2 lg:[&>section:only-child]:col-span-2`}>
        <LandingSkillSection section="popular" />
        <LandingSkillSection section="latest" />
      </div>

      {settings.sections.curated?.enabled !== false && <HomepageRecommendations />}

      {settings.sections.capabilities.enabled && visibleFeatures.length > 0 && <section className="w-full py-7 [overflow-wrap:anywhere]">
        <div className={APP_FRAME_CLASS_NAME}>
          <div className="mb-5 max-w-3xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {text('capabilities', 'title')}
            </h2>
          </div>

          {visibleFeatures.length > 0 && <div className={`grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-border gap-px ${featureColumns}`}>
            {visibleFeatures.map((feature, index) => (
              <div key={feature.id} className={`bg-card p-5 transition-colors hover:bg-secondary/50${index === visibleFeatures.length - 1 && visibleFeatures.length === 3 ? ' md:col-span-2 lg:col-span-1' : index === visibleFeatures.length - 1 && visibleFeatures.length === 5 ? ' md:col-span-2 lg:col-span-2' : ''}`}>
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>}
        </div>
      </section>}

      {settings.sections.footer?.enabled !== false && <footer role="contentinfo" className="mt-auto border-t border-border py-5 text-sm text-muted-foreground">
        <div className={`${APP_FRAME_CLASS_NAME} flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3`}>
          <p className="min-w-0 max-w-full [overflow-wrap:anywhere]">© {new Date().getFullYear()} {settings.siteName ?? PRODUCT_NAME}</p>
          {settings.sections.cta.enabled && commonLinks.length > 0 && (
            <ul aria-label={t('sitePresentation.commonLinksTitle')} className="flex min-w-0 flex-wrap gap-x-5 gap-y-2">
              {commonLinks.map(({ title, href }, index) => (
                <li key={index} className="min-w-0">
                  <a href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noreferrer"
                    className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [overflow-wrap:anywhere]">
                    {title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </footer>}
    </div>
  )
}
