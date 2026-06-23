/**
 * Handler types and interfaces
 */

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
  interval?: string
  url?: string
  folderize?: boolean
}

export interface PaginationOptions {
  maxCursor?: number
  minCursor?: number
  pageCounts?: number
  maxCounts?: number
}

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
