import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  KUAISHOU_COOKIE_HINT,
  KuaishouCookieError,
  commentsOutputPath,
  douyinOnlyIgnoredMessage,
  formatKuaishouError,
  formatLiveDanmakuLine,
  kuaishouOnlyIgnoredMessage,
  parseCliCount,
  parseDurationSeconds,
  parseKuaishouExport,
  parseKuaishouMedia,
  resolveCliPlatform,
  resolveKuaishouCookie,
  resolveLiveEid,
  runKuaishouComments,
  runKuaishouDownload,
  runKuaishouHot,
  runKuaishouLive,
  runKuaishouSearch,
  runKuaishouUser,
  type CliLog,
  type KuaishouCliDeps,
  type KuaishouWorkSource,
  type LiveSession,
} from '../src/cli/kuaishou.js'
import type { KuaishouDownloaderConfig } from '../src/platforms/kuaishou/downloader.js'
import { KuaishouLoginError, KuaishouRiskError } from '../src/platforms/kuaishou/errors.js'
import type { KuaishouWork } from '../src/platforms/kuaishou/work.js'

const PHOTO = 'https://www.kuaishou.com/short-video/3xabc'
const PROFILE = 'https://www.kuaishou.com/profile/3xeid'
const LIVE = 'https://live.kuaishou.com/u/3xeid'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pdl-ks-cli-'))
  dirs.push(dir)
  return dir
}

function recordLog(): { lines: string[]; log: CliLog } {
  const lines: string[] = []
  const log: CliLog = {
    start: message => lines.push(`start:${message}`),
    info: message => lines.push(`info:${message}`),
    success: message => lines.push(`success:${message}`),
    warn: message => lines.push(`warn:${message}`),
    error: message => lines.push(`error:${message}`),
  }
  return { lines, log }
}

function fakeWork(workId: string, workType: 'video' | 'image' = 'video'): KuaishouWork {
  return {
    workId,
    workUrl: `https://www.kuaishou.com/short-video/${workId}`,
    workType,
    title: `标题${workId}`,
    caption: `标题${workId}`,
    desc: `描述${workId}`,
    duration: 1000,
    createTime: '2026-10-25 00:00:00',
    createTimestamp: 1,
    likeCount: 1,
    commentCount: 2,
    viewCount: 3,
    shareCount: 4,
    collectCount: 5,
    author: {
      userId: 'user',
      nickname: '昵称',
      avatar: '',
      profileUrl: PROFILE,
    },
    coverUrl: '',
    videoUrl: 'https://cdn.example/v.mp4',
    videoH265Url: '',
    bestManifestUrl: '',
    imageUrls: [],
    tags: [],
    raw: { id: workId },
  }
}

function source(partial: Partial<KuaishouWorkSource> = {}): KuaishouWorkSource {
  return {
    fetchWork: async () => {
      throw new Error('fetchWork 不应被调用')
    },
    fetchUserWorks: async function* () {
      throw new Error('fetchUserWorks 不应被调用')
    },
    searchWorks: async function* () {
      throw new Error('searchWorks 不应被调用')
    },
    fetchFeedHot: async function* () {
      throw new Error('fetchFeedHot 不应被调用')
    },
    fetchComments: async function* () {
      throw new Error('fetchComments 不应被调用')
    },
    ...partial,
  }
}

function deps(extra: KuaishouCliDeps = {}): KuaishouCliDeps & { lines: string[] } {
  const recorded = recordLog()
  return { env: {}, lines: recorded.lines, ...extra, log: extra.log ?? recorded.log }
}

describe('快手 CLI Cookie 与平台分发', () => {
  it('显式 Cookie 优先于 KS_COOKIES，空白则退回环境变量', () => {
    expect(resolveKuaishouCookie('  from-flag  ', { KS_COOKIES: 'from-env' })).toBe('from-flag')
    expect(resolveKuaishouCookie('   ', { KS_COOKIES: '  from-env  ' })).toBe('from-env')
    expect(resolveKuaishouCookie(undefined, {})).toBe('')
  })

  it('缺少 Cookie 的提示写明 kwfv1、web_st 和 KS_COOKIES', () => {
    expect(KUAISHOU_COOKIE_HINT).toMatch(/kwfv1/)
    expect(KUAISHOU_COOKIE_HINT).toMatch(/kuaishou\.server\.web\*_st/)
    expect(KUAISHOU_COOKIE_HINT).toMatch(/KS_COOKIES/)
    expect(() => resolveKuaishouCookie(undefined, {})).not.toThrow()
    try {
      throw new KuaishouCookieError()
    } catch (error) {
      expect(error).toBeInstanceOf(KuaishouCookieError)
      expect(formatKuaishouError(error)).toBe(KUAISHOU_COOKIE_HINT)
    }
  })

  it('快手链接走快手，抖音和未识别链接保持抖音', () => {
    expect(resolveCliPlatform(PHOTO)).toBe('kuaishou')
    expect(resolveCliPlatform('https://v.kuaishou.com/abc')).toBe('kuaishou')
    expect(resolveCliPlatform(LIVE)).toBe('kuaishou')
    expect(resolveCliPlatform('https://v.douyin.com/abc')).toBe('douyin')
    expect(resolveCliPlatform('https://www.iesdouyin.com/share/video/1')).toBe('douyin')
    expect(resolveCliPlatform('https://example.com/not-a-video')).toBe('douyin')
  })

  it('抖音专用选项和快手专用选项会生成忽略提示', () => {
    expect(douyinOnlyIgnoredMessage({})).toBeUndefined()
    expect(douyinOnlyIgnoredMessage({ music: true, deviceOs: 'mac' })).toMatch(/--music/)
    expect(douyinOnlyIgnoredMessage({ deviceSeed: 's' })).toMatch(/--device-seed/)
    expect(kuaishouOnlyIgnoredMessage({})).toBeUndefined()
    expect(kuaishouOnlyIgnoredMessage({ media: 'video', exportAs: 'csv' })).toMatch(/--media/)
    expect(kuaishouOnlyIgnoredMessage({ exportAs: 'json' })).toMatch(/--export/)
  })

  it('登录和风控错误有单独的说明', () => {
    expect(formatKuaishouError(new KuaishouLoginError())).toMatch(/109/)
    expect(formatKuaishouError(new KuaishouLoginError())).toMatch(/kwfv1/)
    const risk = formatKuaishouError(
      new KuaishouRiskError('https://captcha.example/iframe', { result: 400002 })
    )
    expect(risk).toMatch(/400002/)
    expect(risk).toMatch(/https:\/\/captcha\.example\/iframe/)
    expect(risk).not.toMatch(/at /)
    expect(formatKuaishouError(new Error('普通错误'))).toBe('普通错误')
  })

  it('解析 media、export、数量和时长', () => {
    expect(parseKuaishouMedia(undefined)).toBe('all')
    expect(parseKuaishouMedia('video')).toBe('video')
    expect(() => parseKuaishouMedia('audio')).toThrow(/--media/)
    expect(parseKuaishouExport(undefined)).toBeUndefined()
    expect(parseKuaishouExport('csv')).toBe('csv')
    expect(() => parseKuaishouExport('xlsx')).toThrow(/--export/)
    expect(parseCliCount(undefined, 20)).toBe(20)
    expect(parseCliCount('0', 20)).toBe(0)
    expect(parseCliCount('-1', 20)).toBe(20)
    expect(parseDurationSeconds(undefined)).toBeUndefined()
    expect(parseDurationSeconds('1.5')).toBe(1.5)
    expect(() => parseDurationSeconds('0')).toThrow(/--duration/)
  })
})

describe('快手 CLI 作品命令', () => {
  it('下载单个作品：Cookie 用 -c，并按 --media / --export 执行', async () => {
    const dir = tempDir()
    const seen: KuaishouDownloaderConfig[] = []
    const { log } = deps()
    const work = await runKuaishouDownload(
      PHOTO,
      { cookie: 'from-flag', output: dir, media: 'video', exportAs: 'csv', cover: true },
      {
        env: { KS_COOKIES: 'from-env' },
        log,
        createHandler: cookie => {
          expect(cookie).toBe('from-flag')
          return source({ fetchWork: async () => fakeWork('3xabc') })
        },
        createDownloader: config => {
          seen.push(config)
          return { downloadWork: async () => [{ success: true, kind: 'video' }] }
        },
      }
    )
    expect(work.workId).toBe('3xabc')
    expect(seen[0]?.cookie).toBe('from-flag')
    expect(seen[0]?.mediaType).toBe('video')
    expect(seen[0]?.cover).toBe(true)
    expect(seen[0]?.desc).toBe(false)
    const csv = readFileSync(join(dir, 'kuaishou-works.csv'), 'utf8')
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('3xabc')
  })

  it('没有 Cookie 时不创建 handler', async () => {
    let called = false
    await expect(
      runKuaishouDownload(
        PHOTO,
        { output: tempDir() },
        {
          env: {},
          log: recordLog().log,
          createHandler: () => {
            called = true
            return source()
          },
        }
      )
    ).rejects.toBeInstanceOf(KuaishouCookieError)
    expect(called).toBe(false)
  })

  it('空白 -c 退回 KS_COOKIES', async () => {
    const dir = tempDir()
    await runKuaishouDownload(
      'https://v.kuaishou.com/short',
      { cookie: '   ', output: dir },
      {
        env: { KS_COOKIES: 'env-cookie' },
        log: recordLog().log,
        createHandler: cookie => {
          expect(cookie).toBe('env-cookie')
          return source({
            fetchWork: async url => {
              expect(url).toContain('v.kuaishou.com')
              return fakeWork('short')
            },
          })
        },
        createDownloader: () => ({
          downloadWork: async () => [{ success: true, kind: 'video' }],
        }),
      }
    )
  })

  it('主页和直播链接不能当作单个作品下载', async () => {
    await expect(
      runKuaishouDownload(PROFILE, { cookie: 'c' }, { env: {}, log: recordLog().log })
    ).rejects.toThrow(/pdl user/)
    await expect(
      runKuaishouDownload(LIVE, { cookie: 'c' }, { env: {}, log: recordLog().log })
    ).rejects.toThrow(/ks live/)
  })

  it('登录失败从 handler 原样抛出', async () => {
    await expect(
      runKuaishouDownload(
        PHOTO,
        { cookie: 'c', output: tempDir() },
        {
          env: {},
          log: recordLog().log,
          createHandler: () =>
            source({
              fetchWork: async () => {
                throw new KuaishouLoginError()
              },
            }),
        }
      )
    ).rejects.toBeInstanceOf(KuaishouLoginError)
  })

  it('有文件失败时命令失败', async () => {
    await expect(
      runKuaishouDownload(
        PHOTO,
        { cookie: 'c', output: tempDir() },
        {
          env: {},
          log: recordLog().log,
          createHandler: () => source({ fetchWork: async () => fakeWork('3xabc') }),
          createDownloader: () => ({
            downloadWork: async () => [{ success: false, kind: 'video', error: 'HTTP 403' }],
          }),
        }
      )
    ).rejects.toThrow(/1 个文件下载失败/)
  })

  it('用户作品把数量传给 handler，作品链接会被拒绝', async () => {
    const dir = tempDir()
    const ids: string[] = []
    await expect(
      runKuaishouUser(PHOTO, { cookie: 'c' }, { env: {}, log: recordLog().log })
    ).rejects.toThrow(/pdl download/)

    const works = await runKuaishouUser(
      PROFILE,
      { cookie: 'c', number: '2', output: dir, exportAs: 'json', desc: true },
      {
        env: {},
        log: recordLog().log,
        createHandler: () =>
          source({
            fetchUserWorks: async function* (_url, options) {
              expect(options?.maxCounts).toBe(2)
              yield [fakeWork('a')]
              yield [fakeWork('b')]
            },
          }),
        createDownloader: config => {
          expect(config.desc).toBe(true)
          return {
            downloadWork: async work => {
              ids.push(work.workId)
              return [{ success: true, kind: 'video' }]
            },
          }
        },
      }
    )
    expect(works.map(item => item.workId)).toEqual(['a', 'b'])
    expect(ids).toEqual(['a', 'b'])
    const json = JSON.parse(readFileSync(join(dir, 'kuaishou-works.json'), 'utf8')) as Array<{
      workId: string
    }>
    expect(json.map(item => item.workId)).toEqual(['a', 'b'])
  })

  it('空关键词在请求前失败', async () => {
    await expect(
      runKuaishouSearch('  ', { cookie: 'c' }, { env: {}, log: recordLog().log })
    ).rejects.toThrow(/关键词/)
  })

  it('搜索 --no-download 只导出，不创建下载器', async () => {
    const dir = tempDir()
    let downloaded = false
    const { lines, log } = recordLog()
    const works = await runKuaishouSearch(
      ' 美食 ',
      { cookie: 'c', number: '20', output: dir, download: false, exportAs: 'json' },
      {
        env: {},
        log,
        createHandler: () =>
          source({
            searchWorks: async function* (keyword, options) {
              expect(keyword).toBe('美食')
              expect(options?.maxCounts).toBe(20)
              yield [fakeWork('s1')]
            },
          }),
        createDownloader: () => {
          downloaded = true
          return { downloadWork: async () => [] }
        },
      }
    )
    expect(downloaded).toBe(false)
    expect(works).toHaveLength(1)
    expect(lines.some(line => line.includes('已导出 1 条'))).toBe(true)
    const saved = JSON.parse(readFileSync(join(dir, 'kuaishou-search.json'), 'utf8')) as Array<{
      workId: string
    }>
    expect(saved[0]?.workId).toBe('s1')
  })

  it('搜索默认会下载；不导出时 --no-download 只打印列表', async () => {
    const dir = tempDir()
    const { lines, log } = recordLog()
    let downloaded = 0
    await runKuaishouSearch(
      '猫',
      { cookie: 'c', output: dir },
      {
        env: {},
        log,
        createHandler: () =>
          source({
            searchWorks: async function* () {
              yield [fakeWork('cat')]
            },
          }),
        createDownloader: () => ({
          downloadWork: async () => {
            downloaded += 1
            return [{ success: true, kind: 'video' }]
          },
        }),
      }
    )
    expect(downloaded).toBe(1)

    const listed = recordLog()
    await runKuaishouSearch(
      '猫',
      { cookie: 'c', output: dir, download: false },
      {
        env: {},
        log: listed.log,
        createHandler: () =>
          source({
            searchWorks: async function* () {
              yield [fakeWork('cat2')]
            },
          }),
      }
    )
    expect(listed.lines.some(line => line.includes('cat2'))).toBe(true)
    expect(listed.lines.some(line => line.includes('未下载'))).toBe(true)
  })

  it('推荐流走 fetchFeedHot', async () => {
    const dir = tempDir()
    await runKuaishouHot(
      { cookie: 'c', number: '5', output: dir, download: false, exportAs: 'csv' },
      {
        env: {},
        log: recordLog().log,
        createHandler: () =>
          source({
            fetchFeedHot: async function* (options) {
              expect(options?.maxCounts).toBe(5)
              yield [fakeWork('hot1')]
            },
          }),
      }
    )
    expect(readFileSync(join(dir, 'kuaishou-hot.csv'), 'utf8')).toContain('hot1')
  })

  it('非法 --media 在发请求前失败', async () => {
    let called = false
    await expect(
      runKuaishouHot(
        { cookie: 'c', media: 'audio' },
        {
          env: {},
          log: recordLog().log,
          createHandler: () => {
            called = true
            return source()
          },
        }
      )
    ).rejects.toThrow(/--media/)
    expect(called).toBe(false)
  })
})

describe('快手 CLI 评论与直播', () => {
  it('评论可以写到文件，也可以打到 stdout', async () => {
    const dir = tempDir()
    const file = join(dir, 'out.json')
    const saved = await runKuaishouComments(
      PHOTO,
      { cookie: 'c', number: '2', output: file },
      {
        env: {},
        log: recordLog().log,
        createHandler: () =>
          source({
            fetchComments: async function* (_target, options) {
              expect(options?.maxCounts).toBe(2)
              yield [{ commentId: '1', content: '你好' }]
              yield [{ commentId: '2', content: '世界' }]
            },
          }),
      }
    )
    expect(saved).toHaveLength(2)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(saved)

    const chunks: string[] = []
    await runKuaishouComments(
      '3xabc',
      { cookie: 'c', number: '1' },
      {
        env: {},
        log: recordLog().log,
        writeStdout: text => chunks.push(text),
        createHandler: () =>
          source({
            fetchComments: async function* () {
              yield [{ commentId: '9' }]
            },
          }),
      }
    )
    expect(JSON.parse(chunks.join(''))).toEqual([{ commentId: '9' }])
    expect(commentsOutputPath(join(dir, 'box'))).toBe(join(dir, 'box', 'comments.json'))
  })

  it('解析直播 eid，并打印评论、礼物和点赞', async () => {
    expect(resolveLiveEid(LIVE)).toBe('3xeid')
    expect(resolveLiveEid('  3xeid  ')).toBe('3xeid')
    expect(resolveLiveEid(PROFILE)).toBe('3xeid')
    expect(() => resolveLiveEid(PHOTO)).toThrow(/作品链接/)
    expect(() => resolveLiveEid('https://v.kuaishou.com/abc')).toThrow(/短链/)
    expect(() => parseDurationSeconds('-2')).toThrow(/--duration/)

    expect(
      formatLiveDanmakuLine('comment', {
        payload: { content: 'hello', user: { userName: '甲' } },
      })
    ).toBe('💬 甲: hello')
    expect(
      formatLiveDanmakuLine('gift', {
        payload: { giftId: 9, comboCount: 2, user: { userName: '乙' } },
      })
    ).toBe('🎁 乙 送出礼物 9 x2')
    expect(formatLiveDanmakuLine('like', { payload: { user: { userName: '丙' } } })).toBe(
      '👍 丙 点赞'
    )

    const { lines, log } = recordLog()
    let duration: number | undefined
    let sessionSeen = false
    const handlers = new Map<string, (message: { payload?: unknown }) => void>()
    const session: LiveSession = {
      token: 'tok',
      riskControlled: false,
      on(event, handler) {
        handlers.set(event, handler)
      },
      async run(options) {
        duration = options?.duration
        handlers.get('comment')?.({
          payload: { content: '弹', user: { userName: '甲' } },
        })
        handlers.get('gift')?.({
          payload: { giftId: 3, comboCount: 1, user: { userName: '乙' } },
        })
        handlers.get('like')?.({ payload: { user: { userName: '丙' } } })
        return { frames: 4, comments: 1, likes: 1, gifts: 1 }
      },
      stop() {},
    }
    const stats = await runKuaishouLive(
      LIVE,
      { cookie: 'live-cookie', duration: '12' },
      {
        env: { KS_COOKIES: 'other' },
        log,
        createSession: args => {
          expect(args).toEqual({ eid: '3xeid', cookie: 'live-cookie' })
          return session
        },
        onSession: current => {
          sessionSeen = current === session
        },
      }
    )
    expect(sessionSeen).toBe(true)
    expect(duration).toBe(12)
    expect(stats.comments).toBe(1)
    expect(lines.some(line => line.includes('💬 甲: 弹'))).toBe(true)
    expect(lines.some(line => line.includes('礼物 3'))).toBe(true)
    expect(lines.some(line => line.includes('👍 丙'))).toBe(true)
  })

  it('没有 token 或没有 Cookie 时不会假装连上', async () => {
    await expect(
      runKuaishouLive(
        '3xeid',
        { cookie: 'c' },
        {
          env: {},
          log: recordLog().log,
          createSession: () => ({
            token: '',
            riskControlled: true,
            on() {},
            async run() {
              return { frames: 0, comments: 0, likes: 0, gifts: 0 }
            },
            stop() {},
          }),
        }
      )
    ).rejects.toThrow(/kwfv1/)

    let created = false
    await expect(
      runKuaishouLive(
        '3xeid',
        {},
        {
          env: {},
          log: recordLog().log,
          createSession: () => {
            created = true
            throw new Error('不应创建会话')
          },
        }
      )
    ).rejects.toBeInstanceOf(KuaishouCookieError)
    expect(created).toBe(false)
  })
})
