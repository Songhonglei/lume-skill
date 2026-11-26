import { useId, useState, type FormEvent } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReviewCenterFilters } from './review-center-filters'
import { REVIEW_KINDS, REVIEW_STATUSES } from './review-center-filters'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import './review-center-filter-form.css'

interface ReviewFilterOption { value: string; label: string }
interface ReviewCenterFilterFormProps {
  value: ReviewCenterFilters
  namespaces: ReviewFilterOption[]
  namespaceLoading?: boolean
  onChange: (filters: ReviewCenterFilters) => void
  onReset: () => void
}

export const REVIEW_FILTER_TRIGGER_CLASS_NAME = 'w-full bg-background sm:w-44'
export const REVIEW_FILTER_CONTENT_CLASS_NAME = 'w-[var(--radix-select-trigger-width)] min-w-0 max-w-[var(--radix-select-trigger-width)] [&_[role=option]]:min-h-11 [&_[role=option]]:rounded-lg [&_[role=option]]:py-1.5 md:[&_[role=option]]:min-h-8 md:[&_[role=option]]:py-1 [&_[data-radix-select-viewport]]:h-auto [&_[data-radix-select-viewport]]:min-w-0 [&_[data-radix-select-viewport]]:p-1.5'

function measureScopeLabel(option: HTMLElement) {
  option.closest('.review-scope-menu')?.setAttribute('data-pointer', '')
  const label = option.querySelector<HTMLElement>('.review-scope-label')
  if (!label) return
  const distance = Math.max(0, label.scrollWidth - label.clientWidth)
  label.style.setProperty('--scope-label-offset', `${-distance}px`)
  label.style.setProperty('--scope-label-duration', `${Math.max(350, distance * 22)}ms`)
  label.toggleAttribute('data-overflow', distance > 0)
}

export function ReviewCenterFilterForm({ value, namespaces, namespaceLoading, onChange, onReset }: ReviewCenterFilterFormProps) {
  const { t } = useTranslation()
  const id = useId()
  const [input, setInput] = useState({ applied: value.q, text: value.q })
  if (input.applied !== value.q) setInput({ applied: value.q, text: value.q })
  const setValue = <K extends keyof ReviewCenterFilters>(key: K, next: ReviewCenterFilters[K]) => onChange({ ...value, [key]: next })
  const submit = (event: FormEvent) => { event.preventDefault(); setValue('q', input.text.trim()) }
  const selectedScope = namespaces.find(item => item.value === value.namespace)
  const scopeLabel = value.namespace !== 'ALL' ? selectedScope?.label || value.namespace : ''
  const kindLabel = value.reviewKind !== 'ALL' ? t(`reviewCenter.kind.${value.reviewKind}`) : ''
  const field = (key: 'status' | 'namespace' | 'reviewKind' | 'originType', options: ReviewFilterOption[]) => (
    <div className="min-w-0">
      <label htmlFor={`${id}-${key}`} className="mb-2 block text-xs font-medium text-muted-foreground">{t(`reviewCenter.filters.${key}`)}</label>
      <Select value={value[key]} onValueChange={(next) => setValue(key, next as ReviewCenterFilters[typeof key])} disabled={key === 'namespace' && namespaceLoading}>
        <SelectTrigger id={`${id}-${key}`} data-analytics-id={key === 'status' ? 'review.filter.status.interact' : key === 'namespace' ? 'review.filter.namespace.interact' : key === 'reviewKind' ? 'review.filter.kind.interact' : 'review.filter.origin.interact'} className={REVIEW_FILTER_TRIGGER_CLASS_NAME}><SelectValue /></SelectTrigger>
        <SelectContent sideOffset={8} align="start" className={`${REVIEW_FILTER_CONTENT_CLASS_NAME} ${key === 'namespace' ? 'review-scope-menu' : ''}`}
          onKeyDownCapture={key === 'namespace' ? (event) => event.currentTarget.removeAttribute('data-pointer') : undefined}>
          {options.map((option) => <SelectItem key={option.value} value={option.value} textValue={option.label} title={option.label} onPointerEnter={key === 'namespace' ? (event) => measureScopeLabel(event.currentTarget) : undefined} data-analytics-id={key === 'status' ? 'review.filter.status.select' : key === 'namespace' ? 'review.filter.namespace.select' : key === 'reviewKind' ? 'review.filter.kind.select' : 'review.filter.origin.select'}><span className={key === 'namespace' ? 'review-scope-label' : 'block truncate'}>{key === 'namespace' ? <span>{option.label}</span> : option.label}</span></SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4">
      <form data-analytics-id="review.filter.apply" onSubmit={submit} className="flex flex-wrap items-end gap-2 sm:gap-3" aria-label={t('reviewCenter.filters.title')}>
        {field('status', REVIEW_STATUSES.map(status => ({ value: status, label: t(`reviewCenter.status.${status}`) })))}
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor={`${id}-q`} className="mb-2 block text-xs font-medium text-muted-foreground">{t('reviewCenter.filters.q')}</label>
          <div className="flex gap-2">
            <Input id={`${id}-q`} value={input.text} onChange={event => setInput({ applied: value.q, text: event.target.value })}
              placeholder={t('reviewCenter.filters.searchPlaceholder')} className="min-w-0 bg-background" />
            <Button type="submit" variant="outline" aria-label={t('reviewCenter.filters.apply')} title={t('reviewCenter.filters.apply')} className="shrink-0 px-2.5">
              <Search aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </form>
      <details className="group mt-2">
        <summary className="flex w-fit max-w-full cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-sm py-1 text-xs font-medium text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />
          {t('reviewCenter.filters.advanced')}
          {[scopeLabel, kindLabel].filter(Boolean).map((label, index) => <span key={index} className="max-w-48 truncate rounded border px-1.5 py-0.5" title={label}>{label}</span>)}
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-3 border-t pt-3">
          {field('namespace', [{ value: 'ALL', label: t('reviewCenter.filters.allScopes') }, ...namespaces])}
          {field('reviewKind', REVIEW_KINDS.map(kind => ({ value: kind, label: t(`reviewCenter.kind.${kind}`) })))}
          <Button data-analytics-id="review.filter.reset" type="button" variant="ghost" onClick={() => {
            setInput({ applied: value.q, text: '' })
            onReset()
          }}>{t('reviewCenter.filters.reset')}</Button>
        </div>
      </details>
    </div>
  )
}
