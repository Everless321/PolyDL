/**
 * 快手 www REST / GraphQL 传输。
 *
 * 默认用 LocalSigner 算 __NS_hxfalcon；传入的 RemoteSigner 仍然可用。
 * 只有 needSign(path) 或 force 才把签名和 caver=2 放进 query。
 * query 走 Params（axios 编码，`$` 保持原样）。
 * 空 body 的 POST 不带 content-type，和浏览器一致。
 * kww 用 config.kww，否则取 cookie 里的 kwfv1。
 *
 * 不设置 accept-encoding，留给运行时的 fetch 解压响应。
 */

import { CAVER, needSign } from './sign/falcon.js'
import { LocalSigner } from './sign/local.js'
import { Params } from './sign/params.js'
import { throwIfKuaishouStatus } from './errors.js'

export interface SignRequest {
  method: 'GET' | 'POST'
  /** 形如 /rest/v/profile/feed（不含 query） */
  path: string
  /** POST 时的原始 body 字符串（与实际发送一致）；GET 或空 body 省略 */
  body?: string
  /** 合并进签名的 query（不含 __NS_hxfalcon / caver） */
  query?: Record<string, unknown>
  /** 决定 body 归入 form 还是 requestBody；省略时按 application/json */
  contentType?: string
}

/** 签名器：产出 __NS_hxfalcon 的值 */
export interface KuaishouSigner {
  sign(req: SignRequest): Promise<string>
}

export interface RemoteSignerConfig {
  /** dym 签名服务地址，如 https://dym.example.com/kuaishou/sign */
  endpoint: string
  /** 可选鉴权 token（Bearer）*/
  token?: string
}

/**
 * 远程签名器：把签名请求 POST 给外部签名服务，取回 __NS_hxfalcon。
 *
 *   POST endpoint  body: SignRequest
 *   200 resp: { hxfalcon: "<__NS_hxfalcon 值>" }
 */
export class RemoteSigner implements KuaishouSigner {
  constructor(private config: RemoteSignerConfig) {}

  async sign(req: SignRequest): Promise<string> {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
      },
      body: JSON.stringify(req),
    })
    if (!response.ok) {
      throw new Error(`远程签名服务失败: HTTP ${response.status}`)
    }
    const data = (await response.json()) as { hxfalcon?: string }
    if (!data.hxfalcon) {
      throw new Error('远程签名服务响应缺少 hxfalcon 字段')
    }
    return data.hxfalcon
  }
}

export const KUAISHOU_HOST = 'https://www.kuaishou.com'
export const KUAISHOU_RECO_REFERER = 'https://www.kuaishou.com/new-reco'
export const KUAISHOU_ACCEPT = 'application/json'
export const KUAISHOU_ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7,ja;q=0.6'

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

/** www GET/POST 实抓顺序里我们实际发出的字段。空值不出现。 */
const WWW_HEADER_ORDER = [
  'referer',
  'user-agent',
  'accept',
  'content-type',
  'kww',
  'accept-language',
  'cookie',
  'origin',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
] as const

export interface KuaishouRestConfig {
  /** 用户登录 Cookie（含 kuaishou.server.web*_st 等登录态）*/
  cookie: string
  /** 不传则用 LocalSigner */
  signer?: KuaishouSigner
  userAgent?: string
  /** 显式 kww。不传则从 cookie 的 kwfv1 取值 */
  kww?: string
}

export interface KuaishouRestCallOptions {
  /** 签名前就放进 query 的参数 */
  query?: Record<string, unknown>
  /** 忽略白名单，强制带 __NS_hxfalcon */
  force?: boolean
  referer?: string
  /** 追加头，如 profile_referer。空字符串也会发出 */
  extraHeaders?: Record<string, string>
  /** 默认 application/json；GraphQL 用 star slash star */
  accept?: string
}

/** 从 Cookie 头里取第一段 kwfv1 的值，不解百分号。 */
export function kwfv1FromCookie(cookie: string): string {
  if (!cookie) return ''
  for (const part of cookie.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq).trim() === 'kwfv1') return trimmed.slice(eq + 1)
  }
  return ''
}

function buildWwwHeaders(
  fields: Record<string, string | undefined>,
  extras?: Record<string, string>
): Record<string, string> {
  const ordered: Record<string, string> = {}
  for (const key of WWW_HEADER_ORDER) {
    const value = fields[key]
    if (value) ordered[key] = value
  }
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      const name = key.toLowerCase()
      if (!(name in ordered)) ordered[name] = value
    }
  }
  return ordered
}

export class KuaishouRestClient {
  private cookie: string
  private signer: KuaishouSigner
  private ua: string
  private kww: string

  constructor(config: KuaishouRestConfig) {
    this.cookie = config.cookie
    this.signer = config.signer ?? new LocalSigner()
    this.ua = config.userAgent || DEFAULT_UA
    this.kww = config.kww ?? kwfv1FromCookie(config.cookie)
  }

  /**
   * 调用 www 接口。
   *
   * body 为 undefined / null 时不发 body，也不带 content-type（空 POST）。
   * body 为对象时用 JSON.stringify 的结果同时签名和发送，非 ASCII 不转义。
   * @returns 服务端 JSON。风控抛 KuaishouRiskError，未登录抛 KuaishouLoginError。
   */
  async call<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown> | null,
    options: KuaishouRestCallOptions = {}
  ): Promise<T> {
    const hasBody = body != null
    const bodyStr = hasBody ? JSON.stringify(body) : undefined

    const params = new Params()
    if (options.query) params.updateParams(options.query)
    if (options.force || needSign(path)) {
      const signReq: SignRequest = {
        method,
        path,
        contentType: 'application/json',
      }
      if (bodyStr !== undefined) signReq.body = bodyStr
      if (Object.keys(params.params).length > 0) signReq.query = { ...params.params }
      const hxfalcon = await this.signer.sign(signReq)
      params.addParam('__NS_hxfalcon', hxfalcon)
      params.addParam('caver', CAVER)
    }

    const query = params.toQueryString()
    const joiner = path.includes('?') ? '&' : '?'
    const url = query ? `${KUAISHOU_HOST}${path}${joiner}${query}` : `${KUAISHOU_HOST}${path}`

    const headers = buildWwwHeaders(
      {
        referer: options.referer || KUAISHOU_RECO_REFERER,
        'user-agent': this.ua,
        accept: options.accept || KUAISHOU_ACCEPT,
        'content-type': bodyStr !== undefined ? 'application/json' : undefined,
        kww: this.kww || undefined,
        'accept-language': KUAISHOU_ACCEPT_LANGUAGE,
        cookie: this.cookie || undefined,
        origin: method === 'POST' ? KUAISHOU_HOST : undefined,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      options.extraHeaders
    )

    const init: RequestInit = { method, headers }
    if (bodyStr !== undefined) init.body = bodyStr

    const response = await fetch(url, init)
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      if (!response.ok) {
        throw new Error(`快手 REST 请求失败: HTTP ${response.status}`)
      }
      throw new Error(`快手 REST 响应非 JSON: HTTP ${response.status}`)
    }
    throwIfKuaishouStatus(payload)
    if (!response.ok) {
      throw new Error(`快手 REST 请求失败: HTTP ${response.status}`)
    }
    return payload as T
  }
}
