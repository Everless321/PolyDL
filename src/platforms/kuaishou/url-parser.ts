/**
 * 快手 URL 解析
 *
 * 主页:   https://www.kuaishou.com/profile/3x5mpuwhjphwr8w
 * 作品:   https://www.kuaishou.com/short-video/3x...  或  /f/...
 * 短链:   https://v.kuaishou.com/xxxxxx （需跟随重定向）
 */

const PROFILE_RE = /kuaishou\.com\/profile\/([A-Za-z0-9_-]+)/
const PHOTO_RE = /kuaishou\.com\/(?:short-video|f)\/([A-Za-z0-9_-]+)/
const SHORT_URL_RE = /https?:\/\/v\.kuaishou\.com\/[A-Za-z0-9]+/

/** 从主页链接取 userId */
export function getUserId(url: string): string | null {
  return url.match(PROFILE_RE)?.[1] ?? null
}

/** 从作品链接取 photoId */
export function getPhotoId(url: string): string | null {
  return url.match(PHOTO_RE)?.[1] ?? null
}

/** 是否为短链 */
export function isShortUrl(url: string): boolean {
  return SHORT_URL_RE.test(url)
}

/**
 * 跟随短链重定向，返回最终 URL
 */
export async function resolveShortUrl(url: string): Promise<string> {
  const response = await fetch(url, { method: 'GET', redirect: 'follow' })
  return response.url || url
}
