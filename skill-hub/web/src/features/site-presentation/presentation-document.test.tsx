// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { PresentationDocument } from './presentation-document'
const state = vi.hoisted(() => ({ settings: { siteName: null as string | null, faviconUrl: null as string | null, logoUrl: null as string | null } }))
vi.mock('@/shared/hooks/use-site-presentation', () => ({ useSitePresentation: () => state }))
vi.mock('@/api/site-presentation', () => ({
  presentationAssetUrl: (path: string | null) => path ? `/skillhub${path}` : undefined,
  presentationFaviconUrl: (path: string | null) => path ? `/skillhub${path}/favicon` : undefined,
}))
vi.mock('@/shared/lib/base-path', () => ({ withBasePath: (path: string) => `/skillhub${path}` }))
afterEach(() => { cleanup(); document.head.innerHTML = ''; state.settings = { siteName: null, faviconUrl: null, logoUrl: null } })
describe('site document metadata', () => {
  it('uses the icon generated from the active logo and restores the shared default mark', () => {
    document.head.innerHTML = '<link rel="icon" href="/lumaskill-mark.svg" type="image/svg+xml">'
    state.settings = { siteName: 'Team Library', faviconUrl: '/api/v1/site-presentation/assets/icon-123', logoUrl: '/api/v1/site-presentation/assets/logo-123' }
    const { rerender } = render(<PresentationDocument />)
    expect(document.title).toBe('Team Library')
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!
    expect(icon.getAttribute('href')).toBe('/skillhub/api/v1/site-presentation/assets/logo-123/favicon')
    expect(icon.type).toBe('image/png')
    state.settings = { ...state.settings, siteName: null, logoUrl: null }
    rerender(<PresentationDocument />)
    expect(document.title).toBe('Luma Skill Hub')
    expect(icon.getAttribute('href')).toBe('/skillhub/lumaskill-mark.svg')
    expect(icon.type).toBe('image/svg+xml')
  })
})
