import { avatarAssetUrl } from '@/shared/lib/avatar-asset-url'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useAuth } from '@/features/auth/use-auth'
import { APP_SHELL_PAGE_CLASS_NAME } from '@/app/page-shell-style'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import {
  Star, Heart, Package, Boxes, Key, Flag, Globe,
  UserCog, Lock, Bell, Clock, ChevronDown, ChevronRight, Github, Settings, Tags, ClipboardList, Users,
} from 'lucide-react'

/**
 * Sidebar navigation groups for the Dashboard.
 *
 * Groups are rendered with a label divider; items within each group share visual spacing.
 * Admin-only items are filtered based on the user's platform roles.
 */

interface SidebarItem {
  key: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  to: string
  analyticsId?: string
  admin?: boolean
  roles?: readonly string[]
  passwordCapability?: boolean
}

interface SidebarGroup {
  label: string
  items: SidebarItem[]
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'sidebar.account',
    items: [
      { key: 'profile', icon: UserCog, label: 'sidebar.profile', to: '/settings/profile', analyticsId: 'account.profile.open' },
      { key: 'security', icon: Lock, label: 'sidebar.security', to: '/settings/security', analyticsId: 'account.security.open', passwordCapability: true },
      { key: 'tokens', icon: Key, label: 'sidebar.tokens', to: '/dashboard/tokens', analyticsId: 'account.tokens.open' },
      { key: 'notifications', icon: Bell, label: 'sidebar.notifications', to: '/settings/notifications', analyticsId: 'notification.settings.open' },
    ],
  },
  {
    label: 'sidebar.skillsAndData',
    items: [
      { key: 'skills', icon: Package, label: 'sidebar.mySkills', to: '/dashboard/skills', analyticsId: 'navigation.owned.skills' },
      { key: 'suites', icon: Boxes, label: 'sidebar.mySuites', to: '/dashboard/suites', analyticsId: 'navigation.owned.suites' },
      { key: 'namespaces', icon: Globe, label: 'sidebar.namespaces', to: '/dashboard/namespaces', analyticsId: 'namespace.list.open' },
      { key: 'stars', icon: Star, label: 'sidebar.stars', to: '/dashboard/stars', analyticsId: 'navigation.starred.open' },
      { key: 'subscriptions', icon: Heart, label: 'sidebar.subscriptions', to: '/dashboard/subscriptions', analyticsId: 'navigation.subscriptions.open' },
      { key: 'reviewProgress', icon: Clock, label: 'sidebar.reviewProgress', to: '/dashboard/review-progress', analyticsId: 'review.progress.open' },
    ],
  },
]

export const ADMIN_SETTINGS_GROUPS: SidebarGroup[] = [
  {
    label: 'user.menu.adminSettings',
    items: [
      { key: 'systemConfig', icon: Settings, label: 'user.menu.systemConfig', to: '/admin/system-config', analyticsId: 'admin.settings.open', roles: ['SUPER_ADMIN'] },
      { key: 'users', icon: Users, label: 'user.menu.users', to: '/admin/users', analyticsId: 'admin.users.open', roles: ['USER_ADMIN', 'SUPER_ADMIN'] },
      { key: 'labels', icon: Tags, label: 'user.menu.labels', to: '/admin/labels', analyticsId: 'admin.labels.open', roles: ['SUPER_ADMIN'] },
      { key: 'namespacesAdmin', icon: Globe, label: 'user.menu.namespacesAdmin', to: '/admin/namespaces', analyticsId: 'admin.namespaces.open', roles: ['SUPER_ADMIN'] },
      { key: 'governance', icon: Flag, label: 'sidebar.governance', to: '/dashboard/governance', analyticsId: 'governance.center.open', admin: true },
      { key: 'githubSync', icon: Github, label: 'sidebar.githubSync', to: '/dashboard/github-sync', analyticsId: 'github.sync.open', roles: ['SUPER_ADMIN'] },
      { key: 'githubCatalog', icon: Github, label: 'nav.githubSkills', to: '/github', analyticsId: 'navigation.github.open', roles: ['SUPER_ADMIN'] },
      { key: 'audit', icon: ClipboardList, label: 'user.menu.auditLog', to: '/admin/audit-log', analyticsId: 'admin.audit.open', roles: ['AUDITOR', 'SUPER_ADMIN'] },
    ],
  },
]

/**
 * Overview cards for the Dashboard home.
 * Shown as a grid of quick-access cards linking to main sections.
 */
const OVERVIEW_CARDS = [
  { key: 'skills', icon: Package, label: 'overview.mySkills', to: '/dashboard/skills', analyticsId: 'navigation.owned.skills', desc: 'overview.mySkillsDesc' },
  { key: 'suites', icon: Boxes, label: 'overview.mySuites', to: '/dashboard/suites', analyticsId: 'navigation.owned.suites', desc: 'overview.mySuitesDesc' },
  { key: 'stars', icon: Star, label: 'overview.stars', to: '/dashboard/stars', analyticsId: 'navigation.starred.open', desc: 'overview.starsDesc' },
] as const

/**
 * Dashboard overview content; the shared Layout owns its sidebar.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  return (
    <div className={APP_SHELL_PAGE_CLASS_NAME}>
      <DashboardPageHeader title={t('dashboard.title')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {OVERVIEW_CARDS.map((card) => {
        const Icon = card.icon
        return (
          <Link data-analytics-id={card.analyticsId}
            key={card.key}
            to={card.to}
            className="group flex items-start gap-4 rounded-lg border border-border bg-card p-4 transition-all duration-150 hover:bg-accent hover:border-border hover:shadow-sm"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-secondary">
              <Icon className="w-5 h-5" style={{ color: 'hsl(var(--foreground))' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
                  {t(card.label)}
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0" style={{ color: 'hsl(var(--muted-foreground))' }} />
              </div>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'hsl(var(--text-secondary))' }}>
                {t(card.desc)}
              </p>
            </div>
          </Link>
        )
      })}
      </div>
    </div>
  )
}

/** Reusable sidebar for dashboard and its sub-pages. */
export function DashboardSidebar({
  groups,
  user,
  t,
  pathname,
  navigationLabel,
}: {
  groups: SidebarGroup[]
  user: ReturnType<typeof useAuth>['user']
  t: ReturnType<typeof useTranslation>['t']
  pathname: string
  navigationLabel: string
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeItem = groups.flatMap(group => group.items)
    .find(item => pathname === item.to || pathname.startsWith(`${item.to}/`))

  return (
    <aside className="w-full lg:w-56 flex-shrink-0">
      <div className="overflow-hidden rounded-lg border bg-background lg:sticky lg:top-[68px] lg:rounded-none lg:border-0">
        <button data-analytics-id="navigation.dashboard.toggle"
          type="button"
          className="flex h-10 w-full items-center justify-between gap-3 px-3 text-sm font-medium lg:hidden"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(open => !open)}
        >
          <span>{navigationLabel}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {activeItem ? t(activeItem.label) : null}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>

        <div className="mb-4 hidden items-center gap-3 px-3 py-2 lg:flex">
          {user?.avatarUrl ? (
            <img src={avatarAssetUrl(user.avatarUrl)} alt={user.displayName} className="h-8 w-8 shrink-0 rounded-full border border-border/60" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
              {user?.displayName?.charAt(0) ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user?.displayName}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            <div className="truncate text-xs text-muted-foreground">
              {t('dashboard.userId')}: {user?.userId}
            </div>
          </div>
        </div>

        <div className={`${mobileOpen ? 'block' : 'hidden'} border-t p-2 lg:block lg:border-0 lg:p-0`}>
          {groups.map(group => (
            <div key={group.label} className="mb-3 last:mb-0">
              <h2 className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{t(group.label)}</h2>
              <nav aria-label={t(group.label)} className="grid grid-cols-2 gap-1 lg:block lg:space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon
                  const isActive = activeItem?.key === item.key
                  return (
                    <Link data-analytics-id={item.analyticsId}
                      key={item.key}
                      to={item.to}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-accent lg:text-sm ${isActive ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">{t(item.label)}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
