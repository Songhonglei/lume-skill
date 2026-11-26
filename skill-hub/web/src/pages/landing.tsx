import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { normalizeSearchQuery } from '@/shared/lib/search-query'
import {
  CheckCircle2,
  GitBranch,
  Lock,
  Monitor,
  PackageOpen,
  Search as SearchIcon,
  LayoutGrid,
  Upload,
  Server,
  Settings,
  Shield,
  Terminal,
  Users,
} from 'lucide-react'
import { LandingQuickStartSection } from '@/shared/components/landing-quick-start'
import { HomepageRecommendations } from '@/features/recommendation/recommendation-preview'
import { SkillCard } from '@/features/skill/skill-card'
import { SkeletonList } from '@/shared/components/skeleton-loader'
import { useSearchSkills } from '@/shared/hooks/use-skill-queries'
import { useInView } from '@/shared/hooks/use-in-view'
import { Button, buttonVariants } from '@/shared/ui/button'
import { useSitePresentation, presentationText } from '@/shared/hooks/use-site-presentation'
import { presentationItemVisible, presentationLinkUrl, presentationNavigationUrl } from '@/shared/lib/presentation-content'
import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'
import { cn } from '@/shared/lib/utils'

function EnterpriseSection() {
  const { t, i18n } = useTranslation()
  const { settings } = useSitePresentation()
  const text = (section: Parameters<typeof presentationText>[1], slot: string) => presentationText(settings, section, slot, i18n.resolvedLanguage, t)

  return (
    <section className="[overflow-wrap:anywhere] w-full py-7 md:py-9">
      <div className={APP_FRAME_CLASS_NAME}>
        <div className="text-center mb-12">
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{text('enterprise', 'title')}</h2>
          <p className="text-muted-foreground">{text('enterprise', 'description')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {presentationItemVisible(settings, 'enterprise', 'deployment') && <div className="md:col-span-2 md:row-span-2 flex flex-col rounded-xl border border-border/70 bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Server className="h-4 w-4" />
              </div>
              <h3 className="font-semibold text-foreground">{text('enterprise', 'deploymentTitle')}</h3>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              {text('enterprise', 'deploymentDescription')}
            </p>
            <div className="flex-1 rounded-lg border border-border/70 bg-secondary/50 p-4">
              <div className="mb-3 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-col gap-1.5 sm:flex-shrink-0">
                  <div className="mb-0.5 text-center text-[10px] text-muted-foreground">{text('enterprise', 'clientLayer')}</div>
                  <div className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">Agent</div>
                  <div className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">CLI</div>
                  <div className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">Web</div>
                </div>
                <div className="flex h-8 items-center justify-center sm:h-auto sm:min-w-0 sm:flex-1">
                  <svg className="h-4 w-16 rotate-90 text-border sm:w-full sm:max-w-16 sm:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 64 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" strokeDasharray="3 3" d="M0 8h54" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M50 4l6 4-6 4" /></svg>
                </div>
                <div className="flex min-w-0 flex-col items-center sm:max-w-[50%]">
                  <div className="mb-0.5 text-center text-[10px] text-muted-foreground">{text('enterprise', 'serviceLayer')}</div>
                  <div className="rounded-lg bg-primary px-3.5 py-3 text-center text-xs font-semibold leading-tight text-primary-foreground">{text('enterprise', 'registryLabel').split('\n').map((line, index) => <span key={index} className="block [overflow-wrap:anywhere]">{line}</span>)}</div>
                </div>
                <div className="flex h-8 items-center justify-center sm:h-auto sm:min-w-0 sm:flex-1">
                  <svg className="h-4 w-16 rotate-90 text-border sm:w-full sm:max-w-16 sm:rotate-0" fill="none" stroke="currentColor" viewBox="0 0 64 16"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" strokeDasharray="3 3" d="M0 8h54" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M50 4l6 4-6 4" /></svg>
                </div>
                <div className="flex flex-col gap-1.5 sm:flex-shrink-0">
                  <div className="mb-0.5 text-center text-[10px] text-muted-foreground">{text('enterprise', 'storageLayer')}</div>
                  <div className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">PostgreSQL</div>
                  <div className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">Redis</div>
                  <div className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">MinIO / S3</div>
                </div>
              </div>
              <div className="border-t border-dashed border-border/70 pt-2.5 text-center text-[10px] text-muted-foreground">{text('enterprise', 'networkBoundary')}</div>
            </div>
          </div>}

          {presentationItemVisible(settings, 'enterprise', 'security') && <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-3">
              <Shield className="h-5 w-5 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{text('enterprise', 'securityTitle')}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{text('enterprise', 'securityDescription')}</p>
          </div>}

          {presentationItemVisible(settings, 'enterprise', 'rbac') && <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-3">
              <Lock className="h-5 w-5 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{text('enterprise', 'rbacTitle')}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{text('enterprise', 'rbacDescription')}</p>
          </div>}

          {presentationItemVisible(settings, 'enterprise', 'access') && <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-3">
              <Settings className="h-5 w-5 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{text('enterprise', 'accessTitle')}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{text('enterprise', 'accessDescription')}</p>
          </div>}

          {presentationItemVisible(settings, 'enterprise', 'audit') && <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-3">
              <Monitor className="h-5 w-5 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{text('enterprise', 'auditTitle')}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{text('enterprise', 'auditDescription')}</p>
          </div>}

          {presentationItemVisible(settings, 'enterprise', 'openSource') && <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-2 flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{text('enterprise', 'openSourceTitle')}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{text('enterprise', 'openSourceDescription')}</p>
          </div>}
        </div>
      </div>
    </section>
  )
}

/**
 * Marketing-style landing page for unauthenticated and first-time visitors.
 *
 * The page mixes static positioning content with live skill queries so popular and latest skills
 * stay aligned with the current registry state.
 */
export function LandingPage() {
  return <LandingIntroduction />
}

function LandingIntroduction() {
  const { t, i18n } = useTranslation()
  const { settings } = useSitePresentation()
  const text = (section: Parameters<typeof presentationText>[1], slot: string) => presentationText(settings, section, slot, i18n.resolvedLanguage, t)
  const commonLinks = settings.commonLinks?.flatMap(link => {
    const href = presentationNavigationUrl(link.url)
    return href && link.title?.trim() ? [{ title: link.title.trim(), href }] : []
  })
  const navigate = useNavigate()

  const { data: popularSkills, isLoading: isLoadingPopular, isError: popularFailed } = useSearchSkills({
    source: 'platform',
    sort: 'downloads',
    size: 6,
  }, settings.sections.popular.enabled)

  const { data: latestSkills, isLoading: isLoadingLatest, isError: latestFailed } = useSearchSkills({
    source: 'platform',
    sort: 'newest',
    size: 6,
  }, settings.sections.latest.enabled)

  const handleSkillClick = (namespace: string, slug: string) => {
    navigate({ to: `/space/${namespace}/${encodeURIComponent(slug)}` })
  }

  const [searchQuery, setSearchQuery] = useState('')
  const featuresView = useInView()
  const quickStartView = useInView()
  const enterpriseView = useInView()
  const popularView = useInView()
  const latestView = useInView()

  const handleSearch = (query: string) => {
    const normalized = normalizeSearchQuery(query)
    navigate({
      to: '/search',
      search: { q: normalized, sort: 'relevance', page: 0, starredOnly: false },
    })
  }

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

  const hasPopular = !!popularSkills?.items.length
  const hasLatest = !!latestSkills?.items.length
  const popularTitle = text('popular', 'title')
  const popularDescription = text('popular', 'description')
  const latestTitle = text('latest', 'title')
  const latestDescription = text('latest', 'description')

  return (
    <>
      {settings.sections.hero.enabled && (
        <section className={`${APP_FRAME_CLASS_NAME} py-6 md:py-8`} aria-labelledby="hub-title">
          <div className="grid gap-6 rounded-xl border border-border border-t-[3px] border-t-primary bg-card p-5 shadow-[var(--shadow-card)] sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <h1 id="hub-title" className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{text('hero', 'title')}</h1>
              {presentationItemVisible(settings, 'hero', 'preview') && (
                <form
                  aria-label={t('nav.marketplace')}
                  className="mt-4 flex max-w-2xl items-center gap-2 rounded-lg border border-border bg-background p-1.5 focus-within:border-ring"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleSearch(searchQuery)
                  }}
                >
                  <SearchIcon aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    data-analytics-id="discovery.query.enter"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={text('hero', 'searchPlaceholder')}
                    aria-label={text('hero', 'searchPlaceholder')}
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <Button className="shrink-0" type="submit">{t('nav.search')}</Button>
                </form>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {presentationItemVisible(settings, 'hero', 'secondaryAction') && (
                <Link
                  data-analytics-id="navigation.skills.open"
                  to="/search"
                  search={{ q: '', sort: 'relevance', page: 0, starredOnly: false }}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <LayoutGrid aria-hidden="true" className="h-4 w-4" />{text('hero', 'secondaryActionLabel')}
                </Link>
              )}
              {presentationItemVisible(settings, 'hero', 'primaryAction') && (
                <Link data-analytics-id="skill.publish.open" to="/dashboard/publish" className={buttonVariants({ variant: 'soft' })}>
                  <Upload aria-hidden="true" className="h-4 w-4" />{text('hero', 'primaryActionLabel')}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {settings.sections.curated?.enabled !== false && <HomepageRecommendations />}

      {settings.sections.popular.enabled && (hasPopular || isLoadingPopular || popularFailed) && <section ref={popularView.ref} className={`[overflow-wrap:anywhere] relative z-10 w-full py-4 scroll-fade-up${popularView.inView ? ' in-view' : ''} md:py-5`}>
        <div className={`${APP_FRAME_CLASS_NAME} space-y-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground">{popularTitle}</h2>
              {popularDescription && <p className="text-sm text-muted-foreground">{popularDescription}</p>}
            </div>
            <Button data-analytics-id="discovery.popular.open"
              variant="ghost"
              className="h-auto min-h-8 whitespace-normal"
              onClick={() => navigate({ to: '/search', search: { q: '', sort: 'downloads', page: 0, starredOnly: false } })}
            >
              {text('popular', 'viewAllLabel')}
            </Button>
          </div>
          {isLoadingPopular ? (
            <SkeletonList count={6} />
          ) : (
            !popularSkills?.items.length ? (
              <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                {t('search.source.loadFailed')}
              </p>
            ) :
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {popularSkills?.items.map((skill, idx) => (
                <div key={skill.id} className={`animate-fade-up delay-${Math.min(idx + 1, 6)}`}>
                  <SkillCard analyticsId="skill.card.open" skill={skill} onClick={() => handleSkillClick(skill.namespace, skill.slug)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>}

      {settings.sections.latest.enabled && (hasLatest || isLoadingLatest || latestFailed) && <section ref={latestView.ref} className={`[overflow-wrap:anywhere] relative z-10 w-full py-4 scroll-fade-up${latestView.inView ? ' in-view' : ''} md:py-5`}>
        <div className={`${APP_FRAME_CLASS_NAME} space-y-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground">{latestTitle}</h2>
              {latestDescription && <p className="text-sm text-muted-foreground">{latestDescription}</p>}
            </div>
            <Button data-analytics-id="discovery.latest.open"
              variant="ghost"
              className="h-auto min-h-8 whitespace-normal"
              onClick={() => navigate({ to: '/search', search: { q: '', sort: 'newest', page: 0, starredOnly: false } })}
            >
              {text('latest', 'viewAllLabel')}
            </Button>
          </div>
          {isLoadingLatest ? (
            <SkeletonList count={6} />
          ) : (
            !latestSkills?.items.length ? (
              <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                {t('search.source.loadFailed')}
              </p>
            ) :
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {latestSkills?.items.map((skill, idx) => (
                <div key={skill.id} className={`animate-fade-up delay-${Math.min(idx + 1, 6)}`}>
                  <SkillCard analyticsId="skill.card.open" skill={skill} onClick={() => handleSkillClick(skill.namespace, skill.slug)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>}

      {settings.sections.capabilities.enabled && visibleFeatures.length > 0 && <section ref={featuresView.ref} className={`[overflow-wrap:anywhere] relative z-10 w-full py-7 scroll-fade-up${featuresView.inView ? ' in-view' : ''} md:py-9`}>
        <div className={APP_FRAME_CLASS_NAME}>
          <div className="mb-5 max-w-3xl">
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
              {text('capabilities', 'title')}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {text('capabilities', 'description')}
            </p>
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

      {settings.sections.quickStart.enabled && <div ref={quickStartView.ref} className={`scroll-fade-up${quickStartView.inView ? ' in-view' : ''}`}>
        <LandingQuickStartSection />
      </div>}

      {settings.sections.enterprise.enabled && <div ref={enterpriseView.ref} className={`scroll-fade-up${enterpriseView.inView ? ' in-view' : ''}`}>
        <EnterpriseSection />
      </div>}

      {settings.sections.cta.enabled && commonLinks === undefined && <section className="[overflow-wrap:anywhere] relative z-10 w-full border-t border-border/70 py-7 text-center md:py-9">
        <div className={APP_FRAME_CLASS_NAME}>
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">{text('cta', 'title')}</h2>
          <p className="mb-8 text-muted-foreground">{text('cta', 'description')}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {presentationItemVisible(settings, 'cta', 'primaryAction') && <a data-analytics-id="navigation.repository.open" href={presentationLinkUrl(settings, 'repository')} target="_blank" rel="noreferrer" className={buttonVariants()}>
              {text('cta', 'primaryActionLabel')}
            </a>}
            {presentationItemVisible(settings, 'cta', 'secondaryAction') && <a data-analytics-id="navigation.documentation.open" href={presentationLinkUrl(settings, 'documentation')} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}>
              {text('cta', 'secondaryActionLabel')} <CheckCircle2 className="h-4 w-4" />
            </a>}
          </div>
        </div>
      </section>}
      {settings.sections.cta.enabled && !!commonLinks?.length && <section aria-labelledby="home-common-links" className="relative z-10 w-full border-t border-border/70 py-7 md:py-9">
        <div className={APP_FRAME_CLASS_NAME}>
          <h2 id="home-common-links" className="mb-4 text-xl font-semibold tracking-tight">{t('sitePresentation.commonLinksTitle')}</h2>
          <ul className="flex flex-wrap gap-3">
            {commonLinks.map(({ title, href }, index) => <li key={index} className="min-w-0 max-w-full">
              <a href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-auto min-h-[var(--control-height)] max-w-full whitespace-normal py-2 text-left [overflow-wrap:anywhere]')}>{title}</a>
            </li>)}
          </ul>
        </div>
      </section>}
    </>
  )
}
