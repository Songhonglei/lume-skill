import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, Search, Trash2, X } from 'lucide-react'
import type { SkillSuiteDraftInput, SkillSuiteMemberCandidate, SkillSuiteMemberInput } from '@/api/types'
import {
  useCreateSuite,
  useCreateSuiteVersion,
  useSuiteDetail,
  useSuiteMemberCandidates,
  useUpdateSuiteDraft,
} from '@/shared/hooks/use-suite-queries'
import { useMyNamespaces } from '@/shared/hooks/use-namespace-queries'
import { SuiteWorkspaceHeader } from '@/features/suite/suite-workspace-header'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/lib/toast'
import {
  hasStoredSuiteBundleOperation,
  SuiteBundleImport,
} from '@/features/suite/suite-bundle-import'
import { SuiteLabelPanel } from '@/features/skill/skill-label-panel'
import { useSuiteLabels } from '@/shared/hooks/use-label-queries'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/shared/lib/utils'

type SelectedMember = SkillSuiteMemberInput & { skillId: number; skillVersionId: number; displayName: string }
type CandidateScope = 'market' | 'namespace' | 'coordinate'

export function SuiteEditor({ namespace: routeNamespace, slug: routeSlug, version: routeVersion, mode = 'create' }: {
  namespace?: string
  slug?: string
  version?: string
  mode?: 'create' | 'edit' | 'new-version'
}) {
  const editing = mode === 'edit'
  const creatingVersion = mode === 'new-version'
  const bundleMode = creatingVersion ? 'UPDATE' : 'CREATE'
  const bundleCoordinate = creatingVersion && routeNamespace && routeSlug
    ? `@${routeNamespace}/${routeSlug}`
    : undefined
  const loadingSource = editing || creatingVersion
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const { data: namespaces } = useMyNamespaces()
  const { data: existing, isLoading: isLoadingExisting, error: existingError } = useSuiteDetail(
    routeNamespace || '', routeSlug || '', routeVersion, loadingSource,
  )
  const [namespace, setNamespace] = useState(routeNamespace || '')
  const [slug, setSlug] = useState(routeSlug || '')
  const [displayName, setDisplayName] = useState('')
  const [summary, setSummary] = useState('')
  const [overview, setOverview] = useState('')
  const [version, setVersion] = useState(routeVersion || '1.0.0')
  const [visibility, setVisibility] = useState<SkillSuiteDraftInput['visibility']>('PUBLIC')
  const [changelog, setChangelog] = useState('')
  const [candidateInput, setCandidateInput] = useState('')
  const [candidateQuery, setCandidateQuery] = useState('')
  const [candidateScope, setCandidateScope] = useState<CandidateScope>('namespace')
  const [candidateSearchStarted, setCandidateSearchStarted] = useState(false)
  const [membersSettingsOpen, setMembersSettingsOpen] = useState(false)
  const [selected, setSelected] = useState<SelectedMember[]>([])
  const [entrySkillVersionId, setEntrySkillVersionId] = useState<number | null>(null)
  const [pendingVersionUpdate, setPendingVersionUpdate] = useState<SkillSuiteMemberCandidate | null>(null)
  const [namespaceRequired, setNamespaceRequired] = useState(false)
  const [slugRequired, setSlugRequired] = useState(false)
  const [nameRequired, setNameRequired] = useState(false)
  const [versionRequired, setVersionRequired] = useState(false)
  const [membersRequired, setMembersRequired] = useState(false)
  const slugInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const versionInputRef = useRef<HTMLInputElement>(null)
  const [authoringMode, setAuthoringMode] = useState<'manual' | 'import'>(() => {
    if (editing) return 'manual'
    return hasStoredSuiteBundleOperation(bundleMode, bundleCoordinate) ? 'import' : 'manual'
  })
  const candidateInputTrimmed = candidateInput.trim()
  const backendCandidateQuery = useMemo(() => {
    if (candidateScope !== 'coordinate') return candidateQuery
    const raw = candidateQuery.trim().replace(/^@/, '')
    const [, skillSlug] = raw.split('/')
    return skillSlug || raw
  }, [candidateQuery, candidateScope])
  const { data: candidates, isLoading: isLoadingCandidates } = useSuiteMemberCandidates(
    namespace, visibility, backendCandidateQuery, Boolean(namespace) && candidateSearchStarted,
  )
  const createMutation = useCreateSuite()
  const createVersionMutation = useCreateSuiteVersion(existing?.id ?? 0)
  const updateMutation = useUpdateSuiteDraft(existing?.id ?? 0, existing?.versionId ?? 0)
  const { data: suiteLabels } = useSuiteLabels(
    existing?.namespace ?? '', existing?.slug ?? '', Boolean(existing && loadingSource),
  )

  const goBack = () => {
    if (routeNamespace && routeSlug) {
      navigate({
        to: `/dashboard/suites/${routeNamespace}/${encodeURIComponent(routeSlug)}`,
        search: { version: existing?.version ?? routeVersion },
      })
      return
    }
    navigate({ to: '/dashboard/suites' })
  }

  useEffect(() => {
    if (!namespace && namespaces?.length) setNamespace(namespaces[0].slug)
  }, [namespace, namespaces])

  useEffect(() => {
    if (!existing) return
    setNamespace(existing.namespace)
    setSlug(existing.slug)
    setDisplayName(existing.displayName)
    setSummary(existing.summary || '')
    setOverview(existing.overview || '')
    setVersion(creatingVersion ? '' : existing.version)
    setVisibility(existing.visibility)
    setSelected(existing.members.map((member) => ({
      namespace: member.namespace,
      slug: member.slug,
      version: member.version,
      skillId: member.skillId ?? -member.position - 1,
      skillVersionId: member.skillVersionId ?? -member.position - 1,
      displayName: `@${member.namespace}/${member.slug}`,
    })))
    setMembersRequired(false)
    setEntrySkillVersionId(existing.members.find((member) => member.entry)?.skillVersionId ?? null)
  }, [creatingVersion, existing])

  const selectedIds = useMemo(() => new Set(selected.map((member) => member.skillVersionId)), [selected])
  const selectedSkillIds = useMemo(() => new Set(selected.map((member) => member.skillId)), [selected])
  const filteredCandidates = useMemo(() => {
    const items = candidates ?? []
    if (candidateScope === 'namespace') {
      return items.filter((candidate) => candidate.namespace === namespace)
    }
    if (candidateScope === 'coordinate') {
      const raw = candidateQuery.trim().replace(/^@/, '')
      if (!raw) return items
      return items.filter((candidate) => `${candidate.namespace}/${candidate.slug}` === raw)
    }
    return items
  }, [candidateQuery, candidateScope, candidates, namespace])

  const selectedEntry = selected.find((member) => member.skillVersionId === entrySkillVersionId)
  const marketSearchRequiresKeyword = candidateScope === 'market' && candidateInputTrimmed.length === 0
  const runCandidateSearch = () => {
    if (marketSearchRequiresKeyword) return
    setCandidateSearchStarted(true)
    setCandidateQuery(candidateInputTrimmed)
  }

  const addCandidate = (candidate: SkillSuiteMemberCandidate) => {
    if (selectedIds.has(candidate.skillVersionId)) return
    setMembersRequired(false)
    setMembersSettingsOpen(true)
    setSelected((current) => {
      if (current.length === 0) setEntrySkillVersionId(candidate.skillVersionId)
      return [...current, {
        namespace: candidate.namespace,
        slug: candidate.slug,
        version: candidate.version,
        skillId: candidate.skillId,
        skillVersionId: candidate.skillVersionId,
        displayName: candidate.displayName,
      }]
    })
  }

  const applyCandidateUpdate = (candidate: SkillSuiteMemberCandidate) => {
    const previous = selected.find((member) => member.skillId === candidate.skillId)
    if (previous && entrySkillVersionId === previous.skillVersionId) {
      setEntrySkillVersionId(candidate.skillVersionId)
    }
    setSelected((current) => current.map((member) => {
      if (member.skillId !== candidate.skillId) return member
      return {
        namespace: candidate.namespace,
        slug: candidate.slug,
        version: candidate.version,
        skillId: candidate.skillId,
        skillVersionId: candidate.skillVersionId,
        displayName: candidate.displayName,
      }
    }))
  }

  const moveMember = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= selected.length) return
    setSelected((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const removeMember = (skillVersionId: number) => {
    setSelected((current) => current.filter((member) => member.skillVersionId !== skillVersionId))
    if (entrySkillVersionId === skillVersionId) setEntrySkillVersionId(null)
  }

  const save = async () => {
    if (!namespace) {
      setNamespaceRequired(true)
      toast.error(t('suite.namespaceRequired'))
      return
    }
    if (!slug.trim()) {
      setSlugRequired(true)
      slugInputRef.current?.focus()
      toast.error(t('suite.slugRequired'))
      return
    }
    if (!displayName.trim()) {
      setNameRequired(true)
      nameInputRef.current?.focus()
      toast.error(t('suite.nameRequired'))
      return
    }
    if (!version.trim()) {
      setVersionRequired(true)
      versionInputRef.current?.focus()
      toast.error(t('suite.versionRequired'))
      return
    }
    if (selected.length === 0) {
      setMembersRequired(true)
      toast.error(t('suite.membersRequired'))
      return
    }
    if (entrySkillVersionId === null) {
      toast.error(t('suite.entryRequired'))
      return
    }
    const members = selected.map(({ skillVersionId, namespace: memberNamespace, slug: memberSlug, version: memberVersion }) => ({
      skillVersionId,
      namespace: memberNamespace,
      slug: memberSlug,
      version: memberVersion,
    }))
    const entry = selected.find((member) => member.skillVersionId === entrySkillVersionId)
    if (!entry) {
      toast.error(t('suite.entryRequired'))
      return
    }
    const input = {
      namespace,
      slug: slug.trim(),
      displayName: displayName.trim(),
      summary: summary.trim() || undefined,
      overview: overview.trim() || undefined,
      version: version.trim(),
      visibility,
      changelog: changelog.trim() || undefined,
      entrySkill: {
        skillVersionId: entry.skillVersionId,
        namespace: entry.namespace,
        slug: entry.slug,
        version: entry.version,
      },
      members,
    }
    try {
      const result = editing
        ? await updateMutation.mutateAsync(input)
        : creatingVersion
          ? await createVersionMutation.mutateAsync(input)
          : await createMutation.mutateAsync(input)
      toast.success(editing ? t('suite.draftUpdated') : t('suite.draftCreated'))
      navigate({
        to: `/dashboard/suites/${result.namespace}/${encodeURIComponent(result.slug)}`,
        search: { version: result.version },
      })
    } catch (error) {
      toast.error(t('suite.saveFailed'), error instanceof Error ? error.message : '')
    }
  }

  if (loadingSource && isLoadingExisting) return <div className="h-64 animate-shimmer rounded-xl" />
  if (loadingSource && (!existing || existingError)) {
    return <Card className="mx-auto max-w-3xl p-8 text-center text-destructive">{t('suite.sourceLoadFailed')}</Card>
  }
  if (editing && existing && !existing.allowedActions.includes('EDIT')) {
    return <Card className="mx-auto max-w-3xl p-8 text-center text-destructive">{t('suite.editorAccessDenied')}</Card>
  }
  if (creatingVersion && existing && !existing.allowedActions.includes('CREATE_VERSION')) {
    return <Card className="mx-auto max-w-3xl p-8 text-center text-destructive">{t('suite.editorAccessDenied')}</Card>
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-20 animate-fade-up">
      <SuiteWorkspaceHeader
        title={editing
          ? t('suite.editTitle')
          : creatingVersion
            ? t('suite.newVersionTitle')
            : t('suite.createTitle')}
        eyebrow={existing ? `@${existing.namespace}/${existing.slug}@${existing.version}` : undefined}
        backLabel={t(existing ? 'suite.bundle.backToSuite' : 'suite.management.backToSuites')}
        onBack={goBack}
      />

      {!editing ? (
        <div className="flex w-fit rounded-lg border bg-muted/30 p-1" role="tablist" aria-label={t('suite.authoringMode')}>
          <button data-analytics-id="suite.authoring.manual"
            type="button"
            role="tab"
            aria-selected={authoringMode === 'manual'}
            className={authoringMode === 'manual' ? 'rounded-md bg-background px-3 py-1.5 text-xs font-medium shadow-sm' : 'px-3 py-1.5 text-xs text-muted-foreground'}
            onClick={() => setAuthoringMode('manual')}
          >
            {t('suite.manualAuthoring')}
          </button>
          <button data-analytics-id="suite.authoring.import"
            type="button"
            role="tab"
            aria-selected={authoringMode === 'import'}
            className={authoringMode === 'import' ? 'rounded-md bg-background px-3 py-1.5 text-xs font-medium shadow-sm' : 'px-3 py-1.5 text-xs text-muted-foreground'}
            onClick={() => setAuthoringMode('import')}
          >
            {t('suite.localImport')}
          </button>
        </div>
      ) : null}

      {!editing && authoringMode === 'import' ? (
        <SuiteBundleImport
          key={`${bundleMode}:${bundleCoordinate ?? 'new'}`}
          expectedMode={bundleMode}
          expectedCoordinate={creatingVersion && existing ? bundleCoordinate : undefined}
          returnToSuite={creatingVersion && existing ? {
            namespace: existing.namespace,
            slug: existing.slug,
            version: existing.version,
          } : undefined}
        />
      ) : (
        <>

      <Card className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
        <h2 className="text-base font-semibold md:col-span-2">{t('suite.management.basicInfo')}</h2>
        <div className="space-y-2">
          <Label htmlFor="suite-namespace">{t('suite.namespace')}</Label>
          <Select value={namespace} onValueChange={(value) => {
            setNamespace(value)
            if (value) setNamespaceRequired(false)
          }} disabled={loadingSource}>
            <SelectTrigger data-analytics-id="suite.namespace.interact" id="suite-namespace"><SelectValue placeholder={t('suite.selectNamespace')} /></SelectTrigger>
            <SelectContent>{namespaces?.map((item) => <SelectItem data-analytics-id="suite.namespace.select" key={item.id} value={item.slug}>@{item.slug}</SelectItem>)}</SelectContent>
          </Select>
          {namespaceRequired ? <p role="alert" className="text-xs text-destructive">{t('suite.namespaceRequired')}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="suite-slug">{t('suite.slug')}</Label>
          <Input
            ref={slugInputRef}
            id="suite-slug"
            value={slug}
            disabled={loadingSource}
            aria-invalid={slugRequired || undefined}
            onChange={(event) => {
              setSlug(event.target.value)
              if (event.target.value.trim()) setSlugRequired(false)
            }}
            placeholder="marketing-workflow"
          />
          {slugRequired ? <p role="alert" className="text-xs text-destructive">{t('suite.slugRequired')}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="suite-name">{t('suite.name')}</Label>
          <Input
            ref={nameInputRef}
            id="suite-name"
            value={displayName}
            aria-invalid={nameRequired || undefined}
            onChange={(event) => {
              setDisplayName(event.target.value)
              if (event.target.value.trim()) setNameRequired(false)
            }}
            placeholder={t('suite.namePlaceholder')}
          />
          {nameRequired ? <p role="alert" className="text-xs text-destructive">{t('suite.nameRequired')}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="suite-version">{t('suite.version')}</Label>
          <Input
            ref={versionInputRef}
            id="suite-version"
            value={version}
            disabled={editing}
            aria-invalid={versionRequired || undefined}
            onChange={(event) => {
              setVersion(event.target.value)
              if (event.target.value.trim()) setVersionRequired(false)
            }}
            placeholder={creatingVersion ? t('suite.newVersionPlaceholder') : undefined}
          />
          {versionRequired ? <p role="alert" className="text-xs text-destructive">{t('suite.versionRequired')}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="suite-visibility">{t('suite.visibility')}</Label>
          <Select value={visibility} onValueChange={(value) => {
            if (value === 'PUBLIC' || value === 'NAMESPACE_ONLY' || value === 'PRIVATE') {
              setVisibility(value)
            }
          }}>
            <SelectTrigger data-analytics-id="suite.visibility.interact" id="suite-visibility"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem data-analytics-id="suite.visibility.public" value="PUBLIC">{t('suite.visibilityPublic')}</SelectItem>
              <SelectItem data-analytics-id="suite.visibility.namespace" value="NAMESPACE_ONLY">{t('suite.visibilityNamespace')}</SelectItem>
              <SelectItem data-analytics-id="suite.visibility.private" value="PRIVATE">{t('suite.visibilityPrivate')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="suite-summary">
            {t('suite.summary')}
            <span aria-hidden="true" className="ml-1 text-xs font-normal text-muted-foreground">
              · {t('suite.requiredForPublish')}
            </span>
          </Label>
          <Textarea
            id="suite-summary"
            aria-label={t('suite.summary')}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="suite-overview">
            {t('suite.overview')}
            <span aria-hidden="true" className="ml-1 text-xs font-normal text-muted-foreground">
              · {t('suite.requiredForPublish')}
            </span>
          </Label>
          <Textarea
            id="suite-overview"
            aria-label={t('suite.overview')}
            value={overview}
            onChange={(event) => setOverview(event.target.value)}
            maxLength={20000}
            rows={5}
          />
          <details className="text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{t('suite.overviewGuide')}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {['Scenario', 'Preparation', 'Sequence', 'InputsOutputs', 'Boundaries'].map(prompt => (
                <li key={prompt}>{t(`suite.overviewPrompt${prompt}`)}</li>
              ))}
            </ul>
          </details>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="suite-changelog">{t('suite.changelog')}</Label>
          <Textarea id="suite-changelog" value={changelog} onChange={(event) => setChangelog(event.target.value)} rows={2} />
        </div>
        <div aria-live="polite" className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs md:col-span-2">
          <span className="font-medium">{t('suite.publishReadinessTitle')}</span>
          <span className={summary.trim() ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400'}>
            {summary.trim() ? t('suite.summaryComplete') : t('suite.summaryIncomplete')}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">·</span>
          <span className={overview.trim() ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400'}>
            {overview.trim() ? t('suite.overviewComplete') : t('suite.overviewIncomplete')}
          </span>
        </div>
      </Card>

      {existing ? (
        <SuiteLabelPanel
          namespace={existing.namespace}
          slug={existing.slug}
          initialLabels={suiteLabels ?? []}
          canManage
          isSuperAdmin={hasRole('SUPER_ADMIN')}
          compact
        />
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">{t('suite.selectSkills')}</h2>
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={t('suite.memberSearchScope')}>
            {([
              ['namespace', 'suite.scopeNamespace'],
              ['coordinate', 'suite.scopeCoordinate'],
              ['market', 'suite.scopeMarket'],
            ] as const).map(([scope, label]) => (
              <button data-analytics-id={scope === 'namespace' ? 'suite.candidate.namespace.select' : scope === 'coordinate' ? 'suite.candidate.coordinate.select' : 'suite.candidate.market.select'}
                key={scope}
                type="button"
                role="tab"
                aria-selected={candidateScope === scope}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs transition-colors',
                  candidateScope === scope
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 bg-background text-muted-foreground hover:bg-muted',
                )}
                onClick={() => {
                  setCandidateScope(scope)
                  setCandidateSearchStarted(false)
                }}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input data-analytics-id="suite.candidate.search"
                className="pl-9"
                value={candidateInput}
                onChange={(event) => setCandidateInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runCandidateSearch()
                }}
                placeholder={candidateScope === 'coordinate' ? '@global/skill-name' : t('suite.searchSkills')}
              />
            </div>
            <Button data-analytics-id="suite.candidate.search" disabled={marketSearchRequiresKeyword} onClick={runCandidateSearch}>
              {t('suite.search')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('suite.candidateVisibilityHint', { visibility: t(visibility === 'PUBLIC' ? 'suite.visibilityPublic' : visibility === 'PRIVATE' ? 'suite.visibilityPrivate' : 'suite.visibilityNamespace') })}
          </p>
        </div>

        {isLoadingCandidates ? (
          <div role="status" aria-label={t('common.loading')} className="m-4 h-24 animate-shimmer rounded-lg" />
        ) : !candidateSearchStarted ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">{t('suite.memberSearchEmptyTitle')}</p>
        ) : filteredCandidates.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted-foreground">{t('suite.noCandidates')}</p>
        ) : (
          <div data-density="compact" className="[&>div]:max-h-[25rem]">
            <Table aria-label={t('suite.selectSkills')}>
              <TableHeader className="sticky top-0 z-10 bg-muted max-sm:sr-only">
                <TableRow>
                  <TableHead scope="col">{t('suite.memberSkillColumn')}</TableHead>
                  <TableHead scope="col" className="w-28">{t('suite.visibility')}</TableHead>
                  <TableHead scope="col" className="w-28">{t('suite.memberVersionColumn')}</TableHead>
                  <TableHead scope="col" className="w-32 text-right">{t('suite.memberActionColumn')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map(candidate => {
                  const alreadySelected = selectedIds.has(candidate.skillVersionId)
                  const replaceVersion = !alreadySelected && selectedSkillIds.has(candidate.skillId)
                  const action = t(alreadySelected ? 'suite.memberAdded' : replaceVersion ? 'suite.updatePinnedVersion' : 'suite.addMember')
                  const visibilityLabel = t(candidate.visibility === 'PUBLIC' ? 'suite.visibilityPublic' : candidate.visibility === 'PRIVATE' ? 'suite.visibilityPrivate' : 'suite.visibilityNamespace')
                  return (
                    <TableRow key={candidate.skillVersionId} className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-2 max-sm:px-3 max-sm:py-1">
                      <TableCell className="min-w-0 max-sm:p-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-medium [overflow-wrap:anywhere]">{candidate.displayName}</span>
                          {candidate.recommended && <span className="text-xs text-muted-foreground">{t('suite.recommendedCandidate')}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">@{candidate.namespace}/{candidate.slug}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-sm:order-3 max-sm:p-1">{visibilityLabel}</TableCell>
                      <TableCell className="font-mono text-xs [overflow-wrap:anywhere] max-sm:order-4 max-sm:p-1">{candidate.version}</TableCell>
                      <TableCell className="text-right max-sm:order-2 max-sm:p-1">
                        <Button
                          data-analytics-id={replaceVersion ? 'suite.member.version.replace' : 'suite.member.add'}
                          type="button"
                          size="sm"
                          variant={alreadySelected ? 'ghost' : 'outline'}
                          aria-label={`${action} · ${candidate.displayName}`}
                          disabled={alreadySelected}
                          onClick={() => replaceVersion ? setPendingVersionUpdate(candidate) : addCandidate(candidate)}
                        >
                          {!alreadySelected && !replaceVersion && <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                          {action}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {membersSettingsOpen || membersRequired ? (
        <Card className={membersRequired ? 'border-destructive/50 p-4' : 'p-4'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('suite.selectedMembers', { count: selected.length })}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('suite.selectedMembersDescription')}</p>
            </div>
            <Button data-analytics-id="suite.members.collapse" size="sm" variant="ghost" onClick={() => setMembersSettingsOpen(false)}>{t('suite.collapseMembers')}</Button>
          </div>
          {membersRequired ? <p role="alert" className="mt-2 text-xs text-destructive">{t('suite.membersRequired')}</p> : null}
          <div className="mt-3 space-y-1.5" role="radiogroup" aria-label={t('suite.entrySkill')}>
            {selected.map((member, index) => {
              const isEntry = entrySkillVersionId === member.skillVersionId
              return (
                <div key={member.skillVersionId} className={cn('rounded-lg border p-2.5', isEntry && 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button data-analytics-id="suite.entry.select" type="button" className="min-w-[220px] flex-1 text-left" onClick={() => setEntrySkillVersionId(member.skillVersionId)}>
                      <span className="block truncate text-sm font-medium" title={member.displayName}>{member.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground" title={`@${member.namespace}/${member.slug}@${member.version}`}>@{member.namespace}/{member.slug}@{member.version}</span>
                    </button>
                    {isEntry ? <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs text-amber-900">{t('suite.entrySkill')}</span> : null}
                    <Button data-analytics-id="suite.member.up" className="h-7 w-7 p-0" aria-label={t('suite.moveMemberUp', { name: member.displayName })} variant="outline" size="sm" disabled={index === 0} onClick={() => moveMember(index, -1)}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                    <Button data-analytics-id="suite.member.down" className="h-7 w-7 p-0" aria-label={t('suite.moveMemberDown', { name: member.displayName })} variant="outline" size="sm" disabled={index === selected.length - 1} onClick={() => moveMember(index, 1)}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                    <Button data-analytics-id="suite.member.remove" className="h-7 w-7 p-0" aria-label={t('suite.removeMember', { name: member.displayName })} variant="ghost" size="sm" onClick={() => removeMember(member.skillVersionId)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <input data-analytics-id="suite.entry.select" type="radio" name="suite-entry-skill" aria-label={t('suite.setEntryFor', { name: member.displayName })} checked={isEntry} onChange={() => setEntrySkillVersionId(member.skillVersionId)} />
                    {t('suite.setEntry')}
                  </label>
                </div>
              )
            })}
            {selected.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t('suite.addMemberHint')}</p> : null}
          </div>
        </Card>
      ) : null}

      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_-20px_rgb(0_0_0/0.45)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 basis-full sm:flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span>{t('suite.selectedMembers', { count: selected.length })}</span>
              {selectedEntry ? <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs text-amber-900">{t('suite.entrySkill')}: {selectedEntry.displayName}</span> : null}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {selected.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t('suite.addMemberHint')}</span>
              ) : selected.map((member) => (
                <span key={member.skillVersionId} className={cn('inline-flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-xs', entrySkillVersionId === member.skillVersionId && 'border-amber-300 bg-amber-50 text-amber-950')}>
                  <span className="max-w-56 truncate">@{member.namespace}/{member.slug}@{member.version}</span>
                  <button data-analytics-id="suite.member.remove" type="button" aria-label={t('suite.removeMember', { name: member.displayName })} onClick={() => removeMember(member.skillVersionId)}>
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button data-analytics-id="suite.members.toggle" size="sm" variant="outline" onClick={() => setMembersSettingsOpen((open) => !open)}>
              {membersSettingsOpen ? t('suite.collapseMembers') : t('suite.expandMembers')}
            </Button>
            <Button data-analytics-id="suite.draft.cancel" size="sm" variant="outline" onClick={goBack}>{t('suite.cancel')}</Button>
            <Button data-analytics-id={editing ? 'suite.draft.edit.save' : creatingVersion ? 'suite.version.draft.save' : 'suite.draft.create.save'}
              size="sm"
              disabled={createMutation.isPending || createVersionMutation.isPending || updateMutation.isPending}
              onClick={save}
            >{t('suite.saveDraft')}</Button>
          </div>
        </div>
      </div>

      <ConfirmDialog confirmAnalyticsId="suite.member.version.confirm" cancelAnalyticsId="suite.member.version.cancel"
        open={pendingVersionUpdate !== null}
        onOpenChange={(open) => { if (!open) setPendingVersionUpdate(null) }}
        title={t('suite.confirmVersionUpdateTitle')}
        description={pendingVersionUpdate ? t('suite.confirmVersionUpdateDescription', {
          coordinate: `@${pendingVersionUpdate.namespace}/${pendingVersionUpdate.slug}`,
          from: selected.find((member) => member.skillId === pendingVersionUpdate.skillId)?.version,
          to: pendingVersionUpdate.version,
        }) : undefined}
        onConfirm={() => {
          if (pendingVersionUpdate) applyCandidateUpdate(pendingVersionUpdate)
        }}
      />
        </>
      )}
    </div>
  )
}

export function SuiteCreatePage() {
  return <SuiteEditor />
}

export function SuiteEditPage() {
  const { namespace, slug } = useParams({ from: '/dashboard/suites/$namespace/$slug/edit' })
  const { version } = useSearch({ from: '/dashboard/suites/$namespace/$slug/edit' })
  return <SuiteEditor namespace={namespace} slug={slug} version={version} mode="edit" />
}

export function SuiteVersionCreatePage() {
  const { namespace, slug } = useParams({ from: '/dashboard/suites/$namespace/$slug/new-version' })
  const { sourceVersion } = useSearch({ from: '/dashboard/suites/$namespace/$slug/new-version' })
  return <SuiteEditor namespace={namespace} slug={slug} version={sourceVersion} mode="new-version" />
}
