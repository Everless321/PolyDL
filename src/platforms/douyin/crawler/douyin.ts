/**
 * DouyinCrawler - 抖音 API 请求封装
 * 对应 Python f2 项目的 crawler.py
 */

import { get, post, HttpResponse } from '../client/http.js'
import { getDevice, getEncryption } from '../config/index.js'
import { clientHintsOf, userAgentOf, type DeviceProfile } from '../device/profile.js'
import { xbogusModel2Endpoint, abogusModel2Endpoint } from '../utils/sign.js'
import { ENDPOINTS } from '../api/endpoints.js'
import { fetchRealMsToken, generateFakeMsToken } from '../algorithm/index.js'
import {
  createUserProfileParams,
  createUserPostParams,
  createUserLikeParams,
  createUserCollectionParams,
  createUserCollectsParams,
  createUserCollectsVideoParams,
  createUserMusicCollectionParams,
  createUserMixParams,
  createFriendFeedParams,
  createPostFeedParams,
  createFollowFeedParams,
  createPostRelatedParams,
  createPostDetailParams,
  createPostCommentParams,
  createPostCommentReplyParams,
  createPostLocateParams,
  createUserLiveParams,
  createUserLive2Params,
  createFollowingUserLiveParams,
  createSuggestWordParams,
  createPostSearchParams,
  createHomePostSearchParams,
  createUserFollowingParams,
  createUserFollowerParams,
  createLiveImFetchParams,
  createUserLiveStatusParams,
  createQueryUserParams,
  createPostStatsParams,
  toQueryString,
} from '../model/request.js'

export interface DouyinCrawlerConfig {
  cookie: string
  headers?: Record<string, string>
  proxies?: {
    http?: string
    https?: string
  }
  /** 按实例覆盖全局 device（多账号场景一账号一指纹）；不传则跟随全局配置 */
  device?: DeviceProfile
  /**
   * 设备参数 uifid。被加强管控的会话，接口会被 ArgusSecurityPlugin 以
   * 「Uifid Not Found」拦截，真实网页请求都带它。不传则取 Cookie 里的 UIFID（没有则 UIFID_TEMP），
   * 都没有就不带。
   */
  uifid?: string
}

/**
 * 抖音边缘网关 ArgusSecurityPlugin 要求的请求头。网关目前只检查头在不在、不校验取值：
 * 缺了它 aweme/post、aweme/detail 等接口直接 403「Uifid Not Found」，
 * 只补 uifid 不补它则是「Signature Not Found」（易误判成 a_bogus 问题）。
 * 将来若开始真校验取值，只能改为在真实页面里发请求，让页面自带的 SDK 补齐。
 */
const ARGUS_HEADER_VALUE = '1'

/** Cookie 里的 UIFID，没有则用 UIFID_TEMP——真实浏览器取 uifid 就是这个顺序 */
function uifidFromCookie(cookie: string): string | null {
  const match =
    cookie.match(/(?:^|;\s*)UIFID=([^;]+)/) ?? cookie.match(/(?:^|;\s*)UIFID_TEMP=([^;]+)/)
  return match ? match[1] : null
}

export class DouyinCrawler {
  private headers: Record<string, string>
  private readonly device: DeviceProfile | null
  private msToken: string | null = null
  private msTokenPromise: Promise<string> | null = null
  private uifid: string | null

  constructor(config: DouyinCrawlerConfig) {
    this.device = config.device ?? null
    this.uifid = config.uifid ?? null
    this.headers = {
      Cookie: config.cookie,
      ...config.headers,
    }
  }

  /** 实例指定了 device 就用实例的，否则读当前全局配置（构造后 setConfig 也生效） */
  private get profile(): DeviceProfile {
    return this.device ?? getDevice()
  }

  /**
   * 实例级 device 时要把 UA / Client Hints 一起带上，
   * 否则签名里的 UA 与请求头 UA 不一致。
   */
  private withDeviceHeaders(headers: Record<string, string>): Record<string, string> {
    if (!this.device) return headers
    return {
      'User-Agent': userAgentOf(this.device),
      ...clientHintsOf(this.device),
      ...headers,
    }
  }

  /**
   * 更新 uifid，之后的请求生效（例如从真实页面请求里采到了更准的值）。
   * 传 null 恢复为读 Cookie 里的 UIFID。
   */
  setUifid(uifid: string | null): void {
    this.uifid = uifid
  }

  /**
   * Cookie 里的 s_v_web_id。真实页面的 verifyFp / fp 就是它；
   * detail 等接口的 Argus 校验要求 uifid 与 verifyFp 成套且同源，自己生成的 verifyFp 会被判
   * 「Signature Not Found」。
   */
  private get cookieVerifyFp(): string | null {
    return this.headers.Cookie?.match(/(?:^|;\s*)s_v_web_id=([^;]+)/)?.[1] ?? null
  }

  private get currentUifid(): string | null {
    return this.uifid ?? uifidFromCookie(this.headers.Cookie ?? '')
  }

  /**
   * 补上 ArgusSecurityPlugin 要求的 x-tt-argus 与 uifid 头。
   * 调用方显式传的同名头优先；没有 uifid 时不发这个头，免得被当成「有但为空」。
   */
  private withArgusHeaders(headers: Record<string, string>): Record<string, string> {
    const uifid = this.currentUifid
    return {
      'x-tt-argus': ARGUS_HEADER_VALUE,
      ...(uifid ? { uifid } : {}),
      ...headers,
    }
  }

  private async ensureMsToken(): Promise<string> {
    if (this.msToken) {
      return this.msToken
    }

    if (this.msTokenPromise) {
      return this.msTokenPromise
    }

    this.msTokenPromise = fetchRealMsToken()
      .then(token => {
        this.msToken = token
        return token
      })
      .catch(() => {
        const fakeToken = generateFakeMsToken()
        this.msToken = fakeToken
        return fakeToken
      })

    return this.msTokenPromise
  }

  private async model2Endpoint(
    baseEndpoint: string,
    params: Record<string, unknown>,
    body: string = ''
  ): Promise<string> {
    const msToken = await this.ensureMsToken()
    // uifid / verifyFp / fp 必须在签名前加入，a_bogus 会把它们一起算进去；
    // 调用方已带 verifyFp（如直播接口传空串）时不动
    const uifid = this.currentUifid
    const verifyFp = 'verifyFp' in params ? null : this.cookieVerifyFp
    const paramsWithMsToken = {
      ...params,
      ...(uifid ? { uifid } : {}),
      ...(verifyFp ? { verifyFp, fp: verifyFp } : {}),
      msToken,
    }

    const profile = this.profile
    const userAgent = userAgentOf(profile)

    const encryption = getEncryption()
    if (encryption === 'xb') {
      return xbogusModel2Endpoint(userAgent, baseEndpoint, paramsWithMsToken)
    }
    return abogusModel2Endpoint(
      userAgent,
      baseEndpoint,
      paramsWithMsToken,
      body,
      profile.windowFingerprint
    )
  }

  private async fetchGetJson<T = unknown>(
    endpoint: string,
    maxRetries: number = 3,
    headers: Record<string, string> = this.headers
  ): Promise<HttpResponse<T>> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await get<T>(endpoint, {
          headers: this.withArgusHeaders(this.withDeviceHeaders(headers)),
        })

        // 检查响应是否为空或无效
        if (response.data === null || response.data === undefined) {
          throw new Error('响应数据为空')
        }

        // 检查是否为空字符串
        if (typeof response.data === 'string' && response.data.trim() === '') {
          throw new Error('响应数据为空字符串')
        }

        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          // 等待后重试 (指数退避)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }
    }

    throw lastError
  }

  private async fetchPostJson<T = unknown>(
    endpoint: string,
    body?: string | Record<string, unknown>
  ): Promise<HttpResponse<T>> {
    return post<T>(endpoint, body, {
      headers: this.withArgusHeaders(this.withDeviceHeaders(this.headers)),
    })
  }

  /**
   * 获取用户资料
   */
  async fetchUserProfile(secUserId: string): Promise<HttpResponse> {
    const params = createUserProfileParams(secUserId)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_DETAIL,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户作品列表
   */
  async fetchUserPost(
    secUserId: string,
    maxCursor: number = 0,
    count: number = 18
  ): Promise<HttpResponse> {
    const params = createUserPostParams(secUserId, maxCursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_POST,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户喜欢列表
   */
  async fetchUserLike(
    secUserId: string,
    maxCursor: number = 0,
    count: number = 18
  ): Promise<HttpResponse> {
    const params = createUserLikeParams(secUserId, maxCursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_FAVORITE_A,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户收藏列表
   * 注意：该接口需要用 POST 且只靠 cookie 来获取数据（与 f2 保持一致）
   */
  async fetchUserCollection(cursor: number = 0, count: number = 18): Promise<HttpResponse> {
    const params = createUserCollectionParams(cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_COLLECTION,
      params as unknown as Record<string, unknown>
    )
    return this.fetchPostJson(endpoint, params as unknown as Record<string, unknown>)
  }

  /**
   * 获取用户收藏夹列表
   */
  async fetchUserCollects(cursor: number = 0, count: number = 18): Promise<HttpResponse> {
    const params = createUserCollectsParams(cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_COLLECTS,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取收藏夹作品
   */
  async fetchUserCollectsVideo(
    collectsId: string,
    cursor: number = 0,
    count: number = 18
  ): Promise<HttpResponse> {
    const params = createUserCollectsVideoParams(collectsId, cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_COLLECTS_VIDEO,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户音乐收藏
   */
  async fetchUserMusicCollection(cursor: number = 0, count: number = 18): Promise<HttpResponse> {
    const params = createUserMusicCollectionParams(cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_MUSIC_COLLECTION,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取合集作品
   */
  async fetchUserMix(mixId: string, cursor: number = 0, count: number = 18): Promise<HttpResponse> {
    const params = createUserMixParams(mixId, cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.MIX_AWEME,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取朋友作品
   */
  async fetchFriendFeed(cursor: number = 0): Promise<HttpResponse> {
    const params = createFriendFeedParams(cursor)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.FRIEND_FEED,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取首页 Feed
   */
  async fetchPostFeed(count: number = 10): Promise<HttpResponse> {
    const params = createPostFeedParams(count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.TAB_FEED,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取关注用户作品
   */
  async fetchFollowFeed(cursor: number = 0, count: number = 20): Promise<HttpResponse> {
    const params = createFollowFeedParams(cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.FOLLOW_FEED,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取相关推荐
   */
  async fetchPostRelated(
    awemeId: string,
    filterGids: string = '',
    count: number = 20
  ): Promise<HttpResponse> {
    const params = createPostRelatedParams(awemeId, filterGids, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.POST_RELATED,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取作品详情
   */
  async fetchPostDetail(awemeId: string): Promise<HttpResponse> {
    const params = createPostDetailParams(awemeId)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.POST_DETAIL,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取作品评论
   */
  async fetchPostComment(
    awemeId: string,
    cursor: number = 0,
    count: number = 20
  ): Promise<HttpResponse> {
    const params = createPostCommentParams(awemeId, cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.POST_COMMENT,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取评论回复
   */
  async fetchPostCommentReply(
    itemId: string,
    commentId: string,
    cursor: number = 0,
    count: number = 3
  ): Promise<HttpResponse> {
    const params = createPostCommentReplyParams(itemId, commentId, cursor, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.POST_COMMENT_REPLY,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 定位作品
   */
  async fetchPostLocate(
    secUserId: string,
    maxCursor: string,
    locateItemCursor: string,
    locateItemId: string = '',
    count: number = 10
  ): Promise<HttpResponse> {
    const params = createPostLocateParams(
      secUserId,
      maxCursor,
      locateItemCursor,
      locateItemId,
      count
    )
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.LOCATE_POST,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户直播信息
   */
  async fetchUserLive(webRid: string, roomIdStr: string): Promise<HttpResponse> {
    const params = createUserLiveParams(webRid, roomIdStr)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.LIVE_INFO,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户直播信息2
   */
  async fetchUserLive2(roomId: string): Promise<HttpResponse> {
    const params = createUserLive2Params(roomId)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.LIVE_INFO_ROOM_ID,
      params as unknown as Record<string, unknown>
    )
    // 临时清空 Cookie 避免 invalid session（对齐 f2 fetch_live_room_id）
    const headersNoCookie = { ...this.headers, Cookie: '' }
    return this.fetchGetJson(endpoint, 3, headersNoCookie)
  }

  /**
   * 获取关注用户直播列表
   */
  async fetchFollowingUserLive(): Promise<HttpResponse> {
    const params = createFollowingUserLiveParams()
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.FOLLOW_USER_LIVE,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取搜索建议词
   */
  async fetchSuggestWords(query: string, count: number = 8): Promise<HttpResponse> {
    const params = createSuggestWordParams(query, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.SUGGEST_WORDS,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 搜索作品
   */
  async fetchPostSearch(
    keyword: string,
    filterSelected: string = '',
    offset: number = 0,
    count: number = 15
  ): Promise<HttpResponse> {
    const params = createPostSearchParams(keyword, filterSelected, offset, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.POST_SEARCH,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 主页作品搜索
   */
  async fetchHomePostSearch(
    keyword: string,
    fromUser: string,
    offset: number = 0,
    count: number = 10
  ): Promise<HttpResponse> {
    const params = createHomePostSearchParams(keyword, fromUser, offset, count)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.HOME_POST_SEARCH,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户关注列表
   */
  async fetchUserFollowing(
    secUserId: string,
    userId: string = '',
    offset: number = 0,
    count: number = 20,
    sourceType: number = 4
  ): Promise<HttpResponse> {
    const params = createUserFollowingParams(secUserId, userId, offset, count, sourceType)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_FOLLOWING,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户粉丝列表
   */
  async fetchUserFollower(
    userId: string,
    secUserId: string,
    offset: number = 0,
    count: number = 20,
    sourceType: number = 1
  ): Promise<HttpResponse> {
    const params = createUserFollowerParams(userId, secUserId, offset, count, sourceType)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_FOLLOWER,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取直播弹幕初始化数据
   */
  async fetchLiveImFetch(
    roomId: string,
    userUniqueId: string,
    cursor: string = '',
    internalExt: string = ''
  ): Promise<HttpResponse> {
    const params = createLiveImFetchParams(roomId, userUniqueId, cursor, internalExt)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.LIVE_IM_FETCH,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 获取用户直播状态
   */
  async fetchUserLiveStatus(userIds: string): Promise<HttpResponse> {
    const params = createUserLiveStatusParams(userIds)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.USER_LIVE_STATUS,
      params as unknown as Record<string, unknown>
    )
    return this.fetchGetJson(endpoint)
  }

  /**
   * 查询用户
   */
  async fetchQueryUser(secUserIds: string = ''): Promise<HttpResponse> {
    const params = createQueryUserParams()
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.QUERY_USER,
      params as unknown as Record<string, unknown>
    )

    // 与 f2 对齐：默认 GET；保留旧语义，传入 sec_user_ids 时走 POST。
    if (!secUserIds.trim()) {
      return this.fetchGetJson(endpoint)
    }

    const secUserIdList = secUserIds
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)

    return this.fetchPostJson(endpoint, { sec_user_ids: secUserIdList })
  }

  /**
   * 获取作品统计
   */
  async fetchPostStats(
    itemId: string,
    awemeType: number = 0,
    playDelta: number = 1
  ): Promise<HttpResponse> {
    const params = createPostStatsParams(itemId, awemeType, playDelta)
    const body = toQueryString(params as unknown as Record<string, unknown>)
    const endpoint = await this.model2Endpoint(
      ENDPOINTS.POST_STATS,
      params as unknown as Record<string, unknown>,
      body
    )
    return this.fetchPostJson(endpoint, body)
  }
}
