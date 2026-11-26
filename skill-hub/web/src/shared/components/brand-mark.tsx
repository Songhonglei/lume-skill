import { PRODUCT_NAME } from '@/shared/lib/product-brand'
import { withBasePath } from '@/shared/lib/base-path'
import { useState } from 'react'
import { presentationAssetUrl } from '@/api/site-presentation'
import { useSitePresentation } from '@/shared/hooks/use-site-presentation'
import { cn } from '@/shared/lib/utils'

interface BrandMarkProps {
  className?: string
  imageClassName?: string
  alt?: string
}

/**
 * Uses the shared LumaSkill mark when the site has no usable logo override.
 */
export function BrandMark({ className, imageClassName, alt }: BrandMarkProps) {
  const { settings } = useSitePresentation()
  const configured = presentationAssetUrl(settings.logoUrl)
  const [failedUrl, setFailedUrl] = useState<string>()
  const src = configured && configured !== failedUrl ? configured : withBasePath('/lumaskill-mark.svg')
  return (
    <span className={cn('inline-flex items-center justify-center overflow-hidden rounded-xl', className)}>
      <img
        src={src}
        onError={() => setFailedUrl(configured)}
        alt={alt ?? settings.siteName ?? PRODUCT_NAME}
        className={cn('h-full w-full object-contain', imageClassName)}
      />
    </span>
  )
}
