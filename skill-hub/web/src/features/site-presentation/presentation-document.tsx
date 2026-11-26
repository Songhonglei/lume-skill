import { DEFAULT_BRAND_MARK, PRODUCT_NAME } from '@/shared/lib/product-brand'
import { useEffect } from 'react'
import { presentationAssetUrl, presentationFaviconUrl } from '@/api/site-presentation'
import { useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { withBasePath } from '@/shared/lib/base-path'

export function PresentationDocument() {
  const { settings } = useSitePresentation()
  useEffect(() => {
    document.title = settings.siteName || PRODUCT_NAME
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) return
    const customIcon = presentationFaviconUrl(settings.logoUrl)
    const defaultIcon = withBasePath(DEFAULT_BRAND_MARK)
    const fallback = () => { icon.href = defaultIcon; icon.type = 'image/svg+xml' }
    if (customIcon) {
      icon.type = 'image/png'
      icon.href = customIcon
    } else {
      fallback()
    }
    // A normalized square Logo can also serve as the icon if the thumbnail is unavailable.
    const onIconError = () => {
      const logo = presentationAssetUrl(settings.logoUrl)
      if (logo && icon.getAttribute('href') === customIcon) icon.href = logo
      else if (icon.getAttribute('href') !== defaultIcon) fallback()
    }
    icon.addEventListener('error', onIconError)
    return () => icon.removeEventListener('error', onIconError)
  }, [settings.siteName, settings.logoUrl])
  return null
}
