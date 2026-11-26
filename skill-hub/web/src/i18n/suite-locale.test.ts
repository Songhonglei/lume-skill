import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import ko from '../../test/fixtures/locales/ko.json'
import ru from '../../test/fixtures/locales/ru.json'
import zh from './locales/zh.json'

describe('suite locales', () => {
  it('keeps Suite keys aligned in every supported locale', () => {
    const expected = Object.keys(zh.suite).sort()
    expect(Object.keys(en.suite).sort()).toEqual(expected)
    expect(expected).toEqual(expect.arrayContaining(Object.keys(ru.suite)))
    expect(en.nav.suites).toBeTruthy()
    expect(ru.nav.suites).toBeTruthy()
    expect(zh.nav.suites).toBeTruthy()
    expect(expected).toEqual(expect.arrayContaining(Object.keys(ko.suite)))
    expect(ko.nav.suites).toBeTruthy()
  })
})
