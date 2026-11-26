import { cn } from '@/shared/lib/utils'
import { APP_FRAME_CLASS_NAME } from '@/shared/lib/layout-frame'

export const APP_HEADER_BASE_CLASS_NAME =
  'sticky top-0 z-50 border-b border-border bg-card transition-shadow duration-150'

export const APP_HEADER_CONTENT_CLASS_NAME = `${APP_FRAME_CLASS_NAME} flex min-h-16 items-center justify-between gap-3`

export const APP_HEADER_ELEVATED_CLASS_NAME =
  'shadow-sm'

export function getAppHeaderClassName(isElevated: boolean): string {
  return cn(APP_HEADER_BASE_CLASS_NAME, isElevated && APP_HEADER_ELEVATED_CLASS_NAME)
}
