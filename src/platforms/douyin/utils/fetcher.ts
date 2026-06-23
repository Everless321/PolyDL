import { get } from '../client/http.js'
import { APINotFoundError, APIResponseError } from '../errors/index.js'
import { extractValidUrls } from './common.js'

const DOUYIN_USER_PATTERN = /user\/([^/?]*)/
const REDIRECT_SEC_UID_PATTERN = /sec_uid=([^&]*)/
const DOUYIN_VIDEO_PATTERN = /video\/([^/?]*)/
const DOUYIN_NOTE_PATTERN = /note\/([^/?]*)/
const DOUYIN_SLIDES_PATTERN = /slides\/([^/?]*)/ // 图集分享链接 (iesdouyin.com)
const DOUYIN_MIX_PATTERN = /collection\/([^/?]*)/
const DOUYIN_LIVE_PATTERN = /live\/([^/?]*)/
const DOUYIN_LIVE_PATTERN2 = /https?:\/\/live\.douyin\.com\/(\d+)/
const DOUYIN_ROOM_PATTERN = /reflow\/([^/?]*)/

export type DouyinUrlType = 'user' | 'video' | 'note' | 'mix' | 'live' | 'unknown'

export interface ParsedDouyinUrl {
  type: DouyinUrlType
  url: string
  id: string | null
  secUserId: string | null
  awemeId: string | null
  mixId: string | null
  webcastId: string | null
}

/**
 * 统一解析抖音链接，自动识别类型（会跟随重定向）
 */
export async function resolveDouyinUrl(url: string): Promise<ParsedDouyinUrl> {
  if (typeof url !== 'string') {
    throw new TypeError('参数必须是字符串类型')
  }

  const validUrl = extractValidUrls(url)
  if (!validUrl) {
    throw new APINotFoundError('输入的URL不合法')
  }

  const response = await get<string>(validUrl, { followRedirects: true })
  const finalUrl = response.url

  const result: ParsedDouyinUrl = {
    type: 'unknown',
    url: finalUrl,
    id: null,
    secUserId: null,
    awemeId: null,
    mixId: null,
    webcastId: null,
  }

  // 检查视频链接
  let match = DOUYIN_VIDEO_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'video'
    result.id = match[1]
    result.awemeId = match[1]
    return result
  }

  // 检查图文链接
  match = DOUYIN_NOTE_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'note'
    result.id = match[1]
    result.awemeId = match[1]
    return result
  }

  // 检查图集分享链接 (iesdouyin.com/share/slides/)
  match = DOUYIN_SLIDES_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'note'
    result.id = match[1]
    result.awemeId = match[1]
    return result
  }

  // 检查用户链接
  match = DOUYIN_USER_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'user'
    result.id = match[1]
    result.secUserId = match[1]
    return result
  }

  // 检查重定向中的 sec_uid
  match = REDIRECT_SEC_UID_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'user'
    result.id = match[1]
    result.secUserId = match[1]
    return result
  }

  // 检查合集链接
  match = DOUYIN_MIX_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'mix'
    result.id = match[1]
    result.mixId = match[1]
    return result
  }

  // 检查直播链接
  match = DOUYIN_LIVE_PATTERN.exec(finalUrl)
  if (match) {
    result.type = 'live'
    result.id = match[1]
    result.webcastId = match[1]
    return result
  }

  match = DOUYIN_LIVE_PATTERN2.exec(finalUrl)
  if (match) {
    result.type = 'live'
    result.id = match[1]
    result.webcastId = match[1]
    return result
  }

  return result
}

export async function getSecUserId(url: string): Promise<string> {
  if (typeof url !== 'string') {
    throw new TypeError('参数必须是字符串类型')
  }

  const validUrl = extractValidUrls(url)
  if (!validUrl) {
    throw new APINotFoundError('输入的URL不合法')
  }

  const parsedUrl = new URL(validUrl)
  const host = parsedUrl.hostname

  const pattern =
    host === 'v.douyin.com' || host.endsWith('.v.douyin.com')
      ? REDIRECT_SEC_UID_PATTERN
      : DOUYIN_USER_PATTERN

  const response = await get<string>(validUrl, { followRedirects: true })

  if (response.status === 200 || response.status === 444) {
    const match = pattern.exec(response.url)
    if (match) {
      return match[1]
    }
    throw new APIResponseError('未在响应的地址中找到sec_user_id，检查链接是否为用户主页')
  }

  throw new APIResponseError(`状态码错误: ${response.status}`)
}

export async function getAllSecUserId(urls: string[]): Promise<string[]> {
  if (!Array.isArray(urls)) {
    throw new TypeError('参数必须是数组类型')
  }

  const validUrls = extractValidUrls(urls)
  if (validUrls.length === 0) {
    throw new APINotFoundError('输入的URL列表不合法')
  }

  return Promise.all(validUrls.map(url => getSecUserId(url)))
}

export async function getAwemeId(url: string): Promise<string> {
  if (typeof url !== 'string') {
    throw new TypeError('参数必须是字符串类型')
  }

  const validUrl = extractValidUrls(url)
  if (!validUrl) {
    throw new APINotFoundError('输入的URL不合法')
  }

  const response = await get<string>(validUrl, { followRedirects: true })

  let match = DOUYIN_VIDEO_PATTERN.exec(response.url)
  if (match) {
    return match[1]
  }

  match = DOUYIN_NOTE_PATTERN.exec(response.url)
  if (match) {
    return match[1]
  }

  // 图集分享链接 (iesdouyin.com/share/slides/)
  match = DOUYIN_SLIDES_PATTERN.exec(response.url)
  if (match) {
    return match[1]
  }

  throw new APIResponseError('未在响应的地址中找到aweme_id，当前链接暂时不支持')
}

export async function getAllAwemeId(urls: string[]): Promise<string[]> {
  if (!Array.isArray(urls)) {
    throw new TypeError('参数必须是数组类型')
  }

  const validUrls = extractValidUrls(urls)
  if (validUrls.length === 0) {
    throw new APINotFoundError('输入的URL列表不合法')
  }

  return Promise.all(validUrls.map(url => getAwemeId(url)))
}

export async function getMixId(url: string): Promise<string> {
  if (typeof url !== 'string') {
    throw new TypeError('参数必须是字符串类型')
  }

  const validUrl = extractValidUrls(url)
  if (!validUrl) {
    throw new APINotFoundError('输入的URL不合法')
  }

  const response = await get<string>(validUrl, { followRedirects: true })

  const match = DOUYIN_MIX_PATTERN.exec(response.url)
  if (match) {
    return match[1]
  }

  throw new APIResponseError('未在响应的地址中找到mix_id，检查链接是否为合集页')
}

export async function getAllMixId(urls: string[]): Promise<string[]> {
  if (!Array.isArray(urls)) {
    throw new TypeError('参数必须是数组类型')
  }

  const validUrls = extractValidUrls(urls)
  if (validUrls.length === 0) {
    throw new APINotFoundError('输入的URL列表不合法')
  }

  return Promise.all(validUrls.map(url => getMixId(url)))
}

export async function getWebcastId(url: string): Promise<string> {
  if (typeof url !== 'string') {
    throw new TypeError('参数必须是字符串类型')
  }

  const validUrl = extractValidUrls(url)
  if (!validUrl) {
    throw new APINotFoundError('输入的URL不合法')
  }

  const response = await get<string>(validUrl, { followRedirects: true })
  const finalUrl = response.url

  let match = DOUYIN_LIVE_PATTERN.exec(finalUrl)
  if (match) {
    return match[1]
  }

  match = DOUYIN_LIVE_PATTERN2.exec(finalUrl)
  if (match) {
    return match[1]
  }

  match = DOUYIN_ROOM_PATTERN.exec(finalUrl)
  if (match) {
    console.warn('该链接返回的是room_id，请使用getRoomId方法处理APP端分享链接')
    return match[1]
  }

  throw new APIResponseError('未在响应的地址中找到webcast_id，检查链接是否为直播页')
}

export async function getAllWebcastId(urls: string[]): Promise<string[]> {
  if (!Array.isArray(urls)) {
    throw new TypeError('参数必须是数组类型')
  }

  const validUrls = extractValidUrls(urls)
  if (validUrls.length === 0) {
    throw new APINotFoundError('输入的URL列表不合法')
  }

  return Promise.all(validUrls.map(url => getWebcastId(url)))
}

export async function getRoomId(url: string): Promise<string> {
  if (typeof url !== 'string') {
    throw new TypeError('参数必须是字符串类型')
  }

  const validUrl = extractValidUrls(url)
  if (!validUrl) {
    throw new APINotFoundError('输入的URL不合法')
  }

  const response = await get<string>(validUrl, { followRedirects: true })

  const match = DOUYIN_ROOM_PATTERN.exec(response.url)
  if (match) {
    return match[1]
  }

  throw new APIResponseError('未在响应的地址中找到room_id，检查链接是否为直播页')
}

export async function getAllRoomId(urls: string[]): Promise<string[]> {
  if (!Array.isArray(urls)) {
    throw new TypeError('参数必须是数组类型')
  }

  const validUrls = extractValidUrls(urls)
  if (validUrls.length === 0) {
    throw new APINotFoundError('输入的URL列表不合法')
  }

  return Promise.all(validUrls.map(url => getRoomId(url)))
}

/**
 * 从移动端分享页面获取视频/图集详情（无需 Cookie）
 * 这是一个备用方案，当没有 cookie 时可以使用此方法获取基础信息
 */
export interface SharePageDetail {
  awemeId: string
  desc: string
  createTime: number
  author: {
    uid: string
    secUid: string
    nickname: string
    avatarThumb?: string
  }
  statistics: {
    diggCount: number
    commentCount: number
    shareCount: number
    collectCount: number
  }
  video?: {
    duration: number
    playAddr: string[]
    cover: string[]
  }
  images?: Array<{
    urlList: string[]
  }>
  music?: {
    id: string
    title: string
    author: string
    playUrl?: string
  }
}

export async function fetchFromSharePage(awemeId: string): Promise<SharePageDetail | null> {
  const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`
  const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

  const response = await get<string>(shareUrl, {
    headers: {
      'User-Agent': mobileUA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  })

  const html = response.data as string
  const routerMatch = html.match(/<script[^>]*>window\._ROUTER_DATA\s*=\s*([\s\S]*?)<\/script>/i)

  if (!routerMatch) {
    return null
  }

  try {
    const jsonStr = routerMatch[1].trim().replace(/;$/, '')
    const routerData = JSON.parse(jsonStr)
    const loaderData = routerData.loaderData

    for (const key of Object.keys(loaderData)) {
      const data = loaderData[key]

      // 格式1: aweme.detail (图集等)
      let detail = data?.aweme?.detail

      // 格式2: videoInfoRes.item_list[0] (视频等)
      if (!detail && data?.videoInfoRes?.item_list?.length > 0) {
        detail = data.videoInfoRes.item_list[0]
      }

      if (detail) {
        const result: SharePageDetail = {
          awemeId: detail.awemeId || detail.aweme_id,
          desc: detail.desc || '',
          createTime: detail.createTime || detail.create_time || 0,
          author: {
            uid: detail.author?.uid || '',
            secUid: detail.author?.secUid || detail.author?.sec_uid || '',
            nickname: detail.author?.nickname || '',
            avatarThumb: detail.author?.avatarThumb?.urlList?.[0] || detail.author?.avatar_thumb?.url_list?.[0],
          },
          statistics: {
            diggCount: detail.statistics?.diggCount || detail.statistics?.digg_count || 0,
            commentCount: detail.statistics?.commentCount || detail.statistics?.comment_count || 0,
            shareCount: detail.statistics?.shareCount || detail.statistics?.share_count || 0,
            collectCount: detail.statistics?.collectCount || detail.statistics?.collect_count || 0,
          },
        }

        // 视频信息
        if (detail.video && !detail.images) {
          const playAddr = detail.video.playAddr || detail.video.play_addr
          const cover = detail.video.cover || detail.video.origin_cover
          result.video = {
            duration: detail.video.duration || 0,
            playAddr: playAddr ? (playAddr[0]?.src ? playAddr.map((p: any) => p.src) : playAddr.url_list || []) : [],
            cover: cover?.urlList || cover?.url_list || [],
          }
        }

        // 图集信息
        if (detail.images && detail.images.length > 0) {
          result.images = detail.images.map((img: any) => ({
            urlList: img.urlList || img.url_list || [],
          }))
        }

        // 音乐信息
        if (detail.music) {
          result.music = {
            id: detail.music.id || detail.music.mid || '',
            title: detail.music.title || '',
            author: detail.music.author || '',
            playUrl: detail.music.playUrl?.uri || detail.music.play_url?.uri,
          }
        }

        return result
      }
    }
  } catch {
    return null
  }

  return null
}
