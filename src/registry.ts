import type { Platform } from './platform.js'
import { douyinPlatform } from './platforms/douyin/index.js'

/** 已注册的平台列表 - 新增平台在此追加 */
export const platforms: Platform[] = [douyinPlatform]

/** 根据 URL 找到对应平台 */
export function findPlatform(url: string): Platform | undefined {
  return platforms.find(p => p.match(url))
}
