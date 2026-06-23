import type { ParsedUrl } from '../model/types.js'

const DOUYIN_PATTERNS = {
  // 短链接: https://v.douyin.com/xxx
  SHORT_URL: /https?:\/\/v\.douyin\.com\/([a-zA-Z0-9]+)/,
  // 分享链接: https://www.douyin.com/video/xxx
  VIDEO_URL: /https?:\/\/www\.douyin\.com\/video\/(\d+)/,
  // 用户主页: https://www.douyin.com/user/xxx
  USER_URL: /https?:\/\/www\.douyin\.com\/user\/([a-zA-Z0-9_-]+)/,
  // 直播间: https://live.douyin.com/xxx
  LIVE_URL: /https?:\/\/live\.douyin\.com\/(\d+)/,
  // 作品ID提取
  AWEME_ID: /aweme_id=(\d+)/,
}

export function parseDouyinUrl(url: string): ParsedUrl {
  const result: ParsedUrl = {
    type: 'unknown',
    id: '',
    originalUrl: url,
  }

  // 视频链接
  const videoMatch = url.match(DOUYIN_PATTERNS.VIDEO_URL)
  if (videoMatch) {
    return { ...result, type: 'video', id: videoMatch[1] }
  }

  // 用户主页
  const userMatch = url.match(DOUYIN_PATTERNS.USER_URL)
  if (userMatch) {
    return { ...result, type: 'user', id: userMatch[1] }
  }

  // 直播间
  const liveMatch = url.match(DOUYIN_PATTERNS.LIVE_URL)
  if (liveMatch) {
    return { ...result, type: 'live', id: liveMatch[1] }
  }

  // 短链接需要先解析
  const shortMatch = url.match(DOUYIN_PATTERNS.SHORT_URL)
  if (shortMatch) {
    return { ...result, type: 'video', id: shortMatch[1] }
  }

  return result
}

export async function resolveShortUrl(_shortUrl: string): Promise<string> {
  // TODO: 解析短链接获取真实URL
  throw new Error('Not implemented')
}

export function extractAwemeId(url: string): string | null {
  const match = url.match(DOUYIN_PATTERNS.AWEME_ID)
  return match ? match[1] : null
}
