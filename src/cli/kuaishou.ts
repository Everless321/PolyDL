/**
 * 快手 CLI：Cookie 解析、平台分发，以及 download / user / ks 的可测试入口。
 *
 * 抖音命令仍留在 index.ts。这里不调用 process.exit，失败一律抛错，由命令行捕获后打印。
 */
import * as fs from 'fs'
import * as path from 'path'
import consola from 'consola'

import { findPlatform } from '../registry.js'
import { KuaishouDownloader } from '../platforms/kuaishou/downloader.js'
import type {
  KuaishouDownloaderConfig,
  KuaishouDownloadResult,
} from '../platforms/kuaishou/downloader.js'
import { KuaishouLoginError, KuaishouRiskError } from '../platforms/kuaishou/errors.js'
import { KuaishouHandler } from '../platforms/kuaishou/handler.js'
import {
  KuaishouLiveClient,
  KuaishouLiveDanmaku,
  createLiveSigner,
} from '../platforms/kuaishou/live/index.js'
import type { LiveDanmakuStats } from '../platforms/kuaishou/live/index.js'
import {
  extractPhotoId,
  getLiveUserId,
  parseKuaishouTarget,
} from '../platforms/kuaishou/url-parser.js'
import { exportWorksToCsv, exportWorksToJson } from '../platforms/kuaishou/work.js'
import type { KuaishouWork } from '../platforms/kuaishou/work.js'

export const KS_COOKIES_ENV = 'KS_COOKIES'

export const KUAISHOU_COOKIE_HINT = [
  '快手需要完整的网页 Cookie（含 kwfv1 与 kuaishou.server.web*_st）。',
  '请用 -c/--cookie 传入，或设置环境变量 KS_COOKIES。',
  '在浏览器登录 https://www.kuaishou.com 后，从任意请求的请求头复制整段 Cookie。',
].join('')

export class KuaishouCookieError extends Error {
  constructor(message = KUAISHOU_COOKIE_HINT) {
    super(message)
    this.name = 'KuaishouCookieError'
  }
}

export type CliPlatform = 'douyin' | 'kuaishou'
export type KuaishouMediaChoice = 'all' | 'video' | 'image'
export type KuaishouExportFormat = 'csv' | 'json'
export type LiveDanmakuKind = 'comment' | 'gift' | 'like'

export interface CliLog {
  start(message: string): void
  info(message: string): void
  success(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface KuaishouWorkSource {
  fetchWork(urlOrId: string): Promise<KuaishouWork>
  fetchUserWorks(
    userIdOrUrl: string,
    options?: { maxCounts?: number }
  ): AsyncIterable<KuaishouWork[]>
  searchWorks(keyword: string, options?: { maxCounts?: number }): AsyncIterable<KuaishouWork[]>
  fetchFeedHot(options?: { maxCounts?: number }): AsyncIterable<KuaishouWork[]>
  fetchComments(photoIdOrUrl: string, options?: { maxCounts?: number }): AsyncIterable<unknown[]>
}

export interface KuaishouCliDownloader {
  downloadWork(work: KuaishouWork, dir?: string): Promise<KuaishouDownloadResult[]>
}

export interface KuaishouCliDeps {
  createHandler?: (cookie: string) => KuaishouWorkSource
  createDownloader?: (config: KuaishouDownloaderConfig) => KuaishouCliDownloader
  log?: CliLog
  env?: NodeJS.ProcessEnv
  writeStdout?: (text: string) => void
}

export interface KuaishouSingleOptions {
  output?: string
  cookie?: string
  cover?: boolean
  desc?: boolean
  media?: string
  exportAs?: string
}

export interface KuaishouListOptions extends KuaishouSingleOptions {
  /** 0 表示不限制。命令行缺省由调用方决定 */
  number?: string
  /** false 对应 --no-download */
  download?: boolean
  exportStem: string
  taskLabel: string
}

export interface LiveSession {
  token: string
  riskControlled: boolean
  on(event: string, handler: (message: { payload?: unknown }) => void): void
  run(options?: { duration?: number }): Promise<LiveDanmakuStats>
  stop(): void
}

export interface KuaishouLiveDeps extends KuaishouCliDeps {
  createSession?: (args: { eid: string; cookie: string }) => LiveSession | Promise<LiveSession>
  onSession?: (session: LiveSession) => void
}

const consolaLog: CliLog = {
  start(message) {
    consola.start(message)
  },
  info(message) {
    consola.info(message)
  },
  success(message) {
    consola.success(message)
  },
  warn(message) {
    consola.warn(message)
  },
  error(message) {
    consola.error(message)
  },
}

/** -c 优先，空白则退回 KS_COOKIES。都没有时返回空串。 */
export function resolveKuaishouCookie(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fromFlag = explicit?.trim()
  if (fromFlag) return fromFlag
  return env[KS_COOKIES_ENV]?.trim() ?? ''
}

export function requireKuaishouCookie(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const cookie = resolveKuaishouCookie(explicit, env)
  if (!cookie) throw new KuaishouCookieError()
  return cookie
}

/**
 * download / user 的平台选择。
 * 未识别的链接继续走抖音，和改造前「一律按抖音解析」一致。
 * 已注册但不是抖音/快手的平台会抛错，避免误丢进抖音。
 */
export function resolveCliPlatform(url: string): CliPlatform {
  const platform = findPlatform(url)
  if (platform?.id === 'kuaishou') return 'kuaishou'
  if (platform && platform.id !== 'douyin') {
    throw new Error(`链接属于尚未接入命令行的平台: ${platform.name}`)
  }
  return 'douyin'
}

export function parseKuaishouMedia(value: string | undefined): KuaishouMediaChoice {
  if (value == null || value.trim() === '' || value === 'all') return 'all'
  if (value === 'video' || value === 'image') return value
  throw new Error(`--media 只支持 all、video、image，收到: ${value}`)
}

export function parseKuaishouExport(value: string | undefined): KuaishouExportFormat | undefined {
  if (value == null || value.trim() === '') return undefined
  if (value === 'csv' || value === 'json') return value
  throw new Error(`--export 只支持 csv 或 json，收到: ${value}`)
}

/** 非法或负数退回 fallback。0 是合法值，表示不限制条数。 */
export function parseCliCount(value: string | undefined, fallback = 0): number {
  if (value == null || value.trim() === '') return fallback
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export function parseDurationSeconds(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--duration 必须是正数秒，收到: ${value}`)
  }
  return n
}

export function douyinOnlyIgnoredMessage(options: {
  music?: boolean
  deviceOs?: string
  deviceSeed?: string
}): string | undefined {
  const names: string[] = []
  if (options.music) names.push('--music')
  if (options.deviceOs) names.push('--device-os')
  if (options.deviceSeed) names.push('--device-seed')
  if (names.length === 0) return undefined
  return `快手暂不支持这些抖音选项，已忽略: ${names.join('、')}`
}

export function kuaishouOnlyIgnoredMessage(options: {
  media?: string
  exportAs?: string
}): string | undefined {
  const names: string[] = []
  if (options.media) names.push('--media')
  if (options.exportAs) names.push('--export')
  if (names.length === 0) return undefined
  return `当前链接按抖音处理，已忽略快手选项: ${names.join('、')}`
}

export function isKuaishouCliError(error: unknown): boolean {
  return (
    error instanceof KuaishouCookieError ||
    error instanceof KuaishouLoginError ||
    error instanceof KuaishouRiskError
  )
}

export function formatKuaishouError(error: unknown): string {
  if (error instanceof KuaishouCookieError) return error.message
  if (error instanceof KuaishouLoginError) {
    return [
      '快手登录态无效或已过期（result=109 / No Login）。',
      '请重新登录 https://www.kuaishou.com ，复制完整网页 Cookie',
      '（含 kwfv1 与 kuaishou.server.web*_st），用 -c 或环境变量 KS_COOKIES 传入。',
    ].join('')
  }
  if (error instanceof KuaishouRiskError) {
    return [
      '快手触发风控（result=400002），本工具不会求解滑块验证码。',
      '请稍后重试，或在浏览器里完成验证后更新 Cookie。',
      `验证页: ${error.captchaUrl}`,
    ].join('')
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export function kuaishouExportPath(
  outputDir: string,
  stem: string,
  format: KuaishouExportFormat
): string {
  return path.join(path.resolve(outputDir), `${stem}.${format}`)
}

export function commentsOutputPath(output: string): string {
  const trimmed = output.trim()
  const resolved = path.resolve(trimmed)
  if (trimmed.toLowerCase().endsWith('.json')) return resolved
  return path.join(resolved, 'comments.json')
}

/** 直播间链接或裸 eid。作品链接和短链给出明确错误，不发请求。 */
export function resolveLiveEid(input: string): string {
  const text = input.trim()
  if (!text) throw new Error('请提供直播间链接或 eid')
  const parsed = parseKuaishouTarget(text)
  if (parsed.kind === 'photo') {
    throw new Error('这是作品链接，不是直播间。请传 live.kuaishou.com/u/<eid> 或 eid')
  }
  if (parsed.kind === 'short') {
    throw new Error('直播弹幕请使用 live.kuaishou.com/u/<eid> 或直接传 eid，短链不会在本地展开')
  }
  const fromLive = getLiveUserId(text)
  if (fromLive) return fromLive
  if (parsed.kind === 'live-user' || parsed.kind === 'profile' || parsed.kind === 'id') {
    return parsed.id
  }
  const id = extractPhotoId(text)
  if (!id) throw new Error(`无法从输入解析直播间 eid: ${input}`)
  return id
}

export function formatLiveDanmakuLine(
  kind: LiveDanmakuKind,
  message: { payload?: unknown }
): string {
  const payload = asRecord(message.payload) ?? {}
  const name = userNameOf(payload)
  if (kind === 'comment') return `💬 ${name}: ${scalar(payload.content)}`
  if (kind === 'like') return `👍 ${name} 点赞`
  const giftId = scalar(payload.giftId) || '?'
  const combo = scalar(payload.comboCount) || '1'
  return `🎁 ${name} 送出礼物 ${giftId} x${combo}`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return String(value)
  return ''
}

function userNameOf(payload: Record<string, unknown>): string {
  const user = asRecord(payload.user)
  const name = scalar(user?.userName)
  return name || '未知用户'
}

function outputDirectory(output: string | undefined): string {
  return path.resolve(output?.trim() || './downloads')
}

function resolvedDeps(
  deps: KuaishouCliDeps | undefined
): Required<
  Pick<KuaishouCliDeps, 'createHandler' | 'createDownloader' | 'log' | 'env' | 'writeStdout'>
> {
  return {
    createHandler: deps?.createHandler ?? (cookie => new KuaishouHandler({ cookie })),
    createDownloader: deps?.createDownloader ?? (config => new KuaishouDownloader(config)),
    log: deps?.log ?? consolaLog,
    env: deps?.env ?? process.env,
    writeStdout: deps?.writeStdout ?? (text => process.stdout.write(text)),
  }
}

function cookieOf(options: { cookie?: string }, env: NodeJS.ProcessEnv): string {
  return requireKuaishouCookie(options.cookie, env)
}

function downloaderConfig(
  cookie: string,
  options: KuaishouSingleOptions
): KuaishouDownloaderConfig {
  return {
    cookie,
    downloadPath: outputDirectory(options.output),
    cover: options.cover === true,
    desc: options.desc === true,
    mediaType: parseKuaishouMedia(options.media),
    folderize: false,
    naming: '{nickname}_{work_id}',
  }
}

function writeWorkExport(
  works: KuaishouWork[],
  format: KuaishouExportFormat,
  filePath: string
): string {
  const resolved = path.resolve(filePath)
  if (format === 'csv') exportWorksToCsv(works, resolved)
  else exportWorksToJson(works, resolved)
  return resolved
}

function assertKuaishouWorkUrl(url: string): void {
  const text = url.trim()
  if (!text) throw new Error('请提供作品链接或 photoId')
  const parsed = parseKuaishouTarget(text)
  if (parsed.kind === 'profile') {
    throw new Error('这是用户主页链接。下载该用户的作品请改用: pdl user <url>')
  }
  if (parsed.kind === 'live-user') {
    throw new Error(
      '这是直播间链接，不能当作作品下载。监听弹幕: pdl ks live <url>；下载该用户作品: pdl user <url>'
    )
  }
}

function assertKuaishouUserUrl(url: string): void {
  const text = url.trim()
  if (!text) throw new Error('请提供用户主页链接或 eid')
  const parsed = parseKuaishouTarget(text)
  if (parsed.kind === 'photo') {
    throw new Error('这是作品链接。下载单个作品请改用: pdl download <url>')
  }
}

function briefTitle(work: KuaishouWork): string {
  return (work.title || '').replace(/\s+/g, ' ').slice(0, 50)
}

async function downloadAll(
  works: KuaishouWork[],
  downloader: KuaishouCliDownloader,
  dir: string,
  log: CliLog
): Promise<void> {
  let failed = 0
  let index = 0
  for (const work of works) {
    index += 1
    log.info(`[${index}] ${work.author?.nickname || '未知'} ${work.workId} ${briefTitle(work)}`)
    const results = await downloader.downloadWork(work, dir)
    if (results.length === 0) {
      log.info(`${work.workId} 没有匹配 --media 的媒体文件`)
      continue
    }
    for (const result of results) {
      if (result.success) continue
      failed += 1
      log.warn(`${work.workId} ${result.kind} 失败: ${result.error || '未知错误'}`)
    }
  }
  if (failed > 0) throw new Error(`${failed} 个文件下载失败`)
}

async function collectWorks(
  pages: AsyncIterable<KuaishouWork[]>,
  log: CliLog
): Promise<KuaishouWork[]> {
  const works: KuaishouWork[] = []
  for await (const page of pages) {
    works.push(...page)
    log.info(`已获取 ${works.length} 条`)
  }
  return works
}

export async function runKuaishouDownload(
  url: string,
  options: KuaishouSingleOptions,
  deps?: KuaishouCliDeps
): Promise<KuaishouWork> {
  assertKuaishouWorkUrl(url)
  const { createHandler, createDownloader, log, env } = resolvedDeps(deps)
  const media = parseKuaishouMedia(options.media)
  const exportAs = parseKuaishouExport(options.exportAs)
  const cookie = cookieOf(options, env)
  const handler = createHandler(cookie)
  log.start('获取作品详情...')
  const work = await handler.fetchWork(url.trim())
  log.info(`作者: ${work.author?.nickname || '未知'}`)
  log.info(`描述: ${briefTitle(work)}`)
  const dir = outputDirectory(options.output)
  if (exportAs) {
    const file = writeWorkExport(
      [work],
      exportAs,
      kuaishouExportPath(dir, 'kuaishou-works', exportAs)
    )
    log.info(`作品列表已写入 ${file}`)
  }
  log.start('开始下载...')
  await downloadAll(
    [work],
    createDownloader(downloaderConfig(cookie, { ...options, media })),
    dir,
    log
  )
  log.success('下载完成!')
  return work
}

export async function runKuaishouWorkList(
  options: KuaishouListOptions,
  iterate: (handler: KuaishouWorkSource, maxCounts: number) => AsyncIterable<KuaishouWork[]>,
  deps?: KuaishouCliDeps
): Promise<KuaishouWork[]> {
  const { createHandler, createDownloader, log, env } = resolvedDeps(deps)
  const media = parseKuaishouMedia(options.media)
  const exportAs = parseKuaishouExport(options.exportAs)
  const maxCounts = parseCliCount(options.number, 0)
  const cookie = cookieOf(options, env)
  const shouldDownload = options.download !== false
  const handler = createHandler(cookie)
  log.start(`获取${options.taskLabel}...`)
  const works = await collectWorks(iterate(handler, maxCounts), log)
  const dir = outputDirectory(options.output)
  if (exportAs) {
    const file = writeWorkExport(
      works,
      exportAs,
      kuaishouExportPath(dir, options.exportStem, exportAs)
    )
    log.info(`作品列表已写入 ${file}`)
  }
  if (!shouldDownload) {
    if (!exportAs) {
      for (const work of works) {
        log.info(`${work.workId}  ${briefTitle(work)}`)
      }
      log.success(`共 ${works.length} 条（未下载；加上 --export csv|json 可写出列表）`)
    } else {
      log.success(`已导出 ${works.length} 条`)
    }
    return works
  }
  if (works.length === 0) {
    log.success(`下载完成! 共 0 个作品`)
    return works
  }
  log.start('开始下载...')
  await downloadAll(
    works,
    createDownloader(downloaderConfig(cookie, { ...options, media })),
    dir,
    log
  )
  log.success(`下载完成! 共 ${works.length} 个作品`)
  return works
}

export async function runKuaishouUser(
  url: string,
  options: Omit<KuaishouListOptions, 'exportStem' | 'taskLabel' | 'download'>,
  deps?: KuaishouCliDeps
): Promise<KuaishouWork[]> {
  assertKuaishouUserUrl(url)
  return runKuaishouWorkList(
    { ...options, exportStem: 'kuaishou-works', taskLabel: '用户作品', download: true },
    (handler, maxCounts) => handler.fetchUserWorks(url.trim(), { maxCounts }),
    deps
  )
}

export async function runKuaishouSearch(
  keyword: string,
  options: Omit<KuaishouListOptions, 'exportStem' | 'taskLabel'>,
  deps?: KuaishouCliDeps
): Promise<KuaishouWork[]> {
  const text = keyword.trim()
  if (!text) throw new Error('请提供搜索关键词')
  return runKuaishouWorkList(
    { ...options, exportStem: 'kuaishou-search', taskLabel: `搜索「${text}」` },
    (handler, maxCounts) => handler.searchWorks(text, { maxCounts }),
    deps
  )
}

export async function runKuaishouHot(
  options: Omit<KuaishouListOptions, 'exportStem' | 'taskLabel'>,
  deps?: KuaishouCliDeps
): Promise<KuaishouWork[]> {
  return runKuaishouWorkList(
    { ...options, exportStem: 'kuaishou-hot', taskLabel: '推荐流' },
    (handler, maxCounts) => handler.fetchFeedHot({ maxCounts }),
    deps
  )
}

export async function runKuaishouComments(
  target: string,
  options: { number?: string; output?: string; cookie?: string },
  deps?: KuaishouCliDeps
): Promise<unknown[]> {
  const text = target.trim()
  if (!text) throw new Error('请提供作品链接或 photoId')
  const { createHandler, log, env, writeStdout } = resolvedDeps(deps)
  const cookie = cookieOf(options, env)
  const maxCounts = parseCliCount(options.number, 20)
  const handler = createHandler(cookie)
  log.start('获取评论...')
  const comments: unknown[] = []
  for await (const page of handler.fetchComments(text, { maxCounts })) {
    comments.push(...page)
    log.info(`已获取 ${comments.length} 条`)
  }
  const output = options.output?.trim()
  if (output) {
    const file = writeJsonFile(commentsOutputPath(output), comments)
    log.success(`评论已写入 ${file}（${comments.length} 条）`)
  } else {
    writeStdout(`${JSON.stringify(comments, null, 2)}\n`)
    log.success(`共 ${comments.length} 条评论`)
  }
  return comments
}

function writeJsonFile(filePath: string, data: unknown): string {
  const resolved = path.resolve(filePath)
  fs.mkdirSync(path.dirname(resolved), { recursive: true })
  fs.writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return resolved
}

function defaultLiveSession(args: { eid: string; cookie: string }): LiveSession {
  const client = new KuaishouLiveClient({
    cookie: args.cookie,
    signer: createLiveSigner(),
  })
  return new KuaishouLiveDanmaku({ eid: args.eid, client })
}

export async function runKuaishouLive(
  target: string,
  options: { cookie?: string; duration?: string },
  deps?: KuaishouLiveDeps
): Promise<LiveDanmakuStats> {
  const eid = resolveLiveEid(target)
  const duration = parseDurationSeconds(options.duration)
  const { log, env } = resolvedDeps(deps)
  const cookie = cookieOf(options, env)
  const createSession = deps?.createSession ?? defaultLiveSession
  log.start(`连接直播间 ${eid} ...`)
  const session = await createSession({ eid, cookie })
  deps?.onSession?.(session)
  session.on('comment', message => log.info(formatLiveDanmakuLine('comment', message)))
  session.on('gift', message => log.info(formatLiveDanmakuLine('gift', message)))
  session.on('like', message => log.info(formatLiveDanmakuLine('like', message)))
  log.info('开始接收弹幕（Ctrl+C 停止）')
  const stats = await session.run(duration == null ? undefined : { duration })
  if (!session.token) {
    const risk = session.riskControlled ? '本次请求被标记为风控。' : ''
    throw new Error(
      `未能连接直播弹幕，没有拿到 WebSocket token。${risk}请确认房间正在直播，且 Cookie 对 live.kuaishou.com 有效（完整网页 Cookie，含 kwfv1）。直播弹幕可能需要直播站 Cookie。`
    )
  }
  log.success(
    `弹幕结束：评论 ${stats.comments}，点赞 ${stats.likes}，礼物 ${stats.gifts}，帧 ${stats.frames}`
  )
  return stats
}
