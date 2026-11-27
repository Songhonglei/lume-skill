import { useEffect, useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UploadZone } from '@/features/publish/upload-zone'
import { packageFolderAsZip } from '@/features/publish/folder-zip'
import {
  extractPrecheckWarnings,
  isFrontmatterFailureMessage,
  isPrecheckConfirmationMessage,
  isPrecheckFailureMessage,
  isVersionExistsMessage,
} from '@/features/publish/publish-error-utils'
import { useAuth } from '@/features/auth/use-auth'
import { readPublishDraft, savePublishDraft } from '@/features/publish/publish-draft'
import { normalizePublishPrefill } from '@/features/publish/publish-prefill'
import { Button } from '@/shared/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  normalizeSelectValue,
} from '@/shared/ui/select'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Label } from '@/shared/ui/label'
import { stripMarkdownFrontmatter } from '@/features/skill/markdown-frontmatter'
import { PublishResultPanel } from '@/features/publish/publish-result-panel'
import { classifyPublishFailure, type PublishSubmissionState } from '@/features/publish/publish-result'
import { MarkdownRenderer } from '@/features/skill/markdown-renderer'
import { readPackageOverview } from '@/features/publish/package-overview'
import { PresentationEditor } from '@/features/publish/presentation-editor'
import { packageSummary, presentationPayload, publishedOverrides, SHORT_DESCRIPTION_LIMIT, type PresentationSource } from '@/features/publish/presentation-source'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Pencil, RotateCcw } from 'lucide-react'
import { SkillAvatarEditor, KEEP_AVATAR, type AvatarEdit } from '@/features/skill/skill-avatar-editor'
import { SkillAvatarManager } from '@/features/skill/skill-avatar-manager'
import { previewSkillPackage, resolveExternalSkillPackage, usePublishSkill, useSkillDetail, useSkillVersionDetail } from '@/shared/hooks/use-skill-queries'
import { getSkillDetailQueryKey } from '@/shared/hooks/query-keys'
import { useMyNamespaces } from '@/shared/hooks/use-namespace-queries'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DashboardPageHeader } from '@/shared/components/dashboard-page-header'
import { navigateAfterOverlays } from '@/shared/lib/navigate-after-overlays'
import { toast } from '@/shared/lib/toast'
import { refreshSkillPermissionsAfterForbidden } from '@/features/skill/refresh-skill-permissions'
import { ApiError, skillAvatarApi } from '@/api/client'

const EMPTY_NAMESPACE_VALUE = '__select_namespace__'

export function PublishPage() {
  const { user } = useAuth(false)
  const search = useSearch({ from: '/dashboard/publish' })
  const identity = JSON.stringify([user?.userId, search.namespace, search.updateSkill, search.resubmitSkill, search.resubmitVersion, search.visibility])
  const draftKey = user?.userId ? `luma.publish-draft:${identity}` : ''
  return <PublishForm key={identity} search={search} draftKey={draftKey} />
}

type PublishSearch = Parameters<typeof normalizePublishPrefill>[0] & { updateSkill?: string; updateName?: string }

function PublishForm({ search, draftKey }: { search: PublishSearch; draftKey: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [restoredDraft] = useState(() => readPublishDraft(draftKey))
  const prefill = normalizePublishPrefill(search)
  const updateSlug = typeof search.updateSkill === 'string' ? search.updateSkill : prefill.resubmitSkill
  const isUpdate = !!search.updateSkill && !prefill.resubmitSkill
  const queryClient = useQueryClient()
  const submitting = useRef(false)
  const [isSavingAvatar, setIsSavingAvatar] = useState(false)
  const [avatarEdit, setAvatarEdit] = useState<AvatarEdit>(KEEP_AVATAR)
  const previewId = useId()
  const [fileRevision, setFileRevision] = useState(0)
  const [displayName, setDisplayName] = useState(restoredDraft?.displayName ?? '')
  const [shortDescription, setShortDescription] = useState(restoredDraft?.shortDescription ?? '')
  const [overview, setOverview] = useState(restoredDraft?.overview ?? '')
  const [editorOpen, setEditorOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submissionState, setSubmissionState] = useState<PublishSubmissionState | null>(null)
  const [shortSource, setShortSource] = useState<PresentationSource>(restoredDraft?.shortSource ?? 'package')
  const [overviewSource, setOverviewSource] = useState<PresentationSource>(restoredDraft?.overviewSource ?? 'package')
  const [attempted, setAttempted] = useState(false)
  const [viewOverview, setViewOverview] = useState(false)
  const [restoreField, setRestoreField] = useState<'short' | 'overview' | null>(null)
  const editorOriginal = useRef('')
  const restoredFocus = useRef<string | null>(null)
  const restoreOpener = useRef<HTMLButtonElement | null>(null)
  const initialized = useRef('')
  const sourceTouched = useRef({ short: restoredDraft?.shortTouched ?? false, overview: restoredDraft?.overviewTouched ?? false })
  const resourceIdentity = `${prefill.namespace}/${updateSlug}`
  const displayNameEdited = useRef(restoredDraft?.displayName !== undefined)
  const shortDescriptionEdited = useRef(Boolean(restoredDraft?.shortTouched))
  const overviewEdited = useRef(Boolean(restoredDraft?.overviewTouched))
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sourceMode, setSourceMode] = useState<'local' | 'external'>(restoredDraft?.externalSourceUrl ? 'external' : 'local')
  const [sourceInput, setSourceInput] = useState(restoredDraft?.externalSourceUrl ?? '')
  const [externalSourceUrl, setExternalSourceUrl] = useState<string>()
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [mustReselectPackage, setMustReselectPackage] = useState(restoredDraft?.hadPackage ?? false)
  const [namespaceSlug, setNamespaceSlug] = useState(restoredDraft?.namespace ?? prefill.namespace)
  const [visibility, setVisibility] = useState(restoredDraft?.visibility ?? prefill.visibility)
  const [visibilityEdited, setVisibilityEdited] = useState(restoredDraft?.visibilityEdited ?? false)
  const [warningDialogOpen, setWarningDialogOpen] = useState(false)
  const [precheckWarnings, setPrecheckWarnings] = useState<string[]>([])
  const [isPackaging, setIsPackaging] = useState(false)
  const [folderError, setFolderError] = useState('')
  const selectionGeneration = useRef(0)
  const resourceReady = !updateSlug || namespaceSlug === prefill.namespace
  useEffect(() => () => { selectionGeneration.current += 1 }, [])

  const { data: namespaces, isLoading: isLoadingNamespaces } = useMyNamespaces()
  const publishMutation = usePublishSkill()
  const { data: updateTarget } = useSkillDetail(namespaceSlug, updateSlug ?? '', resourceReady && !!namespaceSlug && !!updateSlug)
  const ownerReadOnly = updateTarget?.ownerReadOnly === true
  useEffect(() => { if (ownerReadOnly) { setEditorOpen(false); setConfirmOpen(false); setWarningDialogOpen(false); setRestoreField(null); setViewOverview(false) } }, [ownerReadOnly])
  const packagePreview = useQuery({
    queryKey: ['skill-package-preview', previewId, resourceIdentity, fileRevision],
    queryFn: () => previewSkillPackage(selectedFile!),
    enabled: resourceReady && selectedFile !== null,
    retry: false,
    gcTime: 0,
  })
  const packageOverview = useQuery({
    queryKey: ['skill-package-overview', previewId, resourceIdentity, fileRevision],
    queryFn: ({ signal }) => readPackageOverview(selectedFile!, signal),
    enabled: resourceReady && selectedFile !== null && packagePreview.isSuccess && !packagePreview.data?.overview,
    retry: false,
    gcTime: 0,
  })
  const packageShort = packagePreview.data?.shortDescription ?? packagePreview.data?.description ?? ''
  const summary = packageSummary(packageShort)
  const shortenedPackageSummary = summary !== packageShort && shortSource === 'package'
  const packageBody = packagePreview.data?.overview || packageOverview.data?.content || ''
  const readingPackageOverview = selectedFile !== null && packagePreview.isSuccess && !packagePreview.data?.overview && packageOverview.isPending
  const readingOverview = overviewSource === 'package' && readingPackageOverview
  const overviewPreviewFailed = overviewSource === 'package' && (packageOverview.isError || !!packageOverview.data?.error)
  const previewOverview = resourceReady ? (overviewSource === 'custom' ? overview : packageBody) : ''
  const previewShortDescription = resourceReady ? (shortSource === 'custom' ? shortDescription : summary) : ''
  const shortInvalid = !previewShortDescription.trim() || previewShortDescription.length > SHORT_DESCRIPTION_LIMIT
  const overviewInvalid = !stripMarkdownFrontmatter(previewOverview).trim() || previewOverview.length > 20000
  const { data: publishedDetail, isLoading: readingPublished, isError: publishedFailed, refetch: retryPublished } = useSkillVersionDetail(namespaceSlug, updateSlug ?? '', updateTarget?.publishedVersion?.version, resourceReady && !!updateSlug && !!updateTarget?.publishedVersion?.version)
  useEffect(() => {
    const key = `${namespaceSlug}/${updateSlug}/${publishedDetail?.version}`
    if (!resourceReady || !publishedDetail || initialized.current === key) return
    initialized.current = key
    const previous = publishedOverrides(publishedDetail.parsedMetadataJson)
    if (!sourceTouched.current.short && !shortDescriptionEdited.current && previous.short !== undefined) { shortDescriptionEdited.current = true; setShortDescription(previous.short); setShortSource('custom') }
    if (!sourceTouched.current.overview && !overviewEdited.current && previous.overview !== undefined) { overviewEdited.current = true; setOverview(previous.overview); setOverviewSource('custom') }
  }, [namespaceSlug, updateSlug, publishedDetail, resourceReady])
  useEffect(() => {
    if (resourceReady && selectedFile && packagePreview.data && !displayNameEdited.current) {
      setDisplayName(packagePreview.data.displayName ?? packagePreview.data.name ?? '')
    }

  }, [packagePreview.data, resourceReady, selectedFile])
  const avatarTarget = useQuery({ queryKey: ['skill-avatar', namespaceSlug, updateSlug], queryFn: () => skillAvatarApi.status(namespaceSlug, updateSlug), enabled: resourceReady && !!namespaceSlug && !!updateSlug })
  const avatarUnavailable = !!updateSlug && (avatarTarget.isLoading || avatarTarget.isError)
  const isBusy = publishMutation.isPending || isSavingAvatar
  const avatarOnly = isUpdate && !selectedFile && !mustReselectPackage && sourceMode === 'local'
  const selectedNamespace = namespaces?.find((ns) => ns.slug === namespaceSlug)
  const useTeamDefault = !updateSlug && !search.visibility && !visibilityEdited && selectedNamespace?.type === 'TEAM'
  const effectiveVisibility = useTeamDefault ? 'NAMESPACE_ONLY' : visibility
  const namespaceOnlyLabel = selectedNamespace?.type === 'GLOBAL'
    ? t('publish.visibilityOptions.loggedInUsersOnly')
    : t('publish.visibilityOptions.namespaceOnly')
  const audience = effectiveVisibility === 'PUBLIC'
    ? t('publish.audience.public')
    : effectiveVisibility === 'PRIVATE' ? t('publish.audience.private')
    : selectedNamespace?.type === 'GLOBAL' ? t('publish.audience.global')
    : t('publish.audience.team', { namespace: selectedNamespace?.displayName ?? namespaceSlug })

  const draftChanged = Boolean(selectedFile || mustReselectPackage || namespaceSlug !== prefill.namespace || visibilityEdited ||
    displayNameEdited.current || sourceTouched.current.short || sourceTouched.current.overview)
  const accepted = submissionState?.kind === 'accepted'
  const shouldProtect = !accepted && (draftChanged || avatarEdit.action !== 'KEEP' || isPackaging || importing || isBusy)
  const blocker = useBlocker({
    shouldBlockFn: () => shouldProtect && !editorOpen && !isBusy && !submitting.current,
    enableBeforeUnload: shouldProtect && !editorOpen,
    withResolver: true,
  })
  useEffect(() => {
    if (accepted || !draftChanged) {
      savePublishDraft(draftKey)
      return
    }
    savePublishDraft(draftKey, {
      namespace: namespaceSlug, visibility, visibilityEdited, hadPackage: Boolean(selectedFile || mustReselectPackage),
      externalSourceUrl: externalSourceUrl || (sourceMode === 'external' && mustReselectPackage ? restoredDraft?.externalSourceUrl : undefined),
      displayName: displayNameEdited.current ? displayName : undefined,
      shortDescription, overview, shortSource, overviewSource,
      shortTouched: sourceTouched.current.short, overviewTouched: sourceTouched.current.overview,
    })
  }, [draftKey, accepted, draftChanged, displayName, namespaceSlug, visibility, visibilityEdited, selectedFile,
    mustReselectPackage, shortDescription, overview, shortSource, overviewSource, externalSourceUrl, sourceMode, restoredDraft?.externalSourceUrl])
  const canSubmit = resourceReady && !ownerReadOnly && !isPackaging && !importing && (!selectedFile || packagePreview.isSuccess) && displayName.trim().length <= 200 && (avatarOnly || (!shortInvalid && !overviewInvalid && !readingOverview && !readingPublished && !publishedFailed)) && !!namespaceSlug && avatarEdit.ready && !avatarUnavailable && !isBusy && (selectedFile !== null || (avatarOnly && avatarEdit.action !== 'KEEP'))

  const handleRemoveSelectedFile = () => {
    selectionGeneration.current += 1
    setFolderError('')
    setSelectedFile(null)
    if (selectedFile) setFileRevision(value => value + 1)
    setExternalSourceUrl(undefined)
    setMustReselectPackage(false)
    setPrecheckWarnings([])
    setWarningDialogOpen(false)
  }

  const handleFileSelect = (file: File | null) => {
    selectionGeneration.current += 1
    setFolderError('')
    setSelectedFile(file)
    setMustReselectPackage(false)
    setFileRevision(value => value + 1)
    setPrecheckWarnings([])
    setWarningDialogOpen(false)
  }

  const importExternal = async () => {
    if (!sourceInput.trim() || importing) return
    setImporting(true)
    setImportError('')
    try {
      const imported = await resolveExternalSkillPackage(sourceInput.trim())
      handleFileSelect(imported.file)
      setSourceInput(imported.sourceUrl)
      setExternalSourceUrl(imported.sourceUrl)
    } catch (error) {
      setImportError(error instanceof ApiError ? error.message : t('publish.external.failed'))
    } finally {
      setImporting(false)
    }
  }

  const handleFolderSelect = async (files: File[]) => {
    const generation = ++selectionGeneration.current
    setFolderError('')
    setIsPackaging(true)
    try {
      const zip = await packageFolderAsZip(files)
      if (generation !== selectionGeneration.current) return
      setIsPackaging(false)
      handleFileSelect(zip)
    } catch {
      if (generation === selectionGeneration.current) setFolderError(t('publish.folderPackagingFailed'))
    } finally {
      if (generation === selectionGeneration.current) setIsPackaging(false)
    }
  }

  const publishSkill = async (confirmWarnings = false) => {
    if (submitting.current) return
    if (!canSubmit) {
      toast.error(t(ownerReadOnly ? 'mySkills.ownerReadOnly' : 'publish.selectRequired'))
      return
    }

    submitting.current = true
    setWarningDialogOpen(false)
    setConfirmOpen(false)
    setEditorOpen(false)
    setViewOverview(false)
    setRestoreField(null)
    if (!avatarOnly) setSubmissionState({ kind: 'submitting', label: displayName, version: packagePreview.data?.version })
    try {
      if (avatarOnly) {
        setIsSavingAvatar(true)
        if (avatarEdit.action === 'REMOVE') await skillAvatarApi.delete(namespaceSlug, updateSlug)
        else await skillAvatarApi.submit(namespaceSlug, updateSlug, avatarEdit.uploadId!)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['skills'], refetchType: avatarEdit.action === 'REMOVE' ? 'all' : 'active' }),
          queryClient.invalidateQueries({ queryKey: ['skill-avatar', namespaceSlug, updateSlug] }),
          queryClient.invalidateQueries({ queryKey: ['reviews'] }),
        ])
        toast.success(t('publish.avatarSaved'), t(avatarEdit.action === 'REMOVE' ? 'skillAvatar.removedNotice' : 'skillAvatar.submittedNotice'))
        navigateAfterOverlays(() => { navigate({ to: '/dashboard/skills' }) })
        return
      }
      const result = await publishMutation.mutateAsync({
        namespace: namespaceSlug,
        file: selectedFile!,
        externalSourceUrl,
        visibility: effectiveVisibility,
        confirmWarnings,
        avatarAction: avatarEdit.action,
        avatarUploadId: avatarEdit.uploadId,
        expectedSlug: updateSlug || undefined,
        displayName,
        ...presentationPayload(shortenedPackageSummary ? 'custom' : shortSource, overviewSource, previewShortDescription, overview),
      })
      setPrecheckWarnings([])
      setWarningDialogOpen(false)
      savePublishDraft(draftKey)
      setSubmissionState({ kind: 'accepted', result, hadPublishedVersion: !!updateTarget?.publishedVersion })
    } catch (error) {
      // A package rejection may also reflect changed membership. Re-read the
      // server state instead of inferring permissions from its localized message.
      if (updateSlug && !avatarOnly && error instanceof ApiError && error.status === 400) {
        await queryClient.invalidateQueries({ queryKey: getSkillDetailQueryKey(namespaceSlug, updateSlug ?? '') })
      }
      // Avatar-only updates call the API directly rather than a mutation.
      if (avatarOnly) await refreshSkillPermissionsAfterForbidden(queryClient, error)
      if (!avatarOnly) { const failure = classifyPublishFailure(error, packagePreview.data?.version); if (failure) { setSubmissionState(failure); return } setSubmissionState(null) }
      if (error instanceof ApiError && error.status === 408) {
        toast.error(t('publish.timeoutTitle'), t('publish.timeoutDescription'))
        return
      }

      if (error instanceof ApiError && isVersionExistsMessage(error.serverMessage || error.message)) {
        toast.error(
          t('publish.versionExistsTitle'),
          t('publish.versionExistsDescription'),
        )
        return
      }

      if (error instanceof ApiError && isPrecheckConfirmationMessage(error.serverMessage || error.message)) {
        setPrecheckWarnings(extractPrecheckWarnings(error.serverMessage || error.message))
        setWarningDialogOpen(true)
        return
      }

      if (error instanceof ApiError && isPrecheckFailureMessage(error.serverMessage || error.message)) {
        toast.error(
          t('publish.precheckFailedTitle'),
          error.serverMessage || t('publish.precheckFailedDescription'),
        )
        return
      }

      if (error instanceof ApiError && isFrontmatterFailureMessage(error.serverMessage || error.message)) {
        toast.error(
          t('publish.frontmatterFailedTitle'),
          error.serverMessage || t('publish.frontmatterFailedDescription'),
        )
        return
      }

      toast.error(t('publish.error'), error instanceof Error ? error.message : '')
    } finally {
      submitting.current = false
      setIsSavingAvatar(false)
    }
  }

  const handlePublish = async () => {
    await publishSkill(false)
  }

  const openOverviewEditor = () => {
    editorOriginal.current = previewOverview
    setEditorOpen(true)
  }

  const restorePackageContent = () => {
    if (!restoreField || ownerReadOnly || isBusy || !selectedFile || !packagePreview.isSuccess) return
    sourceTouched.current[restoreField] = true
    if (restoreField === 'short') {
      setShortSource('package')
      setShortDescription('')
      shortDescriptionEdited.current = false
    } else {
      setOverviewSource('package')
      setOverview('')
      overviewEdited.current = false
    }
    restoredFocus.current = restoreField === 'short' ? 'skill-short-description' : 'skill-overview-label'
    setRestoreField(null)
  }

  const focusField = (id: string) => {
    const field = document.getElementById(id)
    field?.scrollIntoView?.({ block: 'center' })
    field?.focus()
  }

  const showPublicationFields = isUpdate || (selectedFile !== null && packagePreview.isSuccess)
  const missingFields = [
    { id: 'publish-package-section', invalid: !selectedFile, label: 'publish.file' },
    { id: 'namespace', invalid: !namespaceSlug, label: 'publish.namespace' },
    { id: 'skill-short-description', invalid: shortInvalid, label: 'publish.shortDescription' },
    { id: 'skill-overview-label', invalid: overviewInvalid, label: 'publish.overview' },
  ].filter(field => field.invalid)

  return (
    <div className="mx-auto w-full max-w-[50rem] animate-fade-up">
      {submissionState && <PublishResultPanel
        state={submissionState}
        onReturnToForm={() => {
          setSubmissionState(null)
          requestAnimationFrame(() => {
            const action = document.getElementById('publish-confirm-action')
            focusField(action?.hasAttribute('disabled') ? 'publish-form-heading' : 'publish-confirm-action')
          })
        }}
        onReplacePackage={() => {
          setSubmissionState(null)
          requestAnimationFrame(() => focusField(`${previewId}-replace-action`))
        }}
        onViewMySkills={() => navigate({ to: '/dashboard/skills' })}
        onViewVersion={result => navigate({ to: '/space/$namespace/$slug', params: { namespace: result.namespace, slug: result.slug }, search: { version: result.version } })}
      />}
      <div hidden={!!submissionState} inert={!!submissionState} className="space-y-5">
        <div id="publish-form-heading" tabIndex={-1}>
          <DashboardPageHeader title={t(isUpdate ? 'publish.updateTitle' : 'publish.title')} />
        </div>

        {showPublicationFields && attempted && !avatarOnly && missingFields.length > 0 && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <p>{t('publish.source.requiredSummary')}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {missingFields.map(field => <button key={field.id} type="button" className="underline underline-offset-4" onClick={() => focusField(field.id)}>{t(field.label)}</button>)}
          </div>
        </div>}
        {publishedFailed && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <p>{t('publish.source.historyUnavailable')}</p>
          <Button type="button" variant="outline" onClick={() => retryPublished()}>{t('publish.retryPackagePreview')}</Button>
        </div>}
        {ownerReadOnly && <p role="status" className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{t('mySkills.ownerReadOnly')}</p>}
        {prefill.resubmitSkill && prefill.resubmitVersion && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold">{t('publish.resubmitNotice.title', { skill: `@${prefill.namespace}/${prefill.resubmitSkill}`, version: prefill.resubmitVersion })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('publish.resubmitNotice.description')}</p>
        </div>}

        <div className="min-w-0 space-y-4">
          <section id="publish-package-section" tabIndex={-1} aria-labelledby="publish-package-label" aria-invalid={attempted && !avatarOnly && !selectedFile} className="min-w-0 space-y-3 scroll-mt-24 rounded-xl border bg-card p-4 sm:p-6">
            <h2 id="publish-package-label" className="flex items-center gap-2.5 text-base font-semibold">
              <span aria-hidden="true" className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs text-primary">1</span>
              {t('publish.form.package')}
            </h2>
            {isUpdate && <p className="text-sm text-muted-foreground">{t('publish.optionalPackage')}</p>}
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('publish.external.source')}>
              {(['local', 'external'] as const).map(mode => (
                <Button key={mode} type="button" size="sm" variant={sourceMode === mode ? 'soft' : 'outline'}
                  aria-pressed={sourceMode === mode} disabled={ownerReadOnly || importing || isBusy || isPackaging}
                  onClick={() => {
                    if (mode === sourceMode) return
                    handleRemoveSelectedFile()
                    setImportError('')
                    setSourceMode(mode)
                  }}>
                  {t(`publish.external.${mode}`)}
                </Button>
              ))}
            </div>
            {sourceMode === 'local' ? (
              <UploadZone
                key={`${namespaceSlug}/${updateSlug}`}
                formatHint={t('publish.packageFormatHint')}
                analyticsId="skill.package.select"
                folderAnalyticsId="skill.package.folder.select"
                pickerAnalyticsId="skill.package.folder.open"
                selectedFile={selectedFile}
                previewStatus={selectedFile ? packagePreview.isPending ? 'reading' : packagePreview.isError ? 'error' : packagePreview.isSuccess ? 'ready' : 'idle' : 'idle'}
                previewError={packagePreview.isError ? t('publish.packagePreviewFailed') : undefined}
                isPackaging={isPackaging}
                onFileSelect={handleFileSelect}
                onFolderSelect={handleFolderSelect}
                onRemove={() => {
                  handleRemoveSelectedFile()
                  requestAnimationFrame(() => focusField('publish-package-section'))
                }}
                replaceActionId={`${previewId}-replace-action`}
                disabled={ownerReadOnly || isBusy}
              />
            ) : (
              <form aria-busy={importing} className="space-y-2 rounded-lg border bg-background p-3" onSubmit={event => { event.preventDefault(); void importExternal() }}>
                <Label htmlFor="external-skill-url">{t('publish.external.url')}</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="external-skill-url" type="url" maxLength={2048} value={sourceInput}
                    className="min-w-0 flex-1" disabled={importing || ownerReadOnly || isBusy}
                    placeholder="https://github.com/owner/repo/tree/main/skill"
                    aria-describedby="external-skill-help" onChange={event => {
                      setSourceInput(event.target.value)
                      setImportError('')
                      handleRemoveSelectedFile()
                    }} />
                  <Button type="submit" variant="outline" disabled={!sourceInput.trim() || importing || ownerReadOnly || isBusy}>
                    {t(importing ? 'publish.external.checking' : 'publish.external.import')}
                  </Button>
                </div>
                <p id="external-skill-help" className="text-xs text-muted-foreground">{t('publish.external.help')}</p>
                {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
                {selectedFile && (packagePreview.isPending || packagePreview.isSuccess) && <p role="status" className="text-xs font-medium">{t(packagePreview.isSuccess ? 'publish.external.checked' : 'publish.readingPackage')}</p>}
              </form>
            )}
            {selectedFile && packagePreview.data && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="[overflow-wrap:anywhere]"><code>{packagePreview.data.name}</code> · {packagePreview.data.version}</span>
                {packagePreview.data.examplesStatus === 'ready' && <span role="status">{t('publish.examplesReady', { count: packagePreview.data.examplesCount })}</span>}
                {packagePreview.data.examplesStatus === 'none' && <span>{t('publish.examplesNone')}</span>}
                {packagePreview.data.examplesStatus === 'invalid' && <span role="status">{t('publish.examplesInvalid')}</span>}
              </div>
            )}
            {mustReselectPackage && <p role="status" className="text-sm text-muted-foreground">{t(sourceMode === 'external' ? 'publish.external.reimport' : 'publish.form.reselectPackage')}</p>}
            {folderError && <p role="alert" className="text-sm text-destructive">{folderError}</p>}
            {sourceMode === 'external' && selectedFile && packagePreview.isError && <p role="alert" className="text-sm text-destructive">{t('publish.packagePreviewFailed')}</p>}
            {selectedFile && packagePreview.isError && <Button data-analytics-id="skill.package.preview.retry" type="button" size="sm" variant="outline" disabled={ownerReadOnly || isBusy} onClick={() => packagePreview.refetch()}>{t('publish.retryPackagePreview')}</Button>}
          </section>

          <section hidden={!showPublicationFields} aria-labelledby="publish-details-heading" className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6">
            <h2 id="publish-details-heading" className="flex items-center gap-2.5 text-base font-semibold">
              <span aria-hidden="true" className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs text-primary">2</span>
              {t('publish.form.details')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="namespace">{t('publish.namespace')} <span className="text-destructive">*</span></Label>
                {isLoadingNamespaces ? <div className="h-[var(--control-height)] animate-shimmer rounded-lg" /> : <Select
                  disabled={!!updateSlug || ownerReadOnly || isBusy}
                  value={normalizeSelectValue(namespaceSlug) ?? EMPTY_NAMESPACE_VALUE}
                  onValueChange={value => { setNamespaceSlug(value === EMPTY_NAMESPACE_VALUE ? '' : value); setAvatarEdit(KEEP_AVATAR) }}
                >
                  <SelectTrigger data-analytics-id="skill.publish.namespace.interact" id="namespace" aria-invalid={attempted && !namespaceSlug}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem data-analytics-id="skill.publish.namespace.clear" value={EMPTY_NAMESPACE_VALUE}>{t('publish.selectNamespace')}</SelectItem>
                    {namespaces?.map(ns => <SelectItem data-analytics-id="skill.publish.namespace.select" key={ns.slug} value={ns.slug}>{ns.displayName} (@{ns.slug})</SelectItem>)}
                  </SelectContent>
                </Select>}
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="visibility">{t('publish.visibility')} <span className="text-destructive">*</span></Label>
                <Select value={effectiveVisibility} onValueChange={value => { setVisibility(value); setVisibilityEdited(true) }} disabled={ownerReadOnly || isBusy || avatarOnly}>
                  <SelectTrigger data-analytics-id="skill.publish.visibility.interact" id="visibility" aria-describedby="publish-visibility-help"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem data-analytics-id="skill.publish.visibility.public" value="PUBLIC">{t('publish.visibilityOptions.public')}</SelectItem>
                    <SelectItem data-analytics-id="skill.publish.visibility.namespace" value="NAMESPACE_ONLY">{namespaceOnlyLabel}</SelectItem>
                    <SelectItem data-analytics-id="skill.publish.visibility.private" value="PRIVATE">{t('publish.visibilityOptions.private')}</SelectItem>
                  </SelectContent>
                </Select>
                <p id="publish-visibility-help" className="text-xs leading-5 text-muted-foreground">{namespaceSlug ? audience : null}</p>
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="skill-display-name">{t('publish.displayName')}</Label>
              <Input
                id="skill-display-name"
                value={resourceReady ? displayName : ''}
                maxLength={200}
                disabled={ownerReadOnly || isBusy || !selectedFile}
                placeholder={isUpdate ? search.updateName : t('publish.displayNamePlaceholder')}
                aria-describedby="skill-display-name-help"
                onChange={event => { displayNameEdited.current = true; setDisplayName(event.target.value) }}
              />
              <p id="skill-display-name-help" className="text-xs leading-5 text-muted-foreground">{t('publish.form.nameHelp')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-short-description">{t('publish.shortDescription')} <span className="text-destructive">*</span></Label>
              <Textarea
                aria-label={t('publish.shortDescription')}
                aria-required
                id="skill-short-description"
                rows={3}
                className="min-h-20 resize-y"
                maxLength={SHORT_DESCRIPTION_LIMIT}
                value={previewShortDescription}
                disabled={ownerReadOnly || isBusy}
                aria-invalid={attempted && shortInvalid}
                aria-describedby={`skill-short-description-help${shortInvalid && selectedFile ? ' skill-short-description-error' : ''}`}
                onChange={event => {
                  if (event.target.value === previewShortDescription) return
                  sourceTouched.current.short = true
                  shortDescriptionEdited.current = true
                  setShortDescription(event.target.value)
                  setShortSource('custom')
                }}
              />
              <div id="skill-short-description-help" className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{t(shortSource === 'custom' ? 'publish.form.customized' : shortenedPackageSummary ? 'publish.form.shortenedPackageSummary' : 'publish.form.packageContent')}</span>
                  {shortSource === 'custom' && <button type="button" className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline focus-visible:underline disabled:opacity-50" disabled={ownerReadOnly || isBusy || !selectedFile || !packagePreview.isSuccess} onClick={event => { restoreOpener.current = event.currentTarget; setRestoreField('short') }}><RotateCcw aria-hidden className="h-3 w-3" />{t('publish.form.restore')}</button>}
                </div>
                <span className="tabular-nums">{previewShortDescription.length} / {SHORT_DESCRIPTION_LIMIT}</span>
              </div>
              {shortInvalid && selectedFile && <p id="skill-short-description-error" role={attempted ? 'alert' : 'status'} className={attempted ? 'text-sm text-destructive' : 'text-sm text-amber-700 dark:text-amber-400'}>{t('publish.source.shortRequired')}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="skill-overview-label" tabIndex={-1} className="text-sm font-medium scroll-mt-24">{t('publish.overview')} <span className="text-destructive">*</span></h3>
                <Button type="button" variant="outline" size="sm" disabled={ownerReadOnly || isBusy || readingOverview || readingPublished || (!!selectedFile && packagePreview.isPending)} onClick={openOverviewEditor}><Pencil className="h-3.5 w-3.5" aria-hidden />{t('publish.editOverview')}</Button>
              </div>
              <div className="rounded-lg border bg-background p-3 sm:p-4" aria-labelledby="skill-overview-label" aria-describedby={overviewInvalid && selectedFile ? 'skill-overview-error' : undefined}>
                {readingOverview ? <p role="status" className="text-sm text-muted-foreground">{t('publish.readingOverview')}</p> : overviewPreviewFailed ? <p role="status" className="text-sm text-muted-foreground">{t('publish.overviewPreviewUnavailable')}</p> : previewOverview.trim() ? <div className="max-h-44 overflow-y-auto [overflow-wrap:anywhere]"><MarkdownRenderer content={previewOverview} /></div> : <p className="text-sm text-muted-foreground">{t('publish.emptyOverview')}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{t(overviewSource === 'custom' ? 'publish.form.customized' : 'publish.form.packageContent')}</span>
                  {overviewSource === 'custom' && <button type="button" className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline focus-visible:underline disabled:opacity-50" disabled={ownerReadOnly || isBusy || !selectedFile || !packagePreview.isSuccess || readingPackageOverview} onClick={event => { restoreOpener.current = event.currentTarget; setRestoreField('overview') }}><RotateCcw aria-hidden className="h-3 w-3" />{t('publish.form.restore')}</button>}
                </div>
                {previewOverview.trim() && <button type="button" className="underline-offset-4 hover:underline focus-visible:underline" disabled={isBusy} onClick={() => setViewOverview(true)}>{t('publish.source.view')}</button>}
              </div>
              {overviewInvalid && selectedFile && <p id="skill-overview-error" role={attempted ? 'alert' : 'status'} className={attempted ? 'text-sm text-destructive' : 'text-sm text-amber-700 dark:text-amber-400'}>{t('publish.source.overviewRequired')}</p>}
              {overviewPreviewFailed && <Button type="button" variant="outline" disabled={ownerReadOnly || isBusy} onClick={() => packageOverview.refetch()}>{t('publish.retryPackagePreview')}</Button>}
            </div>
            <details open={avatarOnly || undefined} className="min-w-0 border-t pt-4">
              <summary className="cursor-pointer rounded-sm text-sm font-medium text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t('publish.form.optionalAvatar')}</summary>
              <div className="mt-3 min-w-0 space-y-3">
                <SkillAvatarEditor key={`${namespaceSlug}/${updateSlug}`} name={displayName || search.updateName || updateSlug} currentUrl={avatarTarget.data?.avatarUrl} canRemove={!!updateSlug} disabled={ownerReadOnly || isBusy || avatarUnavailable} onChange={setAvatarEdit} />
                {updateSlug && <SkillAvatarManager namespace={namespaceSlug} slug={updateSlug} disabled={ownerReadOnly || isBusy} />}
                {avatarTarget.isError && <p role="alert" className="text-sm text-destructive">{t('skillAvatar.failed')}</p>}
              </div>
            </details>
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              <Button id="publish-confirm-action" data-analytics-id={avatarOnly ? 'skill.avatar.save' : 'skill.publish.request'}
                className="sm:min-w-32"
                onClick={() => {
                  setAttempted(true)
                  if (canSubmit) { if (avatarOnly) void handlePublish(); else setConfirmOpen(true) }
                  else focusField(missingFields[0]?.id ?? 'publish-form-heading')
                }}
                disabled={ownerReadOnly || isBusy || isPackaging || importing || !avatarEdit.ready || avatarUnavailable || (avatarOnly && !canSubmit) || readingOverview || readingPublished || (!!selectedFile && !packagePreview.isSuccess)}
              >{isBusy ? t('publish.publishing') : t(avatarOnly ? 'publish.saveAvatar' : 'publish.nextConfirm')}</Button>
            </footer>
          </section>
        </div>

        <Dialog open={viewOverview} onOpenChange={setViewOverview}>
          <DialogContent className="w-[min(calc(100vw-2rem),56rem)]"><DialogTitle>{t('publish.overview')}</DialogTitle><MarkdownRenderer content={previewOverview} /></DialogContent>
        </Dialog>
        <PresentationEditor open={editorOpen} value={editorOriginal.current} maxLength={20000} onCancel={() => setEditorOpen(false)} onApply={value => {
          if (ownerReadOnly || isBusy) { setEditorOpen(false); return }
          if (value !== editorOriginal.current) {
            sourceTouched.current.overview = true
            overviewEdited.current = true
            setOverview(value)
            setOverviewSource('custom')
          }
          setEditorOpen(false)
        }} />
        <ConfirmDialog
          open={restoreField !== null}
          onOpenChange={open => { if (!open) setRestoreField(null) }}
          title={t('publish.form.restoreTitle', { field: t(restoreField === 'short' ? 'publish.shortDescription' : 'publish.overview') })}
          description={t('publish.form.restoreDescription')}
          confirmText={t('publish.form.restore')}
          cancelText={t('dialog.cancel')}
          onConfirm={restorePackageContent}
          onCloseAutoFocus={event => {
            event.preventDefault()
            const target = restoredFocus.current
            const opener = restoreOpener.current
            restoredFocus.current = null
            restoreOpener.current = null
            requestAnimationFrame(() => {
              if (target) focusField(target)
              else if (opener?.isConnected && !opener.disabled) opener.focus()
              else focusField('publish-form-heading')
            })
          }}
        />
        <ConfirmDialog
          open={blocker.status === 'blocked'}
          onOpenChange={open => { if (!open && blocker.status === 'blocked') blocker.reset() }}
          title={t('publish.form.leaveTitle')}
          description={t('publish.form.leaveDescription')}
          confirmText={t('publish.form.leave')}
          cancelText={t('publish.backToEdit')}
          closeOnConfirm={false}
          onConfirm={() => { if (blocker.status === 'blocked') blocker.proceed() }}
        />
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('publish.confirmDetails')}
          description={
            <span className="block space-y-3 text-left">
              <span className="block space-y-0.5 rounded-lg border bg-muted/30 p-3">
                <strong className="block font-medium text-foreground">{displayName.trim() || packagePreview.data?.displayName || packagePreview.data?.name}</strong>
                <code className="block break-all text-xs">@{namespaceSlug}/{packagePreview.data?.name}@{packagePreview.data?.version}</code>
                <span className="block text-xs">{audience}</span>
              </span>
              {externalSourceUrl && <span className="block break-all text-xs">{externalSourceUrl}</span>}
              <span className="block max-h-24 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{previewShortDescription}</span>
              <span className="block text-xs">{t('publish.reviewNotice.description')}</span>
            </span>
          }
          confirmText={t('publish.confirm')}
          cancelText={t('publish.backToEdit')}
          onCloseAutoFocus={event => {
            event.preventDefault()
            const action = document.getElementById('publish-confirm-action')
            if (!submitting.current && !action?.closest('[hidden]')) action?.focus()
          }}
          onConfirm={() => {
            if (!canSubmit) return
            setConfirmOpen(false)
            void handlePublish()
          }}
        />
        <ConfirmDialog confirmAnalyticsId={avatarOnly ? undefined : 'skill.publish.confirm'} cancelAnalyticsId={avatarOnly ? undefined : 'skill.publish.cancel'}
          open={warningDialogOpen}
          onOpenChange={setWarningDialogOpen}
          title={t('publish.warningConfirmTitle')}
          description={<div className="space-y-3 text-left"><p>{t('publish.warningConfirmDescription')}</p>{precheckWarnings.length > 0 && <ul className="list-disc space-y-1 pl-5">{precheckWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}</div>}
          confirmText={t('publish.warningConfirmContinue')}
          cancelText={t('publish.warningConfirmCancel')}
          onConfirm={() => publishSkill(true)}
        />
      </div>
    </div>
  )
}
