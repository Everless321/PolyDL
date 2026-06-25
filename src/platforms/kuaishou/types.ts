/**
 * 快手类型定义
 */

import type { KuaishouSigner } from './rest.js'

export interface KuaishouConfig {
  cookie?: string
  headers?: Record<string, string>
  /** 注入签名器后，handler 可走签名 REST 接口（更稳，需登录 Cookie）；不传则用 graphql */
  signer?: KuaishouSigner
}

/** REST /rest/v/profile/feed 返回（带签名通道，字段比 graphql 更全） */
export interface KsRestFeedPage {
  result: number
  pcursor: string
  feeds: KuaishouFeed[]
  /** result!==1 时可能带登录跳转 */
  loginUrl?: string
}

export interface KuaishouPaginationOptions {
  /** 最大抓取数量，0 表示全部 */
  maxCounts?: number
  /** 起始游标，默认空串 */
  pcursor?: string
}

export interface KuaishouCdnUrl {
  cdn?: string
  url: string
}

export interface KuaishouAuthor {
  id: string
  name: string
  following?: boolean
  headerUrl?: string
  headerUrls?: KuaishouCdnUrl[]
}

export interface KuaishouPhoto {
  id: string
  caption?: string
  originCaption?: string
  duration?: number
  timestamp?: number
  likeCount?: number | string
  realLikeCount?: number
  viewCount?: number | string
  commentCount?: number | string
  coverUrl?: string
  coverUrls?: KuaishouCdnUrl[]
  /** H264 无水印单档地址 */
  photoUrl?: string
  /** HEVC 单档地址 */
  photoH265Url?: string
  /** 多码率清单（字符串化 JSON，需二次解析） */
  manifest?: unknown
  manifestH265?: unknown
  videoResource?: unknown
  animatedCoverUrl?: string
  videoRatio?: number
  stereoType?: string
}

export interface KuaishouFeed {
  type?: number
  author: KuaishouAuthor
  photo: KuaishouPhoto
  status?: number
}

/** visionProfilePhotoList 返回结构 */
export interface VisionProfilePhotoList {
  result?: number
  llsid?: string
  webPageArea?: string
  feeds: KuaishouFeed[]
  hostName?: string
  /** 翻页游标，'no_more' 表示结束 */
  pcursor: string
}

/** visionProfile 返回结构 */
export interface KuaishouOwnerCount {
  fan?: number
  photo?: number
  follow?: number
  photo_public?: number
}

export interface KuaishouProfileInfo {
  gender?: string
  user_name?: string
  user_id?: string
  headurl?: string
  user_text?: string
  user_profile_bg_url?: string
}

export interface VisionProfile {
  result?: number
  hostName?: string
  userProfile: {
    ownerCount: KuaishouOwnerCount
    profile: KuaishouProfileInfo
    isFollowing?: boolean
  }
}

/** visionVideoDetail 返回结构（含 HEVC + 多码率 manifest） */
export interface KuaishouRepresentation {
  id?: string
  url: string
  backupUrl?: string[]
  codecs?: string
  height?: number
  width?: number
  avgBitrate?: number
  maxBitrate?: number
  qualityType?: string
  qualityLabel?: string
  frameRate?: number
  defaultSelect?: boolean
}

export interface KuaishouAdaptationSet {
  id?: number
  duration?: number
  representation: KuaishouRepresentation[]
}

export interface KuaishouManifest {
  mediaType?: string
  businessType?: string
  version?: string
  adaptationSet: KuaishouAdaptationSet[]
}

export interface VisionVideoDetail {
  status?: number
  type?: number
  author: KuaishouAuthor
  photo: KuaishouPhoto & {
    photoH265Url?: string
    manifest?: KuaishouManifest
    videoResource?: unknown
  }
}

/** GraphQL 响应外壳 */
export interface GraphqlResponse<T> {
  data?: Record<string, T>
  errors?: Array<{ message: string }>
}
