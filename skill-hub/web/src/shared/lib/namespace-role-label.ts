export function namespaceRoleLabel(t: (key: string) => string, role?: string | null) {
  switch (role?.trim().toUpperCase()) {
    case 'OWNER': return t('members.roleOwner')
    case 'ADMIN': return t('members.roleAdmin')
    case 'MEMBER': return t('members.roleMember')
    default: return t('myNamespaces.roleUnknown')
  }
}
