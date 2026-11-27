import { useTranslation } from 'react-i18next'
import { IconAction } from '@/shared/components/icon-action'
import { useStar, useToggleStar } from './use-star'
import { Bookmark } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'

interface StarButtonProps {
  skillId: number
  onRequireLogin?: () => void
}

/**
 * Toggles the current user's star state for a skill while delegating the login
 * prompt to the surrounding page. The read query is kept separate so pages can
 * decide independently whether star controls should be rendered at all.
 */
export function StarButton({ skillId, onRequireLogin }: StarButtonProps) {
  const { t } = useTranslation()
  const { data: starStatus } = useStar(skillId)
  const toggleMutation = useToggleStar(skillId)
  const { isAuthenticated } = useAuth()

  const handleToggle = () => {
    if (!isAuthenticated) {
      onRequireLogin?.()
      return
    }
    if (starStatus) {
      toggleMutation.mutate(starStatus.starred)
    }
  }

  const active = starStatus?.starred ?? false

  return (
    <IconAction data-analytics-id={active ? 'skill.star.remove' : 'skill.star.add'}
      label={t(active ? 'starButton.starred' : 'starButton.star')} aria-pressed={active}
      variant={active ? 'soft' : 'outline'} onClick={handleToggle}
      disabled={toggleMutation.isPending || (isAuthenticated && !starStatus)}>
      <Bookmark aria-hidden="true" className={`size-4 ${active ? 'fill-current' : ''}`} />
    </IconAction>
  )
}
