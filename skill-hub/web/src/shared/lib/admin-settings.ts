import { canViewGovernanceCenter } from './governance-access'

/** Use the first area the user's existing platform role is allowed to open. */
export function getAdminSettingsEntry(roles: readonly string[] = []) {
  if (roles.includes('SUPER_ADMIN')) return '/admin/system-config'
  if (roles.includes('USER_ADMIN')) return '/admin/users'
  if (canViewGovernanceCenter(roles)) return '/dashboard/governance'
  if (roles.includes('AUDITOR')) return '/admin/audit-log'
}
