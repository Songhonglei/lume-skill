import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import type { Namespace, NamespaceRole } from '@/api/types'
import { NamespaceBadge } from '@/shared/components/namespace-badge'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { EditNamespaceDialog } from './edit-namespace-dialog'

interface NamespaceHeaderProps {
  namespace: Namespace
  viewerRole?: NamespaceRole | null
}

/**
 * Header block for namespace pages and namespace-oriented dashboard views.
 */
export function NamespaceHeader({ namespace, viewerRole }: NamespaceHeaderProps) {
  const { t } = useTranslation()
  const canEdit = namespace.type === 'TEAM' && namespace.status === 'ACTIVE'
    && (viewerRole === 'OWNER' || viewerRole === 'ADMIN')
  const statusLabel = namespace.status === 'FROZEN'
    ? t('namespaceStatus.frozen')
    : namespace.status === 'ARCHIVED'
      ? t('namespaceStatus.archived')
      : t('namespaceStatus.active')
  const statusClassName = namespace.status === 'FROZEN'
    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
    : namespace.status === 'ARCHIVED'
      ? 'bg-slate-500/10 text-slate-500 border-slate-500/20'
      : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
  const hint = namespace.type === 'GLOBAL'
    ? t('namespaceStatus.immutableHint')
    : namespace.status === 'FROZEN'
      ? t('namespaceStatus.frozenHint')
      : namespace.status === 'ARCHIVED'
        ? t('namespaceStatus.archivedHint')
        : null

  return (
    <div className="rounded-lg border bg-card p-3 sm:px-4">
      <div className="flex items-center gap-2.5">
        {namespace.avatarUrl && (
          <img
            src={namespace.avatarUrl}
            alt=""
            className="size-9 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="min-w-0 text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{namespace.displayName}</h1>
            <NamespaceBadge type={namespace.type} name={namespace.type === 'GLOBAL' ? t('myNamespaces.typeGlobal') : t('myNamespaces.typeTeam')} />
            <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', statusClassName)}>
              {statusLabel}
            </span>
          </div>
          <span className="min-w-0 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">@{namespace.slug}</span>
          {namespace.description && (
            <p className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">{namespace.description}</p>
          )}
        </div>
        {canEdit ? (
          <EditNamespaceDialog namespace={namespace}>
            <Button data-analytics-id="namespace.settings.edit" type="button" variant="outline" size="sm" className="shrink-0" aria-label={t('namespaceEdit.editButton')}>
              <Pencil className="size-4" aria-hidden="true" />
              {t('namespaceEdit.editButton')}
            </Button>
          </EditNamespaceDialog>
        ) : null}
      </div>
      {hint && <p className="mt-2 border-t border-border/50 pt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}
