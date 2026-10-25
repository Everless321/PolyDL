/**
 * 直播弹幕 WebSocket。
 *
 * 链路与浏览器 / KuaiShou-Spider `LiveDanmakuClient` 一致：
 * 1. getRoomState（或调用方已经给了 liveStreamId）
 * 2. websocketinfo -> token + websocketUrls
 * 3. 连上后立刻发 CS_ENTER_ROOM
 * 4. SC_ENTER_ROOM_ACK 之后按 heartbeatIntervalMs 发 CS_HEARTBEAT（下限 1 秒）
 * 5. 收 SC_FEED_PUSH，拆出 comment / gift / like / system 等事件
 * 6. 退出前发 CS_USER_EXIT；断线按上限重连，reconnectCount 递增
 *
 * 不在这里换直播会话票据。websocketinfo 没给 token 就失败返回；
 * result:2 且没有 token 时把 `riskControlled` 标成 true。
 */
import WebSocket from 'ws'

import { isRiskControlled } from './api.js'
import {
  decodeFrame,
  enterRoomFrame,
  heartbeatFrame,
  userExitFrame,
  type DecodedLiveFrame,
  type ProtoValue,
} from './proto.js'
import type {
  KuaishouLiveDanmakuConfig,
  LiveDanmakuHandler,
  LiveDanmakuStats,
  LiveWebSocketFactory,
  LiveWebSocketLike,
} from './types.js'
import { LIVE_ORIGIN, LIVE_UA } from './url-map.js'

const WS_OPEN = 1

function defaultWebSocketFactory(
  url: string,
  init: { headers: Record<string, string>; origin: string; handshakeTimeout: number }
): LiveWebSocketLike {
  // ws 的 message 载荷含 Buffer[]，和测试用的窄接口不完全同构，这里收成 LiveWebSocketLike。
  return new WebSocket(url, {
    origin: init.origin,
    headers: init.headers,
    handshakeTimeout: init.handshakeTimeout,
  }) as unknown as LiveWebSocketLike
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  if (Array.isArray(data)) return Buffer.concat(data.map(item => toBuffer(item)))
  return Buffer.alloc(0)
}

function countOf(value: ProtoValue | undefined): number {
  return Array.isArray(value) ? value.length : 0
}

function isProtoObject(value: ProtoValue): value is DecodedLiveFrame['payload'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  )
}

export class KuaishouLiveDanmaku {
  readonly eid: string
  liveStreamId = ''
  token = ''
  wsUrls: string[] = []
  riskControlled = false
  lastError: DecodedLiveFrame['payload'] | null = null
  stats: LiveDanmakuStats = { frames: 0, comments: 0, likes: 0, gifts: 0 }

  private readonly client: KuaishouLiveDanmakuConfig['client']
  private readonly room: KuaishouLiveDanmakuConfig['room']
  private readonly factory: LiveWebSocketFactory
  private readonly userAgent: string
  private readonly pageId: string
  private readonly expTag: string
  private readonly attach: string
  private readonly minHeartbeatMs: number
  private readonly handshakeTimeoutMs: number
  private readonly nowFn: () => number
  private readonly sleepFn: ((ms: number) => Promise<void>) | undefined
  private readonly handlers = new Map<string, Set<LiveDanmakuHandler>>()

  private ws: LiveWebSocketLike | null = null
  private stopped = false
  private heartbeating = false
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatIntervalMs = 20_000

  constructor(config: KuaishouLiveDanmakuConfig) {
    this.eid = config.eid
    this.client = config.client
    this.room = config.room
    this.factory = config.webSocketFactory ?? defaultWebSocketFactory
    this.userAgent = config.userAgent || LIVE_UA
    this.pageId = config.pageId ?? ''
    this.expTag = config.expTag ?? ''
    this.attach = config.attach ?? ''
    this.minHeartbeatMs = config.minHeartbeatMs ?? 1000
    this.handshakeTimeoutMs = config.handshakeTimeoutMs ?? 10_000
    this.nowFn = config.now ?? (() => Date.now())
    this.sleepFn = config.sleep
  }

  /**
   * 注册回调。`SC_FEED_PUSH` / `*` 收到整帧；
   * `comment` / `gift` / `like` / `system` / `share` / `combo` 收到拆开的单条，payload 是那一条 feed。
   * `*` 只收原始帧，不收拆开的单条。
   */
  on(event: string, handler: LiveDanmakuHandler): this {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler)
    this.handlers.set(event, set)
    return this
  }

  off(event: string, handler: LiveDanmakuHandler): this {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  /** 拉 liveStreamId、token 和接入点。已有 token 时 `run` 不会再调。 */
  async prepare(): Promise<boolean> {
    const snapshot = this.room?.liveStreamId ? this.room : null
    if (snapshot) {
      this.liveStreamId = snapshot.liveStreamId
    } else {
      const state = await this.client.getRoomState(this.eid)
      this.liveStreamId = state.liveStreamId
    }
    if (!this.liveStreamId) return false
    const info = await this.client.websocketInfo(this.liveStreamId, { eid: this.eid })
    const data =
      info.data && typeof info.data === 'object' ? (info.data as Record<string, unknown>) : {}
    const token = typeof data.token === 'string' ? data.token : ''
    const urls = Array.isArray(data.websocketUrls)
      ? data.websocketUrls.filter((item): item is string => typeof item === 'string')
      : []
    if (!token) {
      if (isRiskControlled(info)) this.riskControlled = true
      return false
    }
    if (!urls.length) return false
    this.token = token
    this.wsUrls = urls
    return true
  }

  /** 连上并一直收到 `stop()`。 */
  start(): Promise<LiveDanmakuStats> {
    return this.run()
  }

  /** 停止心跳、发退房帧、关掉当前连接。正在 `run` 的那次循环会退出。 */
  stop(): void {
    this.stopped = true
    this.closeSocket()
  }

  /**
   * 连上并阻塞收流，断线自动重连。
   * `duration` 是秒；`maxReconnect` 默认 5（不含第一次连接）。
   */
  async run(options?: { duration?: number; maxReconnect?: number }): Promise<LiveDanmakuStats> {
    this.stopped = false
    const maxReconnect = options?.maxReconnect ?? 5
    const duration = options?.duration
    if (!this.token && !(await this.prepare())) return this.stats
    if (this.stopped) return this.stats
    const deadline = duration != null ? this.nowFn() + duration * 1000 : null
    let reconnect = 0
    let urlIndex = 0
    while (!this.stopped) {
      if (deadline !== null && this.nowFn() > deadline) break
      if (urlIndex >= this.wsUrls.length) break
      const state = await this.connectOnce(this.wsUrls[urlIndex], deadline, reconnect)
      if (state === 'done') break
      if (state === 'failed') {
        urlIndex += 1
        continue
      }
      reconnect += 1
      if (reconnect > maxReconnect) break
      this.heartbeating = false
      await this.sleep(Math.min(2 * reconnect, 10) * 1000)
    }
    this.close()
    return this.stats
  }

  close(): void {
    this.stopped = true
    this.closeSocket()
  }

  private now(): number {
    return this.nowFn()
  }

  private async sleep(ms: number): Promise<void> {
    if (this.sleepFn) {
      await this.sleepFn(ms)
      return
    }
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms)
      timer.unref?.()
    })
  }

  private dispatch(event: string, message: DecodedLiveFrame): void {
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        handler(message)
      } catch {
        // 单个回调失败不影响收流
      }
    }
  }

  private emitEach(kind: string, parent: DecodedLiveFrame, feeds: ProtoValue | undefined): void {
    if (!Array.isArray(feeds)) return
    for (const feed of feeds) {
      if (!isProtoObject(feed)) continue
      this.dispatch(kind, { type: kind, payloadType: parent.payloadType, payload: feed })
    }
  }

  private handleFrame(raw: Buffer): void {
    const message = decodeFrame(raw)
    this.stats.frames += 1
    if (message.type === 'SC_ENTER_ROOM_ACK') {
      const interval = Number(message.payload.heartbeatIntervalMs ?? 20_000)
      this.heartbeatIntervalMs = Math.max(
        this.minHeartbeatMs,
        Number.isFinite(interval) ? interval : 20_000
      )
      if (!this.heartbeating) {
        this.heartbeating = true
        this.startHeartbeat()
      }
    } else if (message.type === 'SC_FEED_PUSH') {
      this.stats.comments += countOf(message.payload.commentFeeds)
      this.stats.likes += countOf(message.payload.likeFeeds)
      this.stats.gifts += countOf(message.payload.giftFeeds)
    } else if (message.type === 'SC_ERROR') {
      this.lastError = message.payload
    }
    this.dispatch(message.type, message)
    this.dispatch('*', message)
    if (message.type !== 'SC_FEED_PUSH') return
    this.emitEach('comment', message, message.payload.commentFeeds)
    this.emitEach('like', message, message.payload.likeFeeds)
    this.emitEach('gift', message, message.payload.giftFeeds)
    this.emitEach('system', message, message.payload.systemNoticeFeeds)
    this.emitEach('share', message, message.payload.shareFeeds)
    this.emitEach('combo', message, message.payload.comboCommentFeed)
  }

  private startHeartbeat(): void {
    const tick = () => {
      this.heartbeatTimer = setTimeout(() => {
        this.heartbeatTimer = null
        if (this.stopped || !this.ws || this.ws.readyState !== WS_OPEN) return
        try {
          this.ws.send(heartbeatFrame(this.now()))
        } catch {
          return
        }
        if (!this.stopped) tick()
      }, this.heartbeatIntervalMs)
      this.heartbeatTimer.unref?.()
    }
    tick()
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private closeSocket(): void {
    this.stopHeartbeat()
    this.heartbeating = false
    const ws = this.ws
    this.ws = null
    if (!ws) return
    try {
      if (ws.readyState === WS_OPEN) ws.send(userExitFrame(this.now()))
    } catch {
      // 连接已经没了
    }
    try {
      ws.close()
    } catch {
      // 重复关闭
    }
  }

  private connectOnce(
    url: string,
    deadline: number | null,
    reconnectCount: number
  ): Promise<'done' | 'closed' | 'failed'> {
    return new Promise(resolve => {
      let settled = false
      let opened = false
      let handshakeTimer: ReturnType<typeof setTimeout> | null = null
      const finish = (state: 'done' | 'closed' | 'failed') => {
        if (settled) return
        settled = true
        if (handshakeTimer) clearTimeout(handshakeTimer)
        this.closeSocket()
        resolve(state)
      }
      let ws: LiveWebSocketLike
      try {
        ws = this.factory(url, {
          origin: LIVE_ORIGIN,
          handshakeTimeout: this.handshakeTimeoutMs,
          headers: {
            'User-Agent': this.userAgent,
            Origin: LIVE_ORIGIN,
          },
        })
      } catch {
        resolve('failed')
        return
      }
      this.ws = ws
      handshakeTimer = setTimeout(() => {
        if (!opened) finish('failed')
      }, this.handshakeTimeoutMs)
      handshakeTimer.unref?.()

      ws.on('open', () => {
        opened = true
        if (handshakeTimer) clearTimeout(handshakeTimer)
        if (this.stopped || (deadline !== null && this.now() > deadline)) {
          finish('done')
          return
        }
        try {
          ws.send(
            enterRoomFrame(this.token, this.liveStreamId, {
              reconnectCount,
              pageId: this.pageId,
              expTag: this.expTag,
              attach: this.attach,
            })
          )
        } catch {
          finish('closed')
        }
      })

      ws.on('message', (data, isBinary) => {
        if (settled) return
        if (deadline !== null && this.now() > deadline) {
          finish('done')
          return
        }
        if (isBinary === false) return
        const buf = toBuffer(data)
        if (!buf.length) return
        try {
          this.handleFrame(buf)
        } catch {
          // 单帧解不开不拖垮连接
        }
      })

      ws.on('close', () => {
        finish(this.stopped ? 'done' : 'closed')
      })

      ws.on('error', () => {
        finish(opened ? 'closed' : 'failed')
      })
    })
  }
}
