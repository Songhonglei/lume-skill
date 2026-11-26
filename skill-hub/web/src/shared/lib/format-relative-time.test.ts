import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n/config'
import { formatRelativeTime } from './format-relative-time'

const now = new Date('2026-06-15T12:00:00Z')
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    [0, '刚刚'], [0.5, '刚刚'], [1, '1分钟'], [59, '59分钟'],
    [60, '1小时'], [1439, '23小时'], [1440, '1天'], [29 * 1440, '29天'],
  ])('formats %s minutes ago in Chinese', (minutes, expected) => {
    expect(formatRelativeTime(ago(minutes), 'zh-CN')).toBe(expected)
  })

  it.each([['en', '5m'], ['zh-CN', '5分钟'], ['ru-RU', '5m']])('preserves compact %s output', (locale, expected) => {
    expect(formatRelativeTime(ago(5), locale)).toBe(expected)
  })

  it('uses the selected locale for older dates', () => {
    const date = ago(30 * 1440)
    expect(formatRelativeTime(date, 'zh')).toBe(new Date(date).toLocaleDateString('zh'))
  })

  it.each([0, 5, 60, 1440, 30 * 1440])('does not append a second suffix in Chinese notifications (%s minutes)', (minutes) => {
    const time = formatRelativeTime(ago(minutes), 'en')
    expect(i18n.getFixedT('en')('notification.timeAgo', { time })).toBe(`${time} ago`)
  })
})
