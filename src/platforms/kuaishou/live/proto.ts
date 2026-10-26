/**
 * 直播弹幕 WebSocket 的 protobuf 编解码（描述符驱动）。
 *
 * schema 来自 live-app.js 内嵌的 protobufjs JSON descriptor
 * （`live_ws_proto.json`）与运行时映射（`live_ws_maps.json`）。
 * 对齐 KuaiShou-Spider `utils/live_proto.py`：
 *
 * - 信封 SocketMessage { payloadType=1, compressionType=2, payload=3 }
 * - CompressionType：UNKNOWN=0、NONE=1、GZIP=2、AES=3（没有 zstd / brotli）
 * - AES-128-CBC：key `PPbzKKL7NB15leYy`，iv `JRODKJiolJ9xqso0`，PKCS#7 非法则保留原文
 * - GZIP 失败时回退 raw deflate；若魔数是 zstd 且运行时有 `zlib.zstdDecompressSync` 再尝试，
 *   否则抛出明确错误
 */
import crypto from 'node:crypto'
import zlib from 'node:zlib'

import protoDescriptor from './live_ws_proto.json'
import mapsDescriptor from './live_ws_maps.json'

const WS_AES_KEY = Buffer.from('PPbzKKL7NB15leYy')
const WS_AES_IV = Buffer.from('JRODKJiolJ9xqso0')
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

export const COMPRESSION_NONE = 1
export const COMPRESSION_GZIP = 2
export const COMPRESSION_AES = 3

const VARINT_TYPES = new Set([
  'int32',
  'int64',
  'uint32',
  'uint64',
  'bool',
  'enum',
  'sint32',
  'sint64',
])
const FIXED64 = new Set(['fixed64', 'sfixed64', 'double'])
const FIXED32 = new Set(['fixed32', 'sfixed32', 'float'])

export type ProtoScalar = string | number | boolean | bigint
export type ProtoValue = ProtoScalar | Uint8Array | ProtoValue[] | ProtoObject
export interface ProtoObject {
  [key: string]: ProtoValue
}

export interface DecodedLiveFrame {
  type: string
  payloadType: number
  payload: ProtoObject
}

interface FieldSpec {
  name: string
  type: string
  repeated: boolean
}

interface DescriptorNode {
  fields?: Record<string, { id: number; type: string; rule?: string }>
  values?: Record<string, number>
  nested?: Record<string, DescriptorNode>
}

interface LiveSchema {
  messages: Map<string, Map<number, FieldSpec>>
  enums: Map<string, Map<number, string>>
  payloadNames: Map<number, string>
}

interface LiveMaps {
  numberToName: Map<number, string>
  nameToType: Map<string, string>
  upstream: Map<string, [number, string]>
}

let schemaCache: LiveSchema | null = null
let mapsCache: LiveMaps | null = null

function flatten(
  node: Record<string, DescriptorNode>,
  messages: Map<string, Map<number, FieldSpec>>,
  enums: Map<string, Map<number, string>>
): void {
  for (const [name, body] of Object.entries(node)) {
    if (!body || typeof body !== 'object') continue
    if (body.fields) {
      const byId = new Map<number, FieldSpec>()
      for (const [field, spec] of Object.entries(body.fields)) {
        byId.set(Number(spec.id), {
          name: field,
          type: spec.type,
          repeated: spec.rule === 'repeated',
        })
      }
      messages.set(name, byId)
    }
    if (body.values) {
      const table = new Map<number, string>()
      for (const [label, num] of Object.entries(body.values)) table.set(Number(num), label)
      enums.set(name, table)
    }
    if (body.nested) flatten(body.nested, messages, enums)
  }
}

function schema(): LiveSchema {
  if (schemaCache) return schemaCache
  const messages = new Map<string, Map<number, FieldSpec>>()
  const enums = new Map<string, Map<number, string>>()
  flatten(protoDescriptor as unknown as Record<string, DescriptorNode>, messages, enums)
  schemaCache = {
    messages,
    enums,
    payloadNames: enums.get('PayloadType') ?? new Map(),
  }
  return schemaCache
}

function maps(): LiveMaps {
  if (mapsCache) return mapsCache
  const raw = mapsDescriptor as unknown as {
    number_to_name: Record<string, string>
    name_to_type: Record<string, string>
    upstream: Record<string, [number, string]>
  }
  const numberToName = new Map<number, string>()
  for (const [key, value] of Object.entries(raw.number_to_name)) {
    numberToName.set(Number(key), value)
  }
  const upstream = new Map<string, [number, string]>()
  for (const [key, value] of Object.entries(raw.upstream)) {
    upstream.set(key, [Number(value[0]), String(value[1])])
  }
  mapsCache = {
    numberToName,
    nameToType: new Map(Object.entries(raw.name_to_type)),
    upstream,
  }
  return mapsCache
}

function kind(typeName: string): string {
  const sch = schema()
  if (sch.messages.has(typeName)) return 'message'
  if (sch.enums.has(typeName)) return 'enum'
  return typeName
}

function asBuffer(data: Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

function bigintToNumber(value: bigint): number | bigint {
  if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }
  return value
}

/** protobuf zigzag 解码（sint32 / sint64）。算术右移按任意精度整数，不用 JS 的 32 位位运算。 */
export function zigzagDecode(value: number | bigint): number | bigint {
  const n = typeof value === 'bigint' ? value : BigInt(Math.trunc(value))
  return bigintToNumber((n >> 1n) ^ -(n & 1n))
}

function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n
  let shift = 0n
  while (pos < buf.length) {
    const byte = buf[pos]
    pos += 1
    result |= BigInt(byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return [result, pos]
    shift += 7n
    if (shift > 70n) throw new Error('varint 过长')
  }
  throw new Error('varint 越界')
}

function writeVarint(value: bigint): Buffer {
  let v = BigInt.asUintN(64, value)
  const out: number[] = []
  while (true) {
    const byte = Number(v & 0x7fn)
    v >>= 7n
    if (v !== 0n) out.push(byte | 0x80)
    else {
      out.push(byte)
      return Buffer.from(out)
    }
  }
}

function toBigInt(item: ProtoValue): bigint {
  if (typeof item === 'bigint') return item
  if (typeof item === 'boolean') return item ? 1n : 0n
  if (typeof item === 'number') {
    if (!Number.isFinite(item)) throw new Error(`无法编码的数字 ${item}`)
    return BigInt(Math.trunc(item))
  }
  if (typeof item === 'string' && /^-?\d+$/.test(item)) return BigInt(item)
  throw new Error(`无法编码为整数：${String(item)}`)
}

function enumNumber(typeName: string, name: string): bigint {
  const table = schema().enums.get(typeName)
  if (!table) throw new Error(`未知枚举类型 ${typeName}`)
  for (const [num, label] of table) {
    if (label === name) return BigInt(num)
  }
  throw new Error(`未知枚举值 ${typeName}.${name}`)
}

function isZstd(payload: Uint8Array): boolean {
  return payload.length >= 4 && ZSTD_MAGIC.equals(payload.subarray(0, 4))
}

function zstdDecompress(payload: Uint8Array): Buffer {
  const fn = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer })
    .zstdDecompressSync
  if (typeof fn !== 'function') {
    throw new Error('直播帧使用 zstd 压缩，但当前 Node 的 zlib.zstdDecompressSync 不可用')
  }
  return fn(payload)
}

function aesDecrypt(payload: Uint8Array): Buffer {
  if (payload.length === 0) return Buffer.alloc(0)
  if (payload.length % 16 !== 0) {
    throw new Error(`AES 载荷长度 ${payload.length} 不是 16 的倍数`)
  }
  const decipher = crypto.createDecipheriv('aes-128-cbc', WS_AES_KEY, WS_AES_IV)
  decipher.setAutoPadding(false)
  const plain = Buffer.concat([decipher.update(payload), decipher.final()])
  const pad = plain[plain.length - 1] ?? 0
  if (pad >= 1 && pad <= 16 && plain.subarray(plain.length - pad).every(byte => byte === pad)) {
    return plain.subarray(0, plain.length - pad)
  }
  return plain
}

/**
 * 按 compressionType 还原 payload。
 * 协议枚举只有 NONE / GZIP / AES。GZIP 路径在标准 gzip 失败后尝试 raw deflate
 * （对齐 Python `zlib.decompress(payload, -MAX_WBITS)`）；两者都失败且魔数是 zstd 时，
 * 才走运行时探测。brotli 不在枚举里，也不做嗅探。
 */
function decompress(payload: Uint8Array, compression: ProtoValue | undefined): Buffer {
  if (compression === COMPRESSION_AES || compression === 'AES') return aesDecrypt(payload)
  if (compression === COMPRESSION_GZIP || compression === 'GZIP') {
    const input = Buffer.from(payload)
    try {
      return zlib.gunzipSync(input)
    } catch (gzipError) {
      try {
        return zlib.inflateRawSync(input)
      } catch {
        if (isZstd(input)) return zstdDecompress(input)
        const reason = gzipError instanceof Error ? gzipError.message : String(gzipError)
        throw new Error(
          `GZIP 载荷解压失败（已尝试 gzip 与 raw deflate）。直播 WS 的 CompressionType 只有 NONE/GZIP/AES，不含 brotli。${reason}`
        )
      }
    }
  }
  return Buffer.from(payload)
}

/** 按 schema 解一条消息。未知字段以 `_unknown_<号>` 保留。 */
export function decodeMessage(buf: Uint8Array | ArrayBuffer, typeName: string): ProtoObject {
  const input = asBuffer(buf)
  const fields = schema().messages.get(typeName)
  if (!fields) return { _raw: input.toString('hex') }
  const out: ProtoObject = {}
  let pos = 0
  while (pos < input.length) {
    const tagPair = readVarint(input, pos)
    const tag = tagPair[0]
    pos = tagPair[1]
    const fieldNo = Number(tag >> 3n)
    const wire = Number(tag & 7n)
    const spec = fields.get(fieldNo)
    let value: ProtoValue
    if (wire === 0) {
      const rawPair = readVarint(input, pos)
      const raw = rawPair[0]
      pos = rawPair[1]
      if (spec && (spec.type === 'sint32' || spec.type === 'sint64')) {
        value = zigzagDecode(raw)
      } else if (spec && spec.type === 'bool') {
        value = raw !== 0n
      } else if (spec && kind(spec.type) === 'enum') {
        const label = schema().enums.get(spec.type)?.get(Number(raw))
        value = label ?? bigintToNumber(raw)
      } else {
        value = bigintToNumber(raw)
      }
    } else if (wire === 2) {
      const lenPair = readVarint(input, pos)
      const length = Number(lenPair[0])
      pos = lenPair[1]
      if (pos + length > input.length) throw new Error('length-delimited 字段越界')
      const chunk = input.subarray(pos, pos + length)
      pos += length
      if (!spec) {
        value = Buffer.from(chunk).toString('hex')
      } else if (kind(spec.type) === 'message') {
        value = decodeMessage(chunk, spec.type)
      } else if (spec.type === 'string') {
        value = new TextDecoder('utf-8', { fatal: false }).decode(chunk)
      } else if (spec.type === 'bytes') {
        value = Buffer.from(chunk)
      } else {
        const packed: ProtoValue[] = []
        let inner = 0
        const packedBuf = Buffer.from(chunk)
        while (inner < packedBuf.length) {
          const itemPair = readVarint(packedBuf, inner)
          packed.push(bigintToNumber(itemPair[0]))
          inner = itemPair[1]
        }
        value = packed
      }
    } else if (wire === 1) {
      if (pos + 8 > input.length) throw new Error('fixed64 越界')
      value = bigintToNumber(input.readBigUInt64LE(pos))
      pos += 8
    } else if (wire === 5) {
      if (pos + 4 > input.length) throw new Error('fixed32 越界')
      value = input.readUInt32LE(pos)
      pos += 4
    } else {
      break
    }
    const key = spec ? spec.name : `_unknown_${fieldNo}`
    if (spec?.repeated) {
      const prev = out[key]
      const list = Array.isArray(prev) ? prev : []
      list.push(value)
      out[key] = list
    } else if (Object.prototype.hasOwnProperty.call(out, key)) {
      const prev = out[key] as ProtoValue
      out[key] = Array.isArray(prev) ? [...prev, value] : [prev, value]
    } else {
      out[key] = value
    }
  }
  return out
}

/** 按 schema 编一条消息。字段按对象插入顺序写出（与 Python dict 一致，不按字段号重排）。 */
export function encodeMessage(obj: ProtoObject, typeName: string): Buffer {
  const fields = schema().messages.get(typeName)
  if (!fields) throw new Error(`未知消息类型 ${typeName}`)
  const byName = new Map<string, [number, FieldSpec]>()
  for (const [no, spec] of fields) byName.set(spec.name, [no, spec])
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(obj)) {
    if (value === null || value === undefined || !byName.has(name)) continue
    const found = byName.get(name)
    if (!found) continue
    const fieldNo = found[0]
    const spec = found[1]
    const items = spec.repeated ? (value as ProtoValue[]) : [value]
    if (spec.repeated && !Array.isArray(value)) {
      throw new Error(`${typeName}.${name} 是 repeated 字段，需要数组`)
    }
    for (const item of items) {
      const fieldKind = kind(spec.type)
      if (fieldKind === 'message') {
        if (
          !item ||
          typeof item !== 'object' ||
          item instanceof Uint8Array ||
          Array.isArray(item)
        ) {
          throw new Error(`${typeName}.${name} 需要嵌套消息对象`)
        }
        const payload = encodeMessage(item, spec.type)
        chunks.push(
          writeVarint((BigInt(fieldNo) << 3n) | 2n),
          writeVarint(BigInt(payload.length)),
          payload
        )
      } else if (spec.type === 'string') {
        const payload = Buffer.from(String(item), 'utf8')
        chunks.push(
          writeVarint((BigInt(fieldNo) << 3n) | 2n),
          writeVarint(BigInt(payload.length)),
          payload
        )
      } else if (spec.type === 'bytes') {
        if (!(item instanceof Uint8Array)) throw new Error(`${typeName}.${name} 需要字节串`)
        const payload = asBuffer(item)
        chunks.push(
          writeVarint((BigInt(fieldNo) << 3n) | 2n),
          writeVarint(BigInt(payload.length)),
          payload
        )
      } else if (VARINT_TYPES.has(spec.type) || fieldKind === 'enum') {
        const num =
          fieldKind === 'enum' && typeof item === 'string'
            ? enumNumber(spec.type, item)
            : toBigInt(item)
        chunks.push(writeVarint((BigInt(fieldNo) << 3n) | 0n), writeVarint(num))
      } else if (FIXED64.has(spec.type)) {
        const num = toBigInt(item)
        if (num < 0n || num > 0xffffffffffffffffn) {
          throw new Error(`${typeName}.${name} 超出 fixed64 范围`)
        }
        const payload = Buffer.alloc(8)
        payload.writeBigUInt64LE(num)
        chunks.push(writeVarint((BigInt(fieldNo) << 3n) | 1n), payload)
      } else if (FIXED32.has(spec.type)) {
        const num = toBigInt(item)
        if (num < 0n || num > 0xffffffffn) throw new Error(`${typeName}.${name} 超出 fixed32 范围`)
        const payload = Buffer.alloc(4)
        payload.writeUInt32LE(Number(num))
        chunks.push(writeVarint((BigInt(fieldNo) << 3n) | 5n), payload)
      } else {
        throw new Error(`不支持的字段类型 ${spec.type}（${typeName}.${name}）`)
      }
    }
  }
  return Buffer.concat(chunks)
}

/** 解一帧下行。类型名优先用 bundle 的 h 表；不在表里时 payload 保留 `{_raw: hex}`。 */
export function decodeFrame(frame: Uint8Array | ArrayBuffer): DecodedLiveFrame {
  const envelope = decodeMessage(frame, 'SocketMessage')
  const rawType = envelope.payloadType ?? 0
  const sch = schema()
  const table = maps()
  let name: string
  let number: number
  if (typeof rawType === 'string') {
    name = rawType
    number = 0
    for (const [num, label] of sch.payloadNames) {
      if (label === name) {
        number = num
        break
      }
    }
  } else {
    const rawNumber = typeof rawType === 'bigint' ? Number(rawType) : Number(rawType)
    number = rawNumber
    name = table.numberToName.get(rawNumber) ?? sch.payloadNames.get(rawNumber) ?? String(rawNumber)
  }
  const rawPayload = envelope.payload
  const payload =
    rawPayload instanceof Uint8Array && rawPayload.length
      ? decompress(rawPayload, envelope.compressionType)
      : Buffer.alloc(0)
  let body: ProtoObject = {}
  if (payload.length) {
    const typeName = table.nameToType.get(name)
    body =
      typeName && sch.messages.has(typeName)
        ? decodeMessage(payload, typeName)
        : { _raw: payload.toString('hex') }
  }
  return { type: name, payloadType: number, payload: body }
}

/** 编一帧上行：CS_ENTER_ROOM / CS_HEARTBEAT / CS_USER_EXIT。 */
export function encodeFrame(kind: string, payload: ProtoObject = {}): Buffer {
  const spec = maps().upstream.get(kind)
  if (!spec) throw new Error(`不支持的上行帧 ${kind}`)
  const body = encodeMessage(payload, spec[1])
  return encodeMessage({ payloadType: spec[0], payload: body }, 'SocketMessage')
}

export interface EnterRoomOptions {
  pageId?: string
  reconnectCount?: number
  expTag?: string
  attach?: string
}

/** 进房帧。token 来自 `/live_api/liveroom/websocketinfo`。 */
export function enterRoomFrame(
  token: string,
  liveStreamId: string,
  options: EnterRoomOptions = {}
): Buffer {
  const payload: ProtoObject = { token, liveStreamId }
  if (options.reconnectCount) payload.reconnectCount = options.reconnectCount
  if (options.expTag) payload.expTag = options.expTag
  if (options.attach) payload.attach = options.attach
  if (options.pageId) payload.pageId = options.pageId
  return encodeFrame('CS_ENTER_ROOM', payload)
}

/** 心跳帧。间隔用 SC_ENTER_ROOM_ACK 的 heartbeatIntervalMs。 */
export function heartbeatFrame(timestampMs?: number): Buffer {
  return encodeFrame('CS_HEARTBEAT', {
    timestamp: timestampMs ?? Date.now(),
  })
}

/** 退房帧。 */
export function userExitFrame(timestampMs?: number): Buffer {
  return encodeFrame('CS_USER_EXIT', {
    time: timestampMs ?? Date.now(),
  })
}
