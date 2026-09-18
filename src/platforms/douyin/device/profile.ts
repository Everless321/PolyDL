/**
 * DeviceProfile - 浏览器设备指纹的单一事实来源
 *
 * UA、Client Hints、browser_* / os_* / screen_* 请求参数、A-Bogus 窗口指纹
 * 全部由同一份 profile 派生，保证一次会话内自洽且稳定。
 */
import { z } from 'zod'

/** 当前 Chrome 稳定版大版本号（核实于 2026-09-18，需随 Chrome 发版更新） */
export const LATEST_CHROME_MAJOR = 154

export const DeviceOSSchema = z.enum(['windows', 'mac'])
export const DeviceBrowserSchema = z.enum(['chrome', 'edge'])

export const DeviceProfileSchema = z.object({
  os: DeviceOSSchema,
  /** Windows 固定 "10"；Mac 形如 "10_15_7"（UA 里的写法） */
  osVersion: z.string(),
  browser: DeviceBrowserSchema,
  /** 完整四段，如 "154.0.0.0" */
  browserVersion: z.string(),
  screenWidth: z.number(),
  screenHeight: z.number(),
  cpuCores: z.number(),
  /** GB，navigator.deviceMemory 上限为 8 */
  deviceMemory: z.number(),
  language: z.string(),
  timezone: z.string(),
  /** 完整 UA 字符串，创建时按平台模板生成一次后固定 */
  userAgent: z.string(),
  /** A-Bogus 用的窗口尺寸指纹（17 段，最后一段是 platform），创建时生成一次后固定 */
  windowFingerprint: z.string(),
})

export type DeviceOS = z.infer<typeof DeviceOSSchema>
export type DeviceBrowser = z.infer<typeof DeviceBrowserSchema>
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>

export interface CreateDeviceProfileOptions {
  os?: DeviceOS
  browser?: DeviceBrowser
  browserMajor?: number
  screen?: { width: number; height: number }
  cpuCores?: number
  deviceMemory?: number
  language?: string
  timezone?: string
  /** 传入相同 seed 得到相同 profile，便于调用方持久化后复现 */
  seed?: string
}

/** Mac 的 UA 里 macOS 版本被 Chrome 冻结在 10_15_7 */
const MAC_UA_VERSION = '10_15_7'
const WINDOWS_OS_VERSION = '10'

const SCREENS: Record<DeviceOS, ReadonlyArray<{ width: number; height: number }>> = {
  windows: [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1536, height: 864 },
    { width: 1366, height: 768 },
    { width: 1680, height: 1050 },
  ],
  mac: [
    { width: 1440, height: 900 },
    { width: 1512, height: 982 },
    { width: 1728, height: 1117 },
    { width: 2560, height: 1600 },
    { width: 1920, height: 1080 },
  ],
}

const CPU_CORES = [4, 6, 8, 10, 12, 16]
const DEVICE_MEMORY = [4, 8]

/** 无 seed 时用 Math.random；有 seed 时用 xorshift32，保证同 seed 同结果 */
function makeRandom(seed?: string): () => number {
  if (!seed) return Math.random

  let hash = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0
  }
  let state = hash || 1

  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

function pick<T>(list: ReadonlyArray<T>, random: () => number): T {
  return list[Math.floor(random() * list.length)]
}

function randInt(min: number, max: number, random: () => number): number {
  return min + Math.floor(random() * (max - min + 1))
}

function defaultOS(): DeviceOS {
  return process.platform === 'darwin' ? 'mac' : 'windows'
}

function buildUserAgent(os: DeviceOS, osVersion: string, browser: DeviceBrowser, version: string): string {
  const platform =
    os === 'mac' ? `Macintosh; Intel Mac OS X ${osVersion}` : 'Windows NT 10.0; Win64; x64'
  const edge = browser === 'edge' ? ` Edg/${version}` : ''
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36${edge}`
}

/**
 * 生成 A-Bogus 用的窗口尺寸指纹。
 * 各段与 screen 尺寸联动（innerWidth ≤ screenWidth、availHeight ≤ screenHeight），
 * 最后一段的 platform 与 os 一致。
 */
function buildWindowFingerprint(
  os: DeviceOS,
  screenWidth: number,
  screenHeight: number,
  random: () => number
): string {
  const platform = browserPlatformOf(os)
  // 菜单栏 / 任务栏占用
  const availWidth = screenWidth
  const availHeight = screenHeight - (os === 'mac' ? 25 : 40)
  const screenX = 0
  const screenY = os === 'mac' ? 25 : 0

  const outerWidth = Math.max(1024, availWidth - randInt(0, 160, random))
  const outerHeight = Math.max(600, availHeight - randInt(0, 80, random))
  // 标签栏 + 地址栏高度
  const innerWidth = outerWidth
  const innerHeight = Math.max(400, outerHeight - (os === 'mac' ? 87 : 139))

  return [
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    screenX,
    screenY,
    0,
    0,
    outerWidth,
    outerHeight,
    availWidth,
    availHeight,
    innerWidth,
    innerHeight,
    24,
    24,
    platform,
  ].join('|')
}

/** 随机生成一份自洽的 profile；未指定的字段从常见取值里抽 */
export function createDeviceProfile(opts: CreateDeviceProfileOptions = {}): DeviceProfile {
  const random = makeRandom(opts.seed)

  const os = opts.os ?? defaultOS()
  const browser = opts.browser ?? 'chrome'
  const major = opts.browserMajor ?? randInt(LATEST_CHROME_MAJOR - 2, LATEST_CHROME_MAJOR, random)
  // Chrome UA 已冻结小版本，四段固定为 {major}.0.0.0
  const browserVersion = `${major}.0.0.0`
  const osVersion = os === 'mac' ? MAC_UA_VERSION : WINDOWS_OS_VERSION
  const screen = opts.screen ?? pick(SCREENS[os], random)

  return DeviceProfileSchema.parse({
    os,
    osVersion,
    browser,
    browserVersion,
    screenWidth: screen.width,
    screenHeight: screen.height,
    cpuCores: opts.cpuCores ?? pick(CPU_CORES, random),
    deviceMemory: Math.min(8, opts.deviceMemory ?? pick(DEVICE_MEMORY, random)),
    language: opts.language ?? 'zh-CN',
    timezone: opts.timezone ?? 'Asia/Hong_Kong',
    userAgent: buildUserAgent(os, osVersion, browser, browserVersion),
    windowFingerprint: buildWindowFingerprint(os, screen.width, screen.height, random),
  })
}

/**
 * 从 UA 字符串反推 profile（兼容旧的 `setConfig({ userAgent })`）。
 * UA 原样保留，其余字段按解析结果派生，无法解析的部分走随机默认值。
 */
export function deviceFromUserAgent(
  ua: string,
  opts: Omit<CreateDeviceProfileOptions, 'os' | 'browser' | 'browserMajor'> = {}
): DeviceProfile {
  const os: DeviceOS = /Macintosh|Mac OS X/.test(ua)
    ? 'mac'
    : /Windows/.test(ua)
      ? 'windows'
      : defaultOS()
  const browser: DeviceBrowser = /Edg\//.test(ua) ? 'edge' : 'chrome'

  const versionMatch = /(?:Edg|Chrome)\/(\d+)(?:\.[\d.]+)?/.exec(ua)
  const major = versionMatch ? Number(versionMatch[1]) : LATEST_CHROME_MAJOR
  const fullVersion = /(?:Edg|Chrome)\/([\d]+(?:\.\d+){3})/.exec(ua)?.[1]
  const macVersion = /Mac OS X ([\d_]+)/.exec(ua)?.[1]

  const base = createDeviceProfile({ ...opts, os, browser, browserMajor: major })

  return {
    ...base,
    osVersion: os === 'mac' ? (macVersion ?? base.osVersion) : base.osVersion,
    browserVersion: fullVersion ?? base.browserVersion,
    userAgent: ua,
  }
}

// ---- 派生 ----

function browserPlatformOf(os: DeviceOS): 'Win32' | 'MacIntel' {
  return os === 'mac' ? 'MacIntel' : 'Win32'
}

export function userAgentOf(p: DeviceProfile): string {
  return p.userAgent
}

export function clientHintsOf(p: DeviceProfile): {
  'Sec-Ch-Ua': string
  'Sec-Ch-Ua-Mobile': '?0'
  'Sec-Ch-Ua-Platform': string
} {
  const major = p.browserVersion.split('.')[0]
  const brand = p.browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome'
  return {
    'Sec-Ch-Ua': `"${brand}";v="${major}", "Chromium";v="${major}", "Not_A Brand";v="24"`,
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': p.os === 'mac' ? '"macOS"' : '"Windows"',
  }
}

export interface WebRequestDeviceParams {
  browser_platform: 'Win32' | 'MacIntel'
  browser_name: 'Chrome' | 'Edge'
  browser_version: string
  browser_language: string
  os_name: 'Windows' | 'Mac OS'
  os_version: string
  pc_libra_divert: 'Windows' | 'Mac'
  screen_width: number
  screen_height: number
  cpu_core_num: number
  device_memory: number
  engine_name: 'Blink'
  engine_version: string
}

export function webRequestParamsOf(p: DeviceProfile): WebRequestDeviceParams {
  return {
    browser_platform: browserPlatformOf(p.os),
    browser_name: p.browser === 'edge' ? 'Edge' : 'Chrome',
    browser_version: p.browserVersion,
    browser_language: p.language,
    os_name: p.os === 'mac' ? 'Mac OS' : 'Windows',
    // 参数里用点号，UA 里用下划线
    os_version: p.os === 'mac' ? p.osVersion.replace(/_/g, '.') : p.osVersion,
    pc_libra_divert: p.os === 'mac' ? 'Mac' : 'Windows',
    screen_width: p.screenWidth,
    screen_height: p.screenHeight,
    cpu_core_num: p.cpuCores,
    device_memory: p.deviceMemory,
    engine_name: 'Blink',
    engine_version: p.browserVersion,
  }
}

export interface WebcastDeviceParams {
  browser_platform: 'Win32' | 'MacIntel'
  browser_name: 'Mozilla'
  browser_version: string
  browser_language: string
  screen_width: number
  screen_height: number
  tz_name: string
}

export function webcastParamsOf(p: DeviceProfile): WebcastDeviceParams {
  return {
    browser_platform: browserPlatformOf(p.os),
    browser_name: 'Mozilla',
    // webcast 的 browser_version 是去掉 "Mozilla/" 前缀的整条 UA
    browser_version: encodeURIComponent(p.userAgent.replace(/^Mozilla\//, '')),
    browser_language: p.language,
    screen_width: p.screenWidth,
    screen_height: p.screenHeight,
    tz_name: p.timezone,
  }
}

/**
 * @deprecated 改用 `createDeviceProfile()` 得到的 `windowFingerprint`（会话内稳定）。
 * 保留旧行为：每次调用返回随机窗口尺寸。
 */
export function generateBrowserFingerprint(platform: string = 'Win32'): string {
  const os: DeviceOS = platform === 'MacIntel' ? 'mac' : 'windows'
  const screen = pick(SCREENS[os], Math.random)
  const fingerprint = buildWindowFingerprint(os, screen.width, screen.height, Math.random)
  // platform 段沿用调用方传入的原值，保持旧的自由度
  return fingerprint.replace(/\|[^|]*$/, `|${platform}`)
}
