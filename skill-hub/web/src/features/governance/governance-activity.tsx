import { useTranslation } from 'react-i18next'
import type { GovernanceActivityItem } from '@/api/types'
import { auditActionLabelKey, formatAuditDetails } from '@/shared/lib/audit-log-presentation'
import { formatLocalDateTime } from '@/shared/lib/date-time'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

interface GovernanceActivityProps {
  items?: GovernanceActivityItem[]
  isLoading: boolean
}

const targetLabelKeys: Record<string, string> = {
  REVIEW_TASK: 'governance.target.review',
  PROMOTION_REQUEST: 'governance.target.promotion',
  SKILL_REPORT: 'governance.target.report',
  SKILL: 'governance.target.skill',
  SKILL_VERSION: 'governance.target.version',
}

export function GovernanceActivity({ items, isLoading }: GovernanceActivityProps) {
  const { t, i18n } = useTranslation()

  if (isLoading) {
    return <div role="status" aria-label={t('common.loading')} className="h-24 animate-shimmer rounded-lg" />
  }

  if (!items?.length) {
    return <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{t('governance.emptyActivity')}</p>
  }

  return (
    <div data-density="compact" className="overflow-hidden rounded-lg border bg-card">
      <Table aria-label={t('reviewCenter.governanceActivity')} className="table-fixed">
        <TableHeader className="bg-muted/40 max-sm:sr-only">
          <TableRow>
            <TableHead scope="col" className="w-[24%]">{t('auditLog.colAction')}</TableHead>
            <TableHead scope="col" className="w-[22%]">{t('auditLog.resource')}</TableHead>
            <TableHead scope="col">{t('governance.operator')}</TableHead>
            <TableHead scope="col" className="w-40 xl:w-48">{t('auditLog.colTime')}</TableHead>
            <TableHead scope="col" className="w-20 text-right">{t('auditLog.colDetail')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => {
            const action = t(auditActionLabelKey(item.action ?? '') ?? 'governance.otherAction')
            const actor = item.actorDisplayName || item.actorUserId || t('governance.unknownActor')
            const timestamp = item.timestamp ? formatLocalDateTime(item.timestamp, i18n.language) : '—'
            const targetKey = item.targetType && Object.hasOwn(targetLabelKeys, item.targetType) ? targetLabelKeys[item.targetType] : undefined
            const target = [targetKey ? t(targetKey) : item.targetType, item.targetId].filter(Boolean).join(' · ') || '—'
            return (
              <TableRow key={item.id} className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-2 max-sm:px-3 max-sm:py-2">
                <TableCell className="font-medium [overflow-wrap:anywhere] max-sm:order-1 max-sm:p-1">{action}</TableCell>
                <TableCell className="text-xs text-muted-foreground [overflow-wrap:anywhere] max-sm:hidden">{target}</TableCell>
                <TableCell className="text-xs [overflow-wrap:anywhere] max-sm:order-4 max-sm:col-span-2 max-sm:p-1">{actor}</TableCell>
                <TableCell className="text-xs tabular-nums text-muted-foreground max-sm:order-3 max-sm:p-1">{timestamp}</TableCell>
                <TableCell className="text-right max-sm:order-2 max-sm:p-1">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" size="sm" variant="outline">{t('list.details')}</Button>
                    </DialogTrigger>
                    <DialogContent aria-describedby={undefined}>
                      <DialogHeader className="pr-6 text-left"><DialogTitle>{t('governance.activityDetail')}</DialogTitle></DialogHeader>
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">{t('auditLog.colAction')}</dt><dd>{action}</dd>
                        <dt className="text-muted-foreground">{t('auditLog.resource')}</dt><dd className="[overflow-wrap:anywhere]">{target}</dd>
                        <dt className="text-muted-foreground">{t('governance.operator')}</dt><dd className="[overflow-wrap:anywhere]">{actor}</dd>
                        <dt className="text-muted-foreground">{t('auditLog.colTime')}</dt><dd>{timestamp}</dd>
                        <dt className="text-muted-foreground">{t('auditLog.actionCode')}</dt><dd className="font-mono text-xs [overflow-wrap:anywhere]">{item.action || '—'}</dd>
                      </dl>
                      {item.details && <div className="space-y-2">
                        <h3 className="text-sm font-medium">{t('auditLog.originalDetails')}</h3>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs [overflow-wrap:anywhere]">{formatAuditDetails(item.details)}</pre>
                      </div>}
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
