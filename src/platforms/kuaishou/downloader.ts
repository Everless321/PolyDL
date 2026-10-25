/**
 * 快手作品下载。
 *
 * 媒体文件名固定为 video.<ext> / cover.<ext> / image_<i>.<ext>（i 从 0 开始，与
 * Python download_media 的 image_{index} 一致）。目录有两种：
 *
 * - folderize false（默认）：`{downloadPath}/{naming}/`，naming 默认 `{nickname}_{work_id}`
 * - folderize true：Python download_work 的两级目录
 *   `{nickname}_{userId}/{title}_{workId}/`，此时 naming 不参与路径
 *
 * 流式写入用全局 fetch，方便测试替换。已存在且非空的媒体文件会跳过；
 * detail.txt / info.json 每次覆盖，保证文案跟得上最新计数。
 * proxy 只留在配置上，不传给 fetch —— DouyinDownloader 同样没有把 proxy 接进传输层。
 */

import * as fs from 'fs'
import * as path from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import pLimit from 'p-limit'

import { formatWorkDetail } from './work.js'
import type { KuaishouWork } from './work.js'

export type KuaishouMediaType = 'all' | 'video' | 'image'

export interface KuaishouDownloadProgress {
  workId: string
  kind: 'video' | 'image' | 'cover'
  filePath: string
  downloaded: number
  total: number
  percentage: number
}

export type KuaishouDownloadProgressCallback = (progress: KuaishouDownloadProgress) => void

export interface KuaishouDownloaderConfig {
  downloadPath?: string
  /**
   * 作品目录名模板。支持 {nickname} {work_id} {title} {create_time} {user_id}。
   * 只在 folderize 为 false 时用来建目录。非法字符会被去掉。
   */
  naming?: string
  /**
   * true 时使用 `<nickname>_<userId>/<title>_<workId>/`，对齐 Python download_work。
   * 昵称最多 20 字，标题最多 40 字，空标题写成「无标题」。
   */
  folderize?: boolean
  /** 下载封面 cover.<ext>。图文和视频都会下，只要 coverUrl 有值且该作品类型在 mediaType 里 */
  cover?: boolean
  /** 写 detail.txt（save_work_detail）和 info.json（归一化结果，不含 raw） */
  desc?: boolean
  /** all 两种都下；video 只下视频作品；image 只下图文作品。对应 save_choice 的 media / media-video / media-image */
  mediaType?: KuaishouMediaType
  maxConcurrency?: number
  /** 每个文件的总尝试次数（含第一次），默认 3。失败后指数退避 */
  retries?: number
  /** 单次请求超时，毫秒。0 表示不设超时 */
  timeout?: number
  cookie?: string
  userAgent?: string
  headers?: Record<string, string>
  /**
   * 与 Douyin DownloadConfig 对齐的占位。当前 fetch 路径不会使用它。
   */
  proxy?: string
  onProgress?: KuaishouDownloadProgressCallback
}

export interface KuaishouDownloadResult {
  success: boolean
  filePath?: string
  url?: string
  kind: 'video' | 'image' | 'cover' | 'detail' | 'json'
  /** 图文序号，从 0 开始，对应 image_<i> */
  index?: number
  skipped?: boolean
  error?: string
}

const DEFAULT_NAMING = '{nickname}_{work_id}'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const KUAISHOU_REFERER = 'https://www.kuaishou.com/'
const NAMING_KEYS = new Set(['nickname', 'work_id', 'title', 'create_time', 'user_id'])
const RETRY_BASE_MS = 200

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.flv'])
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

interface ResolvedConfig {
  downloadPath: string
  naming: string
  folderize: boolean
  cover: boolean
  desc: boolean
  mediaType: KuaishouMediaType
  maxConcurrency: number
  retries: number
  timeout: number
  cookie?: string
  userAgent?: string
  headers?: Record<string, string>
  proxy?: string
  onProgress?: KuaishouDownloadProgressCallback
}

interface FileTask {
  workId: string
  url: string
  filePath: string
  kind: 'video' | 'image' | 'cover'
  index?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return '请求超时'
    return error.message || '下载失败'
  }
  return String(error)
}

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.floor(value)
}

/** 去掉路径非法字符和空白，对齐 Python norm_str 的删除策略，并避开 Windows 保留名 */
export function sanitizeFileName(input: string, maxLength = 80): string {
  let out = ''
  for (const ch of input) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) continue
    if ('\\/:*?"<>|'.includes(ch)) continue
    if (/\s/u.test(ch)) continue
    out += ch
  }
  out = [...out].slice(0, maxLength).join('').replace(/\.+$/g, '')
  if (RESERVED_NAME.test(out)) return `_${out}`
  return out
}

function assertNamingTemplate(template: string): void {
  const unknown: string[] = []
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const key = match[1]
    if (key && !NAMING_KEYS.has(key)) unknown.push(key)
  }
  if (unknown.length > 0) {
    throw new Error(`文件名模板字段 ${unknown.join(', ')} 不存在，请检查`)
  }
}

function formatNaming(template: string, work: KuaishouWork): string {
  const fields: Record<string, string> = {
    nickname: work.author?.nickname ?? '',
    work_id: work.workId ?? '',
    title: work.title ?? '',
    create_time: work.createTime ?? '',
    user_id: work.author?.userId ?? '',
  }
  const replaced = template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (!Object.hasOwn(fields, key)) {
      throw new Error(`文件名模板字段 ${key} 不存在，请检查`)
    }
    return fields[key] ?? ''
  })
  const safe = sanitizeFileName(replaced, 120)
  if (!safe || safe === '.' || safe === '..') return 'untitled'
  return safe
}

function resolveInside(base: string, ...parts: string[]): string {
  const root = path.resolve(base)
  const target = path.resolve(root, ...parts)
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('保存路径越界')
  }
  return target
}

function extFromUrl(url: string, kind: 'image' | 'video' | 'cover'): string {
  const fallback = kind === 'video' ? '.mp4' : '.jpg'
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (kind === 'video') return VIDEO_EXT.has(ext) ? ext : fallback
    if (IMAGE_EXT.has(ext)) return ext
    return fallback
  } catch {
    return fallback
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

async function nonEmpty(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

function headerNumber(value: string | null): number {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export class KuaishouDownloader {
  private readonly config: ResolvedConfig
  private readonly limit: ReturnType<typeof pLimit>

  constructor(config: KuaishouDownloaderConfig = {}) {
    const naming =
      typeof config.naming === 'string' && config.naming.trim() ? config.naming : DEFAULT_NAMING
    assertNamingTemplate(naming)
    const mediaType: KuaishouMediaType =
      config.mediaType === 'video' || config.mediaType === 'image' || config.mediaType === 'all'
        ? config.mediaType
        : 'all'
    this.config = {
      downloadPath: config.downloadPath?.trim() || './downloads',
      naming,
      folderize: config.folderize ?? false,
      cover: config.cover ?? true,
      desc: config.desc ?? true,
      mediaType,
      maxConcurrency: positiveInt(config.maxConcurrency, 3),
      retries: positiveInt(config.retries, 3),
      timeout:
        typeof config.timeout === 'number' && Number.isFinite(config.timeout)
          ? Math.max(0, config.timeout)
          : 30_000,
      cookie: config.cookie,
      userAgent: config.userAgent,
      headers: config.headers,
      proxy: config.proxy,
      onProgress: config.onProgress,
    }
    this.limit = pLimit(this.config.maxConcurrency)
  }

  /**
   * 下载一条作品。dir 覆盖 downloadPath，只作用于这一次调用。
   * 返回 detail / json / 媒体的结果，顺序与调度顺序一致。
   */
  async downloadWork(work: KuaishouWork, dir?: string): Promise<KuaishouDownloadResult[]> {
    const folder = this.workDirectory(work, dir)
    await fs.promises.mkdir(folder, { recursive: true })
    const results: KuaishouDownloadResult[] = []

    if (this.config.desc) {
      results.push(
        await this.writeText(path.join(folder, 'detail.txt'), formatWorkDetail(work), 'detail')
      )
      results.push(
        await this.writeText(
          path.join(folder, 'info.json'),
          `${JSON.stringify({ ...work, raw: undefined })}\n`,
          'json'
        )
      )
    }

    const tasks: Promise<KuaishouDownloadResult>[] = []
    if (work.workType === 'video' && this.wants('video')) {
      this.enqueueCover(work, folder, tasks)
      if (work.videoUrl) {
        tasks.push(
          this.enqueueFile({
            workId: work.workId,
            url: work.videoUrl,
            filePath: path.join(folder, `video${extFromUrl(work.videoUrl, 'video')}`),
            kind: 'video',
          })
        )
      } else {
        tasks.push(Promise.resolve({ success: false, kind: 'video', error: '缺少视频地址' }))
      }
    }
    if (work.workType === 'image' && this.wants('image')) {
      this.enqueueCover(work, folder, tasks)
      work.imageUrls.forEach((url, index) => {
        if (!url) return
        tasks.push(
          this.enqueueFile({
            workId: work.workId,
            url,
            filePath: path.join(folder, `image_${index}${extFromUrl(url, 'image')}`),
            kind: 'image',
            index,
          })
        )
      })
    }

    results.push(...(await Promise.all(tasks)))
    return results
  }

  /** 并发下载多条作品，并发度由 maxConcurrency 限制在单个文件上 */
  async downloadWorks(works: KuaishouWork[], dir?: string): Promise<KuaishouDownloadResult[]> {
    if (!Array.isArray(works) || works.length === 0) return []
    const groups = await Promise.all(works.map(work => this.downloadWork(work, dir)))
    return groups.flat()
  }

  private wants(kind: 'video' | 'image'): boolean {
    return this.config.mediaType === 'all' || this.config.mediaType === kind
  }

  private enqueueCover(
    work: KuaishouWork,
    folder: string,
    tasks: Promise<KuaishouDownloadResult>[]
  ): void {
    if (!this.config.cover || !work.coverUrl) return
    tasks.push(
      this.enqueueFile({
        workId: work.workId,
        url: work.coverUrl,
        filePath: path.join(folder, `cover${extFromUrl(work.coverUrl, 'cover')}`),
        kind: 'cover',
      })
    )
  }

  private workDirectory(work: KuaishouWork, dir?: string): string {
    const base = path.resolve(dir || this.config.downloadPath)
    if (this.config.folderize) {
      const nickname = sanitizeFileName(work.author?.nickname ?? '', 20)
      const userId = sanitizeFileName(work.author?.userId ?? '', 64)
      const title = sanitizeFileName(work.title ?? '', 40) || '无标题'
      const workId = sanitizeFileName(work.workId ?? '', 64) || 'unknown'
      return resolveInside(base, `${nickname}_${userId}`, `${title}_${workId}`)
    }
    return resolveInside(base, formatNaming(this.config.naming, work))
  }

  private enqueueFile(task: FileTask): Promise<KuaishouDownloadResult> {
    return this.limit(() => this.downloadFile(task))
  }

  private requestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': DEFAULT_USER_AGENT,
      ...this.config.headers,
    }
    if (this.config.userAgent) headers['User-Agent'] = this.config.userAgent
    if (this.config.cookie) headers.Cookie = this.config.cookie
    headers.Referer = KUAISHOU_REFERER
    return headers
  }

  private emitProgress(meta: FileTask, downloaded: number, total: number): void {
    if (!this.config.onProgress) return
    const percentage = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0
    try {
      this.config.onProgress({
        workId: meta.workId,
        kind: meta.kind,
        filePath: meta.filePath,
        downloaded,
        total,
        percentage,
      })
    } catch {
      // 进度回调不能打断下载
    }
  }

  private async writeBody(response: Response, tmpPath: string, meta: FileTask): Promise<void> {
    await fs.promises.mkdir(path.dirname(tmpPath), { recursive: true })
    const total = headerNumber(response.headers.get('content-length'))
    if (!response.body) {
      const buf = Buffer.from(await response.arrayBuffer())
      await fs.promises.writeFile(tmpPath, buf)
      this.emitProgress(meta, buf.length, total || buf.length)
      return
    }
    let downloaded = 0
    const counter = new Transform({
      transform: (chunk, _encoding, callback) => {
        const size = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
        downloaded += size
        this.emitProgress(meta, downloaded, total)
        callback(null, chunk)
      },
    })
    await pipeline(
      Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>),
      counter,
      fs.createWriteStream(tmpPath)
    )
  }

  private async downloadFile(task: FileTask): Promise<KuaishouDownloadResult> {
    const base: KuaishouDownloadResult = {
      success: false,
      filePath: task.filePath,
      url: task.url,
      kind: task.kind,
      ...(task.index !== undefined ? { index: task.index } : {}),
    }
    if (!isHttpUrl(task.url)) {
      return { ...base, error: '不支持的媒体地址' }
    }
    if (await nonEmpty(task.filePath)) {
      return { ...base, success: true, skipped: true }
    }

    let lastError = '下载失败'
    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      if (attempt > 0) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1))
      const tmp = `${task.filePath}.${process.pid}.${attempt}.tmp`
      const controller = new AbortController()
      const timer =
        this.config.timeout > 0
          ? setTimeout(() => controller.abort(), this.config.timeout)
          : undefined
      try {
        const response = await fetch(task.url, {
          headers: this.requestHeaders(),
          signal: controller.signal,
        })
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined)
          throw new Error(`HTTP ${response.status}`)
        }
        await this.writeBody(response, tmp, task)
        const stat = await fs.promises.stat(tmp)
        if (stat.size <= 0) throw new Error('下载内容为空')
        await fs.promises.rename(tmp, task.filePath)
        return { ...base, success: true, skipped: false }
      } catch (error) {
        lastError = errorMessage(error)
        await fs.promises.rm(tmp, { force: true }).catch(() => undefined)
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
    return { ...base, error: lastError }
  }

  /** 文案每次覆盖。媒体文件才跳过已存在的非空文件 */
  private async writeText(
    filePath: string,
    content: string,
    kind: 'detail' | 'json'
  ): Promise<KuaishouDownloadResult> {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      await fs.promises.writeFile(filePath, content, 'utf8')
      return { success: true, filePath, kind, skipped: false }
    } catch (error) {
      return { success: false, filePath, kind, error: errorMessage(error) }
    }
  }
}
