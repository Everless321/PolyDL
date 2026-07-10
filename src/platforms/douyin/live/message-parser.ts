/**
 * 直播弹幕消息解码：WSS 二进制帧 → PushFrame → gzip 解压 → Response → 各类消息
 * 输出为结构化的 DanmakuEvent（友好类型），未知类型以 raw 透传。
 */
import zlib from 'node:zlib'
import protobuf from 'protobufjs'
import { WEBCAST_PROTO_SOURCE } from '../proto/webcast-schema.js'

// proto root 只解析一次
const root = protobuf.parse(WEBCAST_PROTO_SOURCE).root
const PushFrame = root.lookupType('douyin.PushFrame')
const Response = root.lookupType('douyin.Response')

// method → proto 消息类型（只解常用几类，其余 raw 透传）
const MESSAGE_TYPES: Record<string, string> = {
  WebcastChatMessage: 'douyin.ChatMessage',
  WebcastGiftMessage: 'douyin.GiftMessage',
  WebcastLikeMessage: 'douyin.LikeMessage',
  WebcastMemberMessage: 'douyin.MemberMessage',
  WebcastSocialMessage: 'douyin.SocialMessage',
  WebcastRoomUserSeqMessage: 'douyin.RoomUserSeqMessage',
  WebcastRoomStatsMessage: 'douyin.RoomStatsMessage',
  WebcastControlMessage: 'douyin.ControlMessage',
}

export interface DanmakuUser {
  id: string | null
  nickname: string | null
  secUid: string | null
  avatar: string | null
}

export type DanmakuEventBody =
  | { type: 'chat'; user: DanmakuUser; content: string }
  | {
      type: 'gift'
      user: DanmakuUser
      giftId: string
      giftName: string | null
      comboCount: number
      totalCount: number
    }
  | { type: 'like'; user: DanmakuUser; count: number; total: number }
  | { type: 'member'; user: DanmakuUser; memberCount: string | null } // 进场
  | { type: 'social'; user: DanmakuUser; followCount: number } // 关注/分享
  | { type: 'roomUserSeq'; total: number; totalUser: number } // 在线/累计观众
  | { type: 'roomStats'; displayLong: string | null; total: number }
  | { type: 'control'; status: number } // 3 = 直播结束
  | { type: 'raw'; method: string; payload: Uint8Array }

/** 每个弹幕事件都带的时间元信息，用于和录制视频对齐 */
export interface DanmakuMeta {
  /** 帧到达本地墙钟时间（epoch ms）。对齐录制视频的主依据 */
  receivedAt: number
  /** 消息服务端创建时间（来自 Common.create_time，epoch ms；raw 类型或缺失为 null） */
  createTime: number | null
}

export type DanmakuEvent = DanmakuEventBody & DanmakuMeta

export interface DecodedFrame {
  needAck: boolean
  logId: string
  internalExt: string
  cursor: string
  events: DanmakuEvent[]
}

function toNum(v: unknown): number {
  if (v == null) return 0
  // protobufjs 的 int64 可能是 Long 对象或 number
  const anyV = v as { toNumber?: () => number }
  if (typeof anyV.toNumber === 'function') return anyV.toNumber()
  return Number(v) || 0
}

function toStr(v: unknown): string {
  if (v == null) return ''
  const anyV = v as { toString?: () => string }
  return typeof anyV?.toString === 'function' ? anyV.toString() : String(v)
}

function extractUser(u: Record<string, unknown> | undefined | null): DanmakuUser {
  if (!u) return { id: null, nickname: null, secUid: null, avatar: null }
  const avatarThumb = u.avatarThumb as { urlList?: string[] } | undefined
  return {
    id: (u.idStr as string) || (u.id != null ? toStr(u.id) : null) || null,
    nickname: (u.nickname as string) || null,
    secUid: (u.secUid as string) || null,
    avatar: avatarThumb?.urlList?.[0] || null,
  }
}

function extractCreateTime(m: Record<string, unknown>): number | null {
  const common = m.common as { createTime?: unknown } | undefined
  if (!common || common.createTime == null) return null
  const t = toNum(common.createTime)
  return t > 0 ? t : null
}

function decodeMessage(
  method: string,
  payload: Uint8Array
): { body: DanmakuEventBody; createTime: number | null } {
  const typeName = MESSAGE_TYPES[method]
  if (!typeName) return { body: { type: 'raw', method, payload }, createTime: null }

  const T = root.lookupType(typeName)
  const m = T.decode(payload) as unknown as Record<string, unknown>
  const createTime = extractCreateTime(m)
  const body = decodeBody(method, m, payload)
  return { body, createTime }
}

function decodeBody(
  method: string,
  m: Record<string, unknown>,
  payload: Uint8Array
): DanmakuEventBody {
  switch (method) {
    case 'WebcastChatMessage':
      return {
        type: 'chat',
        user: extractUser(m.user as never),
        content: (m.content as string) || '',
      }
    case 'WebcastGiftMessage': {
      const gift = m.gift as { name?: string } | undefined
      return {
        type: 'gift',
        user: extractUser(m.user as never),
        giftId: toStr(m.giftId),
        giftName: gift?.name || null,
        comboCount: toNum(m.comboCount),
        totalCount: toNum(m.totalCount),
      }
    }
    case 'WebcastLikeMessage':
      return {
        type: 'like',
        user: extractUser(m.user as never),
        count: toNum(m.count),
        total: toNum(m.total),
      }
    case 'WebcastMemberMessage':
      return {
        type: 'member',
        user: extractUser(m.user as never),
        memberCount: (m.memberCount as string) || null,
      }
    case 'WebcastSocialMessage':
      return {
        type: 'social',
        user: extractUser(m.user as never),
        followCount: toNum(m.followCount),
      }
    case 'WebcastRoomUserSeqMessage':
      return { type: 'roomUserSeq', total: toNum(m.total), totalUser: toNum(m.totalUser) }
    case 'WebcastRoomStatsMessage':
      return {
        type: 'roomStats',
        displayLong: (m.displayLong as string) || null,
        total: toNum(m.total),
      }
    case 'WebcastControlMessage':
      return { type: 'control', status: toNum(m.status) }
    default:
      return { type: 'raw', method, payload }
  }
}

/**
 * 解码一个 WSS 二进制帧
 * @param receivedAt 帧到达墙钟时间（epoch ms），默认 Date.now()；用于和录制视频对齐
 */
export function decodeFrame(buffer: Buffer, receivedAt: number = Date.now()): DecodedFrame {
  const frame = PushFrame.decode(buffer) as unknown as Record<string, unknown>
  const rawPayload = frame.payload as Uint8Array

  // f2 固定 gzip 解压；这里按 gzip magic(0x1f 0x8b) 判断，非 gzip 则原样
  let decompressed: Buffer
  const buf = Buffer.from(rawPayload)
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    decompressed = zlib.gunzipSync(buf)
  } else {
    decompressed = buf
  }

  const resp = Response.decode(decompressed) as unknown as Record<string, unknown>
  const messages = (resp.messages as Array<Record<string, unknown>>) || []

  const events: DanmakuEvent[] = []
  for (const msg of messages) {
    const method = msg.method as string
    const payload = msg.payload as Uint8Array
    if (!method || !payload) continue
    try {
      const { body, createTime } = decodeMessage(method, payload)
      events.push({ ...body, receivedAt, createTime })
    } catch {
      events.push({ type: 'raw', method, payload, receivedAt, createTime: null })
    }
  }

  return {
    needAck: Boolean(resp.needAck),
    logId: toStr(frame.logId),
    internalExt: (resp.internalExt as string) || '',
    cursor: (resp.cursor as string) || '',
    events,
  }
}

/** 构造 ack 帧（回执，对齐 f2 send_ack: PushFrame{logId, payloadType=internalExt}） */
export function buildAckFrame(logId: string, internalExt: string): Uint8Array {
  const msg = PushFrame.create({ logId: logId, payloadType: internalExt })
  return PushFrame.encode(msg).finish()
}

/** 构造心跳 ping 帧（对齐 f2 send_ping: PushFrame{payloadType:'hb'}） */
export function buildPingFrame(): Uint8Array {
  const msg = PushFrame.create({ payloadType: 'hb' })
  return PushFrame.encode(msg).finish()
}
