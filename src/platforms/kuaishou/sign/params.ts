/**
 * query 构造器。签名通过 withHxfalcon（www）/ withCpSign（cp，自动选 sig4 或 sig3）注入。
 *
 * axios 的 query 编码是 encodeURIComponent 之后把 `: $ , [ ]` 还原、`%20` 换成 `+`。
 * `__NS_hxfalcon` 的值里带 `$`，不能用会把 `$` 编成 `%24` 的序列化。
 */

import { CAVER, cpNeedSign, generateHxfalcon, needSign } from './falcon.js'
import { jsToString, percentEncode } from './jsval.js'
import { generateSig3, needSig3 } from './sig3.js'

/** axios 在 encodeURIComponent 基础上放行的字符。 */
const AXIOS_UNRESERVED = "-_.!~*'()" + ':$,[]'

/** axios query 编码：safe 放行 `:$,[]` 与 encodeURIComponent 保留字符，空格变 `+`。 */
export function axiosEncode(value: unknown): string {
  return percentEncode(jsToString(value), AXIOS_UNRESERVED).replaceAll('%20', '+')
}

export class Params {
  params: Record<string, unknown> = {}

  addParam(key: string, value: unknown): this {
    this.params[key] = value
    return this
  }

  updateParams(params: Record<string, unknown>): this {
    Object.assign(this.params, params)
    return this
  }

  get(): Record<string, unknown> {
    return this.params
  }

  /** www.kuaishou.com 通用 query。 */
  withKpn(): this {
    this.params.kpn = 'KUAISHOU_VISION'
    return this
  }

  /**
   * 注入 www 数据侧 sig4（`__NS_hxfalcon` + `caver`）。
   * 仅当 path 命中白名单或 force 时注入。签名器是进程级单例，计数逐次自增。
   */
  withHxfalcon(
    path: string,
    method = 'POST',
    body?: unknown,
    contentType = 'application/json',
    force = false
  ): this {
    if (!(force || needSign(path))) return this
    const sig = generateHxfalcon({
      path,
      method,
      query: { ...this.params },
      body,
      contentType,
      site: 'www',
    })
    if (sig) {
      this.params.__NS_hxfalcon = sig
      this.params.caver = CAVER
    }
    return this
  }

  /**
   * 注入 cp 发布侧签名。
   * 绝大多数 `/rest/cp/*` 走 `__NS_sig3`；nearby / ip2poi / edit/info / poi/search / video/pc/submit 走 sig4。
   */
  withCpSign(path: string, body?: unknown, reqType = 'json'): this {
    if (cpNeedSign(path)) {
      const sig = generateHxfalcon({
        path,
        method: 'POST',
        query: { ...this.params },
        body,
        contentType: 'application/json',
        site: 'cp',
      })
      if (sig) {
        this.params.__NS_hxfalcon = sig
        this.params.caver = CAVER
      }
    } else if (needSig3(path)) {
      const sig = generateSig3(path, { ...this.params }, body, reqType)
      if (sig) this.params.__NS_sig3 = sig
    }
    return this
  }

  /** 按 axios 口径序列化，键顺序与插入顺序一致。 */
  toQueryString(): string {
    return Object.entries(this.params)
      .map(([key, value]) => `${axiosEncode(key)}=${axiosEncode(value)}`)
      .join('&')
  }

  toString(): string {
    return this.toQueryString()
  }
}
