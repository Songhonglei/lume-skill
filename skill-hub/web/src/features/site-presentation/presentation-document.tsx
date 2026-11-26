import { PRODUCT_NAME } from '@/shared/lib/product-brand'
import { useEffect } from 'react'
import { presentationAssetUrl } from '@/api/site-presentation'
import { useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { withBasePath } from '@/shared/lib/base-path'

export function PresentationDocument() {
  const { settings } = useSitePresentation()
  useEffect(() => {
    document.title = settings.siteName || PRODUCT_NAME
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) return
    const customIcon = presentationAssetUrl(settings.faviconUrl) ?? presentationAssetUrl(settings.logoUrl)
    const fallback = () => { icon.href = withBasePath('/favicon.svg'); icon.type = 'image/svg+xml' }
    if (customIcon) {
      icon.type = ''
      icon.href = customIcon
    } else {
      fallback()
    }
    icon.addEventListener('error', fallback, { once: true })
    return () => icon.removeEventListener('error', fallback)
  }, [settings.siteName, settings.faviconUrl, settings.logoUrl])
  return null
}
