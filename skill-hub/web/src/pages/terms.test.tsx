import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mockI18n = vi.hoisted(() => ({ resolvedLanguage: 'en' }))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: mockI18n,
    }),
  }
})

import { TermsOfServicePage } from './terms'

describe('TermsOfServicePage', () => {
  it('renders the english terms of service for the English locale', () => {
    mockI18n.resolvedLanguage = 'en'
    const html = renderToStaticMarkup(<TermsOfServicePage />)

    expect(html).toContain('Terms of Service')
    expect(html).toContain('These terms apply')
  })

  it.each(['ko', 'ko-KR'])('falls back to English for %s', (language) => {
    mockI18n.resolvedLanguage = language
    expect(renderToStaticMarkup(<TermsOfServicePage />)).toContain('Terms of Service')
  })

  it('preserves the English fallback for other languages', () => {
    mockI18n.resolvedLanguage = 'ru'
    expect(renderToStaticMarkup(<TermsOfServicePage />)).toContain('Terms of Service')
  })
})
