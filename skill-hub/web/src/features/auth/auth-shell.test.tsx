vi.mock('@/shared/hooks/use-site-presentation', async (original) => {
  const actual = await original<typeof import('@/shared/hooks/use-site-presentation')>()
  return { ...actual, useSitePresentation: () => ({ settings: actual.defaultSitePresentation() }) }
})
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))

import { AuthShell } from './auth-shell'

describe('AuthShell', () => {
  it('renders the Luma mark and a theme-aware form card', () => {
    const html = renderToStaticMarkup(<AuthShell><div>Login form</div></AuthShell>)

    expect(html).toContain('bg-card')
    expect(html).toContain('max-w-[450px]')
    expect(html).toContain('Luma Skill Hub')
    expect(html).toContain('lumaskill-mark.svg')
    expect(html).toContain('authShell.backHome')
    expect(html).toContain('pt-20')
    expect(html).toContain('Login form')
  })
})
