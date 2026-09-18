import type { Platform } from '../../platform.js'

export * from './api/index.js'
export * from './config/index.js'
export * from './device/index.js'
export * from './crawler/index.js'
export * from './downloader/index.js'
export * from './filter/index.js'
export * from './handler/index.js'
export * from './utils/index.js'
export * from './algorithm/index.js'
export * from './live/index.js'

// 从 model/types.js 导出不冲突的类型
export type {
  DouyinUser,
  DouyinVideo,
  VideoStatistics,
  VideoInfo,
  ImageInfo,
  ParsedUrl,
} from './model/types.js'

/** 抖音平台实现 */
export const douyinPlatform: Platform = {
  id: 'douyin',
  name: '抖音',
  match(url: string): boolean {
    return /douyin\.com|iesdouyin\.com/.test(url)
  },
}
