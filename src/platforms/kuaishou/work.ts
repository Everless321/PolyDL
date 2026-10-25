/**
 * 快手作品归一化与表格导出。
 *
 * 对齐 KuaiShou-Spider/utils/data_util.py 的 parse_count / handle_work_info /
 * save_work_detail / save_to_xlsx。只处理已经拿到的 feed / photo JSON，不发请求。
 *
 * 下载见 ./downloader.ts。本文件不从 index 再导出，交给后续 API 层接线。
 */

import * as fs from 'fs'
import * as path from 'path'

export type KuaishouWorkType = 'video' | 'image'

export interface KuaishouWorkTag {
  name: string
  /** 快手 tag.type，GraphQL 里常为字符串；没有则省略 */
  type?: string
}

export interface KuaishouWorkAuthor {
  userId: string
  nickname: string
  avatar: string
  /** https://www.kuaishou.com/profile/{userId} */
  profileUrl: string
}

/**
 * handle_work_info 的 camelCase 形态。
 *
 * 计数字段一律是整数：REST 的数字和 GraphQL 的「74万」都走 parseCount。
 * createTime 是本地时区格式化结果，createTimestamp 保留接口原值。
 */
export interface KuaishouWork {
  workId: string
  /** https://www.kuaishou.com/short-video/{workId} */
  workUrl: string
  /**
   * 有图集地址或单图标记时为 image。
   * 此时即使 photoUrl 有值，下载器也按图文处理（与 Python 的「图文」分支一致）；
   * videoUrl 仍会填上，方便调用方自己决定要不要下视频。
   */
  workType: KuaishouWorkType
  /** 展示标题，来源 caption / title / originCaption */
  title: string
  /** 与 title 相同，保留 caption 这个名字给上层 */
  caption: string
  /** 与 title 相同。Python 的 title 和 desc 都取 caption */
  desc: string
  /** photo.duration，快手网页一般是毫秒，这里不换算成秒 */
  duration: number
  /** 本地时区 `YYYY-MM-DD HH:mm:ss`；没有时间戳时为空串 */
  createTime: string
  /** photo.timestamp 原值（网页端一般为毫秒）。小于 1e11 时按秒参与格式化，原值仍保留 */
  createTimestamp: number
  likeCount: number
  commentCount: number
  viewCount: number
  shareCount: number
  collectCount: number
  author: KuaishouWorkAuthor
  coverUrl: string
  /**
   * 可直接下载的视频地址。优先级：
   * photoUrl（无水印 H264）→ mainMvUrls → manifest 最高质量 → videoH265Url。
   * 不使用 croppedPhotoUrl，避免悄悄下到裁剪/带水印地址。
   */
  videoUrl: string
  /** photoH265Url，缺失时用 manifestH265 里最高质量的地址 */
  videoH265Url: string
  /**
   * H264 manifest 里最高质量的播放地址（跳过 hidden，优先 mp4 而非 m3u8）。
   * 与 photoUrl 是否存在无关。H264 清单没有可用地址时才回退到 manifestH265。
   */
  bestManifestUrl: string
  /** 图集地址，顺序与 atlas.list 一致 */
  imageUrls: string[]
  tags: KuaishouWorkTag[]
  /** normalizeWork 的原始入参 */
  raw: unknown
}

/** save_to_xlsx 的列序。单元格含义见 exportWorksToCsv */
export const KUAISHOU_EXPORT_HEADERS = [
  '作品id',
  '作品url',
  '作品类型',
  '作品标题',
  '描述',
  '时长',
  '播放数量',
  '点赞数量',
  '评论数量',
  '收藏数量',
  '分享数量',
  '视频地址url',
  '图片地址url列表',
  '上传时间',
  '视频封面url',
  '用户主页url',
  '用户id',
  '昵称',
  '头像url',
] as const

const PROFILE_URL = 'https://www.kuaishou.com/profile/'
const WORK_URL = 'https://www.kuaishou.com/short-video/'

/**
 * 把计数字段收成整数。
 *
 * 支持 74万 / 1.2万 / 10万+ / 3w / 3亿 / 12.3k / 1,234 / 12345。
 * 单位换算后四舍五入（避免 1.2 * 10000 的二进制误差）；纯数字截断，与 Python int() 一致。
 * bool 不当成 0/1。解析失败返回 fallback，不抛错。
 */
export function parseCount(value: unknown, fallback = 0): number {
  if (typeof value === 'boolean' || value == null) return fallback
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback
    return Math.trunc(value)
  }
  let text = String(value).trim().replace(/,/g, '')
  if (!text) return fallback
  text = text.replace(/\s*[+＋]\s*$/u, '')
  const units: ReadonlyArray<readonly [string, number]> = [
    ['万', 10_000],
    ['亿', 100_000_000],
    ['w', 10_000],
    ['W', 10_000],
    ['k', 1_000],
    ['K', 1_000],
  ]
  for (const [suffix, mul] of units) {
    if (!text.endsWith(suffix)) continue
    const head = text.slice(0, -suffix.length).trim()
    if (!head) return fallback
    const n = Number(head)
    if (!Number.isFinite(n)) return fallback
    return Math.round(n * mul)
  }
  const n = Number(text)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return String(value)
  return ''
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean' || value == null) return 0
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim().replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

function firstDefined(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (!Object.hasOwn(obj, key)) continue
    const value = obj[key]
    if (value == null || value === '') continue
    return value
  }
  return undefined
}

function ensureHttp(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  return trimmed
}

function urlFrom(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = urlFrom(item)
      if (url) return url
    }
    return ''
  }
  if (isRecord(value)) {
    if (isRecord(value.url)) return urlFrom(value.url)
    return (asString(value.url) || asString(value.src)).trim()
  }
  return ''
}

function pickUrl(obj: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    if (!Object.hasOwn(obj, key)) continue
    const url = ensureHttp(urlFrom(obj[key]))
    if (url) return url
  }
  return ''
}

function countFrom(
  photo: Record<string, unknown>,
  root: Record<string, unknown>,
  keys: readonly string[]
): number {
  const direct = firstDefined(photo, keys)
  if (direct !== undefined) return parseCount(direct)
  if (root !== photo) {
    const fallback = firstDefined(root, keys)
    if (fallback !== undefined) return parseCount(fallback)
  }
  return 0
}

/**
 * photo 上没有 commentCount 时，REST feed/hot 把评论数放在顶层 comment.us_c。
 * 显式 0 不会再去翻 comment 节点（与 Python _first 一致）。
 */
function extractCommentCount(
  photo: Record<string, unknown>,
  root: Record<string, unknown>
): number {
  const direct = firstDefined(photo, ['commentCount', 'comment_count'])
  if (direct !== undefined) return parseCount(direct)
  const comment = isRecord(root.comment)
    ? root.comment
    : isRecord(photo.comment)
      ? photo.comment
      : undefined
  if (comment) {
    const nested = firstDefined(comment, ['us_c', 'commentCount', 'count'])
    if (nested !== undefined) return parseCount(nested)
  }
  return 0
}

function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const ms = timestamp < 1e11 ? timestamp * 1000 : timestamp
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return String(timestamp)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

function childRecord(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  return isRecord(obj[key]) ? obj[key] : undefined
}

function cdnHost(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const host = cdnHost(item)
      if (host) return host
    }
    return ''
  }
  if (isRecord(value)) {
    return (asString(value.cdn) || asString(value.host) || asString(value.url)).trim()
  }
  return ''
}

function joinCdn(cdn: string, resource: string): string {
  const resourcePath = resource.trim()
  if (!resourcePath) return ''
  if (/^https?:\/\//i.test(resourcePath) || resourcePath.startsWith('//')) return resourcePath
  const host = cdn.trim()
  if (!host) return resourcePath
  if (/^https?:\/\//i.test(host) || host.startsWith('//')) {
    const base = host.startsWith('//') ? `https:${host}` : host
    return `${base.replace(/\/+$/, '')}/${resourcePath.replace(/^\/+/, '')}`
  }
  const suffix = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`
  return `https://${host.replace(/\/+$/, '')}${suffix}`
}

function atlasEntryUrl(item: unknown, cdn: string): string {
  if (typeof item === 'string') return ensureHttp(joinCdn(cdn, item))
  if (!isRecord(item)) return ''
  const resource = asString(item.url) || asString(item.path) || asString(item.src)
  if (!resource) return ''
  const itemCdn = cdnHost(item.cdn) || cdn
  return ensureHttp(joinCdn(itemCdn, resource))
}

function urlsFromAtlas(atlas: unknown): string[] {
  if (!isRecord(atlas)) return []
  const cdn = cdnHost(atlas.cdn ?? atlas.cdnList)
  const list = atlas.list ?? atlas.paths ?? atlas.images
  if (!Array.isArray(list)) return []
  const urls: string[] = []
  for (const item of list) {
    const url = atlasEntryUrl(item, cdn)
    if (url) urls.push(url)
  }
  return urls
}

function isSinglePicture(
  photo: Record<string, unknown>,
  ext: Record<string, unknown> | undefined,
  extCamel: Record<string, unknown> | undefined
): boolean {
  return (
    photo.singlePicture === true ||
    photo.single === true ||
    ext?.single === true ||
    extCamel?.single === true
  )
}

function collectImageUrls(photo: Record<string, unknown>, root: Record<string, unknown>): string[] {
  const photoExt = childRecord(photo, 'ext_params')
  const photoExtCamel = childRecord(photo, 'extParams')
  const rootExt = root !== photo ? childRecord(root, 'ext_params') : undefined
  const rootExtCamel = root !== photo ? childRecord(root, 'extParams') : undefined
  const pools = [
    photoExt?.atlas,
    photoExtCamel?.atlas,
    rootExt?.atlas,
    rootExtCamel?.atlas,
    photo.atlas,
    root !== photo ? root.atlas : undefined,
    photoExt?.single,
    photoExtCamel?.single,
    isRecord(photo.single) ? photo.single : undefined,
  ]
  for (const pool of pools) {
    const urls = urlsFromAtlas(pool)
    if (urls.length > 0) return urls
  }
  if (isSinglePicture(photo, photoExt, photoExtCamel)) {
    const cover = pickUrl(photo, ['coverUrl', 'coverUrls', 'cover_url'])
    if (cover) return [cover]
  }
  return []
}

function readTags(value: unknown): KuaishouWorkTag[] {
  if (!Array.isArray(value)) return []
  const tags: KuaishouWorkTag[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name) tags.push({ name })
      continue
    }
    if (!isRecord(item)) continue
    const name = asString(firstDefined(item, ['name', 'tagName', 'tag', 'content'])).trim()
    if (!name) continue
    const typeRaw = firstDefined(item, ['type', 'tagType'])
    if (typeRaw == null || typeRaw === '') {
      tags.push({ name })
    } else {
      tags.push({ name, type: asString(typeRaw) })
    }
  }
  return tags
}

interface ScoredRep {
  url: string
  score: number
  index: number
  defaultSelect: boolean
  hidden: boolean
}

function parseJsonMaybe(value: unknown): unknown {
  let current = value
  for (let i = 0; i < 2; i++) {
    if (typeof current !== 'string') return current
    const text = current.trim()
    if (!text || (text[0] !== '{' && text[0] !== '[')) return current
    try {
      current = JSON.parse(text) as unknown
    } catch {
      return value
    }
  }
  return current
}

function collectRepresentations(manifest: unknown): Record<string, unknown>[] {
  const parsed = parseJsonMaybe(manifest)
  if (Array.isArray(parsed)) {
    const reps: Record<string, unknown>[] = []
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) reps.push({ url: item.trim() })
      else if (isRecord(item)) reps.push(item)
    }
    return reps
  }
  if (!isRecord(parsed)) return []
  const reps: Record<string, unknown>[] = []
  const setsRaw = parsed.adaptationSet ?? parsed.adaptationSets
  const sets = Array.isArray(setsRaw) ? setsRaw : isRecord(setsRaw) ? [setsRaw] : []
  for (const set of sets) {
    if (!isRecord(set)) continue
    const raw = set.representation ?? set.representations
    if (Array.isArray(raw)) reps.push(...raw.filter(isRecord))
    else if (isRecord(raw)) reps.push(raw)
    else if (urlFrom(set.url)) reps.push(set)
  }
  if (reps.length === 0) {
    const raw = parsed.representation ?? parsed.representations
    if (Array.isArray(raw)) reps.push(...raw.filter(isRecord))
    else if (isRecord(raw)) reps.push(raw)
  }
  return reps
}

function repPlayableUrl(rep: Record<string, unknown>): string {
  const candidates: string[] = []
  const main = urlFrom(rep.url)
  if (main) candidates.push(main)
  const backup = rep.backupUrl ?? rep.backupUrls
  if (Array.isArray(backup)) {
    for (const item of backup) {
      const url = urlFrom(item)
      if (url) candidates.push(url)
    }
  } else {
    const url = urlFrom(backup)
    if (url) candidates.push(url)
  }
  const file = candidates.find(url => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url.split('#')[0] ?? url))
  return ensureHttp(file || candidates[0] || '')
}

function qualityRank(value: unknown): number {
  const text = asString(value).trim().toLowerCase()
  if (!text) return 0
  const matched = /(\d{3,4})\s*p/.exec(text)
  if (matched?.[1]) return Number(matched[1])
  if (text.includes('超清') || text === 'high') return 1080
  if (text.includes('高清')) return 720
  if (text.includes('标清') || text === 'standard') return 480
  if (text.includes('流畅') || text === 'low') return 360
  return 0
}

function isHidden(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

function scoreRepresentation(rep: Record<string, unknown>, index: number): ScoredRep | null {
  const url = repPlayableUrl(rep)
  if (!url) return null
  const bitrate = asNumber(rep.maxBitrate) || asNumber(rep.avgBitrate)
  const pixels = asNumber(rep.width) * asNumber(rep.height)
  const quality = qualityRank(rep.qualityType) || qualityRank(rep.qualityLabel)
  return {
    url,
    score: bitrate * 1_000_000 + pixels + quality,
    index,
    defaultSelect: rep.defaultSelect === true || rep.defaultSelect === 1,
    hidden: isHidden(rep.hidden),
  }
}

function pickBest(reps: readonly ScoredRep[]): ScoredRep | null {
  const visible = reps.filter(rep => !rep.hidden)
  const pool = visible.length > 0 ? visible : reps
  if (pool.length === 0) return null
  return pool.reduce((best, cur) => {
    if (cur.score !== best.score) return cur.score > best.score ? cur : best
    if (cur.defaultSelect !== best.defaultSelect) return cur.defaultSelect ? cur : best
    return cur.index < best.index ? cur : best
  })
}

/** manifest / manifestH265 里最高质量的可播放地址；没有则空串 */
export function bestManifestUrl(manifest: unknown): string {
  const scored: ScoredRep[] = []
  collectRepresentations(manifest).forEach((rep, index) => {
    const scoredRep = scoreRepresentation(rep, index)
    if (scoredRep) scored.push(scoredRep)
  })
  return pickBest(scored)?.url ?? ''
}

function looksLikePhoto(node: Record<string, unknown>): boolean {
  const keys = [
    'photoUrl',
    'photoH265Url',
    'photoId',
    'photo_id',
    'caption',
    'manifest',
    'manifestH265',
    'ext_params',
    'extParams',
    'atlas',
    'coverUrl',
    'mainMvUrls',
  ]
  return keys.some(key => Object.hasOwn(node, key))
}

function unwrapFeed(input: unknown): {
  root: Record<string, unknown>
  photo: Record<string, unknown>
} {
  let node: unknown = input
  if (isRecord(node) && isRecord(node.data)) {
    const data = node.data
    if (isRecord(data.visionVideoDetail)) node = data.visionVideoDetail
    else if (isRecord(data.visionPhotoDetail)) node = data.visionPhotoDetail
  }
  if (isRecord(node)) {
    if (isRecord(node.visionVideoDetail)) node = node.visionVideoDetail
    else if (isRecord(node.visionPhotoDetail)) node = node.visionPhotoDetail
  }
  if (!isRecord(node)) return { root: {}, photo: {} }
  if (isRecord(node.photo)) return { root: node, photo: node.photo }
  if (looksLikePhoto(node)) return { root: node, photo: node }
  return { root: node, photo: {} }
}

function isNormalizedWork(value: unknown): value is KuaishouWork {
  if (!isRecord(value)) return false
  if (isRecord(value.photo)) return false
  if (value.workType !== 'video' && value.workType !== 'image') return false
  if (typeof value.workId !== 'string' || typeof value.videoUrl !== 'string') return false
  if (!isRecord(value.author) || typeof value.author.userId !== 'string') return false
  return Array.isArray(value.imageUrls)
}

function extractAuthor(
  root: Record<string, unknown>,
  photo: Record<string, unknown>
): Record<string, unknown> {
  if (isRecord(root.author)) return root.author
  if (isRecord(photo.author)) return photo.author
  if (isRecord(root.user)) return root.user
  if (isRecord(photo.user)) return photo.user
  if (isRecord(photo.userInfo)) return photo.userInfo
  return {}
}

function emptyWork(raw: unknown): KuaishouWork {
  return {
    workId: '',
    workUrl: WORK_URL,
    workType: 'video',
    title: '',
    caption: '',
    desc: '',
    duration: 0,
    createTime: '',
    createTimestamp: 0,
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    shareCount: 0,
    collectCount: 0,
    author: { userId: '', nickname: '', avatar: '', profileUrl: PROFILE_URL },
    coverUrl: '',
    videoUrl: '',
    videoH265Url: '',
    bestManifestUrl: '',
    imageUrls: [],
    tags: [],
    raw,
  }
}

/**
 * 归一化一条作品。
 *
 * 接受 REST feed `{ photo, author, comment?, tags? }`、GraphQL visionVideoDetail
 * （含 `{ data: { visionVideoDetail } }` 外壳）、以及已经是 photo 的对象。
 * 已经归一化过的 KuaishouWork 原样返回。无法识别时返回空作品，不抛错。
 */
export function normalizeWork(feedOrPhoto: unknown): KuaishouWork {
  if (isNormalizedWork(feedOrPhoto)) return feedOrPhoto
  const { root, photo } = unwrapFeed(feedOrPhoto)
  if (Object.keys(photo).length === 0 && Object.keys(root).length === 0) {
    return emptyWork(feedOrPhoto)
  }

  const author = extractAuthor(root, photo)
  const workId = asString(firstDefined(photo, ['id', 'photoId', 'photo_id']) ?? '')
  const caption = asString(firstDefined(photo, ['caption', 'title', 'originCaption']) ?? '')
  const userId = asString(
    firstDefined(author, ['id', 'authorId', 'user_id', 'userId', 'kwaiId']) ?? ''
  )
  const nickname = asString(
    firstDefined(author, ['name', 'user_name', 'nickname', 'userName']) ?? ''
  )
  const createTimestamp = asNumber(
    firstDefined(photo, ['timestamp', 'create_time', 'createTime']) ?? 0
  )
  const imageUrls = collectImageUrls(photo, root)
  const photoExt = childRecord(photo, 'ext_params')
  const photoExtCamel = childRecord(photo, 'extParams')
  const workType: KuaishouWorkType =
    imageUrls.length > 0 || isSinglePicture(photo, photoExt, photoExtCamel) ? 'image' : 'video'

  const h264Manifest = bestManifestUrl(photo.manifest)
  const h265Manifest = bestManifestUrl(photo.manifestH265 ?? photo.manifest_h265)
  const h265Direct = pickUrl(photo, ['photoH265Url', 'photo_h265_url'])
  const videoH265Url = h265Direct || h265Manifest
  const directVideo = pickUrl(photo, ['photoUrl', 'photo_url', 'mainMvUrls', 'main_mv_urls'])
  const manifestBest = h264Manifest || h265Manifest

  const tags = readTags(root.tags)
  if (photo !== root) tags.push(...readTags(photo.tags))

  return {
    workId,
    workUrl: `${WORK_URL}${workId}`,
    workType,
    title: caption,
    caption,
    desc: caption,
    duration: asNumber(firstDefined(photo, ['duration', 'durationMs']) ?? 0),
    createTime: formatTimestamp(createTimestamp),
    createTimestamp,
    likeCount: countFrom(photo, root, ['likeCount', 'realLikeCount', 'like_count']),
    commentCount: extractCommentCount(photo, root),
    viewCount: countFrom(photo, root, ['viewCount', 'view_count']),
    shareCount: countFrom(photo, root, [
      'shareCount',
      'share_count',
      'forwardCount',
      'forward_count',
    ]),
    collectCount: countFrom(photo, root, ['collectCount', 'collect_count', 'collectionCount']),
    author: {
      userId,
      nickname,
      avatar: pickUrl(author, ['headerUrl', 'headurl', 'avatar', 'headerUrls', 'headurls']),
      profileUrl: `${PROFILE_URL}${userId}`,
    },
    coverUrl: pickUrl(photo, ['coverUrl', 'coverUrls', 'cover_url']),
    videoUrl: directVideo || h264Manifest || videoH265Url,
    videoH265Url,
    bestManifestUrl: manifestBest,
    imageUrls,
    tags,
    raw: feedOrPhoto,
  }
}

/**
 * 归一化一组作品。
 * 数组、`{ feeds }`、以及 `{ data: { visionProfilePhotoList: { feeds } } }` 这类外壳都会展开。
 * 其它对象当成单条作品。null / undefined 得到空数组。
 */
export function normalizeWorks(list: unknown): KuaishouWork[] {
  if (list == null) return []
  if (Array.isArray(list)) return list.map(item => normalizeWork(item))
  if (isRecord(list)) {
    if (Array.isArray(list.feeds)) return list.feeds.map(item => normalizeWork(item))
    if (isRecord(list.data)) {
      for (const key of Object.keys(list.data)) {
        const node = list.data[key]
        if (isRecord(node) && Array.isArray(node.feeds)) {
          return node.feeds.map(item => normalizeWork(item))
        }
      }
    }
  }
  return [normalizeWork(list)]
}

function workTypeLabel(workType: KuaishouWorkType): string {
  return workType === 'image' ? '图文' : '视频'
}

/**
 * save_work_detail 的文本。
 * 与 Python 一致：没有「收藏数量」这一行；上传时间是格式化后的 createTime。
 */
export function formatWorkDetail(work: KuaishouWork): string {
  const lines = [
    `作品id: ${work.workId}`,
    `作品url: ${work.workUrl}`,
    `作品类型: ${workTypeLabel(work.workType)}`,
    `作品标题: ${work.title}`,
    `描述: ${work.desc}`,
    `时长: ${work.duration}`,
    `播放数量: ${work.viewCount}`,
    `点赞数量: ${work.likeCount}`,
    `评论数量: ${work.commentCount}`,
    `分享数量: ${work.shareCount}`,
    `视频地址url: ${work.videoUrl}`,
    `图片地址url列表: ${work.imageUrls.join(', ')}`,
    `上传时间: ${work.createTime}`,
    `视频封面url: ${work.coverUrl}`,
    `用户主页url: ${work.author.profileUrl}`,
    `用户id: ${work.author.userId}`,
    `昵称: ${work.author.nickname}`,
    `头像url: ${work.author.avatar}`,
  ]
  return `${lines.join('\n')}\n`
}

function normText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) continue
    out += ch
  }
  return out
}

function csvEscape(value: string): string {
  const clean = normText(value)
  if (/[",\r\n]/.test(clean)) return `"${clean.replace(/"/g, '""')}"`
  return clean
}

function exportCells(work: KuaishouWork): string[] {
  return [
    work.workId,
    work.workUrl,
    workTypeLabel(work.workType),
    work.title,
    work.desc,
    String(work.duration),
    String(work.viewCount),
    String(work.likeCount),
    String(work.commentCount),
    String(work.collectCount),
    String(work.shareCount),
    work.videoUrl,
    work.imageUrls.join(', '),
    String(work.createTimestamp),
    work.coverUrl,
    work.author.profileUrl,
    work.author.userId,
    work.author.nickname,
    work.author.avatar,
  ]
}

function assertExportArgs(works: KuaishouWork[], filePath: string): void {
  if (!Array.isArray(works)) throw new TypeError('works 必须是数组')
  if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('filePath 不能为空')
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
}

/**
 * 写出 UTF-8 BOM 的 CSV，Excel 才能正确打开中文。
 * 列名与 save_to_xlsx 一致。作品类型写成「视频 / 图文」。
 * 「上传时间」列是原始时间戳（对齐 xlsx 里的 create_time），不是格式化字符串。
 * 图片列表用 `, ` 拼接，而不是 Python 的 list repr。
 */
export function exportWorksToCsv(works: KuaishouWork[], filePath: string): void {
  assertExportArgs(works, filePath)
  const lines = [
    KUAISHOU_EXPORT_HEADERS.join(','),
    ...works.map(work => exportCells(work).map(csvEscape).join(',')),
  ]
  ensureParent(filePath)
  fs.writeFileSync(filePath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8')
}

/**
 * 把归一化作品写成 JSON 数组（UTF-8，保留中文，含 raw）。
 * 依赖里没有 xlsx 库，所以用 CSV + JSON 代替 save_to_xlsx。
 */
export function exportWorksToJson(works: KuaishouWork[], filePath: string): void {
  assertExportArgs(works, filePath)
  ensureParent(filePath)
  fs.writeFileSync(filePath, `${JSON.stringify(works, null, 2)}\n`, 'utf8')
}
