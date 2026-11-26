import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/shared/hooks/use-theme'
import { cn } from '@/shared/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const Icon = isDark ? Moon : Sun
  const label = t(isDark ? 'theme.switchToLight' : 'theme.switchToDark')

  return (
    <button
      data-analytics-id="navigation.theme.toggle"
      type="button"
      role="switch"
      aria-label={t('theme.darkMode')}
      aria-checked={isDark}
      title={label}
      onClick={toggleTheme}
      className={cn('luma-header-icon inline-grid', className)}
    >
      <Icon aria-hidden="true" className="size-[18px]" />
    </button>
  )
}
