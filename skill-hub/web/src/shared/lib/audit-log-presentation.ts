export const AUDIT_ACTION_OPTIONS = [
  { value: '', labelKey: 'auditLog.filterAll' },
  { value: 'CLI_PUBLISH', labelKey: 'auditLog.filterCliPublish' },
  { value: 'COMPAT_PUBLISH', labelKey: 'auditLog.filterCompatPublish' },
  { value: 'REVIEW_SUBMIT', labelKey: 'auditLog.filterReviewSubmit' },
  { value: 'REVIEW_APPROVE', labelKey: 'auditLog.filterReviewApprove' },
  { value: 'REVIEW_REJECT', labelKey: 'auditLog.filterReviewReject' },
  { value: 'REVIEW_WITHDRAW', labelKey: 'auditLog.filterReviewWithdraw' },
  { value: 'PROMOTION_SUBMIT', labelKey: 'auditLog.filterPromotionSubmit' },
  { value: 'PROMOTION_APPROVE', labelKey: 'auditLog.filterPromotionApprove' },
  { value: 'PROMOTION_REJECT', labelKey: 'auditLog.filterPromotionReject' },
  { value: 'REPORT_SKILL', labelKey: 'auditLog.filterReportSkill' },
  { value: 'RESOLVE_SKILL_REPORT', labelKey: 'auditLog.filterResolveSkillReport' },
  { value: 'DISMISS_SKILL_REPORT', labelKey: 'auditLog.filterDismissSkillReport' },
  { value: 'HIDE_SKILL', labelKey: 'auditLog.filterHideSkill' },
  { value: 'ARCHIVE_SKILL', labelKey: 'auditLog.filterArchiveSkill' },
  { value: 'UNHIDE_SKILL', labelKey: 'auditLog.filterUnhideSkill' },
  { value: 'UNARCHIVE_SKILL', labelKey: 'auditLog.filterUnarchiveSkill' },
  { value: 'YANK_SKILL_VERSION', labelKey: 'auditLog.filterYankVersion' },
  { value: 'REBUILD_SEARCH_INDEX', labelKey: 'auditLog.filterRebuildSearchIndex' },
] as const

export function auditActionLabelKey(action: string) {
  return AUDIT_ACTION_OPTIONS.find(option => option.value === action)?.labelKey
}

export function formatAuditDetails(details?: string | null) {
  if (!details) return ''
  try {
    return JSON.stringify(JSON.parse(details), null, 2)
  } catch {
    // Historical records may contain plain text.
    return details
  }
}
