/**
 * `__NS_sig3` 纯算签名（cp.kuaishou.com）。
 *
 * 签名输入只有 query + body，不含 path 与 method。产物是 56 个 hex（28 字节）：
 * 魔数 TE / 版本 0130 / startupRandom(LE) / count(LE) / 4 字节摘要 / 常量 1653548225 /
 * 01 00 01 00 00 00 00 / 校验字节。
 * 摘要是两轮自定义 IV 的 SHA-256，长度字段写 `(len + 63) * 8`，不是标准比特数。
 * 容器：`out[i] = plain[i] ^ key ^ i`，末字节原样保留。
 */

import { createHash } from 'node:crypto'

import { cpNeedSign } from './falcon.js'
import { encodeUri, jsJsonStringify, jsSorted, unquote } from './jsval.js'

/** getUrlWithSig3 的前置标记。 */
export const SIG3_URL_MARKERS = ['/rest/cp', 'rest/v2/creator', '/rest/kd'] as const

/** 命中 sig3 域且不属于 cp sig4 名单。 */
export function needSig3(url: string): boolean {
  if (!url || !SIG3_URL_MARKERS.some(marker => url.includes(marker))) return false
  return !cpNeedSign(url)
}

/** 对齐 JS parseQuery：取最后一个 `?` 之后解析；无 `?` 时返回空对象。 */
export function parseQuery(url: string): Record<string, string> {
  const raw = url || ''
  const parts = raw.split('?')
  const tail = parts[parts.length - 1] ?? ''
  if (tail === raw) return {}
  const query: Record<string, string> = {}
  for (const item of tail.split('&')) {
    const pair = item.split('=')
    if (!pair[0]) continue
    query[unquote(pair[0])] = unquote(pair.length > 1 ? (pair[1] ?? '') : '')
  }
  return query
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** key 按 UTF-16 升序后拼 `k=encodeURI(v)`，中间无分隔符。 */
export function request2SortedString(obj: unknown): string {
  if (!isPlainObject(obj)) return ''
  const byStr: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) byStr[String(key)] = value
  return jsSorted(Object.keys(byStr))
    .map(key => `${key}=${encodeUri(byStr[key])}`)
    .join('')
}

/**
 * 对齐 request2Md5，产出送入 `$encode` 的 32 位小写 hex。
 * `form-data` 把 body 并入 query 一起排序；`json` 在末尾拼 JSON.stringify(body)。
 */
export function request2Md5(
  query?: Record<string, unknown> | null,
  body?: unknown,
  reqType = 'json'
): string {
  const merged: Record<string, unknown> = { ...(query ?? {}) }
  let suffix = ''
  if (reqType === 'form-data') {
    if (isPlainObject(body) && Object.keys(body).length > 0) Object.assign(merged, body)
  } else if (reqType === 'json') {
    suffix = jsJsonStringify(body != null ? body : {})
  }
  const plain = request2SortedString(merged) + suffix
  return createHash('md5').update(plain, 'utf8').digest('hex')
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

/** 两轮各自的自定义初始向量（源码有符号十进制，这里转成 uint32）。 */
const SIG3_IV: number[][] = [
  [1201087869, 728038316, -1247317401, -375217708, -1820116536, 395408228, 1482956210, -1904517706],
  [-932960537, -839864669, 895983619, 323220038, 1908748190, 778712444, -2022813415, -1089440689],
].map(row => row.map(v => v >>> 0))

function rotr(x: number, n: number): number {
  const u = x >>> 0
  return ((u >>> n) | (u << (32 - n))) >>> 0
}

/**
 * 引擎 d()：追加 0x80，切 16 字大端块，末尾写比特长度。
 * 长度字段是 `(len + 63) * 8`（len 已含 0x80），不是标准 SHA-256 的原文比特数。
 */
function sha256Blocks(msg: Uint8Array): number[][] {
  const data = new Uint8Array(msg.length + 1)
  data.set(msg)
  data[msg.length] = 0x80
  const len = data.length
  const total = Math.ceil((len / 4 + 2) / 16)
  const blocks: number[][] = []
  for (let i = 0; i < total; i++) {
    const block = new Array<number>(16).fill(0)
    for (let j = 0; j < 16; j++) {
      let word = 0
      for (let b = 0; b < 4; b++) {
        const idx = i * 64 + j * 4 + b
        const byte = idx < len ? data[idx] : 0
        word |= byte << (24 - 8 * b)
      }
      block[j] = word >>> 0
    }
    blocks.push(block)
  }
  const bits = BigInt(len + 63) * 8n
  const last = blocks[blocks.length - 1]
  last[14] = Number((bits >> 32n) & 0xffffffffn) >>> 0
  last[15] = Number(bits & 0xffffffffn) >>> 0
  return blocks
}

/** 标准 SHA-256 压缩，仅初始向量被替换。 */
function sha256Compress(blocks: number[][], iv: number[]): number[] {
  let h0 = iv[0] >>> 0
  let h1 = iv[1] >>> 0
  let h2 = iv[2] >>> 0
  let h3 = iv[3] >>> 0
  let h4 = iv[4] >>> 0
  let h5 = iv[5] >>> 0
  let h6 = iv[6] >>> 0
  let h7 = iv[7] >>> 0
  for (const block of blocks) {
    const w = block.slice()
    for (let t = 16; t < 64; t++) {
      const w15 = w[t - 15] >>> 0
      const w2 = w[t - 2] >>> 0
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0
      w.push((w[t - 16] + s0 + w[t - 7] + s1) >>> 0)
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let t = 0; t < 64; t++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0
      const t1 = (h + s1 + ch + SHA256_K[t] + w[t]) >>> 0
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const t2 = (s0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
}

function beBytes(words: number[]): Uint8Array {
  const out = new Uint8Array(words.length * 4)
  for (let i = 0; i < words.length; i++) {
    const w = words[i] >>> 0
    out[i * 4] = (w >>> 24) & 0xff
    out[i * 4 + 1] = (w >>> 16) & 0xff
    out[i * 4 + 2] = (w >>> 8) & 0xff
    out[i * 4 + 3] = w & 0xff
  }
  return out
}

/**
 * `$encode` 里的 4 字节摘要。
 * 第二轮直接吃上一轮的二进制串，不再做 UTF-8 编码。
 */
export function sig3Digest(md5hex: string): Uint8Array {
  const first = sha256Compress(sha256Blocks(Buffer.from(md5hex, 'utf8')), SIG3_IV[0])
  const second = sha256Compress(sha256Blocks(beBytes(first)), SIG3_IV[1])
  return beBytes([second[0]]).subarray(0, 4)
}

export const SIG3_PAYLOAD_LEN = 28

export const SIG3_LAYOUT = {
  magic: [0, 2],
  version: [2, 4],
  startupRandom: [4, 8],
  count: [8, 12],
  digest: [12, 16],
  build: [16, 20],
  flags: [20, 27],
  checksum: [27, 28],
} as const

export const SIG3_MAGIC = Buffer.from('TE', 'latin1')
export const SIG3_VERSION = Buffer.from('0130', 'hex')
export const SIG3_BUILD = 1653548225
export const SIG3_FLAGS = Buffer.from('01000100000000', 'hex')

/** 2026-08-08 cp 发布页 reload 的实测样本，供差分与回归。 */
export const SIG3_SAMPLES: Record<string, string> = {
  '/rest/cp/works/v2/common/pc/current/user':
    '31216656bf801508196c6f6e5e1ec0e5b450f814707072727d7c7f65',
  '/rest/cp/works/v2/video/pc/upload/config':
    '34246353ba85100d11696a6b5b1bc5e0b155fd117575777778797a60',
  '/rest/cp/works/atlas/pc/upload/config':
    '32226555bc83160b1d6f6c6d5d1dc3e6b753fb17737371717e7f7c66',
  '/rest/cp/works/v2/collection/tab': '3a2a6d5db48b1e030d6764655515cbeebf5bf31f7b7b79797677746e',
  '/rest/cp/works/v2/common/pc/w/info': 'd3c384b45d62f7eafa8e8d8c3f6254c356b21af6929290909f9e9d87',
}

/** 前 27 字节的无符号和；超过 255 时取其相反数的低字节。 */
export function sig3Checksum(head27: Uint8Array): number {
  let total = 0
  for (const byte of head27) total += byte
  return total > 255 ? -total & 0xff : total & 0xff
}

/** 用末字节作密钥，逐字节异或密钥与下标。明文必须是 28 字节。 */
export function encodeSig3(plain: Uint8Array): string {
  if (plain.length !== SIG3_PAYLOAD_LEN) {
    throw new Error(`明文长度异常：${plain.length} 字节（期望 ${SIG3_PAYLOAD_LEN}）`)
  }
  const key = plain[27]
  const out = Buffer.alloc(SIG3_PAYLOAD_LEN)
  for (let i = 0; i < 27; i++) out[i] = (plain[i] ^ key ^ i) & 0xff
  out[27] = key
  return out.toString('hex')
}

export interface Sig3Decoded {
  plainHex: string
  key: number
  magicHex: string
  versionHex: string
  startupRandom: number
  count: number
  digestHex: string
  build: number
  flagsHex: string
  checksum: number
  checksumOk: boolean
}

/** encodeSig3 的逆操作，按 SIG3_LAYOUT 拆段。 */
export function decodeSig3(sig: string): Sig3Decoded {
  const raw = Buffer.from(sig, 'hex')
  if (raw.length !== SIG3_PAYLOAD_LEN) {
    throw new Error(`__NS_sig3 长度异常：${raw.length} 字节（期望 ${SIG3_PAYLOAD_LEN}）`)
  }
  const key = raw[27]
  const plain = Buffer.alloc(SIG3_PAYLOAD_LEN)
  for (let i = 0; i < 27; i++) plain[i] = (raw[i] ^ key ^ i) & 0xff
  plain[27] = key
  const startupRandom = plain.readUInt32LE(4)
  const count = plain.readUInt32LE(8)
  const build = plain.readUInt32LE(16)
  return {
    plainHex: plain.toString('hex'),
    key,
    magicHex: plain.subarray(0, 2).toString('hex'),
    versionHex: plain.subarray(2, 4).toString('hex'),
    startupRandom,
    count,
    digestHex: plain.subarray(12, 16).toString('hex'),
    build,
    flagsHex: plain.subarray(20, 27).toString('hex'),
    checksum: key,
    checksumOk: sig3Checksum(plain.subarray(0, 27)) === key,
  }
}

function le32(value: number): Buffer {
  const out = Buffer.alloc(4)
  let v = BigInt(Math.trunc(value))
  for (let i = 0; i < 4; i++) {
    out[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

export interface Sig3SignInput {
  query?: Record<string, unknown> | null
  body?: unknown
  type?: string
}

/** __NS_sig3 签名器。startupRandom 是引擎构造时的 unix 秒，count 从 100 起每次 +1。 */
export class Sig3Signer {
  startupRandom: number
  count: number

  constructor(startupRandom?: number, count = 100) {
    this.startupRandom =
      startupRandom == null ? Math.trunc(Date.now() / 1000) : Math.trunc(startupRandom)
    this.count = Math.trunc(count)
  }

  sign(signInput: Sig3SignInput): string {
    return this.encode(signInput)
  }

  /** 确定性入口：不读时钟。count 在返回前 +1。 */
  encode(signInput: Sig3SignInput): string {
    const digestInput = request2Md5(signInput.query, signInput.body, signInput.type ?? 'json')
    return this.encodeDigest(digestInput)
  }

  /** 已知 32 位 md5 hex 时直接装箱。 */
  encodeDigest(digestInput: string): string {
    const head = Buffer.concat([
      SIG3_MAGIC,
      SIG3_VERSION,
      le32(this.startupRandom),
      le32(this.count),
      sig3Digest(digestInput),
      le32(SIG3_BUILD),
      SIG3_FLAGS,
    ])
    this.count += 1
    return encodeSig3(Buffer.concat([head, Buffer.from([sig3Checksum(head)])]))
  }
}

let sig3Signer: Sig3Signer | null = null

function sig3(): Sig3Signer {
  if (!sig3Signer) sig3Signer = new Sig3Signer()
  return sig3Signer
}

/** 重置 sig3 会话（重取 startupRandom，count 归 100）。 */
export function resetSig3Session(): void {
  sig3Signer = null
}

/**
 * 生成 `__NS_sig3`。与 Python `generate_sig3` 一样，url 不进摘要
 * （是否该签由调用方用 `needSig3` 判断）。reqType 为 `json` 或 `form-data`。
 */
export function generateSig3(
  url: string,
  query?: Record<string, unknown> | null,
  body?: unknown,
  reqType = 'json'
): string {
  void url
  return sig3().sign({
    query: { ...(query ?? {}) },
    body: body != null ? body : {},
    type: reqType,
  })
}
