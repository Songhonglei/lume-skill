import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/client'
import { clearSessionScopedQueries } from '@/features/notification/notification-session'
import { getAdminSettingsEntry } from '@/shared/lib/admin-settings'
import { canAccessGlobalReviewCenter } from '@/features/review/review-paths'
import { withBasePath } from '@/shared/lib/base-path'
import { cn } from '@/shared/lib/utils'

interface User {
  displayName: string
  avatarUrl?: string
  platformRoles?: string[]
  oauthProvider?: string
}

interface UserMenuProps {
  user: User
  triggerClassName?: string
}

export function UserMenu({ user, triggerClassName }: UserMenuProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isClickOpen, setIsClickOpen] = useState(false)

  const adminEntry = getAdminSettingsEntry(user.platformRoles)
  const canReview = canAccessGlobalReviewCenter(user.platformRoles)
  const open = isHovered || isClickOpen

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsHovered(false)
        setIsClickOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setIsHovered(false)
      setIsClickOpen(false)
      rootRef.current?.querySelector('button')?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    return () => {
      clearCloseTimer()
    }
  }, [])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      // Always clear cache and redirect, even if API call fails
      clearSessionScopedQueries(queryClient)
      queryClient.setQueryData(['auth', 'me'], null)
      window.location.href = withBasePath('/')
    }
  }

  const closeMenu = () => {
    clearCloseTimer()
    setIsHovered(false)
    setIsClickOpen(false)
  }

  const handleMouseEnter = () => {
    clearCloseTimer()
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setIsHovered(false)
      closeTimerRef.current = null
    }, 120)
  }

  const menuItemClassName =
    'block w-full rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground'

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button data-analytics-id="navigation.account.toggle"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={user.displayName}
        className={cn('flex items-center gap-3 text-foreground hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md', triggerClassName)}
        onClick={() => setIsClickOpen((current) => !current)}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            loading="lazy"
            className="w-8 h-8 rounded-full border border-border/60"
          />
        ) : (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent text-sm font-semibold text-accent-foreground flex-shrink-0">
            {user.displayName?.charAt(0) ?? '?'}
          </span>
        )}
        <span className="sr-only">
          {user.displayName}
        </span>
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 w-48 pt-2"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            role="menu"
            className="overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <Link data-analytics-id="navigation.owned.skills" to="/dashboard/skills" className={menuItemClassName} onClick={closeMenu}>
              {t('user.menu.mySkills')}
            </Link>
            <Link data-analytics-id="navigation.owned.suites" to="/dashboard/suites" className={menuItemClassName} onClick={closeMenu}>
              {t('user.menu.mySuites')}
            </Link>
            <Link data-analytics-id="navigation.dashboard.open" to="/dashboard" className={menuItemClassName} onClick={closeMenu}>
              {t('user.menu.dashboard')}
            </Link>
            <Link data-analytics-id="account.profile.open" to="/settings/profile" className={menuItemClassName} onClick={closeMenu}>
              {t('user.menu.settings')}
            </Link>
            {canReview ? (
              <Link data-analytics-id="review.queue.open" to="/dashboard/reviews" className={menuItemClassName} onClick={closeMenu}>
                {t('reviewCenter.title')}
              </Link>
            ) : null}
            {adminEntry ? (
              <Link data-analytics-id="admin.settings.open" to={adminEntry} className={menuItemClassName} onClick={closeMenu}>
                {t('user.menu.adminSettings')}
              </Link>
            ) : null}
            <div className="-mx-1 my-1 h-px bg-muted" />
            <button data-analytics-id="auth.logout.request"
              type="button"
              onClick={handleLogout}
              className={cn(menuItemClassName, 'text-destructive')}
            >
              {t('user.menu.logout')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
