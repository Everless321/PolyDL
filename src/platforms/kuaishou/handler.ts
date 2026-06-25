/**
 * 快手业务逻辑处理 —— 对标 DouyinHandler
 */
import { KuaishouClient } from './client.js'
import { KuaishouRestClient } from './rest.js'
import { VISION_PROFILE_PHOTO_LIST, VISION_PROFILE, VISION_VIDEO_DETAIL } from './graphql.js'
import type {
  KuaishouConfig,
  KuaishouPaginationOptions,
  VisionProfilePhotoList,
  VisionProfile,
  VisionVideoDetail,
  KsRestFeedPage,
} from './types.js'

export class KuaishouHandler {
  private client: KuaishouClient
  private rest?: KuaishouRestClient

  constructor(config: KuaishouConfig = {}) {
    this.client = new KuaishouClient(config)
    if (config.signer) {
      this.rest = new KuaishouRestClient({
        cookie: config.cookie || '',
        signer: config.signer,
        userAgent: config.headers?.['User-Agent'],
      })
    }
  }

  /**
   * 获取用户主页作品列表 —— 走签名 REST 通道 /rest/v/profile/feed（需注入 signer + 登录 Cookie）
   * 比 graphql 路径更稳（网页 App 自身用的就是这条）。pcursor 翻页直到 'no_more'。
   */
  async *fetchUserPostVideosRest(
    userId: string,
    options: KuaishouPaginationOptions = {}
  ): AsyncGenerator<KsRestFeedPage, void, unknown> {
    if (!this.rest) {
      throw new Error('未注入 signer，无法走签名 REST 通道；请在 config 传入 signer')
    }
    const { maxCounts = 0 } = options
    let pcursor = options.pcursor ?? ''
    let count = 0

    while (true) {
      const data = await this.rest.call<KsRestFeedPage>('POST', '/rest/v/profile/feed', {
        user_id: userId,
        pcursor,
        page: 'profile',
      })
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
   * 获取用户主页作品列表（生成器，pcursor 翻页直到 'no_more'）
   */
  async *fetchUserPostVideos(
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
   * 注意：必须探测「需要登录态」的列表接口，而非宽松的 visionProfile。
   * 实测 visionProfile 在登录会话过期后仍能返回资料，但 visionProfilePhotoList
   * 会报 "No Login" —— 用 profile 探测会误报有效。这里探测列表接口才准确。
   * 传入即将要抓的 userId 作为探针。
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
   * 获取用户资料（昵称/粉丝/作品数/头像）
   */
  async fetchUserProfile(userId: string): Promise<VisionProfile> {
    return this.client.query<VisionProfile>('visionProfile', VISION_PROFILE, { userId })
  }

  /**
   * 获取单作品详情（含 HEVC photoH265Url + 多码率 manifest）
   */
  async fetchOneVideo(photoId: string): Promise<VisionVideoDetail> {
    return this.client.query<VisionVideoDetail>('visionVideoDetail', VISION_VIDEO_DETAIL, {
      photoId,
      type: '',
      page: 'detail',
    })
  }
}
