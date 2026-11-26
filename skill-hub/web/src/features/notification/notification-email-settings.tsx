import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { notificationEmailApi, type EmailSettings } from './notification-email-api'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Switch } from '@/shared/ui/switch'

interface EmailPanelProps {
  onDirtyChange?: (dirty: boolean) => void
  onBusyChange?: (busy: boolean) => void
}

export function NotificationEmailSettingsPanel({ onDirtyChange, onBusyChange }: EmailPanelProps) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['system-config', 'notification-email'], queryFn: notificationEmailApi.settings })
  return (
    <section className="min-w-0 space-y-4 rounded-lg border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{t('notificationEmail.adminTitle')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('notificationEmail.audienceHelp')}</p>
        </div>
        {query.data && <span className={`shrink-0 rounded-md px-2 py-1 text-xs ${query.data.smtpConfigured ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>{t(query.data.smtpConfigured ? 'notificationEmail.smtpConfiguredStatus' : 'notificationEmail.smtpMissingStatus')}</span>}
      </header>
      {query.isPending ? <p role="status">{t('notificationEmail.loading')}</p> : null}
      {query.isError ? <div role="alert"><p>{t('notificationEmail.loadFailed')}</p><Button variant="outline" onClick={() => void query.refetch()}>{t('notificationEmail.refresh')}</Button></div> : null}
      {query.data ? <EmailSettingsFields key={query.data.version} settings={query.data} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange} /> : null}
    </section>
  )
}

function EmailSettingsFields({ settings, onDirtyChange, onBusyChange }: { settings: EmailSettings; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [enabled, setEnabled] = useState(settings.enabled ?? false)
  const [windowMinutes, setWindowMinutes] = useState(String(settings.digestWindowMinutes ?? 60))
  const [publicBaseUrl, setPublicBaseUrl] = useState(settings.publicBaseUrl ?? '')
  const [saved, setSaved] = useState(false)
  const dirty = enabled !== (settings.enabled ?? false) || windowMinutes !== String(settings.digestWindowMinutes ?? 60) || publicBaseUrl !== (settings.publicBaseUrl ?? '')
  const update = useMutation({ mutationFn: notificationEmailApi.updateSettings, onSuccess: async () => { setSaved(true); await client.invalidateQueries({ queryKey: ['system-config', 'notification-email'] }) } })
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange?.(update.isPending) }, [update.isPending, onBusyChange])
  function discard() { setEnabled(settings.enabled ?? false); setWindowMinutes(String(settings.digestWindowMinutes ?? 60)); setPublicBaseUrl(settings.publicBaseUrl ?? ''); setSaved(false); update.reset() }
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); if (!dirty || update.isPending) return; setSaved(false); update.mutate({ enabled, digestWindowMinutes: Number(windowMinutes), publicBaseUrl, version: settings.version }) }}>
    <div className="flex items-center justify-between gap-4 border-b pb-4">
      <div className="min-w-0 space-y-1"><Label htmlFor="business-email-enabled">{t('notificationEmail.enabled')}</Label><p id="business-email-enabled-help" className="text-xs leading-5 text-muted-foreground">{t('notificationEmail.enabledDraftHelp')}</p></div>
      <Switch id="business-email-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={update.isPending} aria-describedby="business-email-enabled-help" />
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{t('notificationEmail.smtpConfigurationHelp')}</p>
    <fieldset disabled={update.isPending} className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="email-digest-window">{t('notificationEmail.window')} <span aria-hidden className="text-destructive">*</span></Label><Input id="email-digest-window" type="number" min={5} max={1440} required value={windowMinutes} onChange={(event) => setWindowMinutes(event.target.value)} /><p className="text-xs leading-5 text-muted-foreground">{t('notificationEmail.windowHelp')}</p></div><div className="space-y-1.5"><Label htmlFor="email-base-url">{t('notificationEmail.baseUrl')}</Label><Input id="email-base-url" type="url" required={enabled} value={publicBaseUrl} onChange={(event) => setPublicBaseUrl(event.target.value)} placeholder="https://skills.example.com" /><p className="text-xs leading-5 text-muted-foreground">{t('notificationEmail.baseUrlHelp')}</p></div></fieldset>
    {update.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t(update.error instanceof ApiError && update.error.status === 409 ? 'notificationEmail.conflict' : 'notificationEmail.actionFailed')}</p><Button type="button" variant="outline" onClick={() => void client.invalidateQueries({ queryKey: ['system-config', 'notification-email'] })}>{t('notificationEmail.refresh')}</Button></div> : null}
    {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{t('systemConfig.saved')}</p>}
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">{t(dirty ? 'systemConfig.unsaved' : 'systemConfig.upToDate')}</span><div className="ml-auto flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={!dirty || update.isPending} onClick={discard}>{t('systemConfig.discard')}</Button><Button disabled={!dirty || update.isPending || (enabled && !settings.smtpConfigured)} type="submit">{t(update.isPending ? 'systemConfig.saving' : 'notificationEmail.save')}</Button></div></footer>
  </form>
}
