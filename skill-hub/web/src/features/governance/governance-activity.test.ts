/** @vitest-environment jsdom */

import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import type { GovernanceActivityItem } from '@/api/types'

const { formatLocalDateTimeMock } = vi.hoisted(() => ({
  formatLocalDateTimeMock: vi.fn(() => '2026-03-23 12:00'),
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en' },
    }),
  }
})

vi.mock('@/shared/lib/date-time', () => ({
  formatLocalDateTime: formatLocalDateTimeMock,
}))

import { GovernanceActivity } from './governance-activity'

function createItem(overrides: Partial<GovernanceActivityItem> = {}): GovernanceActivityItem {
  return {
    id: 1,
    action: 'REVIEW_APPROVE',
    actorUserId: 'user-1',
    actorDisplayName: 'Alice',
    targetType: 'SKILL',
    targetId: 'skill-1',
    details: 'Approved by governance team',
    timestamp: '2026-03-23T04:00:00Z',
    ...overrides,
  }
}

describe('governance-activity module', () => {
  afterEach(cleanup)
  beforeEach(() => {
    formatLocalDateTimeMock.mockClear()
  })

  it('renders the loading shimmer', () => {
    const html = renderToStaticMarkup(createElement(GovernanceActivity, { isLoading: true }))

    expect(html).toContain('animate-shimmer')
  })

  it('renders the empty state', () => {
    const html = renderToStaticMarkup(createElement(GovernanceActivity, { isLoading: false, items: [] }))

    expect(html).toContain('governance.emptyActivity')
  })

  it('shows compact translated rows and keeps the original record available in details', () => {
    render(createElement(GovernanceActivity, {
      isLoading: false,
      items: [createItem({ details: '{"comment":"Approved by governance team"}' })],
    }))

    const table = screen.getByRole('table', { name: 'reviewCenter.governanceActivity' })
    expect(within(table).getByText('auditLog.filterReviewApprove')).toBeTruthy()
    expect(within(table).getByText('Alice')).toBeTruthy()
    expect(within(table).getByText('governance.target.skill · skill-1')).toBeTruthy()
    expect(within(table).getByText('2026-03-23 12:00')).toBeTruthy()
    expect(table.textContent).not.toContain('REVIEW_APPROVE')
    expect(table.textContent).not.toContain('Approved by governance team')
    expect(formatLocalDateTimeMock).toHaveBeenCalledWith('2026-03-23T04:00:00Z', 'en')

    fireEvent.click(within(table).getByRole('button', { name: 'list.details' }))
    const detail = screen.getByRole('dialog', { name: 'governance.activityDetail' })
    expect(within(detail).getByText('REVIEW_APPROVE')).toBeTruthy()
    expect(detail.querySelector('pre')?.textContent).toBe(JSON.stringify({ comment: 'Approved by governance team' }, null, 2))
  })

  it('falls back to actor user id and unknown actor text when needed', () => {
    const html = renderToStaticMarkup(
      createElement(GovernanceActivity, {
        isLoading: false,
        items: [
          createItem({ id: 2, actorDisplayName: undefined, actorUserId: 'user-2', details: undefined }),
          createItem({ id: 3, actorDisplayName: undefined, actorUserId: undefined, details: undefined }),
        ],
      })
    )

    expect(html).toContain('user-2')
    expect(html).toContain('governance.unknownActor')
  })

  it('keeps an unrecognized action and historical plain text in the detail view', () => {
    render(createElement(GovernanceActivity, {
      isLoading: false,
      items: [createItem({ action: 'HISTORICAL_ACTION' }), createItem({ id: 2, details: undefined })],
    }))

    expect(screen.getByText('governance.otherAction')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'list.details' })[0])
    const detail = screen.getByRole('dialog', { name: 'governance.activityDetail' })
    expect(within(detail).getByText('HISTORICAL_ACTION')).toBeTruthy()
    expect(detail.querySelector('pre')?.textContent).toBe('Approved by governance team')
  })
})
