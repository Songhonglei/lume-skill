import { withBasePath } from './base-path'

/** The API stores built-in avatars at a portable path across deployment prefixes. */
export function avatarAssetUrl(url: string): string {
  return /^\/avatars\/[a-z]+\.svg$/.test(url) ? withBasePath(url) : url
}
