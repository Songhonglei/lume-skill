import { useTranslation } from 'react-i18next'
import { IconAction } from '@/shared/components/icon-action'
import { useSubscription, useToggleSubscription } from './use-subscription'
import { Bell } from 'lucide-react'
import { useAuth } from '@/features/auth/use-auth'

interface SubscribeButtonProps {
  skillId: number
  onRequireLogin?: () => void
}

export function SubscribeButton({ skillId, onRequireLogin }: SubscribeButtonProps) {
  const { t } = useTranslation()
  const { data: subscriptionStatus } = useSubscription(skillId)
  const toggleMutation = useToggleSubscription(skillId)
  const { isAuthenticated } = useAuth()

  const handleToggle = () => {
    if (!isAuthenticated) {
      onRequireLogin?.()
      return
    }
    if (subscriptionStatus) {
      toggleMutation.mutate(subscriptionStatus.subscribed)
    }
  }

  const active = subscriptionStatus?.subscribed ?? false

  return (
    <IconAction data-analytics-id={active ? 'skill.subscription.remove' : 'skill.subscription.add'}
      label={t(active ? 'subscribeButton.subscribed' : 'subscribeButton.subscribe')} aria-pressed={active}
      variant={active ? 'soft' : 'outline'} onClick={handleToggle}
      disabled={toggleMutation.isPending || (isAuthenticated && !subscriptionStatus)}>
      <Bell aria-hidden="true" className={`size-4 ${active ? 'fill-current' : ''}`} />
    </IconAction>
  )
}
