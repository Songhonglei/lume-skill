import { createContext, useContext } from 'react'

export const PRODUCT_NAME = 'Luma Skill Hub'
export const SiteNameContext = createContext(PRODUCT_NAME)

export function useSiteName() {
  return useContext(SiteNameContext)
}
