/**
 * 快手 URL 解析
 *
 * 主页:   https://www.kuaishou.com/profile/<eid>
 * 作品:   https://www.kuaishou.com/short-video/<id>  或  /f/<id>
 * 直播:   https://live.kuaishou.com/u/<eid>
 * 短链:   https://v.kuaishou.com/<code> （需跟随重定向）
 * 纯 ID:  没有斜杠时原样返回
 */

const PROFILE_RE = /kuaishou\.com\/profile\/([A-Za-z0-9_-]+)/
const PHOTO_RE = /kuaishou\.com\/(?:short-video|f)\/([A-Za-z0-9_-]+)/
const LIVE_USER_RE = /live\.kuaishou\.com\/u\/([A-Za-z0-9_-]+)/
const SHORT_URL_RE = /(?:https?:\/\/)?v\.kuaishou\.com\/[A-Za-z0-9]+/i

/** 从主页链接取 userId / eid */
export function getUserId(url: string): string | null {
  return url.match(PROFILE_RE)?.[1] ?? null
}

/** 从 live.kuaishou.com/u/<eid> 取 eid */
export function getLiveUserId(url: string): string | null {
  return url.match(LIVE_USER_RE)?.[1] ?? null
}

/** 主页或直播主页里的用户 eid */
export function getProfileId(url: string): string | null {
  return getUserId(url) ?? getLiveUserId(url)
}

/** 从作品链接取 photoId */
export function getPhotoId(url: string): string | null {
  return url.match(PHOTO_RE)?.[1] ?? null
}

/**
 * 作品链接或 photoId。
 * 有斜杠时取最后一个 path 段并去掉 query，和 Python `_extract_photo_id` 一致。
 */
export function extractPhotoId(workUrlOrId: string): string {
  const text = String(workUrlOrId).trim()
  if (text.includes('/')) {
    return text.replace(/\/+$/, '').split('/').pop()?.split('?')[0] ?? text
  }
  return text
}

/** 是否为 v.kuaishou.com 短链 */
export function isShortUrl(url: string): boolean {
  return SHORT_URL_RE.test(url.trim())
}

/**
 * 跟随短链重定向，返回最终 URL。
 * 没写协议时补 https://。
 */
export async function resolveShortUrl(url: string): Promise<string> {
  const trimmed = url.trim()
  const target = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/\//, '')}`
  const response = await fetch(target, { method: 'GET', redirect: 'follow' })
  return response.url || target
}

export type KuaishouUrlKind = 'photo' | 'profile' | 'live-user' | 'short' | 'id'

export interface ParsedKuaishouTarget {
  kind: KuaishouUrlKind
  id: string
}

/** 识别作品、主页、直播主页、短链和纯 ID。短链本身不跟随重定向。 */
export function parseKuaishouTarget(input: string): ParsedKuaishouTarget {
  const text = input.trim()
  if (isShortUrl(text) && !PHOTO_RE.test(text) && !PROFILE_RE.test(text)) {
    return { kind: 'short', id: extractPhotoId(text) }
  }
  const photo = getPhotoId(text)
  if (photo) return { kind: 'photo', id: photo }
  const live = getLiveUserId(text)
  if (live) return { kind: 'live-user', id: live }
  const user = getUserId(text)
  if (user) return { kind: 'profile', id: user }
  if (!text.includes('/')) return { kind: 'id', id: text }
  return { kind: 'id', id: extractPhotoId(text) }
}
