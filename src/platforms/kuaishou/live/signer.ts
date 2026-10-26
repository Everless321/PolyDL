/**
 * 把 `sign/` 的纯算签名器接成直播客户端要的 `LiveHxfalconSigner`。
 *
 * 客户端传入的 `path` 已经是 `liveSignUrl()` 的 realUrl，`query` 已按键名排序，
 * 且不含 `caver` / `__NS_hxfalcon`。这里调用：
 *
 * ```ts
 * generateHxfalcon({
 *   path,                         // 例如 /rest/k/live/websocket/info
 *   method: 'GET',
 *   query,                        // buildSignInput 会把 caver 放到 query 最前
 *   contentType: 'application/json',
 *   site: 'live',                 // SDK_VERSION_LIVE = 43469，独立计数器
 * })
 * ```
 *
 * `site: 'live'` 时 omitEmptyBody 为 false：`form` 与 `requestBody` 键保留、值为 `{}`。
 * 直播站 POST body 不参与签名，所以这里不传 body。
 */
import { generateHxfalcon } from '../sign/index.js'

import type { LiveHxfalconSigner } from './types.js'

export function createLiveSigner(): LiveHxfalconSigner {
  return input =>
    generateHxfalcon({
      path: input.path,
      method: 'GET',
      query: input.query,
      contentType: 'application/json',
      site: 'live',
    })
}
