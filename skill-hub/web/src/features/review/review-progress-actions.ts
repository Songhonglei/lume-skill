import type { ReviewProgress } from '@/api/types'

export function reviewResubmitSearch(item: ReviewProgress) {
  const slug = item.subjectSlug || item.skillSlug
  const isMetadata = item.subjectType === 'SKILL_METADATA'
  return {
    namespace: item.namespace,
    ...(isMetadata ? { updateSkill: slug } : { resubmitSkill: slug, resubmitVersion: item.skillVersion }),
  }
}
