/**
 * 快手 www 数据接口。请求形态对齐 KuaiShou-Spider/ks_apis/kuaishou_api.py：
 * 路径、方法、body 键序与默认值、各接口 Referer、签名白名单。
 *
 * 不移植浏览器 Cookie 合同（字段顺序 / 长度校验）和滑块解题。
 * 风控与未登录由 KuaishouRestClient 抛出类型化错误。
 *
 * likeData 的 token 需要调用方传入。Python 的 like_token oracle 依赖抓包脚本，这里没有。
 * /rest/v/profile/user/v2 与 /rest/v/profile/history/list 在 Python 里已是 404，不再发包。
 */

import {
  GQL_BASE_EMOTICONS,
  GQL_CHECK_LOGIN,
  GQL_COMMENT_LIST,
  GQL_LIKE_DATA,
  GQL_PROFILE_PHOTO_LIST,
  GQL_SHORT_VIDEO_RECO,
  GQL_SUB_COMMENT_LIST,
  GQL_USER_INFO,
  GQL_VIDEO_DETAIL,
  GQL_VISION_CONFIG,
  GQL_VISION_LOGIN_CONFIG,
  GQL_VISION_OTT_CONFIG,
  GQL_VISION_PROFILE_REDUCED,
} from './graphql.js'
import {
  KUAISHOU_HOST,
  KUAISHOU_RECO_REFERER,
  KuaishouRestClient,
  type KuaishouRestConfig,
} from './rest.js'
import { percentEncode } from './sign/jsval.js'
import { extractPhotoId } from './url-parser.js'

export type KuaishouJson = Record<string, unknown>

const MY_FOLLOW_REFERER = `${KUAISHOU_HOST}/myFollow`
const OFFLINE_PROFILE_USER_V2 =
  '快手 /rest/v/profile/user/v2 已下线（HTTP 404）。Python 没有保留可对齐的请求体，这里不再发包'
const OFFLINE_HISTORY =
  '快手 /rest/v/profile/history/list 已下线（HTTP 404）。Python 没有保留可对齐的请求体，这里不再发包'

export type KuaishouWebApiConfig = KuaishouRestConfig

export interface KuaishouIterOptions {
  /** 累计条数达到后停止。0 或不传表示翻到结束 */
  maxCounts?: number
}

function isRecord(value: unknown): value is KuaishouJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Python urllib.parse.quote(safe='')：字母数字和 -._~ 不编码。 */
function pyQuote(value: string): string {
  return percentEncode(value, '~')
}

function searchReferer(keyword: string): string {
  return `${KUAISHOU_HOST}/search/video?searchKey=${pyQuote(keyword)}`
}

function isTerminalCursor(cursor: string): boolean {
  return (
    cursor === 'no_more' ||
    cursor === '-1' ||
    cursor === '' ||
    cursor === 'None' ||
    cursor === 'null'
  )
}

function feedCursor(page: KuaishouJson): string {
  const raw = page.pcursor
  if (raw == null || raw === '') return 'no_more'
  return String(raw)
}

function commentCursor(page: KuaishouJson): string {
  const v2 = page.pcursorV2
  if (v2 != null && v2 !== '') return String(v2)
  const v1 = page.pcursor
  if (v1 != null && v1 !== '') return String(v1)
  return 'no_more'
}

function commentBatch(page: KuaishouJson): unknown[] {
  const v2 = asArray(page.rootCommentsV2)
  if (v2.length > 0) return v2
  return asArray(page.rootComments)
}

function subCommentBatch(page: KuaishouJson): unknown[] {
  const v2 = asArray(page.subCommentsV2)
  if (v2.length > 0) return v2
  return asArray(page.subComments)
}

function relationBatch(page: KuaishouJson): unknown[] {
  const authors = asArray(page.authors)
  if (authors.length > 0) return authors
  return asArray(page.fols)
}

export class KuaishouWebApi {
  readonly rest: KuaishouRestClient
  private selfEid = ''

  constructor(config: KuaishouWebApiConfig | KuaishouRestClient) {
    this.rest = config instanceof KuaishouRestClient ? config : new KuaishouRestClient(config)
  }

  /** 推荐流。首页是 0 字节 POST；翻页 body 固定为 `{}`，不带 pcursor 字段。 */
  async getFeedHot(pcursor = ''): Promise<KuaishouJson> {
    const cursor = String(pcursor || '')
    const body = cursor ? {} : null
    return this.rest.call<KuaishouJson>('POST', '/rest/v/feed/hot', body, {
      referer: KUAISHOU_RECO_REFERER,
    })
  }

  async *iterFeedHot(options: KuaishouIterOptions = {}): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getFeedHot(cursor).then(page => ({
          items: asArray(page.feeds),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  async getSomeFeedHot(num = 20): Promise<unknown[]> {
    return this.collect(this.iterFeedHot({ maxCounts: num }), num)
  }

  /** 与 getVideoDetail 相同。 */
  getWorkInfo(workUrlOrId: string, referer?: string): Promise<KuaishouJson> {
    return this.getVideoDetail(workUrlOrId, referer)
  }

  /**
   * 作品详情。variables 只有 photoId、page=detail（不带 type / webPageArea）。
   * 短链要先 resolveShortUrl，这里只做 path 末段提取。
   */
  async getVideoDetail(workUrlOrId: string, referer?: string): Promise<KuaishouJson> {
    const photoId = extractPhotoId(workUrlOrId)
    const payload = await this.graphql(
      'visionVideoDetail',
      { photoId, page: 'detail' },
      GQL_VIDEO_DETAIL,
      { referer: referer || `${KUAISHOU_HOST}/short-video/${photoId}` }
    )
    const detail = this.node(payload, 'visionVideoDetail')
    if (Object.keys(detail).length === 0) {
      const errors = payload.errors == null ? '' : `: ${JSON.stringify(payload.errors)}`
      throw new Error(`visionVideoDetail 响应缺少 data.visionVideoDetail${errors}`)
    }
    return detail
  }

  /** 详情页旁边的推荐，不是目标作品本身。 */
  async getShortVideoReco(workUrlOrId: string): Promise<KuaishouJson> {
    const photoId = extractPhotoId(workUrlOrId)
    const payload = await this.graphql(
      'visionShortVideoReco',
      { page: 'detail', photoId },
      GQL_SHORT_VIDEO_RECO,
      { referer: `${KUAISHOU_HOST}/short-video/${photoId}` }
    )
    return this.node(payload, 'visionShortVideoReco')
  }

  /**
   * POST /graphql。不签名。accept 为 star/star。
   * body 键序：operationName、variables、query。
   */
  graphql(
    operationName: string,
    variables: Record<string, unknown>,
    query: string,
    options: { referer?: string } = {}
  ): Promise<KuaishouJson> {
    return this.rest.call<KuaishouJson>(
      'POST',
      '/graphql',
      { operationName, variables, query },
      { referer: options.referer || KUAISHOU_RECO_REFERER, accept: '*/*' }
    )
  }

  /** 评论表情。referer 必须是当前短视频页，不能用 new-reco 代替。 */
  async getBaseEmoticons(referer: string): Promise<KuaishouJson> {
    if (!referer) {
      throw new Error('visionBaseEmoticons 必须传当前短视频详情页 Referer')
    }
    const payload = await this.graphql('visionBaseEmoticons', {}, GQL_BASE_EMOTICONS, { referer })
    return this.node(payload, 'visionBaseEmoticons')
  }

  async visionLoginConfig(referer?: string): Promise<unknown> {
    const payload = await this.graphql(
      'visionLoginConfig',
      { key: 'frontendExplore.vision.loginConfig' },
      GQL_VISION_LOGIN_CONFIG,
      { referer: referer || MY_FOLLOW_REFERER }
    )
    const data = isRecord(payload.data) ? payload.data : {}
    return data.kconf ?? {}
  }

  async checkLogin(referer?: string): Promise<boolean> {
    const payload = await this.graphql('checkLoginQuery', {}, GQL_CHECK_LOGIN, {
      referer: referer || MY_FOLLOW_REFERER,
    })
    const data = isRecord(payload.data) ? payload.data : {}
    return Boolean(data.checkLogin)
  }

  async visionOttConfig(referer?: string): Promise<unknown> {
    const payload = await this.graphql(
      'visionOttConfig',
      { key: 'frontendExplore.vision.ottConfig' },
      GQL_VISION_OTT_CONFIG,
      { referer: referer || MY_FOLLOW_REFERER }
    )
    const data = isRecord(payload.data) ? payload.data : {}
    return data.kconf ?? {}
  }

  /**
   * 关注页 likeData。variables 顺序是 token、st、page。
   * 不传 token 会抛错：本地没有 like_token oracle。
   */
  async likeData(
    options: { page?: string; st?: number; token?: string; referer?: string } = {}
  ): Promise<KuaishouJson> {
    if (!options.token) {
      throw new Error('likeData 需要 token（本仓库未移植 like_token oracle，不能本地生成）')
    }
    const variables = {
      token: String(options.token),
      st: options.st ?? Date.now(),
      page: String(options.page ?? 'follow'),
    }
    const payload = await this.graphql('likeDataQuery', variables, GQL_LIKE_DATA, {
      referer: options.referer || MY_FOLLOW_REFERER,
    })
    return this.node(payload, 'likeData')
  }

  /** userId 省略时 variables 为 {}，传了才带 userId。 */
  async visionProfileReduced(userId?: string, referer?: string): Promise<KuaishouJson> {
    const variables = userId == null ? {} : { userId: String(userId) }
    const payload = await this.graphql(
      'visionProfileReduced',
      variables,
      GQL_VISION_PROFILE_REDUCED,
      {
        referer: referer || MY_FOLLOW_REFERER,
      }
    )
    return this.node(payload, 'visionProfileReduced')
  }

  /**
   * 关注页作品列表。variables 顺序 pcursor、page、profile_referer。
   * 不附带 userId / webPageArea（实抓首屏没有这两个键）。
   */
  async visionProfilePhotoList(
    options: { pcursor?: string; page?: string; profileReferer?: string; referer?: string } = {}
  ): Promise<KuaishouJson> {
    const variables = {
      pcursor: String(options.pcursor ?? ''),
      page: String(options.page ?? 'follow'),
      profile_referer: String(options.profileReferer ?? ''),
    }
    const payload = await this.graphql(
      'visionProfilePhotoList',
      variables,
      GQL_PROFILE_PHOTO_LIST,
      {
        referer: options.referer || MY_FOLLOW_REFERER,
      }
    )
    return this.node(payload, 'visionProfilePhotoList')
  }

  async visionConfig(referer?: string): Promise<KuaishouJson> {
    const payload = await this.graphql('visionConfigQuery', {}, GQL_VISION_CONFIG, {
      referer: referer || MY_FOLLOW_REFERER,
    })
    return this.node(payload, 'visionConfig')
  }

  async getUserInfo(referer?: string): Promise<KuaishouJson> {
    const payload = await this.graphql('userInfoQuery', {}, GQL_USER_INFO, {
      referer: referer || MY_FOLLOW_REFERER,
    })
    return this.node(payload, 'userInfo')
  }

  /** REST 一级评论。不在签名白名单。Referer 默认 new-reco。 */
  getCommentList(photoId: string, pcursor = ''): Promise<KuaishouJson> {
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/photo/comment/list',
      { photoId: String(photoId), pcursor: String(pcursor ?? '') },
      { referer: KUAISHOU_RECO_REFERER }
    )
  }

  async *iterComments(
    photoId: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getCommentList(photoId, cursor).then(page => ({
          items: commentBatch(page),
          cursor: commentCursor(page),
        })),
      options.maxCounts
    )
  }

  getAllComment(photoId: string, num = 100): Promise<unknown[]> {
    return this.collect(this.iterComments(photoId, { maxCounts: num }), num)
  }

  /** 详情页实际使用的 GraphQL 评论。认 rootCommentsV2 / pcursorV2。 */
  async getCommentListGql(photoId: string, pcursor = ''): Promise<KuaishouJson> {
    const id = String(photoId)
    const payload = await this.graphql(
      'commentListQuery',
      { photoId: id, pcursor: String(pcursor ?? '') },
      GQL_COMMENT_LIST,
      { referer: `${KUAISHOU_HOST}/short-video/${id}` }
    )
    return this.node(payload, 'visionCommentList')
  }

  async *iterCommentsGql(
    photoId: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getCommentListGql(photoId, cursor).then(page => ({
          items: commentBatch(page),
          cursor: commentCursor(page),
        })),
      options.maxCounts
    )
  }

  getAllCommentGql(photoId: string, num = 100): Promise<unknown[]> {
    return this.collect(this.iterCommentsGql(photoId, { maxCounts: num }), num)
  }

  /** 「查看更多回复」。任意 photo / root / cursor 都会发，不再卡死在单条抓包样本上。 */
  async getSubCommentList(
    photoId: string,
    rootCommentId: string,
    pcursor = ''
  ): Promise<KuaishouJson> {
    const id = String(photoId)
    const payload = await this.graphql(
      'visionSubCommentList',
      {
        photoId: id,
        rootCommentId: String(rootCommentId),
        pcursor: String(pcursor ?? ''),
      },
      GQL_SUB_COMMENT_LIST,
      { referer: `${KUAISHOU_HOST}/short-video/${id}` }
    )
    return this.node(payload, 'visionSubCommentList')
  }

  async *iterSubComments(
    photoId: string,
    rootCommentId: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getSubCommentList(photoId, rootCommentId, cursor).then(page => ({
          items: subCommentBatch(page),
          cursor: commentCursor(page),
        })),
      options.maxCounts
    )
  }

  /** GET 当前登录用户资料。命中签名白名单。成功时缓存 eid。 */
  async getProfile(options: { referer?: string; profileId?: string } = {}): Promise<KuaishouJson> {
    let referer = options.referer
    if (!referer && options.profileId) referer = `${KUAISHOU_HOST}/profile/${options.profileId}`
    const data = await this.rest.call<KuaishouJson>('GET', '/rest/v/profile/get', undefined, {
      referer,
    })
    const eid = String(data.eid || data.userDefineId || '')
    if (eid) this.selfEid = eid
    return data
  }

  /**
   * 用户作品。body 键序 user_id、pcursor、page=profile。
   * 额外带空的 profile_referer 头。Referer 是该用户主页。
   */
  getProfileFeed(userId: string, pcursor = ''): Promise<KuaishouJson> {
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/profile/feed',
      { user_id: String(userId), pcursor: String(pcursor ?? ''), page: 'profile' },
      {
        referer: `${KUAISHOU_HOST}/profile/${userId}`,
        extraHeaders: { profile_referer: '' },
      }
    )
  }

  async *iterProfileFeed(
    userId: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getProfileFeed(userId, cursor).then(page => ({
          items: asArray(page.feeds),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  /** iterProfileFeed 的别名，和「用户作品」这个说法对齐。 */
  iterUserWorks(userId: string, options: KuaishouIterOptions = {}): AsyncGenerator<unknown[]> {
    return this.iterProfileFeed(userId, options)
  }

  getUserAllWork(userId: string, num = 100): Promise<unknown[]> {
    return this.collect(this.iterProfileFeed(userId, { maxCounts: num }), num)
  }

  /** 端点已 404，Python 禁止发包。 */
  getProfileUserV2(_userId: string): Promise<never> {
    return Promise.reject(new Error(OFFLINE_PROFILE_USER_V2))
  }

  /**
   * 搜索作品。
   * 首页 body：keyword、page=search、webPageArea=""、pcursor=""。
   * 翻页 body：keyword、pcursor、searchSessionId（回传上一页的值）。
   */
  searchFeed(
    keyword: string,
    pcursor = '',
    options: { webPageArea?: string; searchSessionId?: string; referer?: string } = {}
  ): Promise<KuaishouJson> {
    const cursor = String(pcursor || '')
    const body = cursor
      ? {
          keyword,
          pcursor: cursor,
          searchSessionId: String(options.searchSessionId ?? ''),
        }
      : {
          keyword,
          page: 'search',
          webPageArea: String(options.webPageArea ?? ''),
          pcursor: '',
        }
    return this.rest.call<KuaishouJson>('POST', '/rest/v/search/feed', body, {
      referer: options.referer || searchReferer(keyword),
    })
  }

  async *iterSearchFeed(
    keyword: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    let cursor = ''
    let sessionId = ''
    let count = 0
    const max = options.maxCounts ?? 0
    while (true) {
      const page = await this.searchFeed(keyword, cursor, { searchSessionId: sessionId })
      const items = asArray(page.feeds).length > 0 ? asArray(page.feeds) : asArray(page.list)
      yield items
      count += items.length
      const next = feedCursor(page)
      sessionId = String(page.searchSessionId ?? sessionId)
      if (!items.length || isTerminalCursor(next) || next === cursor || (max > 0 && count >= max))
        break
      cursor = next
    }
  }

  searchSomeFeed(keyword: string, num = 20): Promise<unknown[]> {
    return this.collect(this.iterSearchFeed(keyword, { maxCounts: num }), num)
  }

  /** 搜索用户。body 始终是 keyword、pcursor、searchSessionId。Referer 仍是 search/video。 */
  searchUser(
    keyword: string,
    pcursor = '',
    searchSessionId = '',
    referer?: string
  ): Promise<KuaishouJson> {
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/search/user',
      {
        keyword,
        pcursor: String(pcursor || ''),
        searchSessionId: String(searchSessionId || ''),
      },
      { referer: referer || searchReferer(keyword) }
    )
  }

  /** 翻页时回传上一页的 searchSessionId。 */
  async *iterSearchUser(
    keyword: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    let sessionId = ''
    yield* this.iterate(
      cursor =>
        this.searchUser(keyword, cursor, sessionId).then(page => {
          sessionId = String(page.searchSessionId ?? sessionId)
          return { items: asArray(page.users), cursor: feedCursor(page) }
        }),
      options.maxCounts
    )
  }

  /**
   * 关注 ftype=1 / 粉丝 ftype=2。body 键序 pcursor、ftype。
   * 不在签名白名单。Referer 用 profile/get 缓存的本人 eid。
   */
  async getRelation(ftype = 1, pcursor = ''): Promise<KuaishouJson> {
    const selfEid = await this.ensureSelfEid()
    const referer = selfEid ? `${KUAISHOU_HOST}/profile/${selfEid}` : undefined
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/relation/fol',
      { pcursor: String(pcursor ?? ''), ftype: Number(ftype) },
      { referer }
    )
  }

  async *iterRelation(ftype = 1, options: KuaishouIterOptions = {}): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getRelation(ftype, cursor).then(page => ({
          items: relationBatch(page),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  getSomeRelation(ftype = 1, num = 100): Promise<unknown[]> {
    return this.collect(this.iterRelation(ftype, { maxCounts: num }), num)
  }

  /** 喜欢列表。body 键序 pcursor、page=profile。 */
  getLikedList(
    pcursor = '',
    options: { referer?: string; profileId?: string } = {}
  ): Promise<KuaishouJson> {
    let referer = options.referer
    if (!referer && options.profileId) referer = `${KUAISHOU_HOST}/profile/${options.profileId}`
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/feed/liked',
      { pcursor: String(pcursor ?? ''), page: 'profile' },
      { referer }
    )
  }

  async *iterLikedList(options: KuaishouIterOptions = {}): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getLikedList(cursor).then(page => ({
          items: asArray(page.feeds),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  /** 收藏。键名是 userId（驼峰），page=collect。不传 userId 时用本人 eid。 */
  async getCollectList(userId = '', pcursor = ''): Promise<KuaishouJson> {
    const uid = String(userId || (await this.ensureSelfEid()) || '')
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/collect/list',
      { userId: uid, pcursor: String(pcursor ?? ''), page: 'collect' },
      { referer: uid ? `${KUAISHOU_HOST}/profile/${uid}` : undefined }
    )
  }

  async *iterCollectList(
    userId = '',
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getCollectList(userId, cursor).then(page => ({
          items: asArray(page.feeds),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  /** 私密作品。body 键序 pcursor、page=private。 */
  getPrivateList(
    pcursor = '',
    options: { referer?: string; profileId?: string } = {}
  ): Promise<KuaishouJson> {
    let referer = options.referer
    if (!referer && options.profileId) referer = `${KUAISHOU_HOST}/profile/${options.profileId}`
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/profile/private/list',
      { pcursor: String(pcursor ?? ''), page: 'private' },
      { referer }
    )
  }

  async *iterPrivateList(options: KuaishouIterOptions = {}): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getPrivateList(cursor).then(page => ({
          items: asArray(page.feeds),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  /** 端点已 404，Python 禁止发包。 */
  getHistoryList(_pcursor = ''): Promise<never> {
    return Promise.reject(new Error(OFFLINE_HISTORY))
  }

  /** 直播回放。不在签名白名单。body 键序 userId、pcursor。 */
  getPlaybackList(userId: string, pcursor = ''): Promise<KuaishouJson> {
    return this.rest.call<KuaishouJson>(
      'POST',
      '/rest/v/live/playBack/list',
      { userId: String(userId), pcursor: String(pcursor ?? '') },
      { referer: `${KUAISHOU_HOST}/profile/${userId}` }
    )
  }

  async *iterPlaybackList(
    userId: string,
    options: KuaishouIterOptions = {}
  ): AsyncGenerator<unknown[]> {
    yield* this.iterate(
      cursor =>
        this.getPlaybackList(userId, cursor).then(page => ({
          items: asArray(page.livePlayBackList),
          cursor: feedCursor(page),
        })),
      options.maxCounts
    )
  }

  /** 空 body POST，不签名，不带 content-type。 */
  systemConfigs(referer?: string): Promise<KuaishouJson> {
    return this.rest.call<KuaishouJson>('POST', '/rest/v/system/configs', null, { referer })
  }

  /** 旧名字。实际打的是 /rest/v/system/configs。 */
  systemStartup(referer?: string): Promise<KuaishouJson> {
    return this.systemConfigs(referer)
  }

  /** 空 body POST，不签名。 */
  kconfGet(options: { referer?: string; profileId?: string } = {}): Promise<KuaishouJson> {
    let referer = options.referer
    if (!referer && options.profileId) referer = `${KUAISHOU_HOST}/profile/${options.profileId}`
    return this.rest.call<KuaishouJson>('POST', '/rest/v/kconf/get', null, { referer })
  }

  private node(payload: KuaishouJson, key: string): KuaishouJson {
    const data = isRecord(payload.data) ? payload.data : {}
    const value = data[key]
    return isRecord(value) ? value : {}
  }

  private async ensureSelfEid(): Promise<string> {
    if (this.selfEid) return this.selfEid
    await this.getProfile({ referer: KUAISHOU_RECO_REFERER })
    return this.selfEid
  }

  private async *iterate(
    pull: (cursor: string) => Promise<{ items: unknown[]; cursor: string }>,
    maxCounts = 0
  ): AsyncGenerator<unknown[]> {
    let cursor = ''
    let count = 0
    while (true) {
      const page = await pull(cursor)
      yield page.items
      count += page.items.length
      const next = page.cursor
      if (
        !page.items.length ||
        isTerminalCursor(next) ||
        next === cursor ||
        (maxCounts > 0 && count >= maxCounts)
      ) {
        break
      }
      cursor = next
    }
  }

  private async collect(iter: AsyncGenerator<unknown[]>, num: number): Promise<unknown[]> {
    const out: unknown[] = []
    for await (const batch of iter) {
      out.push(...batch)
      if (num > 0 && out.length >= num) break
    }
    return num > 0 ? out.slice(0, num) : out
  }
}
