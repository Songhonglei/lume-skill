import { avatarAssetUrl } from '@/shared/lib/avatar-asset-url'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/client'
import { clearSessionScopedQueries } from '@/features/notification/notification-session'
import { getAdminSettingsEntry } from '@/shared/lib/admin-settings'
import { useMyNamespaces } from '@/shared/hooks/use-namespace-queries'
import { canAccessGlobalReviewCenter, canAccessReviewCenter } from '@/features/review/review-paths'
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
  const globalReviewer = canAccessGlobalReviewCenter(user.platformRoles)
  const { data: managedNamespaces } = useMyNamespaces(!globalReviewer)
  const canReview = canAccessReviewCenter(user.platformRoles, managedNamespaces)
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
      className="relative grid"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button data-analytics-id="navigation.account.toggle"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={user.displayName}
        className={cn('luma-header-icon inline-grid', triggerClassName)}
        onClick={() => setIsClickOpen((current) => !current)}
      >
        {user.avatarUrl ? (
          <img
            src={avatarAssetUrl(user.avatarUrl)}
            alt=""
            loading="lazy"
            className="size-7 rounded-full border border-border/60 object-cover"
          />
        ) : (
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {user.displayName?.charAt(0) ?? '?'}
          </span>
        )}
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
            <Link data-analytics-id="navigation.dashboard.open" to="/dashboard" className={menuItemClassName} onClick={closeMenu}>
              {t('dashboard.title')}
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
