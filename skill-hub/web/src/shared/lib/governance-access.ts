export const GOVERNANCE_ROLES = ['SKILL_ADMIN', 'NAMESPACE_ADMIN', 'SUPER_ADMIN'] as const

export function canViewGovernanceCenter(platformRoles?: readonly string[]) {
  return GOVERNANCE_ROLES.some(role => platformRoles?.includes(role))
}
