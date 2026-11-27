import { IconAction } from '@/shared/components/icon-action'
import { useSiteName } from '@/shared/lib/product-brand'
import { Bot, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCopyToClipboard } from '@/shared/lib/clipboard'
import { buildSkillhubCoordinate, getBaseUrl, isPortableSkillVersion } from './install-command'

interface InstallForAgentButtonProps {
  analyticsId?: string
  namespace: string
  slug: string
  version: string
  disabled?: boolean
}

type FormatAgentPrompt = (guideUrl: string, skill: string, version: string) => string

export function buildAgentInstallPrompt(
  namespace: string,
  slug: string,
  version: string,
  baseUrl: string,
  formatPrompt: FormatAgentPrompt,
): string {
  const skill = buildSkillhubCoordinate(namespace, slug)
  const guideUrl = `${baseUrl.replace(/\/+$/, '')}/registry/skill.md`

  return formatPrompt(guideUrl, skill, version)
}

export function InstallForAgentButton({ namespace, slug, version, disabled = false, analyticsId }: InstallForAgentButtonProps) {
  const { t } = useTranslation()
  const siteName = useSiteName()
  const [copied, copy] = useCopyToClipboard()

  const handleCopy = async () => {
    try {
      await copy(buildAgentInstallPrompt(
        namespace,
        slug,
        version,
        getBaseUrl(),
        (guideUrl, skill, selectedVersion) => t('skillDetail.installForAgent.prompt', {
          guideUrl,
          siteName,
          skill,
          version: selectedVersion,
        }),
      ))
    } catch (err) {
      console.error('Failed to copy agent installation prompt:', err)
    }
  }

  const label = copied
    ? t('skillDetail.installForAgent.copied')
    : t('skillDetail.installForAgent.button')

  return (
    <IconAction data-analytics-id={analyticsId} data-testid="install-for-agent-button"
      label={label} onClick={handleCopy} disabled={disabled || !isPortableSkillVersion(version)}>
      {copied ? <Check aria-hidden="true" className="size-4" /> : <Bot aria-hidden="true" className="size-4" />}
    </IconAction>
  )
}
