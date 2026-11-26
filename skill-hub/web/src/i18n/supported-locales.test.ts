import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import zh from './locales/zh.json'

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    Object.entries(flatten(child, prefix ? `${prefix}.${key}` : key)),
  ))
}

const pluralSuffix = /_(zero|one|two|few|many|other)$/
const english = flatten(en)
const chinese = flatten(zh)
const normalizedKeys = (keys: string[]) => [...new Set(keys.map((key) => key.replace(pluralSuffix, '_plural')))].sort()
const placeholders = (text: string) => [...text.matchAll(/\{\{[^}]+\}\}/g)].map(([match]) => match).sort()
const tags = (text: string) => [...text.matchAll(/<\/?[\w]+\s*\/?\s*>/g)].map(([match]) => match).sort()

describe('Chinese and English locales', () => {
  it('covers every English key, allowing language-specific plural categories', () => {
    expect(normalizedKeys(Object.keys(chinese))).toEqual(normalizedKeys(Object.keys(english).map(key => key.startsWith('mySkills.resultCount_') ? 'mySkills.resultCount' : key)))
  })

  it('preserves interpolation variables and markup without empty translations', () => {
    for (const [key, value] of Object.entries(chinese)) {
      const reference = english[key] ?? english[`${key}_other`] ?? english[key.replace(pluralSuffix, '_other')]
      expect(reference, key).toBeDefined()
      expect(placeholders(value), key).toEqual(placeholders(reference))
      expect(tags(value), key).toEqual(tags(reference))
      // The existing pagination suffix is deliberately empty in English.
      if (reference?.trim()) expect(value.trim(), key).not.toBe('')
    }
  })

  it('uses Chinese plural rules for zero, one, and multiple reviews without English fallback', async () => {
    const instance = createInstance()
    await instance.init({ lng: 'zh-CN', fallbackLng: 'en', resources: { en: { translation: en }, zh: { translation: zh } } })
    for (const count of [0, 1, 2, 21, 100]) {
      const result = instance.t('skillReviews.count', { count, returnDetails: true })
      expect(result.res, String(count)).toBe(`共 ${count} 条评价`)
      expect(result.usedLng).toBe('zh')
    }
  })
})
