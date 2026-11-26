import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as mod from './user-menu'
import { UserMenu } from './user-menu'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initialValue: unknown) => [
      typeof initialValue === 'boolean' ? true : initialValue,
      vi.fn(),
    ],
  }
})

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    onClick,
    to,
  }: {
    children: ReactNode
    className?: string
    onClick?: () => void
    to: string
  }) => (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: vi.fn(),
  }),
}))

vi.mock('@/api/client', () => ({
  authApi: {
    logout: vi.fn(),
  },
}))

vi.mock('@/shared/hooks/use-namespace-queries', () => ({
  useMyNamespaces: () => ({ data: [] }),
}))

/**
 * UserMenu is a React component that renders a hover/click dropdown menu with
 * role-based navigation links (dashboard, reviews, admin, etc.) and logout.
 */
describe('user-menu module exports', () => {
  it('exports the UserMenu component', () => {
    expect(mod.UserMenu).toBeTypeOf('function')
  })
})

describe('UserMenu navigation', () => {
  it('lists personal destinations in the requested order', () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{
          displayName: 'Skill Author',
          platformRoles: ['USER'],
        }}
      />,
    )

    expect(html).toContain('user.menu.mySkills')
    expect(html).toContain('user.menu.mySuites')
    expect(html).toContain('user.menu.dashboard')
    expect(html.indexOf('user.menu.mySkills')).toBeLessThan(html.indexOf('user.menu.mySuites'))
    expect(html.indexOf('user.menu.mySuites')).toBeLessThan(html.indexOf('user.menu.dashboard'))
  })

  it('keeps dashboard-only personal links out of the compact avatar menu', () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{
          displayName: 'Skill Author',
          platformRoles: ['USER'],
        }}
      />,
    )

    expect(html).toContain('user.menu.dashboard')
    expect(html).not.toContain('user.menu.reviewProgress')
    expect(html).not.toContain('user.menu.security')
  })

  it.each([
    ['SUPER_ADMIN', '/admin/system-config'],
    ['USER_ADMIN', '/admin/users'],
    ['AUDITOR', '/admin/audit-log'],
    ['SKILL_ADMIN', '/dashboard/governance'],
  ])('shows personal settings and the appropriate admin entry for %s', (role, entry) => {
    const html = renderToStaticMarkup(<UserMenu user={{ displayName: 'Staff', platformRoles: [role] }} />)

    expect(html).toContain('user.menu.settings')
    expect(html).toContain('href="/settings/profile"')
    expect(html).toContain('user.menu.adminSettings')
    expect(html).toContain(`href="${entry}"`)
  })

  it.each(['SKILL_ADMIN', 'USER_ADMIN', 'SUPER_ADMIN'])(
    'keeps the review center available to %s users',
    (role) => {
      const html = renderToStaticMarkup(
        <UserMenu user={{ displayName: 'Reviewer', platformRoles: [role] }} />,
      )

      expect(html).toContain('href="/dashboard/reviews"')
      expect(html).toContain('reviewCenter.title')
    },
  )

  it('does not show the global review center to regular users', () => {
    const html = renderToStaticMarkup(
      <UserMenu user={{ displayName: 'Regular User', platformRoles: ['USER'] }} />,
    )

    expect(html).not.toContain('href="/dashboard/reviews"')
  })

  it('shows personal settings without an administration link for a member', () => {
    const html = renderToStaticMarkup(<UserMenu user={{ displayName: 'Member', platformRoles: ['USER'] }} />)
    expect(html).toContain('href="/settings/profile"')
    expect(html).toContain('user.menu.settings')
    expect(html).not.toContain('user.menu.adminSettings')
  })

  it('always keeps logout available', () => {
    const html = renderToStaticMarkup(
      <UserMenu
        user={{
          displayName: 'Local User',
          platformRoles: ['USER'],
        }}
      />,
    )

    expect(html).toContain('user.menu.logout')
  })
})
