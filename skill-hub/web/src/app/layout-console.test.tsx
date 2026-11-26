/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SitePresentationSettings } from '@/api/site-presentation'
import { defaultSitePresentation } from '@/shared/hooks/use-site-presentation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let presentationSettings: SitePresentationSettings | undefined
let pathname = '/dashboard'
let resolvedPathname = '/dashboard'
let roles: string[] = []
let canChangePassword = false
let namespaceRole: 'OWNER' | 'ADMIN' | 'MEMBER' | undefined

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="outlet">page-content</div>,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
  useRouterState: () => ({ pathname, resolvedPathname }),
}))
vi.mock('react-i18next', async () => ({
  ...await vi.importActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', resolvedLanguage: 'en' } }),
}))
vi.mock('@/shared/hooks/use-site-presentation', async (original) => {
  const actual = await original<typeof import('@/shared/hooks/use-site-presentation')>()
  return { ...actual, useSitePresentation: () => ({ settings: presentationSettings ?? actual.defaultSitePresentation() }) }
})
vi.mock('@/shared/hooks/use-namespace-queries', () => ({ useMyNamespaces: () => ({ data: namespaceRole ? [{ type: 'TEAM', currentUserRole: namespaceRole, status: 'ACTIVE', slug: 'design' }] : [] }) }))
vi.mock('@/features/auth/use-auth', () => ({ useAuth: () => ({ user: { userId: 'test-reader', displayName: 'Reader', platformRoles: roles, canChangePassword }, isLoading: false }) }))
vi.mock('@/shared/components/language-switcher', () => ({ LanguageSwitcher: () => null }))
vi.mock('@/shared/components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/shared/components/user-menu', () => ({ UserMenu: () => null }))
vi.mock('@/features/notification/notification-bell', () => ({ NotificationBell: () => null }))

import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'
import { Layout } from './layout'

beforeEach(() => { presentationSettings = undefined; pathname = '/dashboard'; resolvedPathname = pathname; roles = []; canChangePassword = false; namespaceRole = undefined })
afterEach(cleanup)

describe('shared console layout composition', () => {
  it('omits the public footer even for a previously configured site', () => {
    presentationSettings = defaultSitePresentation()
    presentationSettings.sections.footer.enabled = true
    presentationSettings.sections.footer.texts.description = { en: 'Previous footer' }
    render(<Layout />)
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(screen.queryByText('Previous footer')).toBeNull()
  })

  it.each(['/dashboard', '/dashboard/skills', '/dashboard/tokens', '/settings/profile'])('renders exactly one sidebar beside the content on %s', (path) => {
    pathname = path
    resolvedPathname = path
    render(<Layout />)
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    expect(within(screen.getByRole('complementary')).queryByTestId('outlet')).toBeNull()
    expect(screen.getByRole('main').contains(screen.getByTestId('outlet'))).toBe(true)
  })

  it.each(['/dashboard/publish', '/search', '/login', '/space/team/skill'])('does not add console navigation to %s', (path) => {
    pathname = path
    resolvedPathname = path
    render(<Layout />)
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it.each(['/search', '/github', '/suites', '/settings/profile', '/dashboard/reviews/42', '/dashboard/publish'])('aligns the header and main frame on %s', (path) => {
    pathname = path
    resolvedPathname = path
    render(<Layout />)
    for (const frame of [
      screen.getByRole('banner').firstElementChild,
      screen.getByRole('main').firstElementChild,
    ]) {
      for (const token of APP_FRAME_CLASS_NAME.split(' ')) {
        expect(frame?.classList.contains(token)).toBe(true)
      }
    }
    expect(screen.getByRole('banner').classList.contains('max-w-[1600px]')).toBe(false)
  })

  it('keeps global navigation collapsible on intermediate screens without changing the console breakpoint', () => {
    render(<Layout />)
    const header = screen.getByRole('banner')
    const desktopNavigation = within(header).getByRole('navigation')
    const toggle = within(header).getByRole('button', { name: 'layout.openNavigation' })
    expect(desktopNavigation.classList.contains('xl:flex')).toBe(true)
    expect(desktopNavigation.classList.contains('lg:flex')).toBe(false)
    expect(toggle.classList.contains('xl:hidden')).toBe(true)
    fireEvent.click(toggle)
    const expandedNavigation = screen.getAllByRole('navigation')
      .find(navigation => navigation.parentElement?.classList.contains('sticky'))
    expect(expandedNavigation?.parentElement?.classList.contains('xl:hidden')).toBe(true)
    expect(screen.getByRole('complementary').classList.contains('lg:w-56')).toBe(true)
  })

  it('preserves mobile navigation and frames the expanded menu consistently', () => {
    render(<Layout />)
    const toggle = screen.getByRole('button', { name: 'layout.openNavigation' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const mobileLink = screen.getAllByRole('link', { name: 'nav.marketplace' })
      .find(link => link.parentElement?.classList.contains('flex-col'))
    expect(mobileLink).toBeTruthy()
    for (const token of APP_FRAME_CLASS_NAME.split(' ')) {
      expect(mobileLink?.parentElement?.classList.contains(token)).toBe(true)
    }
    // Routing is mocked here; exercise the menu callback without jsdom document navigation.
    mobileLink!.addEventListener('click', event => event.preventDefault(), { once: true })
    fireEvent.click(mobileLink!)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps personal, administrative and workspace navigation separate', () => {
    roles = ['SUPER_ADMIN']
    const view = render(<Layout />)
    const sidebar = () => within(screen.getByRole('complementary'))
    expect(sidebar().getByText('sidebar.mySkills')).toBeTruthy()
    expect(sidebar().queryByText('sidebar.security')).toBeNull()
    expect(sidebar().queryByText('sidebar.governance')).toBeNull()
    expect(within(screen.getByRole('banner')).queryByText('nav.githubSkills')).toBeNull()

    resolvedPathname = pathname = '/settings/profile'
    view.rerender(<Layout />)
    expect(sidebar().getByRole('link', { name: 'sidebar.profile' })).toBeTruthy()
    expect(sidebar().getByText('sidebar.tokens')).toBeTruthy()
    expect(sidebar().queryByText('sidebar.security')).toBeNull()
    expect(sidebar().queryByText('sidebar.governance')).toBeNull()
    canChangePassword = true
    view.rerender(<Layout />)
    expect(sidebar().getByText('sidebar.security')).toBeTruthy()

    resolvedPathname = pathname = '/admin/system-config'
    view.rerender(<Layout />)
    expect(sidebar().getByText('sidebar.githubSync')).toBeTruthy()
    expect(sidebar().getByText('sidebar.governance')).toBeTruthy()
    expect(sidebar().queryByText('sidebar.profile')).toBeNull()
    roles = ['USER_ADMIN']
    view.rerender(<Layout />)
    expect(sidebar().getByText('user.menu.users')).toBeTruthy()
    expect(sidebar().queryByText('sidebar.githubSync')).toBeNull()
  })

  it('shows the unified review entry only for authorized namespace managers', () => {
    const view = render(<Layout />)
    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).queryByRole('link', { name: 'reviewCenter.title' })).toBeNull()
    namespaceRole = 'OWNER'
    view.rerender(<Layout />)
    expect(within(sidebar).getByRole('link', { name: 'reviewCenter.title' }).getAttribute('href')).toBe('/dashboard/reviews')
    namespaceRole = 'MEMBER'
    view.rerender(<Layout />)
    expect(within(sidebar).queryByRole('link', { name: 'reviewCenter.title' })).toBeNull()
  })

  it('keeps a single frame while settings-to-dashboard navigation resolves', () => {
    pathname = '/dashboard/skills'
    resolvedPathname = '/settings/profile'
    const view = render(<Layout />)
    const main = screen.getByRole('main')
    expect(main.firstElementChild?.classList.contains('max-w-[1600px]')).toBe(true)
    expect(within(screen.getByRole('complementary')).getByRole('link', { name: 'sidebar.profile' }).classList.contains('bg-accent')).toBe(true)
    resolvedPathname = pathname
    view.rerender(<Layout />)
    expect(main.firstElementChild?.classList.contains('max-w-[1600px]')).toBe(true)
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
  })

  it('keeps the previous console shell while navigation to standalone publish is pending', () => {
    pathname = '/dashboard/publish'
    resolvedPathname = '/dashboard'
    render(<Layout />)
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
  })
})
