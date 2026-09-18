import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import {
  createDeviceProfile,
  deviceFromUserAgent,
  userAgentOf,
  clientHintsOf,
  webRequestParamsOf,
  webcastParamsOf,
  LATEST_CHROME_MAJOR,
  type DeviceProfile,
} from '../src/platforms/douyin/device/index.js'
import { setConfig, getDevice, getUserAgent } from '../src/platforms/douyin/config/index.js'
import { createUserProfileParams } from '../src/platforms/douyin/model/request.js'
import { DouyinCrawler } from '../src/platforms/douyin/crawler/douyin.js'
import { DouyinDownloader } from '../src/platforms/douyin/downloader/douyin.js'

const LEGACY_EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

/** 一次会话内 profile 必须自洽：UA / Client Hints / 请求参数 / 窗口指纹说的是同一台机器 */
function expectSelfConsistent(p: DeviceProfile): void {
  const ua = userAgentOf(p)
  const hints = clientHintsOf(p)
  const params = webRequestParamsOf(p)
  const major = p.browserVersion.split('.')[0]

  if (p.os === 'mac') {
    expect(ua).toContain('Macintosh')
    expect(hints['Sec-Ch-Ua-Platform']).toBe('"macOS"')
    expect(params.browser_platform).toBe('MacIntel')
    expect(params.os_name).toBe('Mac OS')
    expect(params.pc_libra_divert).toBe('Mac')
  } else {
    expect(ua).toContain('Windows NT 10.0')
    expect(hints['Sec-Ch-Ua-Platform']).toBe('"Windows"')
    expect(params.browser_platform).toBe('Win32')
    expect(params.os_name).toBe('Windows')
    expect(params.pc_libra_divert).toBe('Windows')
  }

  expect(ua).toContain(`Chrome/${p.browserVersion}`)
  expect(hints['Sec-Ch-Ua']).toContain(`v="${major}"`)
  expect(hints['Sec-Ch-Ua']).toContain(p.browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome')
  expect(params.browser_name).toBe(p.browser === 'edge' ? 'Edge' : 'Chrome')
  expect(params.engine_version).toBe(p.browserVersion)

  const fp = p.windowFingerprint.split('|')
  expect(fp).toHaveLength(17)
  expect(fp[16]).toBe(params.browser_platform)
  expect(Number(fp[0])).toBeLessThanOrEqual(params.screen_width)
  expect(Number(fp[11])).toBeLessThanOrEqual(params.screen_height)
  expect(p.deviceMemory).toBeLessThanOrEqual(8)
}

describe('DeviceProfile 自洽性', () => {
  it('随机 profile 的 UA / Client Hints / 请求参数 / 指纹互相对应', () => {
    for (let i = 0; i < 50; i++) {
      expectSelfConsistent(createDeviceProfile())
    }
  })

  it('显式指定平台与浏览器时同样自洽', () => {
    for (const osName of ['mac', 'windows'] as const) {
      for (const browser of ['chrome', 'edge'] as const) {
        expectSelfConsistent(createDeviceProfile({ os: osName, browser }))
      }
    }
  })

  it('mac 的 os_version 参数用点号，UA 用下划线', () => {
    const p = createDeviceProfile({ os: 'mac' })
    expect(p.userAgent).toContain('Mac OS X 10_15_7')
    expect(webRequestParamsOf(p).os_version).toBe('10.15.7')
  })

  it('webcast 参数里的 browser_version 是去掉 Mozilla/ 前缀的整条 UA', () => {
    const p = createDeviceProfile({ os: 'windows', browser: 'edge', browserMajor: 131 })
    expect(decodeURIComponent(webcastParamsOf(p).browser_version)).toBe(
      p.userAgent.replace(/^Mozilla\//, '')
    )
    expect(webcastParamsOf(p).tz_name).toBe(p.timezone)
  })

  it('默认大版本落在 [LATEST-2, LATEST]', () => {
    for (let i = 0; i < 50; i++) {
      const major = Number(createDeviceProfile().browserVersion.split('.')[0])
      expect(major).toBeGreaterThanOrEqual(LATEST_CHROME_MAJOR - 2)
      expect(major).toBeLessThanOrEqual(LATEST_CHROME_MAJOR)
    }
  })
})

describe('DeviceProfile 稳定性', () => {
  it('同一 seed 生成完全相同的 profile', () => {
    expect(createDeviceProfile({ seed: 'machine-id-1' })).toEqual(
      createDeviceProfile({ seed: 'machine-id-1' })
    )
    expect(createDeviceProfile({ seed: 'machine-id-1' })).not.toEqual(
      createDeviceProfile({ seed: 'machine-id-2' })
    )
  })

  it('signWithABogus 在会话内始终用同一份窗口指纹', async () => {
    const seen: string[] = []
    vi.resetModules()
    vi.doMock('../src/platforms/douyin/algorithm/abogus.js', () => ({
      getABogus: (params: string, body: string, opts: { userAgent: string; fingerprint: string }) => {
        seen.push(opts.fingerprint)
        return { params, abogus: 'stub', userAgent: opts.userAgent, body }
      },
    }))
    try {
      const { signWithABogus } = await import('../src/platforms/douyin/utils/sign.js')
      const config = await import('../src/platforms/douyin/config/index.js')
      for (let i = 0; i < 50; i++) signWithABogus('a=1')
      expect(new Set(seen).size).toBe(1)
      expect(seen[0]).toBe(config.getDevice().windowFingerprint)
    } finally {
      vi.doUnmock('../src/platforms/douyin/algorithm/abogus.js')
      vi.resetModules()
    }
  })
})

describe('deviceFromUserAgent 反推', () => {
  it('Mac Chrome', () => {
    const p = deviceFromUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    )
    expect(p.os).toBe('mac')
    expect(p.browser).toBe('chrome')
    expect(p.browserVersion).toBe('142.0.0.0')
    expectSelfConsistent(p)
  })

  it('Windows Edge', () => {
    const p = deviceFromUserAgent(LEGACY_EDGE_UA)
    expect(p.os).toBe('windows')
    expect(p.browser).toBe('edge')
    expect(p.browserVersion).toBe('131.0.0.0')
    expect(userAgentOf(p)).toBe(LEGACY_EDGE_UA)
    expectSelfConsistent(p)
  })
})

describe('请求头与请求参数同源', () => {
  let captured: { url: string; headers: Record<string, string> }[] = []

  beforeEach(() => {
    captured = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        headers[k.toLowerCase()] = v
      }
      captured.push({ url: String(url), headers })
      return new Response(JSON.stringify({ status_code: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function queryOf(url: string): URLSearchParams {
    return new URL(url).searchParams
  }

  async function profileRequest(): Promise<{ url: string; headers: Record<string, string> }> {
    captured = []
    await new DouyinCrawler({ cookie: 'x' }).fetchUserProfile('sec-uid')
    const req = captured.find(r => r.url.includes('/aweme/v1/web/user/profile/other/'))
    expect(req).toBeDefined()
    return req!
  }

  it('UA / Client Hints / URL 参数三处描述同一台设备', async () => {
    for (const device of [
      createDeviceProfile({ os: 'windows', browser: 'edge', seed: 'win-1' }),
      createDeviceProfile({ os: 'mac', browser: 'chrome', seed: 'mac-1' }),
    ]) {
      setConfig({ device })
      const req = await profileRequest()
      const hints = clientHintsOf(device)
      const params = webRequestParamsOf(device)

      expect(req.headers['user-agent']).toBe(device.userAgent)
      expect(req.headers['sec-ch-ua']).toBe(hints['Sec-Ch-Ua'])
      expect(req.headers['sec-ch-ua-platform']).toBe(hints['Sec-Ch-Ua-Platform'])

      const query = queryOf(req.url)
      expect(query.get('browser_platform')).toBe(params.browser_platform)
      expect(query.get('browser_version')).toBe(params.browser_version)
      expect(query.get('os_name')).toBe(params.os_name)
      expect(query.get('screen_width')).toBe(String(params.screen_width))
      expect(query.get('cpu_core_num')).toBe(String(params.cpu_core_num))
    }
  })

  it('两个 crawler 各带各的 device，并发互不串台', async () => {
    const winDevice = createDeviceProfile({ os: 'windows', browser: 'edge', seed: 'inst-win' })
    const macDevice = createDeviceProfile({ os: 'mac', browser: 'chrome', seed: 'inst-mac' })

    await Promise.all([
      new DouyinCrawler({ cookie: 'a', device: winDevice }).fetchUserProfile('u1'),
      new DouyinCrawler({ cookie: 'b', device: macDevice }).fetchUserProfile('u2'),
    ])

    for (const [uid, device] of [
      ['u1', winDevice],
      ['u2', macDevice],
    ] as const) {
      const req = captured.find(r => r.url.includes(`sec_user_id=${uid}`))
      expect(req).toBeDefined()
      expect(req!.headers['user-agent']).toBe(device.userAgent)
      expect(req!.headers['sec-ch-ua']).toBe(clientHintsOf(device)['Sec-Ch-Ua'])
    }
  })
})

describe('兼容旧的 setConfig({ userAgent })', () => {
  it('显式配 Windows Edge 131 时请求参数不漂移', () => {
    setConfig({ userAgent: LEGACY_EDGE_UA })
    expect(getUserAgent()).toBe(LEGACY_EDGE_UA)

    const params = createUserProfileParams('sec-uid')
    expect(params.browser_platform).toBe('Win32')
    expect(params.browser_name).toBe('Edge')
    expect(params.browser_version).toBe('131.0.0.0')
    expect(params.engine_version).toBe('131.0.0.0')
    expect(params.os_name).toBe('Windows')
    expect(params.os_version).toBe('10')
    expect(params.pc_libra_divert).toBe('Windows')
    expect(getDevice().windowFingerprint.split('|')[16]).toBe('Win32')
  })

  it('请求参数字段顺序与改动前一致（query 顺序参与签名）', () => {
    expect(Object.keys(createUserProfileParams('sec-uid'))).toEqual([
      'device_platform',
      'aid',
      'channel',
      'pc_client_type',
      'publish_video_strategy_type',
      'pc_libra_divert',
      'version_code',
      'version_name',
      'cookie_enabled',
      'screen_width',
      'screen_height',
      'browser_language',
      'browser_platform',
      'browser_name',
      'browser_version',
      'browser_online',
      'engine_name',
      'engine_version',
      'os_name',
      'os_version',
      'cpu_core_num',
      'device_memory',
      'platform',
      'downlink',
      'effective_type',
      'round_trip_time',
      'msToken',
      'sec_user_id',
    ])
  })

  it('setConfig({ device }) 后全局 UA 立即跟随', () => {
    const device = createDeviceProfile({ os: 'mac', seed: 'follow' })
    setConfig({ device })
    expect(getUserAgent()).toBe(device.userAgent)
    expect(createUserProfileParams('x').browser_platform).toBe('MacIntel')
  })
})

describe('下载请求头', () => {
  it('HEAD / GET 都带上 device 的 UA 与 Client Hints', async () => {
    const received: Record<string, string>[] = []
    const server = http.createServer((req, res) => {
      received.push(req.headers as Record<string, string>)
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': '4' })
      res.end('test')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polydl-dl-'))

    try {
      const device = createDeviceProfile({ os: 'mac', browser: 'chrome', seed: 'dl' })
      const downloader = new DouyinDownloader({ cookie: 'ck', device })
      const downloadFile = (
        downloader as unknown as {
          downloadFile: (
            url: string,
            basePath: string,
            filename: string,
            extension: string
          ) => Promise<{ success: boolean }>
        }
      ).downloadFile.bind(downloader)

      const result = await downloadFile(`http://127.0.0.1:${port}/v.mp4`, dir, 'v', '.mp4')
      expect(result.success).toBe(true)
      expect(received.length).toBeGreaterThanOrEqual(2)

      for (const headers of received) {
        expect(headers['user-agent']).toBe(device.userAgent)
        expect(headers['sec-ch-ua']).toBe(clientHintsOf(device)['Sec-Ch-Ua'])
        expect(headers['sec-ch-ua-platform']).toBe('"macOS"')
        expect(headers['sec-fetch-dest']).toBe('video')
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
