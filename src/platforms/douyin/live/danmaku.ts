/**
 * 直播弹幕流：连接抖音 WSS，实时产出结构化弹幕事件（AsyncGenerator）
 * 对齐 f2 DouyinWebSocketCrawler：签名 WSS URL → 连接(ttwid cookie) → 收帧解码 →
 * 每帧回 ack 保活 → 按类型产出事件；收到 control(status=3) 或连接关闭即结束。
 */
import WebSocket from 'ws'
import { getConfig } from '../config/index.js'
import { genTtwid } from '../utils/token.js'
import { toQueryString, createLiveWebcastParams } from '../model/request.js'
import { ENDPOINTS } from '../api/endpoints.js'
import { getWebcastSignature } from './webcast-signature.js'
import { decodeFrame, buildAckFrame, buildPingFrame, type DanmakuEvent } from './message-parser.js'

export interface LiveDanmakuOptions {
  /** 直播间 ID（room_id，字符串，务必用精确值） */
  roomId: string
  /** 用户唯一 ID（来自握手；不传则调用方需自行提供） */
  userUniqueId: string
  /** 握手返回的 internal_ext */
  internalExt: string
  /** 握手返回的 cursor */
  cursor: string
  /** 自定义 UA，默认取全局配置 */
  userAgent?: string
  /** ws 协议层 ping 间隔（毫秒），默认 10000；设 0 关闭 */
  pingInterval?: number
  /** 中止信号：abort 时关闭连接并结束生成器 */
  signal?: AbortSignal
}

export type { DanmakuEvent } from './message-parser.js'

/**
 * 建立 WSS 连接并持续产出弹幕事件。
 * 用法：`for await (const ev of streamLiveDanmaku(opts)) { ... }`
 */
export async function* streamLiveDanmaku(
  options: LiveDanmakuOptions
): AsyncGenerator<DanmakuEvent, void, unknown> {
  const { roomId, userUniqueId, internalExt, cursor, signal } = options
  const ua = options.userAgent || getConfig().userAgent
  const pingInterval = options.pingInterval ?? 10000

  const ttwid = await genTtwid()
  const signature = getWebcastSignature(roomId, userUniqueId, ua)
  const params = createLiveWebcastParams(roomId, userUniqueId, cursor, internalExt, signature)
  const url = `${ENDPOINTS.LIVE_IM_WSS}?${toQueryString(params as unknown as Record<string, unknown>)}`

  const ws = new WebSocket(url, {
    headers: { Cookie: `ttwid=${ttwid}`, 'User-Agent': ua },
  })
  ws.binaryType = 'nodebuffer'

  // 事件队列 + 唤醒 promise，把 ws 的回调桥接成 async generator
  const queue: DanmakuEvent[] = []
  let done = false
  let error: Error | null = null
  let wake: (() => void) | null = null
  const notify = () => {
    if (wake) {
      wake()
      wake = null
    }
  }
  const finish = (err?: Error) => {
    if (done) return
    done = true
    if (err) error = err
    notify()
  }

  ws.on('open', () => {
    if (pingInterval > 0) {
      const ping = buildPingFrame()
      const timer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping(ping)
        else clearInterval(timer)
      }, pingInterval)
      timer.unref?.()
    }
  })

  ws.on('message', (data: Buffer) => {
    try {
      const frame = decodeFrame(Buffer.isBuffer(data) ? data : Buffer.from(data))
      // 保活：回 ack（对齐 f2，收到就回执）
      if (frame.internalExt) {
        ws.send(buildAckFrame(frame.logId, frame.internalExt))
      }
      for (const ev of frame.events) {
        queue.push(ev)
        if (ev.type === 'control' && ev.status === 3) {
          // 直播结束
          finish()
        }
      }
      notify()
    } catch (e) {
      // 单帧解码失败不致命，跳过
      void e
    }
  })

  ws.on('close', () => finish())
  ws.on('error', (e: Error) => finish(e))

  const onAbort = () => {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
    finish()
  }
  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    while (true) {
      while (queue.length > 0) {
        yield queue.shift() as DanmakuEvent
      }
      if (done) break
      await new Promise<void>(resolve => {
        wake = resolve
      })
    }
    // 排空剩余队列
    while (queue.length > 0) yield queue.shift() as DanmakuEvent
    if (error) throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
  }
}
