/**
 * kww / kwfv1 / kwscode 的纯算部分。
 *
 * `st$1` 是 AES-128-CBC + PKCS7，IV 等于 key，输出 base64。
 * kwfv1 外壳：`K` + s[:4] + `W` + s[4:-2] + `F` + s[-2:]。
 * kwscode 把末尾标记换成 `S`。
 *
 * 请求头 kww 在回访时就是 cookie 里的 kwfv1，不重新计算（见 KwwProvider）。
 * 官方脚本形态的 kwfv1 / 6 分钟 secToken 依赖 gdfp 与 Node 预言机，这里不实现。
 */

import { createCipheriv } from 'node:crypto'

import { encodeUri } from './jsval.js'

export const FINGERPRINT_KEY = 'K8wm5PvY9nX7qJc2'
export const TOKEN_KEY = 'H4tL6rNd3vB9xM5k'
export const DEFAULT_KEY = 'webweaponconfigs'
/** kwscode / kwssectoken：6/1440 天 = 6 分钟。 */
export const COOKIE_TTL = 6 * 60
export const PRODUCT_NAME_WWW = 'kuaishou-vision'
export const PRODUCT_NAME_CP = 'onvideo-cp'
export const PRODUCT_NAME_LIVE = 'PCLive'
export const PRODUCT_NAME_CAPTCHA = 'verification-captcha'
export const HREF_WWW = 'https://www.kuaishou.com/new-reco'
export const HREF_CP = 'https://cp.kuaishou.com/article/publish/video?origin=www.kuaishou.com'
export const HREF_LIVE = 'https://live.kuaishou.com/'
export const HREF_CAPTCHA = 'https://captcha.zt.kuaishou.com/iframe/index.html'

const RAND_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** st$1：AES-128-CBC + PKCS7，IV 等于 key，输出 base64。 */
export function weaponEncrypt(plain: string, key = DEFAULT_KEY): string {
  const keyBytes = Buffer.from(key, 'utf8')
  const cipher = createCipheriv('aes-128-cbc', keyBytes, keyBytes)
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64')
}

/** 从 62 字符表（大写 + 小写 + 数字，顺序同源码）里取 n 个。 */
export function randomString(n: number): string {
  let out = ''
  for (let i = 0; i < n; i++) {
    out += RAND_ALPHABET[Math.floor(Math.random() * RAND_ALPHABET.length)]
  }
  return out
}

/** SDK 加壳：`K` + s[:4] + `W` + s[4:-2] + tag + s[-2:]。 */
export function wrapShell(cipherB64: string, tag: string): string {
  return `K${cipherB64.slice(0, 4)}W${cipherB64.slice(4, -2)}${tag}${cipherB64.slice(-2)}`
}

/**
 * 是否是本地兜底的 `K..W..<tag>..` 外壳。
 * 官方 kwf 脚本产出的 kwfv1 是 174/218 字符，kwscode 是 64 位小写 hex，都不是这种形态。
 */
export function looksLikeShell(value: string, tag = 'F'): boolean {
  return (
    Boolean(value) &&
    value.length > 9 &&
    value[0] === 'K' &&
    value[5] === 'W' &&
    value.at(-3) === tag
  )
}

/** 生成 kwfv1 设备指纹（源码 `!n` 分支）。href 只取前 80 个字符。 */
export function buildKwfv1(
  href: string,
  did = '',
  productName = PRODUCT_NAME_WWW,
  nowMs?: number,
  nonce?: string
): string {
  const now = nowMs == null ? Date.now() : nowMs
  const n = nonce == null ? randomString(8) : nonce
  const plain = `${encodeUri(href.slice(0, 80))}|${did}|${productName}|${now}|${n}`
  return wrapShell(weaponEncrypt(plain, FINGERPRINT_KEY), 'F')
}

/** 生成 kwscode（源码 `!r || !o` 分支，明文取 secToken 前 8 位）。 */
export function buildKwscode(
  href: string,
  secToken: string,
  did = '',
  productName = PRODUCT_NAME_WWW,
  nowMs?: number
): string {
  const now = nowMs == null ? Date.now() : nowMs
  const plain = `${encodeUri(href.slice(0, 80))}|${did}|${productName}|${now}|${secToken.slice(0, 8)}`
  return wrapShell(weaponEncrypt(plain, TOKEN_KEY), 'S')
}

/**
 * 页面级 kww：透传 cookie / localStorage 里的 kwfv1。
 * 浏览器把当时的 kwfv1 冻成该页的 kww 请求头，后续 cookie 轮换不覆盖这个快照。
 */
export class KwwProvider {
  kwfv1: string

  constructor(kwfv1 = '') {
    this.kwfv1 = kwfv1 || ''
  }

  /** kww 请求头的值，就是持有的 kwfv1。 */
  kww(): string {
    return this.kwfv1
  }

  /** 有值才带 kww 头（对齐 `n && (t.kww = n)`）。 */
  headers(): Record<string, string> {
    return this.kwfv1 ? { kww: this.kwfv1 } : {}
  }

  setKwfv1(kwfv1: string): this {
    this.kwfv1 = kwfv1 || ''
    return this
  }
}
