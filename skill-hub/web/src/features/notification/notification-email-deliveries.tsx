import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Mail, RefreshCw } from 'lucide-react'
import { notificationEmailApi, type EmailDeliveryPage } from './notification-email-api'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Pagination } from '@/shared/components/pagination'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'

const DELIVERY_QUERY_KEY = ['system-config', 'email-deliveries'] as const
const DELIVERY_STATUSES = ['ALL', 'PENDING', 'PREPARING', 'CLAIMED', 'SENDING', 'SENT', 'RETRY', 'FAILED', 'UNKNOWN', 'SUPPRESSED', 'MERGED']
const DELIVERY_COLUMNS = ['batch', 'recipient', 'state', 'attempts', 'created', 'actions']

type Delivery = NonNullable<EmailDeliveryPage['items']>[number]
function deliveryTone(status?: string) {
  if (status === 'SENT') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'FAILED') return 'bg-destructive/10 text-destructive'
  if (status === 'UNKNOWN') return 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
  return 'bg-muted text-muted-foreground'
}
function useDeliveryPage(page: number, status: string) {
  return useQuery({ queryKey: [...DELIVERY_QUERY_KEY, page, status], queryFn: () => notificationEmailApi.deliveries(page, status) })
}

export function NotificationEmailDeliveriesPanel() {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [detail, setDetail] = useState<Delivery | null>(null)
  const detailTrigger = useRef<HTMLElement | null>(null)
  const retryTrigger = useRef<HTMLElement | null>(null)
  function openDetail(item: Delivery) { detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDetail(item) }
  // The default history page and the recent batches share the same cached request.
  const recent = useDeliveryPage(0, '')
  const deliveries = useDeliveryPage(page, status)
  const refresh = () => client.invalidateQueries({ queryKey: DELIVERY_QUERY_KEY })
  const retry = useMutation({
    mutationFn: ({ id, risk }: { id: number; risk: boolean }) => notificationEmailApi.retry(id, risk),
    onSuccess: async () => { setSelected(null); await refresh() },
  })
  function requestRetry(item: Delivery) { retryTrigger.current = detail ? detailTrigger.current : document.activeElement instanceof HTMLElement ? document.activeElement : null; retry.reset(); setDetail(null); setSelected(item) }
  const date = (value?: string) => value ? new Date(value).toLocaleString(i18n.language) : '—'
  const rows = deliveries.data?.items
  const recentRows = recent.data?.items?.slice(0, 3)

  return <div className="min-w-0 space-y-6" data-density="compact">
    <section aria-labelledby="recent-email-deliveries" className="space-y-3 rounded-xl border p-4">
      <h3 id="recent-email-deliveries" className="text-base font-semibold">{t('notificationEmail.recentDeliveries')}</h3>
      {recent.isPending && <p role="status" className="text-sm text-muted-foreground">{t('notificationEmail.loading')}</p>}
      {recent.isError && !deliveries.isError && <p role="alert" className="text-sm text-destructive">{t('notificationEmail.loadFailed')}</p>}
      {recentRows?.length === 0 && <p className="text-sm text-muted-foreground">{t('notificationEmail.noDeliveries')}</p>}
      {!!recentRows?.length && <ul className="grid gap-3 lg:grid-cols-3">
        {recentRows.map(item => <li key={item.id} className="min-w-0 space-y-1.5 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="link" className="h-auto p-0" onClick={() => openDetail(item)}>#{item.id}</Button><span className={`rounded-md px-2 py-1 text-xs ${deliveryTone(item.status)}`}>{t(`notificationEmail.status.${item.status}`)}</span></div>
          <p className="break-all text-sm">{item.recipientId}</p>
          <p className="text-xs text-muted-foreground">{date(item.createdAt)} · {t('notificationEmail.attemptCount', { count: item.attempts })}</p>
        </li>)}
      </ul>}
    </section>

    <section aria-labelledby="email-delivery-records" className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="email-delivery-records" className="text-base font-semibold">{t('notificationEmail.deliveries')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="email-delivery-status">{t('notificationEmail.filter')}</Label>
          <Select value={status || 'ALL'} onValueChange={value => { setStatus(value === 'ALL' ? '' : value); setPage(0) }}>
            <SelectTrigger id="email-delivery-status" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{DELIVERY_STATUSES.map(item => <SelectItem value={item} key={item}>{t(item === 'ALL' ? 'notificationEmail.all' : `notificationEmail.status.${item}`)}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => void refresh()}><RefreshCw aria-hidden className="h-4 w-4" />{t('notificationEmail.refresh')}</Button>
        </div>
      </header>
      <p className="text-xs leading-5 text-muted-foreground">{t('notificationEmail.retryPolicy')}</p>
      {deliveries.isPending && <p role="status">{t('notificationEmail.loading')}</p>}
      {deliveries.isError && <p role="alert" className="text-sm text-destructive">{t('notificationEmail.loadFailed')}</p>}
      {rows?.length === 0 && <div className="rounded-lg border border-dashed py-6 text-center"><Mail aria-hidden className="mx-auto mb-2 h-5 w-5 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t('notificationEmail.noDeliveries')}</p></div>}
      {!!rows?.length && <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-muted/50"><tr>{DELIVERY_COLUMNS.map(key => <th className="whitespace-nowrap px-3 py-3 text-xs font-medium text-muted-foreground" key={key}>{t(`notificationEmail.column.${key}`)}</th>)}</tr></thead>
          <tbody>{rows.map(item => <tr key={item.id} className="border-t">
            <td className="px-3 py-3"><Button variant="link" className="h-auto p-0" onClick={() => openDetail(item)}>#{item.id}</Button>{item.mergedIntoDeliveryId ? <span className="block text-xs text-muted-foreground">{t('notificationEmail.mergedTarget', { id: item.mergedIntoDeliveryId })}</span> : null}</td>
            <td className="max-w-44 break-all px-3 py-3">{item.recipientId}</td>
            <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-md px-2 py-1 text-xs ${deliveryTone(item.status)}`}>{t(`notificationEmail.status.${item.status}`)}</span>{item.resultCode ? <span className="mt-1 block text-xs text-muted-foreground">{item.resultCode}</span> : null}</td>
            <td className="px-3 py-3">{item.attempts}</td>
            <td className="whitespace-nowrap px-3 py-3">{date(item.createdAt)}</td>
            <td className="px-3 py-3"><div className="flex gap-2"><Button size="xs" variant="ghost" onClick={() => openDetail(item)}>{t('notificationEmail.details')}</Button>{item.status === 'FAILED' || item.status === 'UNKNOWN' ? <Button size="xs" variant="outline" onClick={() => requestRetry(item)}>{t('notificationEmail.retry')}</Button> : null}</div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {deliveries.data && <Pagination compact page={page} totalPages={deliveries.data.totalPages ?? 0} onPageChange={setPage} />}
    </section>

    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null) }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); if (!selected) detailTrigger.current?.focus() }}><DialogHeader><DialogTitle>{t('notificationEmail.detailTitle', { id: detail?.id })}</DialogTitle><DialogDescription>{t('notificationEmail.deliveryMeaning')}</DialogDescription></DialogHeader>{detail && <><dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">{[[t('notificationEmail.column.recipient'), detail.recipientId], [t('notificationEmail.column.state'), t(`notificationEmail.status.${detail.status}`)], [t('notificationEmail.column.attempts'), detail.attempts], [t('notificationEmail.column.created'), date(detail.createdAt)], [t('notificationEmail.resultCode'), detail.resultCode ?? '—']].map(([label, value]) => <div key={String(label)} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>{(detail.status === 'FAILED' || detail.status === 'UNKNOWN') && <Button onClick={() => requestRetry(detail)}>{t('notificationEmail.retry')}</Button>}</>}</DialogContent></Dialog>
    <ConfirmDialog onCloseAutoFocus={event => { event.preventDefault(); retryTrigger.current?.focus() }} open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }} title={t('notificationEmail.retryTitle', { id: selected?.id })} description={<>{t(selected?.status === 'UNKNOWN' ? 'notificationEmail.duplicateRisk' : 'notificationEmail.retryHelp')}{retry.isError ? <span role="alert" className="mt-2 block text-destructive">{t('notificationEmail.actionFailed')}</span> : null}</>} confirmText={t('notificationEmail.retry')} closeOnConfirm={false} onConfirm={async () => { if (selected?.id !== undefined) { try { await retry.mutateAsync({ id: selected.id, risk: selected.status === 'UNKNOWN' }) } catch { /* Keep the dialog open with an actionable error. */ } } }} />
  </div>
}
