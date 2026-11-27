import { useParams } from '@tanstack/react-router'
import { NamespaceHeader } from '@/features/namespace/namespace-header'
import { NamespaceManagementBack, NamespaceManagementNav } from '@/features/namespace/namespace-management-nav'
import { useMyNamespaces, useNamespaceDetail } from '@/shared/hooks/use-namespace-queries'
import { NamespaceSkills } from '@/features/namespace/namespace-skills'

export function NamespaceManagementPage() {
  const { slug } = useParams({ from: '/dashboard/namespaces/$slug' })
  const { data: namespace } = useNamespaceDetail(slug)
  const { data: myNamespaces } = useMyNamespaces()
  const viewerRole = myNamespaces?.find(item => item.slug === slug)?.currentUserRole
  return (
    <div className="space-y-4">
      <NamespaceManagementBack />
      {namespace ? <NamespaceHeader namespace={namespace} viewerRole={viewerRole} /> : null}
      <NamespaceManagementNav slug={slug} active="skills" />
      <NamespaceSkills key={slug} namespace={slug} showHeader={false} />
    </div>
  )
}
