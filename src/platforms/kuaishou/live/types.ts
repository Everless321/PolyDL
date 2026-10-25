/**
 * 快手直播只读接口与弹幕客户端的类型。
 */

import type { DecodedLiveFrame, ProtoObject } from './proto.js'

/**
 * 直播站 `__NS_hxfalcon` 签名器。
 *
 * 调用方传入的 `path` 已经是映射后的 realUrl（如 `/rest/k/live/websocket/info`），
 * `query` 是按键名排好序的业务参数，不含 `__NS_hxfalcon` 也不含 `caver`。
 * 返回值只是 hxfalcon 字符串；客户端自己把 `__NS_hxfalcon` 和 `caver=2` 拼到 URL 上。
 *
 * 直播站和 www 的差别（签名器内部要自己处理，不在这个入参里）：
 * - SDK 版本号用 43469（`SDK_VERSION_LIVE`），不要用 www 的 43468
 * - `form` / `requestBody` 两个键必须在，值是空对象。省略空对象时 websocketinfo 会 result:2
 * - POST body 不参与直播站签名
 */
export interface LiveHxfalconInput {
  path: string
  query: Record<string, unknown>
}

export type LiveHxfalconSigner = (input: LiveHxfalconInput) => string | Promise<string>

export interface KuaishouLiveClientConfig {
  /** 直播站 Cookie。不解析、不改顺序，原样放进 Cookie 头。 */
  cookie?: string
  /** 页面冻结的 kww。不传则不带这个头。 */
  kww?: string
  userAgent?: string
  /**
   * 命中 LIVE_URL_MAP 的接口必填。未配置时这些接口直接抛错，不会静默发出未签名请求。
   */
  signer?: LiveHxfalconSigner
  /** 测试或自定义传输时替换全局 fetch。 */
  fetch?: typeof fetch
  /** 默认 https://live.kuaishou.com */
  baseUrl?: string
  headers?: Record<string, string>
}

export type LiveJson = Record<string, unknown>

export interface LiveRoomState {
  liveStreamId: string
  author: LiveJson
  caption: string
  isLiving: boolean
  /** `window.__INITIAL_STATE__` 全文 */
  state: LiveJson
}

export interface LiveHomeRoom {
  eid: string
  liveStreamId: string
  name: string
  caption: string
  living: boolean
  author: LiveJson
}

export interface ProfileFeedOptions {
  /** public / private / liked，默认 public */
  privacy?: 'public' | 'private' | 'liked'
  pcursor?: string
  count?: number
  hasMore?: boolean
  /** Referer 用的 eid，默认 principalId */
  eid?: string
}

export interface PlaybackListOptions {
  pcursor?: string
  count?: number
  eid?: string
}

export interface GiftListOptions {
  /** 传了就带 sortType（含 0）。首屏不传。 */
  sortType?: number
  eid?: string
}

export interface CategoryClassifyOptions {
  categoryType?: number
  source?: number
  page?: number
  pageSize?: number
  eid?: string
}

export interface LiveDanmakuStats {
  frames: number
  comments: number
  likes: number
  gifts: number
}

export interface LiveWebSocketInit {
  headers: Record<string, string>
  origin: string
  handshakeTimeout: number
}

export interface LiveWebSocketLike {
  readyState: number
  send(data: Buffer | Uint8Array | ArrayBuffer): void
  close(code?: number, reason?: string): void
  on(event: 'open', listener: () => void): void
  on(
    event: 'message',
    listener: (data: Buffer | ArrayBuffer | Uint8Array, isBinary?: boolean) => void
  ): void
  on(event: 'close', listener: (code?: number, reason?: Buffer) => void): void
  on(event: 'error', listener: (err: Error) => void): void
}

export type LiveWebSocketFactory = (url: string, init: LiveWebSocketInit) => LiveWebSocketLike

export interface LiveRoomSnapshot {
  liveStreamId: string
  isLiving?: boolean
}

export interface KuaishouLiveDanmakuConfig {
  /** 房间 url 里的 eid（`live.kuaishou.com/u/<eid>`） */
  eid: string
  client: {
    getRoomState(eid: string): Promise<LiveRoomState>
    websocketInfo(liveStreamId: string, options?: { eid?: string }): Promise<LiveJson>
  }
  /** 已经解析好的房间。传入 liveStreamId 时不再抓 HTML。 */
  room?: LiveRoomSnapshot
  webSocketFactory?: LiveWebSocketFactory
  userAgent?: string
  pageId?: string
  expTag?: string
  attach?: string
  /** 心跳间隔下限（毫秒）。默认 1000，对齐 Python `max(1s, interval)`。 */
  minHeartbeatMs?: number
  handshakeTimeoutMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export type LiveDanmakuHandler = (message: DecodedLiveFrame) => void

export type { DecodedLiveFrame, ProtoObject }
