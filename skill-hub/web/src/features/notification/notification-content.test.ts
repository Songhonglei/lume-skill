import { describe, expect, it } from 'vitest'
import { resolveNotificationDisplay } from './notification-content'

describe('resolveNotificationDisplay', () => {
  it.each([
    ['zh-CN', '套件审核提交'],
    ['en', 'Suite review submitted'],
  ])('renders a Suite submission with its own title and bound version in %s', (language, title) => {
    const display = resolveNotificationDisplay({
      id: 1,
      category: 'REVIEW',
      eventType: 'SUITE_REVIEW_SUBMITTED',
      title: 'Suite review submitted',
      bodyJson: JSON.stringify({ suiteName: 'Writing suite', version: '2.0.0' }),
      status: 'UNREAD',
      createdAt: '2026-11-05T00:00:00Z',
    }, language)

    expect(display.title).toBe(title)
    expect(display.description).toContain('Writing suite')
    expect(display.description).toContain('2.0.0')
    expect(display.description).not.toContain('{{')
  })

  it.each([
    ['zh', 'SUITE_REVIEW_APPROVED', '套件审核通过'],
    ['zh', 'SUITE_REVIEW_REJECTED', '套件审核未通过'],
    ['en', 'SUITE_REVIEW_APPROVED', 'Suite review approved'],
  ])('renders a Suite result with its submitted version in %s', (language, eventType, title) => {
    const display = resolveNotificationDisplay({
      id: 2, category: 'REVIEW', eventType, title: 'Server title',
      bodyJson: JSON.stringify({ suiteName: 'Writing suite', version: '2.0.0' }),
      status: 'UNREAD', createdAt: '2026-11-06T00:00:00Z',
    }, language)
    expect(display.title).toBe(title)
    expect(display.description).toContain('Writing suite')
    expect(display.description).toContain('2.0.0')
  })

  it('renders review submitted content in Chinese', () => {
    const display = resolveNotificationDisplay({
      category: 'REVIEW',
      eventType: 'REVIEW_SUBMITTED',
      title: 'New review submitted for: Calendar',
      bodyJson: JSON.stringify({ skillName: 'Calendar', version: '1.0.0' }),
      status: 'UNREAD',
      createdAt: '2026-03-20T00:00:00Z',
      id: 1,
    }, 'zh-CN')

    expect(display.title).toBe('技能审核提交')
    expect(display.description).toContain('Calendar')
    expect(display.description).toContain('1.0.0')
  })

  it('renders review submitted content in English', () => {
    const display = resolveNotificationDisplay({
      category: 'REVIEW',
      eventType: 'REVIEW_SUBMITTED',
      title: 'New review submitted for: Calendar',
      bodyJson: JSON.stringify({ skillName: 'Calendar', version: '1.0.0' }),
      status: 'UNREAD',
      createdAt: '2026-03-20T00:00:00Z',
      id: 1,
    }, 'en')

    expect(display.title).toBe('Review submitted')
    expect(display.description).toContain('Calendar')
    expect(display.description).toContain('1.0.0')
  })

  it.each([
    ['REVIEW_SUBMITTED', '技能审核提交'],
    ['REVIEW_APPROVED', '技能审核通过'],
    ['REVIEW_REJECTED', '技能审核驳回'],
    ['PROMOTION_SUBMITTED', '技能推广提交'],
    ['PROMOTION_APPROVED', '技能推广通过'],
    ['PROMOTION_REJECTED', '技能推广驳回'],
    ['REPORT_SUBMITTED', '技能举报提交'],
    ['REPORT_RESOLVED', '技能举报已处理'],
    ['SKILL_PUBLISHED', '技能发布成功'],
    ['SUBSCRIPTION_NEW_VERSION', '订阅技能更新'],
    ['SUBSCRIPTION_VERSION_YANKED', '订阅技能版本撤回'],
  ])('localizes %s in Chinese', (eventType, title) => {
    const display = resolveNotificationDisplay({
      id: 1, category: 'REVIEW', eventType, title: 'Server title', status: 'UNREAD',
      createdAt: '2026-03-20T00:00:00Z',
      bodyJson: JSON.stringify({ skillName: 'Calendar', version: '1.0.0' }),
    }, 'zh-CN')
    expect(display.title).toBe(title)
    expect(display.description).toContain('Calendar')
    expect(display.description).toMatch(/[一-鿿]/)
    if (!eventType.startsWith('REPORT_')) expect(display.description).toContain('1.0.0')
  })

  it.each([undefined, 'invalid JSON', '{}', 'null'])('keeps a localized title with an absent or malformed body (%s)', (bodyJson) => {
    expect(resolveNotificationDisplay({
      id: 1, category: 'REVIEW', eventType: 'REVIEW_APPROVED', title: 'Server title',
      status: 'UNREAD', createdAt: '2026-03-20T00:00:00Z', bodyJson,
    }, 'zh')).toEqual({ title: '技能审核通过', description: '' })
  })

  it('omits version parentheses when a notification has no version', () => {
    const display = resolveNotificationDisplay({
      id: 1, category: 'REVIEW', eventType: 'REVIEW_APPROVED', title: 'Server title',
      status: 'UNREAD', createdAt: '2026-03-20T00:00:00Z',
      bodyJson: JSON.stringify({ skillName: 'Calendar' }),
    }, 'zh')
    expect(display.description).toBe('Calendar 已审核通过。')
  })

  it('falls back to the backend title when the event type is unsupported', () => {
    const display = resolveNotificationDisplay({
      category: 'PUBLISH',
      eventType: 'CUSTOM_EVENT',
      title: 'Backend supplied title',
      status: 'UNREAD',
      createdAt: '2026-03-20T00:00:00Z',
      id: 2,
    }, 'en')

    expect(display.title).toBe('Backend supplied title')
    expect(display.description).toBe('')
  })
})
