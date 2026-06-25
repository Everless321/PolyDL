/**
 * 快手签名 REST 客户端
 *
 * 关键事实（已实测验证）：
 * - /rest/v/* 接口需要 __NS_hxfalcon 签名（falcon/Jose 引擎，fiber-JSVMP，无法纯 TS 重写）
 * - 签名与登录解耦：签名只需被服务端接受（可由匿名浏览器产出），登录由请求时的 Cookie 提供
 * - 因此一个共享的「签名器」可服务多个用户，各自带自己的登录 Cookie
 *
 * 库本身不内置浏览器：通过 KuaishouSigner 接口注入。dym 侧用常驻无头浏览器实现，
 * 开源用户可用默认 graphql 路径（见 handler）或注入自己的签名器 / 指向远程签名服务。
 */

export interface SignRequest {
  method: 'GET' | 'POST'
  /** 形如 /rest/v/profile/feed（不含 query） */
  path: string
  /** POST 时的原始 body 字符串（与实际发送一致）；GET 省略 */
  body?: string
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
 * 远程签名器：把签名请求 POST 给 dym 的浏览器签名服务，取回 __NS_hxfalcon。
 *
 * 这是「方案 C」的库侧实现 —— dym 常驻一个浏览器跑签名服务，开源用户/多实例
 * 只需指向该服务，无需各自装浏览器。服务约定：
 *   POST endpoint  body: { method, path, body? }
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

const HOST = 'https://www.kuaishou.com'
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

export interface KuaishouRestConfig {
  /** 用户登录 Cookie（含 kuaishou.server.web*_st 等登录态）*/
  cookie: string
  signer: KuaishouSigner
  userAgent?: string
}

export class KuaishouRestClient {
  private cookie: string
  private signer: KuaishouSigner
  private ua: string

  constructor(config: KuaishouRestConfig) {
    this.cookie = config.cookie
    this.signer = config.signer
    this.ua = config.userAgent || DEFAULT_UA
  }

  /**
   * 调用签名 REST 接口：签名 → 拼 URL → 带登录 Cookie 发送 → 解析 JSON
   * @returns 服务端返回的 JSON（result===1 为成功；109 为未登录）
   */
  async call<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined
    const hxfalcon = await this.signer.sign({ method, path, body: bodyStr })
    const url = `${HOST}${path}?__NS_hxfalcon=${hxfalcon}&caver=2`

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.cookie,
        Referer: `${HOST}/`,
        'User-Agent': this.ua,
      },
      body: bodyStr,
    })

    if (!response.ok) {
      throw new Error(`快手 REST 请求失败: HTTP ${response.status}`)
    }
    return (await response.json()) as T
  }
}
