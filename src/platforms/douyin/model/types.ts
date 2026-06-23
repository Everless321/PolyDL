export interface DouyinUser {
  uid: string
  secUid: string
  nickname: string
  signature: string
  avatar: string
  followingCount: number
  followerCount: number
  likeCount: number
  videoCount: number
}

export interface DouyinVideo {
  awemeId: string
  desc: string
  createTime: number
  author: DouyinUser
  statistics: VideoStatistics
  video: VideoInfo
  images?: ImageInfo[]
  isImagePost: boolean
}

export interface VideoStatistics {
  playCount: number
  likeCount: number
  commentCount: number
  shareCount: number
  collectCount: number
}

export interface VideoInfo {
  playAddr: string
  cover: string
  duration: number
  width: number
  height: number
}

export interface ImageInfo {
  url: string
  width: number
  height: number
}

export interface ParsedUrl {
  type: 'video' | 'user' | 'live' | 'unknown'
  id: string
  originalUrl: string
}

export interface DownloadResult {
  success: boolean
  filePath?: string
  error?: string
}
