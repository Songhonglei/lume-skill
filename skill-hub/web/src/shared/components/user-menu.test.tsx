import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const namespace = vi.hoisted(() => ({ role: undefined as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined }))

vi.mock('@/shared/hooks/use-namespace-queries', () => ({
  useMyNamespaces: () => ({ data: namespace.role ? [
    { type: 'TEAM', currentUserRole: namespace.role, status: 'ACTIVE', slug: 'team' },
  ] : [] }),
}))

afterEach(() => { namespace.role = undefined })

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
  it('offers one entry for the personal console', () => {
    const html = renderToStaticMarkup(<UserMenu user={{ displayName: 'Skill Author', platformRoles: ['USER'] }} />)

    expect(html.match(/href="\/dashboard"/g)).toHaveLength(1)
    expect(html).toContain('dashboard.title')
    for (const path of ['/dashboard/skills', '/dashboard/suites', '/settings/profile', '/dashboard/review-progress']) {
      expect(html).not.toContain(`href="${path}"`)
    }
  })

  it.each([
    ['SUPER_ADMIN', '/admin/system-config'],
    ['USER_ADMIN', '/admin/users'],
    ['AUDITOR', '/admin/audit-log'],
    ['SKILL_ADMIN', '/dashboard/governance'],
  ])('shows the personal console and the appropriate administration entry for %s', (role, entry) => {
    const html = renderToStaticMarkup(<UserMenu user={{ displayName: 'Staff', platformRoles: [role] }} />)

    expect(html).toContain('href="/dashboard"')
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

  it.each([
    ['OWNER', true], ['ADMIN', true], ['MEMBER', false], [undefined, false],
  ] as const)('limits the independent review menu to eligible namespace roles (%s)', (role, allowed) => {
    namespace.role = role
    const html = renderToStaticMarkup(<UserMenu user={{ displayName: 'Skill User', platformRoles: ['USER'] }} />)

    expect(html.includes('href="/dashboard/reviews"')).toBe(allowed)
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
