import type { AuditLogItem } from '@/api/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Pagination } from '@/shared/components/pagination'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocalDateTime } from '@/shared/lib/date-time'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  normalizeSelectValue,
} from '@/shared/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'
import { useAuditLog } from '@/features/admin/use-audit-log'

const ACTION_OPTIONS = [
  { value: '', labelKey: 'auditLog.filterAll' },
  { value: 'CLI_PUBLISH', labelKey: 'auditLog.filterCliPublish' },
  { value: 'COMPAT_PUBLISH', labelKey: 'auditLog.filterCompatPublish' },
  { value: 'REVIEW_SUBMIT', labelKey: 'auditLog.filterReviewSubmit' },
  { value: 'REVIEW_APPROVE', labelKey: 'auditLog.filterReviewApprove' },
  { value: 'REVIEW_REJECT', labelKey: 'auditLog.filterReviewReject' },
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

/**
 * Admin audit log page with server-backed filtering. The route owns filter state
 * because the query model maps almost one-to-one to the backend search API.
 */
export function AuditLogPage() {
  const { t, i18n } = useTranslation()
  const allActionFilterValue = '__all_actions__'
  const [actionFilter, setActionFilter] = useState<string>('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [requestIdFilter, setRequestIdFilter] = useState('')
  const [ipFilter, setIpFilter] = useState('')
  const [resourceTypeFilter, setResourceTypeFilter] = useState('')
  const [resourceIdFilter, setResourceIdFilter] = useState('')
  const [startTimeFilter, setStartTimeFilter] = useState('')
  const [endTimeFilter, setEndTimeFilter] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditLogItem | null>(null)

  const { data, isLoading, isError, refetch } = useAuditLog({
    action: actionFilter || undefined,
    userId: userIdFilter || undefined,
    requestId: requestIdFilter || undefined,
    ipAddress: ipFilter || undefined,
    resourceType: resourceTypeFilter || undefined,
    resourceId: resourceIdFilter || undefined,
    startTime: startTimeFilter ? new Date(startTimeFilter).toISOString() : undefined,
    endTime: endTimeFilter ? new Date(endTimeFilter).toISOString() : undefined,
    page,
    size: 20,
  })

  const formatDate = (dateString: string) => {
    return formatLocalDateTime(dateString, i18n.language)
  }

  const actionLabel = (action: string) => {
    const known = ACTION_OPTIONS.find(option => option.value === action)
    return known ? t(known.labelKey) : action
  }
  let detailText = selected?.details ?? ''
  if (detailText) {
    try {
      detailText = JSON.stringify(JSON.parse(detailText), null, 2)
    } catch {
      // Historical records may contain plain text.
    }
  }

  const applySearchIndexRebuildFilter = () => {
    setActionFilter('REBUILD_SEARCH_INDEX')
    setResourceTypeFilter('SEARCH_INDEX')
    setPage(0)
  }

  const clearFilters = () => {
    setActionFilter('')
    setUserIdFilter('')
    setRequestIdFilter('')
    setIpFilter('')
    setResourceTypeFilter('')
    setResourceIdFilter('')
    setStartTimeFilter('')
    setEndTimeFilter('')
    setPage(0)
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <DashboardPageHeader title={t('auditLog.title')} />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button data-analytics-id="admin.audit.rebuild.filter" type="button" variant="outline" size="sm" onClick={applySearchIndexRebuildFilter}>
            {t('auditLog.quickFilterSearchRebuild')}
          </Button>
          <Button data-analytics-id="admin.audit.clear" type="button" variant="outline" size="sm" onClick={clearFilters}>
            {t('auditLog.clearFilters')}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            value={normalizeSelectValue(actionFilter) ?? allActionFilterValue}
            onValueChange={(value) => {
              setActionFilter(value === allActionFilterValue ? '' : value)
              setPage(0)
            }}
          >
            <SelectTrigger data-analytics-id="admin.audit.action.interact" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((option) => (
                <SelectItem data-analytics-id={option.value === '' ? 'admin.audit.action.all' : option.value === 'CLI_PUBLISH' ? 'admin.audit.action.cli.publish' : option.value === 'COMPAT_PUBLISH' ? 'admin.audit.action.compat.publish' : option.value === 'REVIEW_SUBMIT' ? 'admin.audit.action.review.submit' : option.value === 'REVIEW_APPROVE' ? 'admin.audit.action.review.approve' : option.value === 'REVIEW_REJECT' ? 'admin.audit.action.review.reject' : option.value === 'PROMOTION_SUBMIT' ? 'admin.audit.action.promotion.submit' : option.value === 'PROMOTION_APPROVE' ? 'admin.audit.action.promotion.approve' : option.value === 'PROMOTION_REJECT' ? 'admin.audit.action.promotion.reject' : option.value === 'REPORT_SKILL' ? 'admin.audit.action.report' : option.value === 'RESOLVE_SKILL_REPORT' ? 'admin.audit.action.report.resolve' : option.value === 'DISMISS_SKILL_REPORT' ? 'admin.audit.action.report.dismiss' : option.value === 'HIDE_SKILL' ? 'admin.audit.action.hide' : option.value === 'ARCHIVE_SKILL' ? 'admin.audit.action.archive' : option.value === 'UNHIDE_SKILL' ? 'admin.audit.action.unhide' : option.value === 'UNARCHIVE_SKILL' ? 'admin.audit.action.unarchive' : option.value === 'YANK_SKILL_VERSION' ? 'admin.audit.action.version.yank' : 'admin.audit.action.search.rebuild'}
                  key={option.value || allActionFilterValue}
                  value={option.value || allActionFilterValue}
                >
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input data-analytics-id="admin.audit.user.filter"
            placeholder={t('auditLog.userIdPlaceholder')}
            value={userIdFilter}
            onChange={(e) => {
              setUserIdFilter(e.target.value)
              setPage(0)
            }}
          />
          <Input data-analytics-id="admin.audit.request.filter"
            placeholder={t('auditLog.requestIdPlaceholder')}
            value={requestIdFilter}
            onChange={(e) => {
              setRequestIdFilter(e.target.value)
              setPage(0)
            }}
          />
          <Input data-analytics-id="admin.audit.ip.filter"
            placeholder={t('auditLog.ipPlaceholder')}
            value={ipFilter}
            onChange={(e) => {
              setIpFilter(e.target.value)
              setPage(0)
            }}
          />
          <Input data-analytics-id="admin.audit.type.filter"
            placeholder={t('auditLog.resourceTypePlaceholder')}
            value={resourceTypeFilter}
            onChange={(e) => {
              setResourceTypeFilter(e.target.value)
              setPage(0)
            }}
          />
          <Input data-analytics-id="admin.audit.resource.filter"
            placeholder={t('auditLog.resourceIdPlaceholder')}
            value={resourceIdFilter}
            onChange={(e) => {
              setResourceIdFilter(e.target.value)
              setPage(0)
            }}
          />
          <Input data-analytics-id="admin.audit.start.filter"
            type="datetime-local"
            value={startTimeFilter}
            onChange={(e) => {
              setStartTimeFilter(e.target.value)
              setPage(0)
            }}
          />
          <Input data-analytics-id="admin.audit.end.filter"
            type="datetime-local"
            value={endTimeFilter}
            onChange={(e) => {
              setEndTimeFilter(e.target.value)
              setPage(0)
            }}
          />
        </div>
      </Card>

      {isError ? (
        <Card role="alert" className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm text-destructive">{t('list.loadFailed')}</p>
          <Button variant="outline" onClick={() => void refetch()}>{t('reviewCenter.retry')}</Button>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-shimmer rounded-lg" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">{t('auditLog.empty')}</p>
        </Card>
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader className="max-sm:sr-only">
                <TableRow>
                  <TableHead>{t('auditLog.colTime')}</TableHead>
                  <TableHead>{t('auditLog.colAction')}</TableHead>
                  <TableHead>{t('auditLog.colUsername')}</TableHead>
                  <TableHead>{t('auditLog.resource')}</TableHead>
                  <TableHead>{t('auditLog.colDetail')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.id} className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-2 max-sm:px-3 max-sm:py-2">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground max-sm:order-3 max-sm:p-1">{formatDate(log.timestamp)}</TableCell>
                    <TableCell className="break-words font-medium max-sm:order-1 max-sm:p-1 [overflow-wrap:anywhere]">{actionLabel(log.action)}</TableCell>
                    <TableCell className="break-words max-sm:order-4 max-sm:col-span-2 max-sm:p-1 max-sm:text-xs [overflow-wrap:anywhere]">{log.username || log.userId || '—'}</TableCell>
                    <TableCell className="break-all text-muted-foreground max-sm:hidden">{[log.resourceType, log.resourceId].filter(Boolean).join(' / ') || '—'}</TableCell>
                    <TableCell className="text-right max-sm:order-2 max-sm:p-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelected(log)}>{t('list.details')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-x-4">
            <p className="text-xs text-muted-foreground">{t('auditLog.totalRecords', { total: data.total, page: page + 1 })}</p>
            <Pagination previousAnalyticsId="admin.audit.previous" nextAnalyticsId="admin.audit.next"
              page={page} totalPages={Math.ceil(data.total / 20)} onPageChange={setPage} />
          </div>
        </>
      )}
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('auditLog.detailsTitle')}</DialogTitle></DialogHeader>
          {selected && <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {[
                ['auditLog.colTime', formatDate(selected.timestamp)],
                ['auditLog.colAction', actionLabel(selected.action)],
                ['auditLog.actionCode', selected.action],
                ['auditLog.colUsername', selected.username],
                ['auditLog.colUserId', selected.userId],
                ['auditLog.colIp', selected.ipAddress],
                ['auditLog.requestId', selected.requestId],
                ['auditLog.resource', [selected.resourceType, selected.resourceId].filter(Boolean).join(' / ')],
              ].map(([key, value]) => <div key={key} className="contents"><dt className="text-muted-foreground">{t(key || '')}</dt><dd className="break-all">{value || '—'}</dd></div>)}
            </dl>
            {detailText && <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">{t('auditLog.originalDetails')}</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{detailText}</pre>
            </details>}
          </>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
