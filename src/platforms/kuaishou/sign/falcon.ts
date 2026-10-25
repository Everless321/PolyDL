/**
 * `__NS_hxfalcon` 纯算签名（sig4）。
 *
 * 产物 `HUDR_<设备 blob>$HE_<45 字节容器>`：
 * HUDR 段是 TLV（scripts.length / KsGuard.count / SECS.s / SECS.c）异或 0x23 再过 ChaCha20；
 * HE 段摘要是 BLAKE2s 变体 → 3-LFSR → 前 4 字节异或常量。
 * `jmpOnw_geh()` 硬编码返回 `e0000000000000`，不是设备指纹。
 *
 * 签名器要长期持有：startupRandom 是构造时刻的 unix 毫秒，count 与 guardCount 从 100 起逐次自增。
 */

import { jsJsonStringify, jsSorted, jsToString } from './jsval.js'

export const CAVER = '2'

export const SIG4_WHITELIST = [
  '/rest/v/profile/get',
  '/rest/v/profile/user/v2',
  '/rest/v/search/user',
  '/rest/v/search/feed',
  '/rest/v/profile/feed',
  '/rest/v/feed/hot',
  '/rest/v/feed/liked',
  '/rest/v/collect/list',
  '/rest/v/profile/private/list',
] as const

/**
 * live.kuaishou.com 的 sig4 名单。签名算的是 realUrl（/rest/k/*），
 * 实际请求仍发 /live_api/*；query 按键名排序后替换真实 params；form / requestBody 恒空。
 */
export const LIVE_URL_MAP: Record<string, string> = {
  '/live_api/baseuser/userinfo/sensitive': '/rest/k/user/info/sensitive',
  '/live_api/search/author': '/rest/k/live/search/user',
  '/live_api/comment/list': '/rest/k/photo/comment/list',
  '/live_api/search/overview': '/rest/k/live/search',
  '/live_api/search/category': '/rest/k/live/game/search/category',
  '/live_api/search/liveStream': '/rest/k/live/game/search/liveStream',
  '/live_api/profile/public': '/rest/k/feed/profile',
  '/live_api/profile/private': '/rest/k/feed/profile',
  '/live_api/profile/liked': '/rest/k/feed/liked',
  '/live_api/web/header/searchHotUserListQuery': '/rest/k/live/search/hot',
  '/live_api/web/header/searchSuggestQuery': '/rest/k/live/search/suggest',
  '/live_api/liveroom/websocketinfo': '/rest/k/live/websocket/info',
  '/live_api/profileInterestMask/list': '/rest/k/pc-live/author/category',
  '/live_api/profile/feedbyid': '/rest/k/photo',
  '/live_api/profile/likestatus': '/rest/k/photo',
  '/live_api/playback/list': '/rest/k/playback/product/list',
  '/live_api/baseuser/author/checkfollow': '/rest/k/user/info',
  '/live_api/baseuser/userinfo/byid': '/rest/k/user/info',
  '/live_api/baseuser/userLogin': '/rest/k/user/info',
  '/live_api/follow/all': '/rest/k/live/relation/follower',
  '/live_api/gameboard/list': '/rest/k/pc-live/live/getByGame',
  '/live_api/home/more': '/rest/k/pc-live/labels/switch',
  '/live_api/playback/detail': '/rest/k/playback/product/play',
  '/live_api/liveroom/like': '/rest/k/live/like',
  '/live_api/liveroom/status': '/rest/wd/live/liveStream/status',
  '/live_api/non-gameboard/list': '/rest/k/pc-live/live/synthesize',
  '/live_api/playback/download': '/rest/k/material/download',
  '/live_api/profile/interestlist': '/rest/k/pc-live/author/profile/reco',
}

export const LIVE_SIG4_INTERFACES: readonly string[] = Object.keys(LIVE_URL_MAP)

/** 直播站该 url 是否需要 __NS_hxfalcon（精确匹配，与拦截器 `===` 一致）。 */
export function liveNeedSign(url: string): boolean {
  return Object.prototype.hasOwnProperty.call(LIVE_URL_MAP, (url || '').split('?')[0])
}

/** 签名输入里该用的 url：网关背后的 /rest/k/*，不是 /live_api/*。未命中则原样返回。 */
export function liveSignUrl(url: string): string {
  const path = (url || '').split('?')[0]
  return Object.prototype.hasOwnProperty.call(LIVE_URL_MAP, path) ? LIVE_URL_MAP[path] : url
}

/** id.kuaishou.com 扫码 / 短信登录的 sig4 名单（精确匹配）。 */
export const LOGIN_SIG4_INTERFACES = [
  '/rest/c/infra/ks/qr/start',
  '/rest/c/infra/ks/new/qr/start',
  '/rest/c/infra/ks/qr/scanResult',
  '/rest/c/infra/ks/new/qr/scanResult',
  '/rest/c/infra/ks/qr/acceptResult',
  '/rest/c/infra/ks/new/qr/acceptResult',
  '/pass/bid/web/sns/login/code',
  '/pass/bid/web/sns/quickLoginByKsAuth',
  '/pass/kuaishou/sms/requestMobileCode',
  '/pass/kuaishou/login/mobileCode',
  '/pass/kuaishou/login/qr/callback',
] as const

/** 登录站该 url 是否需要 __NS_hxfalcon（精确匹配）。 */
export function loginNeedSign(url: string): boolean {
  const path = (url || '').split('?')[0]
  return (LOGIN_SIG4_INTERFACES as readonly string[]).includes(path)
}

/**
 * cp.kuaishou.com 改走 sig4 的接口（子串匹配，优先级高于 sig3）。
 * 发布提交 /rest/cp/works/v2/video/pc/submit 在列，走 sig4 而非 sig3。
 */
export const CP_SIG4_INTERFACES = [
  'rest/cp/works/v2/common/pc/nearby',
  'rest/cp/works/v2/video/pc/edit/info',
  'rest/cp/works/v2/common/pc/ip2poi',
  '/rest/zt/location/wi/poi/search',
  '/rest/cp/works/v2/video/pc/submit',
] as const

/** cp 侧 signInput 多出来的 projectInfo（序列化本身不消费这个字段，与引擎 jmpOnw_ms 一致）。 */
export const CP_PROJECT_INFO: Record<string, unknown> = {
  appKey: 'mMovf2dVDF',
  debug: false,
  sampling: 1,
}

const SIGMA: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
]

const BLAKE_IV = [
  2837534710, 2845986804, 2436420605, 706843635, 719254516, 2557931286, 2596197199, 2432949778,
]

const BLAKE_PARAM = 16842784

const EO = Uint8Array.from([
  98, 0, 0, 128, 49, 117, 185, 253, 224, 172, 104, 36, 223, 155, 87, 19, 32, 0, 0, 64, 2, 0, 0, 16,
  255, 255, 255, 127, 255, 255, 255, 63, 0, 0, 0, 240, 0, 0, 0, 192, 0, 0, 0, 128, 255, 255, 255,
  15,
])

const CTS_KEY = 'Vuz4fCHxn1CO'

const CHACHA_CONST = [394484062, 2378328696, 630790222, 1922531795]
const CHACHA_KEY = [
  4183807412, 394484062, 1106561997, 2378328696, 630790222, 2546784104, 2891127470, 1922531795,
]
const CHACHA_NONCE = [2215853858, 1643070585, 1849059804]
const BLOB_XOR = 35
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const GEH = 'e0000000000000'
const XOR_DIGEST = [45, 211, 69, 192]
const XOR_ENV = [123, 86, 62, 218]
const COUNT_MASK = 3131873467
const NOW_MASK = 3360347992
/** 48 位随机上界（含 0，不含本值）：2^48 - 1。 */
export const RAND_SPAN = 281474976710655

/** cp/www bundle 的 SDK 内部版本（明文第 2 段，小端 2 字节）。 */
export const SDK_VERSION_DEFAULT = 43468
/** live.kuaishou.com 实抓版本，比 www 大 1。 */
export const SDK_VERSION_LIVE = 43469

export const DEFAULT_SCRIPTS_LEN = 24
export const DEFAULT_SECS_STACK =
  'spatchRequest (https://p23-plat.wskwai.com/kos/nlav111422/' +
  'ks-web/assets/index-bZyTA7JL.js:32:235479)'

const HTTP_URL = /^https?:\/\/([\w-]+\.)+[\w-]+/

/** 路径是否命中 www 侧 sig4 白名单。 */
export function needSign(path: string): boolean {
  return (SIG4_WHITELIST as readonly string[]).includes(path)
}

/** cp 侧该 url 是否走 sig4（子串匹配，优先级高于 sig3）。 */
export function cpNeedSign(url: string): boolean {
  const path = (url || '').split('?')[0]
  return CP_SIG4_INTERFACES.some(marker => path.includes(marker))
}

export interface FalconSignInput {
  url: string
  query: Record<string, unknown>
  form?: unknown
  requestBody?: unknown
  projectInfo?: Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Python 真值：空 dict / list / 字符串、0、false、null 为假；NaN 为真。 */
function pyTruthy(value: unknown): boolean {
  if (value == null) return false
  if (value === false) return false
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

function coerceBody(body: unknown): unknown {
  if (typeof body === 'string' && body.length > 0) {
    try {
      return JSON.parse(body) as unknown
    } catch {
      return body
    }
  }
  return body
}

/**
 * 构造送入引擎的 signInput。
 *
 * www/cp（omitEmptyBody）：没 body 就不带 form / requestBody 键。
 * live / login：源码恒写成 `form: {}` / `requestBody: {}`，键在、值为空。
 * 引擎只要看见键就会拼上 JSON.stringify 的结果（哪怕是 "{}"）。
 */
export function buildSignInput(
  path: string,
  method = 'POST',
  query?: Record<string, unknown> | null,
  body?: unknown,
  contentType = 'application/json',
  projectInfo?: Record<string, unknown> | null,
  omitEmptyBody = false
): FalconSignInput {
  // 引擎只看 path / query / body，method 保留以对齐调用方。
  void method
  const ct = (contentType || '').toLowerCase()
  const isForm = ct.includes('application/x-www-form-urlencoded')
  const isJson = ct.includes('application/json')
  const bodyObj = coerceBody(body)
  const formValue = isForm && pyTruthy(bodyObj) ? bodyObj : {}
  const bodyValue = isJson && pyTruthy(bodyObj) ? bodyObj : {}
  const signInput: FalconSignInput = {
    url: path,
    query: { caver: CAVER, ...(query ?? {}) },
  }
  if (!(omitEmptyBody && !pyTruthy(formValue))) signInput.form = formValue
  if (!(omitEmptyBody && !pyTruthy(bodyValue))) signInput.requestBody = bodyValue
  if (projectInfo && pyTruthy(projectInfo)) signInput.projectInfo = { ...projectInfo }
  return signInput
}

function pathnameOf(url: string): string {
  let path = url
  if (HTTP_URL.test(url)) {
    const rest = url.split('//')[1] ?? ''
    path = rest.includes('/') ? rest.slice(rest.indexOf('/')) : rest
  }
  return path.split('?')[0]
}

/**
 * jmpOnw_ms：pathname + 按 UTF-16 排序的 `k=ToString(v)` + （键存在时）JSON body。
 * 键名含 `__NS` 的参数跳过；null 只拼 `k=`，不拼 "null"。cookie 不进签名。
 */
export function serializeSignInput(data: FalconSignInput): string {
  const url = data.url || ''
  const path = pathnameOf(url)
  const merged: Record<string, unknown> = {}
  if (isPlainObject(data.query)) {
    for (const [key, value] of Object.entries(data.query)) merged[String(key)] = value
  }
  if (isPlainObject(data.form)) {
    for (const [key, value] of Object.entries(data.form)) merged[String(key)] = value
  }
  const items: string[] = []
  for (const [key, value] of Object.entries(merged)) {
    if (key.includes('__NS')) continue
    if (value == null) items.push(`${key}=`)
    else items.push(`${key}=${jsToString(value)}`)
  }
  let out = path + jsSorted(items).join('')
  if ('requestBody' in data && data.requestBody != null) {
    out += jsJsonStringify(data.requestBody)
  }
  return out
}

function rotr(x: number, n: number): number {
  const u = x >>> 0
  return ((u >>> n) | (u << (32 - n))) >>> 0
}

function rotl(x: number, n: number): number {
  const u = x >>> 0
  return ((u << n) | (u >>> (32 - n))) >>> 0
}

function blakeG(
  v: number[],
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  y: number
): void {
  v[a] = (v[a] + v[b] + x) >>> 0
  v[d] = rotr(v[d] ^ v[a], 16)
  v[c] = (v[c] + v[d]) >>> 0
  v[b] = rotr(v[b] ^ v[c], 12)
  v[a] = (v[a] + v[b] + y) >>> 0
  v[d] = rotr(v[d] ^ v[a], 8)
  v[c] = (v[c] + v[d]) >>> 0
  v[b] = rotr(v[b] ^ v[c], 7)
}

function blakeCompress(
  h: number[],
  words: number[],
  off: number,
  counter: number,
  length: number,
  finalBlock: boolean
): void {
  const v = h.slice(0, 8).concat(BLAKE_IV)
  v[12] = (v[12] ^ (counter >>> 0)) >>> 0
  if (finalBlock) v[14] = (v[14] ^ 0xffffffff) >>> 0
  const m = new Array<number>(16).fill(0)
  for (let i = 0; i < length; i++) {
    m[i % 16] = (m[i % 16] ^ (words[off + i] >>> 0)) >>> 0
  }
  for (const sg of SIGMA) {
    blakeG(v, 0, 4, 8, 12, m[sg[0]], m[sg[1]])
    blakeG(v, 1, 5, 9, 13, m[sg[2]], m[sg[3]])
    blakeG(v, 2, 6, 10, 14, m[sg[4]], m[sg[5]])
    blakeG(v, 3, 7, 11, 15, m[sg[6]], m[sg[7]])
    blakeG(v, 0, 5, 10, 15, m[sg[8]], m[sg[9]])
    blakeG(v, 1, 6, 11, 12, m[sg[10]], m[sg[11]])
    blakeG(v, 2, 7, 8, 13, m[sg[12]], m[sg[13]])
    blakeG(v, 3, 4, 9, 14, m[sg[14]], m[sg[15]])
  }
  for (let i = 0; i < 8; i++) h[i] = (h[i] ^ v[i] ^ v[i + 8]) >>> 0
}

/**
 * jmpOnw_b2has：BLAKE2s 变体，输出 64 位 hex。
 * 自定义 IV；消息补零到 4 字节对齐后按小端 int32 读成字；块单位是 64 字，块内 `m[i%16] ^= word`。
 */
export function blakeHex(text: string): string {
  const raw = Buffer.from(text, 'utf8')
  const pad = (4 - (raw.length % 4)) % 4
  const padded = pad ? Buffer.concat([raw, Buffer.alloc(pad)]) : raw
  const words: number[] = []
  for (let i = 0; i < padded.length; i += 4) words.push(padded.readUInt32LE(i))
  const h = BLAKE_IV.slice()
  h[0] = (h[0] ^ BLAKE_PARAM) >>> 0
  let remain = words.length
  let off = 0
  let counter = 0
  while (remain > 64) {
    counter += 64
    remain -= 64
    blakeCompress(h, words, off, counter, 64, false)
    off += 64
  }
  counter += remain
  blakeCompress(h, words, off, counter, remain, true)
  return h.map(w => (w >>> 0).toString(16).padStart(8, '0')).join('')
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

/** jmpOnw_cts：三路 LFSR，逐字节 `out = b ^ (keystream + 3)`。 */
class Cts {
  private r0: number
  private r1: number
  private r2: number
  private p0: number
  private f1: number
  private f2: number
  private m0: number
  private m1: number
  private m2: number
  private h0: number
  private h1: number
  private h2: number

  constructor(key = CTS_KEY) {
    this.r0 = u32le(EO, 12)
    this.r1 = u32le(EO, 8)
    this.r2 = u32le(EO, 4)
    this.p0 = u32le(EO, 0)
    this.f1 = u32le(EO, 16)
    this.f2 = u32le(EO, 20)
    this.m0 = u32le(EO, 24)
    this.m1 = u32le(EO, 28)
    this.m2 = u32le(EO, 44)
    this.h0 = u32le(EO, 40)
    this.h1 = u32le(EO, 36)
    this.h2 = u32le(EO, 32)
    for (let i = 0; i < 4; i++) {
      const byte = key.charCodeAt(i + 4) & 0xff
      this.r0 = (((this.r0 << 8) >>> 0) | byte) >>> 0
      this.r1 = (((this.r1 << 8) >>> 0) | byte) >>> 0
      this.r2 = (((this.r2 << 8) >>> 0) | byte) >>> 0
    }
    this.r0 = this.r0 || 324508639
    this.r1 = this.r1 || 610839776
    this.r2 = this.r2 || 4256789809
  }

  private next(): number {
    let out = 0
    let b0 = this.r1 & 1
    let b1 = this.r2 & 1
    for (let i = 0; i < 8; i++) {
      if (this.r0 & 1) {
        this.r0 = ((this.r0 ^ (this.p0 >>> 1)) | this.h0) >>> 0
        if (this.r1 & 1) {
          this.r1 = ((this.r1 ^ (this.f1 >>> 1)) | this.h1) >>> 0
          b0 = 1
        } else {
          this.r1 = ((this.r1 >>> 1) & this.m1) >>> 0
          b0 = 0
        }
      } else {
        this.r0 = ((this.r0 >>> 1) & this.m0) >>> 0
        if (this.r2 & 1) {
          this.r2 = ((this.r2 ^ (this.f2 >>> 1)) | this.h2) >>> 0
          b1 = 1
        } else {
          this.r2 = ((this.r2 >>> 1) & this.m2) >>> 0
          b1 = 0
        }
      }
      out = ((out << 1) & 0xffffffff) | (b0 ^ b1)
      if (out > 127) out -= 256
      else if (out < -128) out += 256
    }
    return out
  }

  apply(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      out[i] = (data[i] ^ (this.next() + 3)) & 0xff
    }
    return out
  }
}

function chachaBlock(state: number[]): number[] {
  const w = state.slice()
  for (let round = 0; round < 10; round++) {
    const quarters: readonly (readonly [number, number, number, number])[] = [
      [0, 4, 8, 12],
      [1, 5, 9, 13],
      [2, 6, 10, 14],
      [3, 7, 11, 15],
      [0, 5, 10, 15],
      [1, 6, 11, 12],
      [2, 7, 8, 13],
      [3, 4, 9, 14],
    ]
    for (const [a, b, c, d] of quarters) {
      w[a] = (w[a] + w[b]) >>> 0
      w[d] = rotl(w[d] ^ w[a], 16)
      w[c] = (w[c] + w[d]) >>> 0
      w[b] = rotl(w[b] ^ w[c], 12)
      w[a] = (w[a] + w[b]) >>> 0
      w[d] = rotl(w[d] ^ w[a], 8)
      w[c] = (w[c] + w[d]) >>> 0
      w[b] = rotl(w[b] ^ w[c], 7)
    }
  }
  return w.map((word, i) => (word + state[i]) >>> 0)
}

/** collectDeviceInfo 用的 ChaCha20（常量 / 密钥 / nonce 全定死，对称）。 */
export function chacha(data: Uint8Array): Uint8Array {
  const state = [...CHACHA_CONST, ...CHACHA_KEY, 1, ...CHACHA_NONCE]
  let block = chachaBlock(state)
  const out = new Uint8Array(data.length)
  let k = 0
  for (let i = 0; i < data.length; i++) {
    if (k === 64) {
      state[12] = (state[12] + 1) >>> 0
      block = chachaBlock(state)
      k = 0
    }
    const shift = (k & 3) << 3
    out[i] = (data[i] ^ ((block[k >> 2] >>> shift) & 0xff)) & 0xff
    k += 1
  }
  return out
}

/** 小端 n 字节；n>=4 且值 >= 2^32 时固定返回 4 个 0xFF（po / _a）。 */
function le(value: number, nbytes: number): number[] {
  const v = value || 0
  if (nbytes >= 4 && v >= 2 ** 32) return [255, 255, 255, 255]
  const out: number[] = []
  let n = BigInt(Math.trunc(v))
  for (let i = 0; i < nbytes; i++) {
    out.push(Number(n & 0xffn))
    n >>= 8n
  }
  return out
}

/**
 * 小端 n 字节 hex。
 * now_ms / startupRandom / rand48 超过 2^32，必须用 BigInt：JS 的 `^` 会先截成 32 位。
 */
function leHex(value: bigint, nbytes: number): string {
  let v = value
  let out = ''
  for (let i = 0; i < nbytes; i++) {
    out += Number(v & 0xffn)
      .toString(16)
      .padStart(2, '0')
    v >>= 8n
  }
  return out
}

function b64Url(data: Uint8Array): string {
  const chunks: string[] = []
  const full = data.length - (data.length % 3)
  for (let i = 0; i < full; i += 3) {
    const n = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    chunks.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63])
  }
  const rem = data.length % 3
  if (rem === 1) {
    const n = data[data.length - 1]
    chunks.push(B64[n >> 2] + B64[(n << 4) & 63] + '==')
  } else if (rem === 2) {
    const n = (data[data.length - 2] << 8) + data[data.length - 1]
    chunks.push(B64[n >> 10] + B64[(n >> 4) & 63] + B64[(n << 2) & 63] + '=')
  }
  return chunks.join('').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '.')
}

/** collectDeviceInfo：TLV → 异或 0x23 → ChaCha20 → base64url，前缀 HUDR_。 */
export function devicePrefix(
  scriptsLen: number,
  guardCount: number,
  secsStack: string,
  secsCount: number
): string {
  const chars = Array.from(secsStack)
  const blob: number[] = [45, 61, 0, 2]
  blob.push(68, 0, ...le(scriptsLen, 4))
  blob.push(112, 0, ...le(guardCount, 4))
  blob.push(114, 1, ...le(chars.length, 2))
  for (const ch of chars) blob.push(ch.codePointAt(0) ?? 0)
  blob.push(115, 0, ...le(secsCount, 4))
  const xored = Uint8Array.from(blob, b => (b ^ BLOB_XOR) & 0xff)
  return `HUDR_${b64Url(chacha(xored))}`
}

function hexChecksum(hex: string): string {
  let total = 0
  for (let i = 0; i < hex.length; i += 2) total += Number.parseInt(hex.slice(i, i + 2), 16)
  const byte = total > 255 ? -total & 0xff : total & 0xff
  return byte.toString(16).padStart(2, '0')
}

/** 末字节（校验字节）作密钥整体异或。与 sig3 不同，不异或下标。 */
function container(hex: string, checksum: string): string {
  const raw = Buffer.from(hex + checksum, 'hex')
  const key = raw[raw.length - 1]
  const out = Buffer.alloc(raw.length)
  for (let i = 0; i < raw.length - 1; i++) out[i] = raw[i] ^ key
  out[raw.length - 1] = key
  return out.toString('hex')
}

export interface HxFalconSignerOptions {
  /** 引擎构造时刻的 unix 毫秒（6 字节，可大于 2^32）。 */
  startupRandom?: number
  count?: number
  guardCount?: number
  scriptsLen?: number
  secsStack?: string
  sdkVersion?: number
}

/** __NS_hxfalcon 签名器。每个爬虫会话一个实例，不要每次请求新建。 */
export class HxFalconSigner {
  startupRandom: number
  count: number
  guardCount: number
  scriptsLen: number
  secsStack: string
  sdkVersion: number

  constructor(options: HxFalconSignerOptions = {}) {
    this.startupRandom =
      options.startupRandom == null ? Date.now() : Math.trunc(options.startupRandom)
    this.count = options.count == null ? 100 : Math.trunc(options.count)
    this.guardCount = options.guardCount == null ? 100 : Math.trunc(options.guardCount)
    this.scriptsLen =
      options.scriptsLen == null ? DEFAULT_SCRIPTS_LEN : Math.trunc(options.scriptsLen)
    this.secsStack = options.secsStack ?? DEFAULT_SECS_STACK
    this.sdkVersion =
      options.sdkVersion == null ? SDK_VERSION_DEFAULT : Math.trunc(options.sdkVersion)
  }

  /** 用当前时间与随机数计算签名。count / guardCount 各 +1。 */
  sign(signInput: FalconSignInput): string {
    return this.encode(signInput, Date.now(), Math.floor(Math.random() * RAND_SPAN))
  }

  /**
   * `$encode` 的确定性入口。nowMs、rand48 显式传入，便于和 Python 对拍。
   * nowMs 与 startupRandom 都是约 1.7e12 的毫秒，异或与 6 字节小端按任意精度整数处理。
   */
  encode(signInput: FalconSignInput, nowMs: number, rand48: number): string {
    const prefix = devicePrefix(this.scriptsLen, this.guardCount, this.secsStack, this.count)
    this.guardCount += 1

    const serialized = serializeSignInput(signInput)
    const stream = new Cts().apply(Buffer.from(blakeHex(serialized + prefix), 'utf8'))
    let digest = ''
    for (let i = 0; i < 4; i++) {
      digest += ((stream[i] ^ XOR_DIGEST[i % 4]) & 0xff).toString(16).padStart(2, '0')
    }

    const envRaw = Buffer.from(GEH, 'hex')
    let env = ''
    for (let i = 0; i < envRaw.length; i++) {
      env += ((envRaw[i] ^ XOR_ENV[i % 4]) & 0xff).toString(16).padStart(2, '0')
    }

    const body =
      '4b54' +
      leHex(BigInt(this.sdkVersion), 2) +
      'ab' +
      leHex(BigInt(this.startupRandom), 6) +
      leHex(BigInt(Math.trunc(rand48)), 6) +
      '0100000001' +
      leHex(BigInt(this.count) ^ BigInt(COUNT_MASK), 4) +
      digest +
      leHex(BigInt(Math.trunc(nowMs)) ^ BigInt(NOW_MASK), 6) +
      env +
      hexChecksum(env)
    this.count += 1
    return `${prefix}$HE_${container(body, hexChecksum(body))}`
  }
}

export type HxfalconSite = 'www' | 'live' | 'login' | 'cp'

export interface GenerateHxfalconOptions {
  path: string
  method?: string
  query?: Record<string, unknown> | null
  body?: unknown
  contentType?: string
  /** www/cp 共用一个引擎；live、login 各自独立，live 的 SDK 版本是 43469。 */
  site?: HxfalconSite
}

let wwwSigner: HxFalconSigner | null = null
let liveSigner: HxFalconSigner | null = null
let loginSigner: HxFalconSigner | null = null

function wwwFalcon(): HxFalconSigner {
  if (!wwwSigner) wwwSigner = new HxFalconSigner()
  return wwwSigner
}

function liveFalcon(): HxFalconSigner {
  if (!liveSigner) liveSigner = new HxFalconSigner({ sdkVersion: SDK_VERSION_LIVE })
  return liveSigner
}

function loginFalcon(): HxFalconSigner {
  if (!loginSigner) loginSigner = new HxFalconSigner()
  return loginSigner
}

/** 重置 sig4 会话（等价于刷新页面：重取 startupRandom，计数归 100）。 */
export function resetHxfalconSession(): void {
  wwwSigner = null
  liveSigner = null
  loginSigner = null
}

/**
 * 生成 `__NS_hxfalcon`。
 * www / cp：omitEmptyBody，没 body 不带 form / requestBody；cp 额外带 CP_PROJECT_INFO。
 * live / login：空对象键保留。live 使用 SDK_VERSION_LIVE。login 默认 content-type 为 form。
 */
export function generateHxfalcon(options: GenerateHxfalconOptions): string {
  const site = options.site ?? 'www'
  const method = options.method ?? (site === 'live' ? 'GET' : 'POST')
  const contentType =
    options.contentType ??
    (site === 'login' ? 'application/x-www-form-urlencoded' : 'application/json')
  const omitEmptyBody = site === 'www' || site === 'cp'
  const signer = site === 'live' ? liveFalcon() : site === 'login' ? loginFalcon() : wwwFalcon()
  const signInput = buildSignInput(
    options.path,
    method,
    options.query,
    options.body,
    contentType,
    site === 'cp' ? CP_PROJECT_INFO : null,
    omitEmptyBody
  )
  return signer.sign(signInput)
}
