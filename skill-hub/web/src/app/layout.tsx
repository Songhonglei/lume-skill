import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Boxes, Home, LayoutDashboard, LayoutGrid, Menu, Upload, X } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'
import { useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { BrandMark } from '@/shared/components/brand-mark'
import { PRODUCT_NAME } from '@/shared/lib/product-brand'
import { LanguageSwitcher } from '@/shared/components/language-switcher'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { UserMenu } from '@/shared/components/user-menu'
import { NotificationBell } from '@/features/notification/notification-bell'
import { dismissOpenOverlays } from '@/shared/lib/dismiss-open-overlays'
import { syncDocumentLanguage } from '@/shared/lib/document-language'
import { ADMIN_SETTINGS_GROUPS, DashboardSidebar, SIDEBAR_GROUPS } from '@/pages/dashboard'
import { canViewGovernanceCenter } from '@/shared/lib/governance-access'
import { APP_HEADER_CONTENT_CLASS_NAME, getAppHeaderClassName } from './layout-header-style'
import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'
import { AUTH_ENTRY_PATHS, SPLIT_AUTH_PATHS, consoleArea, getAppMainContentLayout, resolveAppMainContentPathname } from './layout-main-content'

/**
 * Application shell shared by all routed pages.
 *
 * It owns the global header, language switcher, auth-aware navigation, and suspense
 * fallback used while lazy route modules are loading.
 */
export function Layout() {
  const { settings: presentation } = useSitePresentation()
  const { t, i18n } = useTranslation()
  const { pathname, resolvedPathname } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      resolvedPathname: s.resolvedLocation?.pathname,
    }),
  })
  const { user, isLoading } = useAuth()
  const [isHeaderElevated, setIsHeaderElevated] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const previousPathnameRef = useRef(pathname)
  const contentLayoutPathname = resolveAppMainContentPathname(pathname, resolvedPathname)
  const mainContentLayout = getAppMainContentLayout(contentLayoutPathname)
  const isAuthEntryRoute = AUTH_ENTRY_PATHS.includes(contentLayoutPathname as typeof AUTH_ENTRY_PATHS[number])
  const isSplitAuthRoute = SPLIT_AUTH_PATHS.includes(contentLayoutPathname as typeof SPLIT_AUTH_PATHS[number])
  const showSidebar = mainContentLayout.sidebarRowClassName !== undefined
  const area = consoleArea(contentLayoutPathname)
  const groups = area === 'admin' ? ADMIN_SETTINGS_GROUPS : SIDEBAR_GROUPS
  const governanceVisible = canViewGovernanceCenter(user?.platformRoles)
  const filteredDashboardGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        (!item.admin || governanceVisible)
        && (!item.roles || item.roles.some(role => user?.platformRoles?.includes(role)))
        && (!item.passwordCapability || user?.canChangePassword === true)
      )),
    }))
    .filter((group) => group.items.length > 0)

  useEffect(() => {
    syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language)
  }, [i18n.language, i18n.resolvedLanguage])

  useEffect(() => {
    const updateHeaderElevation = () => {
      setIsHeaderElevated(window.scrollY > 0)
    }

    updateHeaderElevation()
    window.addEventListener('scroll', updateHeaderElevation, { passive: true })

    return () => {
      window.removeEventListener('scroll', updateHeaderElevation)
    }
  }, [])

  // Pathname-only: search debounce on /search must not dismiss overlays mid-typing.
  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }
    previousPathnameRef.current = pathname
    setMobileMenuOpen(false)
    dismissOpenOverlays()
  }, [pathname])

  const navItems = [
    { label: t('nav.landing'), to: '/', icon: Home, analyticsId: 'navigation.home.open' },
    { label: t('nav.marketplace'), to: '/search', icon: LayoutGrid, analyticsId: 'navigation.skills.open' },
    { label: t('nav.publish'), to: '/dashboard/publish', icon: Upload, analyticsId: 'skill.publish.open', auth: true },
    { label: t('nav.suites'), to: '/suites', icon: Boxes, analyticsId: 'navigation.suites.open' },
    { label: t('dashboard.title'), to: '/dashboard', icon: LayoutDashboard, analyticsId: 'navigation.dashboard.open', auth: true },
  ]

  const isActive = (to: string) => {
    if (to === '/dashboard') return showSidebar && area === 'workspace' && pathname !== '/dashboard/publish'
    if (to === '/search' && pathname.startsWith('/space/')) return true
    if (to === '/suites' && pathname.startsWith('/suite/')) return true
    return pathname === to
  }

  return (
    <div className="flex min-h-screen flex-col bg-background [--app-header-height:65px] lg:[--app-header-height:110px]">
      {/* Header */}
      <header
        className={isSplitAuthRoute ? 'absolute right-4 top-4 z-50 flex items-center sm:right-10' : getAppHeaderClassName(isHeaderElevated)}
      >
        <div className={isSplitAuthRoute ? 'flex items-center' : APP_HEADER_CONTENT_CLASS_NAME}>
        {!isSplitAuthRoute ? (
          <Link data-analytics-id="navigation.home.open" to="/" aria-label={presentation.siteName ?? PRODUCT_NAME} className="luma-wordmark flex min-w-0 max-w-full items-center gap-2.5 rounded-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <BrandMark className="h-8 w-8 shrink-0" alt="" />
            <span className="truncate" title={presentation.siteName ?? PRODUCT_NAME}>{presentation.siteName ?? PRODUCT_NAME}</span>
          </Link>
        ) : null}

        <div className="flex shrink-0 items-center gap-1" style={{ color: 'hsl(var(--text-secondary))' }}>
          {/* Hamburger for narrow screens. */}
          {!isAuthEntryRoute ? (
            <button data-analytics-id="navigation.menu.toggle"
              type="button"
              className="luma-header-icon inline-grid lg:hidden"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls={mobileMenuOpen ? 'mobile-main-navigation' : undefined}
              aria-label={t(mobileMenuOpen ? 'layout.closeNavigation' : 'layout.openNavigation')}
            >
              {mobileMenuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
            </button>
          ) : null}
          <ThemeToggle />
          <LanguageSwitcher />
          {user && <NotificationBell />}
          {isLoading ? null : user ? (
            <UserMenu user={user} />
          ) : !isAuthEntryRoute ? (
            <Link data-analytics-id="auth.login.open"
              to="/login"
              className="luma-header-control inline-flex items-center px-2.5 font-medium"
            >
              {t('nav.login')}
            </Link>
          ) : null}
        </div>
        </div>
        {!isAuthEntryRoute && (
          <div className="hidden border-t border-border lg:block">
            <nav aria-label={t('layout.mainNavigation')} className={`${APP_FRAME_CLASS_NAME} flex min-h-11 items-stretch gap-5`}>
              {navItems.filter(item => !item.auth || user).map(({ icon: Icon, ...item }) => (
                <Link data-analytics-id={item.analyticsId}
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  aria-current={isActive(item.to) ? 'page' : undefined}
                  className="luma-nav-link gap-2"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && !isAuthEntryRoute ? (
        <div className="sticky top-[var(--app-header-height)] z-40 border-b border-border bg-card lg:hidden">
          <nav id="mobile-main-navigation" aria-label={t('layout.mainNavigation')} className={`${APP_FRAME_CLASS_NAME} flex flex-col gap-1 py-3`}>
            {navItems.filter(item => !item.auth || user).map(({ icon: Icon, ...item }) => {
              const active = isActive(item.to)
              return (
                <Link data-analytics-id={item.analyticsId}
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      ) : null}

      {/* Main content */}
      <main className={mainContentLayout.mainClassName}>
        <Suspense
          fallback={
            <div className={`${APP_FRAME_CLASS_NAME} space-y-3 py-8 animate-fade-up`}>
              <div className="h-8 w-36 animate-shimmer rounded-md" />
              <div className="h-4 w-56 animate-shimmer rounded-md" />
              <div className="h-48 animate-shimmer rounded-lg" />
            </div>
          }
        >
          <div className={mainContentLayout.contentClassName}>
          {showSidebar && filteredDashboardGroups.length > 0 ? (
            <div className={mainContentLayout.sidebarRowClassName ?? "flex flex-col lg:flex-row gap-6"}>
              <DashboardSidebar groups={filteredDashboardGroups} user={user} t={t} pathname={contentLayoutPathname} navigationLabel={t(area === 'admin' ? 'user.menu.adminSettings' : 'dashboard.title')} />
              <div className={mainContentLayout.sidebarContentClassName ?? "flex-1 min-w-0"}>
                <Outlet />
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
        </Suspense>
      </main>

    </div>
  )
}
