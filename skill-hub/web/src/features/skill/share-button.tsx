import { useTranslation } from 'react-i18next'
import { Share2, Check } from 'lucide-react'
import { useCopyToClipboard } from '@/shared/lib/clipboard'
import { IconAction } from '@/shared/components/icon-action'
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

export function ShareButton({ namespace, slug, description }: ShareButtonProps) {
  const { t } = useTranslation()
  const [copied, copy] = useCopyToClipboard()

  const handleShare = async () => {
    try {
      const baseUrl = getBaseUrl()
      const shareText = buildShareText(namespace, slug, description, baseUrl, t)
      await copy(shareText)
    } catch (err) {
      console.error('Failed to copy share text:', err)
    }
  }

  return (
    <>
      <IconAction data-analytics-id="skill.share.request" data-testid="share-skill-button"
        label={t('skillDetail.share.button')} onClick={handleShare}>
        {copied ? <Check aria-hidden="true" className="size-4" /> : <Share2 aria-hidden="true" className="size-4" />}
      </IconAction>
      <span role="status" className="sr-only">{copied ? t('skillDetail.share.copied') : ''}</span>
    </>
  )
}
