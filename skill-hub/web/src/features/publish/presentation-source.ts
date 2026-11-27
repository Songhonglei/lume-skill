export type PresentationSource = 'package' | 'custom'
export const SHORT_DESCRIPTION_LIMIT = 200

export function packageSummary(description: string): string {
  if (description.length <= SHORT_DESCRIPTION_LIMIT) return description
  const compact = description.trim().replace(/\s+/gu, ' ')
  if (compact.length <= SHORT_DESCRIPTION_LIMIT) return compact

  const prefix = compact.slice(0, SHORT_DESCRIPTION_LIMIT - 1).replace(/[\uD800-\uDBFF]$/u, '')
  const sentenceEnd = Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'),
    prefix.lastIndexOf('. '), prefix.lastIndexOf('! '), prefix.lastIndexOf('? '))
  if (sentenceEnd >= 60) return prefix.slice(0, sentenceEnd + 1)
  const wordEnd = prefix.lastIndexOf(' ')
  const summary = wordEnd >= 160 ? prefix.slice(0, wordEnd) : prefix
  return `${summary.trimEnd()}…`
}

export function presentationPayload(shortSource: PresentationSource, overviewSource: PresentationSource, short: string, overview: string) {
  return { shortDescription: shortSource === 'custom' ? short : undefined, overview: overviewSource === 'custom' ? overview : undefined, resetPresentation: shortSource === 'package' && overviewSource === 'package' }
}
export function publishedOverrides(snapshot?: string): { short?: string; overview?: string } {
  try {
    const value: unknown = JSON.parse(snapshot || '{}')
    if (!value || typeof value !== 'object') return {}
    const data = value as Record<string, unknown>
    return { short: typeof data.shortDescriptionOverride === 'string' ? data.shortDescriptionOverride : undefined, overview: typeof data.overviewOverride === 'string' ? data.overviewOverride : undefined }
  } catch { return {} }
}
