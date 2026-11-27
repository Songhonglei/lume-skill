import { namespaceRoleLabel } from '@/shared/lib/namespace-role-label'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/use-auth'
import { Button } from '@/shared/ui/button'
import { ListStatusIcon } from '@/shared/components/list-status-icon'
import { Card } from '@/shared/ui/card'
import { NamespaceBadge } from '@/shared/components/namespace-badge'
import { EmptyState } from '@/shared/components/empty-state'
import { Pagination } from '@/shared/components/pagination'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { CreateNamespaceDialog } from '@/features/namespace/create-namespace-dialog'
import { useMyNamespacesPage } from '@/shared/hooks/use-namespace-queries'
export { executeNamespaceAction, resolveNamespaceActionCopy } from '@/features/namespace/namespace-actions'

/** Namespace summaries; management actions live inside the namespace. */
const PAGE_SIZE = 10

export function MyNamespacesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const canCreateNamespace = hasRole('SKILL_ADMIN') || hasRole('SUPER_ADMIN')
  const [page, setPage] = useState(0)
  const { data: namespacePage, isLoading } = useMyNamespacesPage({ page, size: PAGE_SIZE })
  const namespaces = namespacePage?.items ?? []
  const totalPages = namespacePage ? Math.max(Math.ceil(namespacePage.total / namespacePage.size), 1) : 1

  useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(totalPages - 1, 0))
    }
  }, [page, totalPages])
  const handleNamespaceClick = (slug: string) => {
    navigate({ to: `/dashboard/namespaces/${encodeURIComponent(slug)}` })
  }

  const resolveStatusLabel = (status: string) => {
    if (status === 'FROZEN') {
      return t('namespaceStatus.frozen')
    }
    if (status === 'ARCHIVED') {
      return t('namespaceStatus.archived')
    }
    return t('namespaceStatus.active')
  }

  const resolveHint = (status: string, type: string) => {
    if (type === 'GLOBAL') {
      return t('myNamespaces.immutableHint')
    }
    if (status === 'FROZEN') {
      return t('myNamespaces.frozenHint')
    }
    if (status === 'ARCHIVED') {
      return t('myNamespaces.archivedHint')
    }
    return undefined
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-up">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-shimmer rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <DashboardPageHeader
        title={t('myNamespaces.title')}
        actions={canCreateNamespace ? (
          <CreateNamespaceDialog>
            <Button data-analytics-id="namespace.create.open">{t('myNamespaces.create')}</Button>
          </CreateNamespaceDialog>
        ) : undefined}
      />

      {namespaces.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {namespaces.map(namespace => (
              <Card key={namespace.id} data-testid={`namespace-card-${namespace.slug}`} className="flex min-w-0 flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="min-w-0 text-base font-semibold leading-tight [overflow-wrap:anywhere]">{namespace.displayName}</h3>
                    <NamespaceBadge type={namespace.type}
                      name={namespace.type === 'GLOBAL' ? t('myNamespaces.typeGlobal') : t('myNamespaces.typeTeam')} />
                  </div>
                  <ListStatusIcon
                    kind={namespace.status === 'FROZEN' ? 'frozen' : namespace.status === 'ARCHIVED' ? 'archived' : 'active'}
                    label={resolveStatusLabel(namespace.status)}
                    hint={resolveHint(namespace.status, namespace.type)}
                  />
                </div>
                {namespace.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]" title={namespace.description}>{namespace.description}</p>
                )}
                <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/50 pt-2">
                  <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                    <div className="truncate font-mono" title={`@${namespace.slug}`}>@{namespace.slug}</div>
                    <div>{t('myNamespaces.roleLabel')}: {namespaceRoleLabel(t, namespace.currentUserRole)}</div>
                  </div>
                  <Button data-analytics-id="namespace.management.open" variant="outline" size="sm" className="shrink-0" onClick={() => handleNamespaceClick(namespace.slug)}>
                    {t('namespaceManagement.enter')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination analyticsId="namespace.list.paginate" page={page} totalPages={totalPages} onPageChange={setPage} />
          ) : null}
        </>
      ) : (
        <EmptyState
          title={t('myNamespaces.emptyTitle')}
          action={canCreateNamespace ? (
            <CreateNamespaceDialog>
              <Button data-analytics-id="namespace.create.open" variant="outline" size="sm">{t('myNamespaces.create')}</Button>
            </CreateNamespaceDialog>
          ) : undefined}
        />
      )}

    </div>
  )
}
