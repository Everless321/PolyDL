/**
 * 快手直播站只读接口（live.kuaishou.com /live_api/*）。
 *
 * 只保留请求语义：URL、方法、query/body、Referer、POST 才带的 Origin、kww、Cookie。
 * 不移植登录换票、退出登录，也不移植 `_assert_*` 那套浏览器合同校验和 sentry 埋点。
 * `game_live_sdk_init` / gdfp 不在 websocketinfo 的请求链上，这里不调用。
 */
import type {
  CategoryClassifyOptions,
  GiftListOptions,
  KuaishouLiveClientConfig,
  LiveHomeRoom,
  LiveHxfalconSigner,
  LiveJson,
  LiveRoomState,
  PlaybackListOptions,
  ProfileFeedOptions,
} from './types.js'
import {
  CAVER,
  LIVE_ORIGIN,
  LIVE_UA,
  liveNeedSign,
  liveSignUrl,
  sortQuery,
  toQueryString,
} from './url-map.js'

const STATE_MARKER = 'window.__INITIAL_STATE__'
const UNDEFINED_RE = /(?<![\w"'])(?:undefined|void 0)(?![\w])/g

export const WS_RESULT_RISK_CONTROL = 2

export type { LiveHxfalconSigner }

function isRecord(value: unknown): value is LiveJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function definedQuery(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

/**
 * 从房间页 HTML 取出 `window.__INITIAL_STATE__`。
 *
 * 不能用非贪婪正则配 `{...};`：对象内部就有 `};`，会截断。
 * 按括号配平，并跳过字符串里的括号。值里的裸 `undefined` / `void 0` 先换成 `null`。
 */
export function extractInitialState(html: string): LiveJson {
  const idx = html.indexOf(STATE_MARKER)
  if (idx < 0) return {}
  const start = html.indexOf('{', idx)
  if (start < 0) return {}
  let depth = 0
  let inStr: string | null = null
  let esc = false
  let end = -1
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") inStr = ch
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) return {}
  try {
    const parsed = JSON.parse(html.slice(start, end).replace(UNDEFINED_RE, 'null')) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** 从 `__INITIAL_STATE__` 取出当前房间。liveStreamId 在 `liveroom.playList[0].liveStream.id`。 */
export function roomStateFromInitialState(state: LiveJson): LiveRoomState {
  const liveroom = isRecord(state.liveroom) ? state.liveroom : {}
  const playList = Array.isArray(liveroom.playList) ? liveroom.playList : []
  const first = isRecord(playList[0]) ? playList[0] : {}
  const liveStream = isRecord(first.liveStream) ? first.liveStream : {}
  const author = isRecord(first.author)
    ? first.author
    : isRecord(liveStream.user)
      ? liveStream.user
      : {}
  const liveStreamId = liveStream.id != null && liveStream.id !== '' ? String(liveStream.id) : ''
  const caption = String(liveStream.caption ?? first.caption ?? '')
  let isLiving = Boolean(liveStreamId)
  if (typeof first.isLiving === 'boolean') isLiving = first.isLiving
  else if (typeof first.living === 'boolean') isLiving = first.living
  else if (typeof liveStream.isLiving === 'boolean') isLiving = liveStream.isLiving
  else if (typeof liveStream.living === 'boolean') isLiving = liveStream.living
  return { liveStreamId, author, caption, isLiving, state }
}

/** websocketinfo 是否被风控挡住（result:2 且没有 token）。 */
export function isRiskControlled(wsInfo: unknown): boolean {
  const root = isRecord(wsInfo) ? wsInfo : {}
  const data = isRecord(root.data) ? root.data : {}
  return data.result === WS_RESULT_RISK_CONTROL && !data.token
}

/** 只从当前 home/list 的 `data.list[].gameLiveInfo[].liveInfo[]` 抽房间。 */
export function roomsFromHomePayload(payload: unknown): LiveHomeRoom[] {
  const root = isRecord(payload) ? payload : {}
  const data = isRecord(root.data) ? root.data : {}
  const sections = Array.isArray(data.list) ? data.list : []
  const rooms: LiveHomeRoom[] = []
  for (const section of sections) {
    const groups =
      isRecord(section) && Array.isArray(section.gameLiveInfo) ? section.gameLiveInfo : []
    for (const group of groups) {
      const items = isRecord(group) && Array.isArray(group.liveInfo) ? group.liveInfo : []
      for (const item of items) {
        if (!isRecord(item)) continue
        const author = isRecord(item.author) ? item.author : {}
        const streamId = item.id != null ? String(item.id) : ''
        const eid = author.id != null ? String(author.id) : ''
        if (!streamId || !eid) continue
        rooms.push({
          eid,
          liveStreamId: streamId,
          name: author.name != null ? String(author.name) : '',
          caption: item.caption != null ? String(item.caption) : '',
          living: Boolean(item.living || author.living),
          author,
        })
      }
    }
  }
  return rooms
}

export class KuaishouLiveClient {
  private readonly cookie: string
  private readonly kww: string
  private readonly userAgent: string
  private readonly signer: LiveHxfalconSigner | undefined
  private readonly fetchImpl: typeof fetch
  readonly origin: string
  private readonly extraHeaders: Record<string, string>

  constructor(config: KuaishouLiveClientConfig = {}) {
    this.cookie = config.cookie ?? ''
    this.kww = config.kww ?? ''
    this.userAgent = config.userAgent || LIVE_UA
    this.signer = config.signer
    this.fetchImpl = config.fetch ?? fetch
    this.origin = (config.baseUrl ?? LIVE_ORIGIN).replace(/\/$/, '')
    this.extraHeaders = config.headers ?? {}
  }

  roomReferer(eid: string): string {
    return `${this.origin}/u/${eid}`
  }

  profileReferer(eid: string): string {
    return `${this.origin}/profile/${eid}`
  }

  workReferer(eid: string, photoId: string): string {
    return `${this.origin}/u/${eid}/${photoId}`
  }

  /**
   * 抓房间页 HTML，解析 `__INITIAL_STATE__`。
   * 当前 Python 仓库改成了从 home/list 里对 eid，但页面上的 liveStreamId 仍以这段 SSR 为准。
   */
  async getRoomState(eid: string): Promise<LiveRoomState> {
    const html = await this.requestText(`/u/${encodeURIComponent(eid)}`, {
      referer: `${this.origin}/`,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    })
    return roomStateFromInitialState(extractInitialState(html))
  }

  /** 直播首页列表。不签名。 */
  async homeList(): Promise<LiveJson> {
    return this.request('GET', '/live_api/home/list', {}, { referer: `${this.origin}/` })
  }

  /** 首页点进分类后的列表。不签名。 */
  async homeCategory(): Promise<LiveJson> {
    return this.request('GET', '/live_api/home/category', {}, { referer: `${this.origin}/` })
  }

  /** 分类简表。不签名。Referer 在房间里用房间页，否则用首页。 */
  async categorySimple(options?: { eid?: string }): Promise<LiveJson> {
    const eid = options?.eid ?? ''
    return this.request(
      'GET',
      '/live_api/category/simple',
      {},
      {
        referer: eid ? this.roomReferer(eid) : `${this.origin}/`,
      }
    )
  }

  /**
   * 分类列表。query 保持调用顺序 `type, source, page, pageSize`（未签名，不排序）。
   */
  async categoryClassify(options: CategoryClassifyOptions = {}): Promise<LiveJson> {
    const eid = options.eid ?? ''
    return this.request(
      'GET',
      '/live_api/category/classify',
      {
        type: options.categoryType ?? 4,
        source: options.source ?? 2,
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 20,
      },
      { referer: eid ? this.roomReferer(eid) : `${this.origin}/` }
    )
  }

  /** 首页候选房间，在播的排前面。 */
  async findLiveRooms(): Promise<LiveHomeRoom[]> {
    const rooms = roomsFromHomePayload(await this.homeList())
    rooms.sort((a, b) => Number(!a.living) - Number(!b.living))
    return rooms
  }

  /**
   * 从首页挑一个房间。`preferLiving` 时优先 living；都不满足则退回排序后的第一个。
   * 找不到返回 null。
   */
  async findLiveRoom(preferLiving = true): Promise<LiveHomeRoom | null> {
    const candidates = await this.findLiveRooms()
    if (!candidates.length) return null
    if (preferLiving) {
      const living = candidates.find(room => room.living)
      if (living) return living
    }
    return candidates[0]
  }

  /** 弹幕 WebSocket 握手信息。需要 `__NS_hxfalcon`，签名路径 `/rest/k/live/websocket/info`。 */
  async websocketInfo(liveStreamId: string, options?: { eid?: string }): Promise<LiveJson> {
    return this.request(
      'GET',
      '/live_api/liveroom/websocketinfo',
      { liveStreamId },
      {
        eid: options?.eid,
      }
    )
  }

  /** 直播间是否在播等状态。需要签名，realUrl `/rest/wd/live/liveStream/status`。 */
  async liveroomStatus(liveStreamId: string, options?: { eid?: string }): Promise<LiveJson> {
    return this.request('GET', '/live_api/liveroom/status', { liveStreamId }, { eid: options?.eid })
  }

  /** 按 eid 取用户信息。需要签名，query 只有 principalId，Referer 是资料页。 */
  async userInfoById(principalId: string, options?: { eid?: string }): Promise<LiveJson> {
    const pageEid = options?.eid || principalId
    return this.request(
      'GET',
      '/live_api/baseuser/userinfo/byid',
      { principalId },
      { eid: pageEid, referer: this.profileReferer(pageEid) }
    )
  }

  /**
   * 主播作品列表。privacy 决定路径：
   * `/live_api/profile/public|private|liked`，三条都要签名。
   * 首页 pcursor 发空串，不省略。
   */
  async profileFeed(principalId: string, options: ProfileFeedOptions = {}): Promise<LiveJson> {
    const privacy = options.privacy ?? 'public'
    if (privacy !== 'public' && privacy !== 'private' && privacy !== 'liked') {
      throw new Error('privacy 只能是 public / private / liked')
    }
    const pageEid = options.eid || principalId
    return this.request(
      'GET',
      `/live_api/profile/${privacy}`,
      {
        count: options.count ?? 12,
        hasMore: options.hasMore === false ? 'false' : 'true',
        pcursor: options.pcursor ?? '',
        principalId,
        privacy,
      },
      { eid: pageEid, referer: this.profileReferer(pageEid) }
    )
  }

  /**
   * 直播回放列表。`live_api.py` 没有对应方法（www 站是另一条 POST
   * `/rest/v/live/playBack/list`）。这里按直播站映射表发 GET
   * `/live_api/playback/list`，签名 realUrl `/rest/k/playback/product/list`，
   * query 用 principalId / pcursor / count。pcursor 首页发空串。
   */
  async playbackList(principalId: string, options: PlaybackListOptions = {}): Promise<LiveJson> {
    const pageEid = options.eid || principalId
    return this.request(
      'GET',
      '/live_api/playback/list',
      {
        principalId,
        pcursor: options.pcursor ?? '',
        count: options.count ?? 20,
      },
      { eid: pageEid, referer: this.profileReferer(pageEid) }
    )
  }

  /** 礼物列表。不签名。sortType 为 undefined 时不带该键（首屏）；传 0 也会带上。 */
  async giftList(liveStreamId: string, options: GiftListOptions = {}): Promise<LiveJson> {
    const query: Record<string, unknown> = { liveStreamId }
    if (options.sortType !== undefined) query.sortType = options.sortType
    return this.request('GET', '/live_api/emoji/gift-list', query, { eid: options.eid })
  }

  /**
   * 直播间评论列表（REST，不是 WebSocket）。路径在签名名单里，
   * realUrl 是 `/rest/k/photo/comment/list`。
   */
  async commentList(liveStreamId: string, options?: { eid?: string }): Promise<LiveJson> {
    return this.request('GET', '/live_api/comment/list', { liveStreamId }, { eid: options?.eid })
  }

  private buildHeaders(
    method: 'GET' | 'POST',
    referer: string,
    accept?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept ?? 'application/json, text/plain, */*',
      'User-Agent': this.userAgent,
      Referer: referer,
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7,ja;q=0.6',
      ...this.extraHeaders,
    }
    if (this.cookie) headers.Cookie = this.cookie
    if (this.kww) headers.kww = this.kww
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json'
      headers.Origin = this.origin
    }
    return headers
  }

  private async buildUrl(api: string, query: Record<string, unknown>): Promise<string> {
    const cleaned = definedQuery(query)
    const signed = liveNeedSign(api)
    const ordered = signed ? sortQuery(cleaned) : cleaned
    const params: Record<string, unknown> = {}
    if (signed) {
      if (!this.signer) {
        throw new Error(
          `直播接口 ${api} 需要 __NS_hxfalcon（签名路径 ${liveSignUrl(api)}），但未配置 signer`
        )
      }
      const hxfalcon = await this.signer({ path: liveSignUrl(api), query: ordered })
      params.__NS_hxfalcon = hxfalcon
      params.caver = CAVER
    }
    for (const [key, value] of Object.entries(ordered)) params[key] = value
    const qs = toQueryString(params)
    return qs ? `${this.origin}${api}?${qs}` : `${this.origin}${api}`
  }

  private async request(
    method: 'GET' | 'POST',
    api: string,
    query: Record<string, unknown>,
    options: { eid?: string; referer?: string; accept?: string; body?: LiveJson } = {}
  ): Promise<LiveJson> {
    const referer = options.referer ?? this.roomReferer(options.eid ?? '')
    const url = await this.buildUrl(api, query)
    const headers = this.buildHeaders(method, referer, options.accept)
    const init: RequestInit = { method, headers }
    if (method === 'POST' && options.body !== undefined) {
      init.body = JSON.stringify(options.body)
    }
    const response = await this.fetchImpl(url, init)
    const text = await response.text()
    if (!text) return {}
    try {
      const parsed = JSON.parse(text) as unknown
      return isRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private async requestText(
    path: string,
    options: { referer: string; accept: string }
  ): Promise<string> {
    const headers = this.buildHeaders('GET', options.referer, options.accept)
    const response = await this.fetchImpl(`${this.origin}${path}`, { method: 'GET', headers })
    return response.text()
  }
}
