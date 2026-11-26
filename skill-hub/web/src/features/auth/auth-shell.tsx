import type React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { BrandMark } from '@/shared/components/brand-mark'
import { PRODUCT_NAME } from '@/shared/lib/product-brand'
import { withBasePath } from '@/shared/lib/base-path'
import { cn } from '@/shared/lib/utils'

interface AuthShellProps {
  children: React.ReactNode
  className?: string
}

/** Shared product and form layout for login and registration. */
export function AuthShell({ children, className }: AuthShellProps) {
  const { t } = useTranslation()
  const { settings } = useSitePresentation()

  return (
    <section className={cn('flex min-h-svh flex-col items-center px-4 pb-10 pt-20 sm:px-6 lg:pt-24', className)}>
      <a
        data-analytics-id="navigation.home.open"
        href={withBasePath('/')}
        className="absolute left-4 top-5 inline-flex h-8 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:left-8"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t('authShell.backHome')}
      </a>
      <div className="w-full max-w-[450px] rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="luma-wordmark mb-6 flex items-center gap-2.5 font-semibold">
          <BrandMark className="h-9 w-9 shrink-0" alt="" />
          <span className="min-w-0 break-words">{settings.siteName ?? PRODUCT_NAME}</span>
        </div>
        {children}
      </div>
    </section>
  )
}
