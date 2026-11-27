import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react'
import { copyToClipboard } from '@/shared/lib/clipboard'
import { toast } from '@/shared/lib/toast'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { getBaseUrl } from './install-command'

interface ShareButtonProps {
  namespace: string
  slug: string
  description?: string
}

/**
 * Build share text for a skill with full description
 */
export function buildShareText(
  namespace: string,
  slug: string,
  description: string | undefined,
  baseUrl: string,
  t: (key: string) => string,
): string {
  const skillUrl = `${baseUrl}/space/${namespace}/${encodeURIComponent(slug)}`
  const displayName = namespace === 'global' ? slug : `${namespace}/${slug}`
  const fullDesc = description || t('skillDetail.share.defaultDescription')

  return `${displayName}\n${fullDesc}\n${skillUrl}`
}

export function ShareMenuItem({ namespace, slug, description }: ShareButtonProps) {
  const { t } = useTranslation()

  const handleShare = async () => {
    try {
      const baseUrl = getBaseUrl()
      const shareText = buildShareText(namespace, slug, description, baseUrl, t)
      await copyToClipboard(shareText)
      toast.success(t('skillDetail.share.copied'))
    } catch {
      toast.error(t('copyButton.failed'))
    }
  }

  return (
    <DropdownMenuItem data-analytics-id="skill.share.request" data-testid="share-skill-button" className="gap-2" onSelect={handleShare}>
      <Share2 aria-hidden="true" className="size-4" />{t('skillDetail.share.button')}
    </DropdownMenuItem>
  )
}
