/**
 * Handler types and interfaces
 */

import type { DeviceProfile } from '../device/profile.js'

export interface HandlerConfig {
  cookie?: string
  headers?: Record<string, string>
  proxies?: {
    http?: string
    https?: string
  }
  timeout?: number
  maxCursor?: number
  pageCounts?: number
  maxCounts?: number
  /** 日期范围过滤（字符串，如 "today" / "2024-01-01~2024-12-31"），用于下载器 */
  interval?: string
  /** 分页请求间隔默认值（毫秒），作为所有生成器的 handler 级默认，可被单次调用 options.interval 覆盖 */
  pageInterval?: number
  url?: string
  folderize?: boolean
  /** 按实例覆盖全局 device（多账号场景一账号一指纹），透传给内部 DouyinCrawler */
  device?: DeviceProfile
  /** 设备参数 uifid，透传给内部 DouyinCrawler；不传则取 Cookie 里的 UIFID */
  uifid?: string
}

export interface PaginationOptions {
  maxCursor?: number
  /** 时间游标下界（时间戳）；仅对 `fetchUserPostVideos` 生效（对齐 f2，游标为时间戳），其他方法忽略 */
  minCursor?: number
  pageCounts?: number
  maxCounts?: number
  /** 每页之间的请求间隔（毫秒），防止触发风控。默认 5000（5 秒），设 0 关闭 */
  interval?: number
}

/** 分页默认请求间隔（毫秒），对齐 f2 默认 5 秒 */
export const DEFAULT_PAGE_INTERVAL = 5000

export interface FetchOptions {
  secUserId?: string
  userId?: string
  awemeId?: string
  mixId?: string
  collectsId?: string
  webcastId?: string
  roomId?: string
  commentId?: string
  keyword?: string
  searchId?: string
  offset?: number
  cursor?: number
  count?: number
  level?: number
  pullType?: number
  sourceType?: number
  minTime?: number
  maxTime?: number
  filterGids?: string
}

export type ModeType =
  | 'one'
  | 'post'
  | 'like'
  | 'music'
  | 'collection'
  | 'collects'
  | 'mix'
  | 'live'
  | 'feed'
  | 'related'
  | 'friend'

export const DY_LIVE_STATUS_MAPPING: Record<number, string> = {
  2: '直播中',
  4: '已关播',
}

export const IGNORE_FIELDS = [
  'video_play_addr',
  'images',
  'video_bit_rate',
  'cover',
  'images_video',
]
