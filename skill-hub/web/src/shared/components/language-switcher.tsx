import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  const current = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0]
  const chinese = current === 'zh'
  const next = chinese ? 'en' : 'zh'

  return (
    <button
      data-analytics-id="navigation.language.select"
      type="button"
      aria-label={chinese ? '中文' : 'English'}
      title={t(chinese ? 'layout.switchToEnglish' : 'layout.switchToChinese')}
      className={cn('luma-header-icon inline-grid text-xs font-semibold', className)}
      onClick={() => void i18n.changeLanguage(next)}
    >
      <span aria-hidden="true">{chinese ? '中' : 'EN'}</span>
    </button>
  )
}
