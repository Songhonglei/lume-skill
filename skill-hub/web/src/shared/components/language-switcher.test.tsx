// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageSwitcher } from './language-switcher'

const mockI18n = vi.hoisted(() => ({
  language: undefined as string | undefined,
  resolvedLanguage: undefined as string | undefined,
  changeLanguage: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: mockI18n }),
}))

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    mockI18n.language = undefined
    mockI18n.resolvedLanguage = undefined
    mockI18n.changeLanguage.mockImplementation((language: string) => {
      mockI18n.language = language
      mockI18n.resolvedLanguage = language
      return Promise.resolve()
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('exports the LanguageSwitcher component', () => {
    expect(LanguageSwitcher).toBeTypeOf('function')
  })

  it('falls back to English when i18next has not resolved a language yet', () => {
    render(<LanguageSwitcher />)

    expect(screen.getByRole('button', { name: /English/i })).toBeTruthy()
  })

  it('uses the resolved language before the raw detected language', () => {
    mockI18n.language = 'zh-CN'
    mockI18n.resolvedLanguage = 'en'

    render(<LanguageSwitcher />)

    expect(screen.getByRole('button', { name: /English/i })).toBeTruthy()
  })

  it('switches directly from English to Chinese', () => {
    mockI18n.language = 'en'
    mockI18n.resolvedLanguage = 'en'
    const view = render(<LanguageSwitcher />)
    const button = screen.getByRole('button', { name: /English/i })
    expect(button.textContent).toBe('EN')
    fireEvent.click(button)
    view.rerender(<LanguageSwitcher />)
    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('zh')
    expect(screen.getByRole('button', { name: /中文/ })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('falls back to English for a legacy Korean preference', () => {
    mockI18n.language = 'ko-KR'
    render(<LanguageSwitcher />)
    expect(screen.getByRole('button', { name: /English/ })).toBeTruthy()
  })

  it('updates the displayed language after selecting English', () => {
    mockI18n.language = 'zh'
    mockI18n.resolvedLanguage = 'zh'

    const view = render(<LanguageSwitcher />)
    const button = screen.getByRole('button', { name: /中文/i })
    expect(button.textContent).toBe('中')
    fireEvent.click(button)
    view.rerender(<LanguageSwitcher />)

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('en')
    expect(screen.getByRole('button', { name: /English/i })).toBeTruthy()
  })
})
