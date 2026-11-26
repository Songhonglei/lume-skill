import { createContext, useContext } from 'react'

export const PRODUCT_NAME = 'Luma Skill Hub'
export const DEFAULT_BRAND_MARK = '/lumaskill-mark.svg'
export const SiteNameContext = createContext(PRODUCT_NAME)

export function useSiteName() {
  return useContext(SiteNameContext)
}
