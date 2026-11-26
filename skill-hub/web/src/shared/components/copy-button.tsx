import { Check, Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { useCopyToClipboard } from '@/shared/lib/clipboard'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'

interface CopyButtonProps {
  analyticsId?: string
  text: string
  className?: string
  ariaLabel?: string
  iconOnly?: boolean
}

export function CopyButton({ text, className, ariaLabel, analyticsId, iconOnly = false }: CopyButtonProps) {
  const { t } = useTranslation()
  const [copied, copy] = useCopyToClipboard()

  const handleCopy = async () => {
    try {
      await copy(text)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error(t('copyButton.failed'))
    }
  }

  const Icon = copied ? Check : Copy
  const label = ariaLabel ?? t('copyButton.copy')
  return (
    <>
      <Button
        data-analytics-id={analyticsId}
        type="button"
        variant={iconOnly ? 'ghost' : 'outline'}
        size={iconOnly ? 'icon' : 'sm'}
        onClick={handleCopy}
        className={cn(iconOnly && (copied ? 'shrink-0 text-emerald-700 dark:text-emerald-300' : 'shrink-0 text-muted-foreground'), className)}
        aria-label={iconOnly ? label : ariaLabel}
        title={iconOnly ? (copied ? t('copyButton.copied') : label) : undefined}
      >
        {iconOnly ? <Icon className="size-4" aria-hidden="true" /> : t(copied ? 'copyButton.copied' : 'copyButton.copy')}
      </Button>
      {iconOnly && <span role="status" className="sr-only">{copied ? t('copyButton.copied') : ''}</span>}
    </>
  )
}
