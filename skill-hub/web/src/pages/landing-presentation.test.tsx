vi.mock('@/features/recommendation/recommendation-preview', () => ({ HomepageRecommendations: () => <div>published-curated-content</div> }))
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { SitePresentationSettings } from '@/api/site-presentation'
import { defaultSitePresentation } from '@/shared/hooks/use-site-presentation'
import { PRESENTATION_CONTENT, PRESENTATION_ITEMS } from '@/shared/lib/presentation-content'
import { LandingPage } from './landing'
import { HomePage } from './home'

const state = vi.hoisted((): { settings: SitePresentationSettings | null; hasSkills: boolean; search: (params: unknown, enabled: boolean) => void } => ({ settings: null, hasSkills: false, search: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn(), Link: ({ to, search: _search, ...props }: React.ComponentProps<'a'> & { to: string; search?: unknown }) => <a href={to} {...props} /> }))
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'zh' } }) }))
vi.mock('@/shared/hooks/use-site-presentation', async (original) => ({ ...await original<typeof import('@/shared/hooks/use-site-presentation')>(), useSitePresentation: () => ({ settings: state.settings ?? defaultSitePresentation() }) }))
vi.mock('@/shared/hooks/use-skill-queries', () => ({ useSearchSkills: (params: unknown, enabled = true) => { state.search(params, enabled); return { data: { items: state.hasSkills ? [{ id: 1, namespace: 'team', slug: 'example' }] : [] }, isLoading: false } } }))
vi.mock('@/shared/hooks/use-in-view', () => ({ useInView: () => ({ ref: null, inView: true }) }))
vi.mock('@/features/search/search-bar', () => ({ SearchBar: () => <input aria-label="market-search" /> }))
vi.mock('@/shared/components/brand-mark', () => ({ BrandMark: () => <div /> }))
vi.mock('@/shared/components/landing-quick-start', () => ({ LandingQuickStartSection: () => <div>landing-quick-start</div> }))
vi.mock('@/shared/components/quick-start', () => ({ QuickStartSection: () => <div>market-quick-start</div> }))
vi.mock('@/features/skill/skill-card', () => ({ SkillCard: () => <div /> }))
afterEach(() => { cleanup(); vi.clearAllMocks(); state.settings = null; state.hasSkills = false })

describe('configurable original homepage and market boundary', () => {
  it('shows the introduction and populated live sections by default', () => {
    state.hasSkills = true
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('landing.experience.heroTitle')
    expect(screen.queryByText('landing-quick-start')).toBeNull()
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain(`© ${new Date().getFullYear()}`)
    expect(within(footer).queryByRole('link')).toBeNull()
    expect(screen.getByText('home.popularTitle')).toBeTruthy()
    expect(screen.getByText('home.latestTitle')).toBeTruthy()
    expect(state.search).toHaveBeenCalledWith({ sort: 'downloads', size: 6, source: 'all' }, true)
  })
  it.each([
    [0, '', '', ''],
    [1, 'md:grid-cols-1', 'lg:grid-cols-1', ''],
    [2, 'md:grid-cols-2', 'lg:grid-cols-2', ''],
    [3, 'md:grid-cols-2', 'lg:grid-cols-3', 'lg:col-span-1'],
    [4, 'md:grid-cols-2', 'lg:grid-cols-2', ''],
    [5, 'md:grid-cols-2', 'lg:grid-cols-3', 'lg:col-span-2'],
    [6, 'md:grid-cols-2', 'lg:grid-cols-3', ''],
  ] as const)('fills the capability grid without vacant cells when %i cards are visible', (count, mediumColumns, largeColumns, lastSpan) => {
    state.settings = defaultSitePresentation()
    state.settings.sections.capabilities.items = Object.fromEntries(PRESENTATION_ITEMS.capabilities.map((item, index) => [item, index < count]))
    render(<LandingPage />)
    const section = screen.queryByText('landing.experience.capabilities.title')?.closest('section')
    if (count === 0) {
      expect(section).toBeUndefined()
      return
    }
    const grid = section?.querySelector('.grid')
    expect(grid?.children).toHaveLength(count)
    expect(grid?.classList.contains(mediumColumns)).toBe(true)
    expect(grid?.classList.contains(largeColumns)).toBe(true)
    const last = grid?.lastElementChild
    expect(last?.classList.contains('md:col-span-2')).toBe(count === 3 || count === 5)
    if (lastSpan) expect(last?.classList.contains(lastSpan)).toBe(true)
    if (count === 6) expect(grid?.classList.contains('gap-px')).toBe(true)
  })
  it('uses a real search field without demo records', () => {
    render(<LandingPage />)
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(screen.queryByText('landing.experience.demoSkills.caption')).toBeNull()
  })
  it('renders custom text safely and disables hidden sections and requests', () => {
    const settings = defaultSitePresentation()
    settings.sections.hero.texts = { title: { zh: '<b>团队技能</b>' }, description: { en: 'Fallback description' } }
    for (const id of ['popular', 'latest', 'quickStart'] as const) settings.sections[id].enabled = false
    state.settings = settings
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('<b>团队技能</b>')
    expect(screen.queryByText('Fallback description')).toBeNull()
    expect(document.querySelector('h1 b')).toBeNull()
    expect(screen.queryByText('landing-quick-start')).toBeNull()
    expect(screen.queryByText('home.popularTitle')).toBeNull()
    expect(screen.queryByText('home.latestTitle')).toBeNull()
    expect(state.search).toHaveBeenCalledWith({ sort: 'downloads', size: 6, source: 'all' }, false)
    expect(state.search).toHaveBeenCalledWith({ sort: 'newest', size: 6, source: 'all' }, false)
  })
  it('defaults legacy missing picks to visible and respects explicit hidden picks', () => {
    state.settings = defaultSitePresentation()
    delete state.settings.sections.curated
    const view = render(<LandingPage />)
    expect(screen.getByText('published-curated-content')).toBeTruthy()
    view.unmount()
    state.settings.sections.curated = { enabled: false, texts: {}, items: {} }
    render(<LandingPage />)
    expect(screen.queryByText('published-curated-content')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })
  it('can hide every homepage section without changing the skills marketplace', () => {
    state.hasSkills = true
    state.settings = defaultSitePresentation()
    state.settings.siteName = 'Team Library'
    Object.values(state.settings.sections).forEach(section => { section.enabled = false })
    const landing = render(<LandingPage />)
    expect(screen.queryByRole('heading')).toBeNull()
    landing.unmount()
    render(<HomePage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Team Library')
    expect(screen.getByText('home.popularTitle')).toBeTruthy()
    expect(screen.getByText('home.latestTitle')).toBeTruthy()
    expect(screen.getByText('market-quick-start')).toBeTruthy()
    expect(state.search).toHaveBeenLastCalledWith({ sort: 'newest', size: 6, source: 'all' }, true)
  })
  it('honors visible copy, icon actions, and customized footer links', () => {
    state.hasSkills = true
    const settings = defaultSitePresentation()
    const visibleSlots = {
      hero: ['title', 'searchPlaceholder', 'primaryActionLabel', 'secondaryActionLabel'],
      capabilities: ['title', 'secureTitle'],
      popular: ['title', 'viewAllLabel'],
      latest: ['title', 'viewAllLabel'],
    } as const
    for (const section of ['hero', 'capabilities', 'popular', 'latest', 'enterprise', 'cta'] as const) {
      for (const slot of Object.keys(PRESENTATION_CONTENT[section])) settings.sections[section].texts[slot] = { zh: `${section}-${slot}` }
    }
    settings.links = { repository: 'https://team.example/source', documentation: 'https://team.example/docs' }
    state.settings = settings
    const { container } = render(<LandingPage />)
    expect(screen.getByRole('searchbox').getAttribute('placeholder')).toBe('hero-searchPlaceholder')
    expect(screen.getByRole('link', { name: 'hero-primaryActionLabel' }).querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'hero-secondaryActionLabel' }).querySelector('svg')).toBeTruthy()
    for (const [section, slots] of Object.entries(visibleSlots)) {
      for (const slot of slots) {
        if (slot !== 'searchPlaceholder') expect(container.textContent).toContain(`${section}-${slot}`)
      }
    }
    for (const copy of ['capabilities-description', 'enterprise-title', 'cta-title']) {
      expect(screen.queryByText(copy)).toBeNull()
    }
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'cta-primaryActionLabel' }).getAttribute('href')).toBe('https://team.example/source')
    expect(within(footer).getByRole('link', { name: 'cta-secondaryActionLabel' }).getAttribute('href')).toBe('https://team.example/docs')

    cleanup()
    settings.commonLinks = [{ title: 'Team handbook', url: '/guide' }]
    settings.sections.hero.items = { preview: false, primaryAction: false, secondaryAction: false }
    render(<LandingPage />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('link', { name: 'hero-primaryActionLabel' })).toBeNull()
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Team handbook' }).getAttribute('href')).toBe('/guide')
  })
})
