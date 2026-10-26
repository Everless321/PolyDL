/**
 * 直播站请求的 query 编码，以及从 sign/ 转出的 URL 映射。
 *
 * `LIVE_URL_MAP` / `liveNeedSign` / `liveSignUrl` 以 `sign/` 为准（精确匹配，
 * 签名用 realUrl）。axios 编码把 `%24` 还原成 `$`，避免 `__NS_hxfalcon` 被转义。
 */
export { CAVER, LIVE_URL_MAP, SDK_VERSION_LIVE, liveNeedSign, liveSignUrl } from '../sign/index.js'

export const LIVE_ORIGIN = 'https://live.kuaishou.com'

export const LIVE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

/** JS 默认排序就是 UTF-16 码元序，和 Python `js_sorted` 对 BMP 字符一致。 */
export function sortQuery(query: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {}
  for (const key of Object.keys(query).sort()) ordered[key] = query[key]
  return ordered
}

function jsToString(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value))
    return value.map(item => (item == null ? '' : jsToString(item))).join(',')
  return '[object Object]'
}

/** axios query 编码：encodeURIComponent 后还原 `: $ , [ ]`，空格用 `+`。 */
export function axiosEncode(value: unknown): string {
  return encodeURIComponent(jsToString(value))
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']')
}

export function toQueryString(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([key, value]) => `${axiosEncode(key)}=${axiosEncode(value)}`)
    .join('&')
}
