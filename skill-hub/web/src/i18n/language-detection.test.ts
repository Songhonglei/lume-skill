// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function initialize() {
  const { default: i18n } = await import('./config')
  if (!i18n.isInitialized) await new Promise<void>((resolve) => i18n.on('initialized', () => resolve()))
  return i18n
}

describe('browser language detection with real i18next', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ko-KR'])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ko-KR')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('falls back to English for a Korean browser locale', async () => {
    const i18n = await initialize()
    expect(i18n.resolvedLanguage).toBe('en')
    expect(i18n.t('nav.home')).toBe('Skill Center')
  })

  it('respects an explicit English preference over the Korean browser', async () => {
    localStorage.setItem('i18nextLng', 'en')
    const i18n = await initialize()
    expect(i18n.resolvedLanguage).toBe('en')
  })

  it('persists a Chinese selection and restores it on a fresh initialization', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US'])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US')
    const i18n = await initialize()
    expect(i18n.resolvedLanguage).toBe('en')
    await i18n.changeLanguage('zh')
    expect(localStorage.getItem('i18nextLng')).toBe('zh')
    vi.resetModules()
    const restored = await initialize()
    expect(restored.resolvedLanguage).toBe('zh')
    expect(restored.t('nav.home')).toBe('技能中心')
  })

  it('keeps English fallback for an unsupported language', async () => {
    localStorage.setItem('i18nextLng', 'fr-FR')
    const i18n = await initialize()
    expect(i18n.resolvedLanguage).toBe('en')
    expect(i18n.t('nav.home')).toBe('Skill Center')
  })
})
