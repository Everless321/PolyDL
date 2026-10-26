/**
 * 快手业务逻辑。用户作品默认走签名 REST /rest/v/profile/feed，失败再退回 GraphQL。
 * 作品列表类方法返回 normalizeWork 之后的 KuaishouWork。
 * 方法名与 DouyinHandler 对齐（fetchOneVideo、fetchUserPostVideos、fetchPostComment …）。
 */
import { KuaishouWebApi } from './api.js'
import { KuaishouClient } from './client.js'
import { VISION_PROFILE, VISION_PROFILE_PHOTO_LIST } from './graphql.js'
import { KuaishouRestClient } from './rest.js'
import type {
  KuaishouConfig,
  KuaishouPaginationOptions,
  KsRestFeedPage,
  VisionProfile,
  VisionProfilePhotoList,
} from './types.js'
import {
  extractPhotoId,
  getProfileId,
  isShortUrl,
  parseKuaishouTarget,
  resolveShortUrl,
} from './url-parser.js'
import { normalizeWork, normalizeWorks, type KuaishouWork } from './work.js'

export class KuaishouHandler {
  private client: KuaishouClient
  private api: KuaishouWebApi
  /** 与 api 共用的 REST 客户端，供仍直接调 call 的代码使用 */
  private rest: KuaishouRestClient

  constructor(config: KuaishouConfig = {}) {
    this.client = new KuaishouClient(config)
    this.api = new KuaishouWebApi({
      cookie: config.cookie || '',
      signer: config.signer,
      userAgent: config.headers?.['User-Agent'] || config.headers?.['user-agent'],
      kww: config.kww,
    })
    this.rest = this.api.rest
  }

  /**
   * 用户主页作品。签名 REST /rest/v/profile/feed，pcursor 直到 no_more。
   */
  async *fetchUserPostVideosRest(
    userId: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KsRestFeedPage, void, unknown> {
    const { maxCounts = 0 } = options
    let pcursor = options.pcursor ?? ''
    let count = 0

    while (true) {
      const data = await this.rest.call<KsRestFeedPage>(
        'POST',
        '/rest/v/profile/feed',
        { user_id: userId, pcursor, page: 'profile' },
        {
          referer: `https://www.kuaishou.com/profile/${userId}`,
          extraHeaders: { profile_referer: '' },
        }
      )
      if (data.result !== 1) {
        throw new Error(`快手 REST 返回 result=${data.result}（109=未登录，请检查登录 Cookie）`)
      }

      yield data

      count += data.feeds?.length ?? 0
      pcursor = data.pcursor
      if (!pcursor || pcursor === 'no_more') break
      if (maxCounts > 0 && count >= maxCounts) break
    }
  }

  /**
   * 用户主页作品，按页产出 KuaishouWork[]。userIdOrUrl 可以是 eid、主页或直播主页链接。
   * 先走 REST，第一页就失败时退回 GraphQL visionProfilePhotoList。
   */
  async *fetchUserPostVideos(
    userIdOrUrl: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    const userId = await this.resolveUserId(userIdOrUrl)
    yield* this.pageWorks(this.rawUserPostPages(userId, options), options.maxCounts)
  }

  private async *rawUserPostPages(
    userId: string,
    options: KuaishouPaginationOptions
  ): AsyncGenerator<unknown[], void, unknown> {
    let yielded = false
    try {
      for await (const page of this.fetchUserPostVideosRest(userId, options)) {
        yielded = true
        yield page.feeds ?? []
      }
    } catch (error) {
      if (yielded) throw error
      for await (const page of this.fetchUserPostVideosGraphql(userId, options)) {
        yield page.feeds ?? []
      }
    }
  }

  private async *fetchUserPostVideosGraphql(
    userId: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<VisionProfilePhotoList, void, unknown> {
    const { maxCounts = 0 } = options
    let pcursor = options.pcursor ?? ''
    let count = 0

    while (true) {
      const data = await this.client.query<VisionProfilePhotoList>(
        'visionProfilePhotoList',
        VISION_PROFILE_PHOTO_LIST,
        { userId, pcursor, page: 'profile' }
      )

      yield data

      count += data.feeds?.length ?? 0
      pcursor = data.pcursor

      if (!pcursor || pcursor === 'no_more') break
      if (maxCounts > 0 && count >= maxCounts) break
    }
  }

  /**
   * 校验 Cookie 是否有效（无签名）。
   *
   * 探测需要登录态的 visionProfilePhotoList，而不是宽松的 visionProfile。
   */
  async checkCookie(probeUserId: string): Promise<boolean> {
    try {
      const data = await this.client.query<VisionProfilePhotoList>(
        'visionProfilePhotoList',
        VISION_PROFILE_PHOTO_LIST,
        { userId: probeUserId, pcursor: '', page: 'profile' }
      )
      return data.result === 1 && Array.isArray(data.feeds)
    } catch {
      return false
    }
  }

  /**
   * 用户资料（昵称/粉丝/作品数/头像）。接受 eid 或主页 / 直播主页链接。
   * 这是 GraphQL visionProfile；当前登录用户的 REST 资料用 KuaishouWebApi.getProfile。
   */
  async fetchUserProfile(userIdOrUrl: string): Promise<VisionProfile> {
    const userId = await this.resolveUserId(userIdOrUrl)
    return this.client.query<VisionProfile>('visionProfile', VISION_PROFILE, { userId })
  }

  /**
   * 作品链接、短链或 photoId → 归一化作品。详情走 GraphQL visionVideoDetail（photoId + page=detail）。
   * 原始响应在返回值的 raw 字段里。
   */
  async fetchOneVideo(urlOrId: string): Promise<KuaishouWork> {
    const detail = await this.api.getVideoDetail(await this.resolvePhotoId(urlOrId))
    return normalizeWork(detail)
  }

  /** fetchOneVideo 的别名。 */
  fetchWork(urlOrId: string): Promise<KuaishouWork> {
    return this.fetchOneVideo(urlOrId)
  }

  /** fetchUserPostVideos 的别名。 */
  fetchUserWorks(
    userIdOrUrl: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    return this.fetchUserPostVideos(userIdOrUrl, options)
  }

  /** 当前登录账号的喜欢列表。快手接口只认 Cookie，查不了别人。 */
  async *fetchUserLikeVideos(
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    yield* this.pageWorks(this.api.iterLikedList(options), options.maxCounts)
  }

  /** 收藏列表。不传 options.userId 时取当前登录账号；传了可以查别人公开的收藏。 */
  async *fetchUserCollectionVideos(
    options: KuaishouPaginationOptions & { userId?: string } = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    const userId = options.userId ? await this.resolveUserId(options.userId) : ''
    yield* this.pageWorks(this.api.iterCollectList(userId, options), options.maxCounts)
  }

  /** 当前登录账号的私密作品。快手独有。 */
  async *fetchUserPrivateVideos(
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    yield* this.pageWorks(this.api.iterPrivateList(options), options.maxCounts)
  }

  /** 作品详情页旁边的相关推荐。接口不翻页，只有一页。 */
  async *fetchRelatedVideos(
    photoIdOrUrl: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    const photoId = await this.resolvePhotoId(photoIdOrUrl)
    const api = this.api
    async function* onePage(): AsyncGenerator<unknown[]> {
      const page = await api.getShortVideoReco(photoId)
      yield Array.isArray(page.feeds) ? page.feeds : []
    }
    yield* this.pageWorks(onePage(), options.maxCounts)
  }

  /** 当前登录账号的关注列表，按页产出用户原始对象（id、name、headerUrl…）。 */
  async *fetchUserFollowing(
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    yield* this.pageItems(this.api.iterRelation(1, options), options.maxCounts)
  }

  /** 当前登录账号的粉丝列表，按页产出用户原始对象。 */
  async *fetchUserFollower(
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    yield* this.pageItems(this.api.iterRelation(2, options), options.maxCounts)
  }

  /** 搜索用户，按页产出用户原始对象。快手独有。 */
  async *fetchSearchUser(
    keyword: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    yield* this.pageItems(this.api.iterSearchUser(keyword, options), options.maxCounts)
  }

  /** 用户的直播回放，按页产出原始对象。快手独有。 */
  async *fetchUserLiveReplays(
    userIdOrUrl: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    const userId = await this.resolveUserId(userIdOrUrl)
    yield* this.pageItems(this.api.iterPlaybackList(userId, options), options.maxCounts)
  }

  /** 搜索作品，按页产出 KuaishouWork[]。 */
  async *searchWorks(
    keyword: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    const max = options.maxCounts ?? 0
    let count = 0
    for await (const page of this.api.iterSearchFeed(keyword, { maxCounts: max })) {
      let works = normalizeWorks(page)
      if (max > 0 && count + works.length > max) works = works.slice(0, max - count)
      if (works.length > 0) yield works
      count += works.length
      if (max > 0 && count >= max) break
    }
  }

  /** 推荐流，按页产出 KuaishouWork[]。 */
  async *fetchFeedHot(
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    const max = options.maxCounts ?? 0
    let count = 0
    for await (const page of this.api.iterFeedHot({ maxCounts: max })) {
      let works = normalizeWorks(page)
      if (max > 0 && count + works.length > max) works = works.slice(0, max - count)
      if (works.length > 0) yield works
      count += works.length
      if (max > 0 && count >= max) break
    }
  }

  /**
   * 作品评论，按页产出。走详情页的 GraphQL commentListQuery。
   * photoId 可以是作品链接或短链。
   */
  async *fetchPostComment(
    photoIdOrUrl: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    const photoId = await this.resolvePhotoId(photoIdOrUrl)
    yield* this.pageItems(this.api.iterCommentsGql(photoId, options), options.maxCounts)
  }

  /** fetchPostComment 的别名。 */
  fetchComments(
    photoIdOrUrl: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    return this.fetchPostComment(photoIdOrUrl, options)
  }

  /** 评论的楼中楼回复，按页产出。rootCommentId 取自 fetchPostComment 的 commentId。 */
  async *fetchPostCommentReply(
    photoIdOrUrl: string,
    rootCommentId: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<unknown[], void, unknown> {
    const photoId = await this.resolvePhotoId(photoIdOrUrl)
    yield* this.pageItems(
      this.api.iterSubComments(photoId, rootCommentId, options),
      options.maxCounts
    )
  }

  /** 把原始作品页归一化成 KuaishouWork[]，并按 maxCounts 截断。 */
  private async *pageWorks(
    pages: AsyncIterable<unknown[]>,
    maxCounts = 0
  ): AsyncGenerator<KuaishouWork[], void, unknown> {
    for await (const items of this.pageItems(pages, maxCounts)) {
      yield normalizeWorks(items)
    }
  }

  /** 按 maxCounts 截断原始分页，跳过空页。 */
  private async *pageItems(
    pages: AsyncIterable<unknown[]>,
    maxCounts = 0
  ): AsyncGenerator<unknown[], void, unknown> {
    let count = 0
    for await (const page of pages) {
      let batch = page
      if (maxCounts > 0 && count + batch.length > maxCounts) {
        batch = batch.slice(0, maxCounts - count)
      }
      if (batch.length > 0) yield batch
      count += batch.length
      if (maxCounts > 0 && count >= maxCounts) break
    }
  }

  private async resolvePhotoId(input: string): Promise<string> {
    let text = input.trim()
    if (isShortUrl(text)) text = await resolveShortUrl(text)
    const parsed = parseKuaishouTarget(text)
    if (parsed.kind === 'photo' || parsed.kind === 'id') return parsed.id
    return extractPhotoId(text)
  }

  private async resolveUserId(input: string): Promise<string> {
    let text = input.trim()
    if (isShortUrl(text)) text = await resolveShortUrl(text)
    const profileId = getProfileId(text)
    if (profileId) return profileId
    const parsed = parseKuaishouTarget(text)
    if (parsed.kind === 'profile' || parsed.kind === 'live-user' || parsed.kind === 'id') {
      return parsed.id
    }
    return extractPhotoId(text)
  }
}
