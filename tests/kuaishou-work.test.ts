import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  KUAISHOU_EXPORT_HEADERS,
  exportWorksToCsv,
  exportWorksToJson,
  normalizeWork,
  normalizeWorks,
  parseCount,
} from '../src/platforms/kuaishou/work.js'
import { KuaishouDownloader } from '../src/platforms/kuaishou/downloader.js'
import type { KuaishouWork } from '../src/platforms/kuaishou/work.js'
import type {
  KuaishouDownloadProgress,
  KuaishouDownloadResult,
} from '../src/platforms/kuaishou/downloader.js'

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kuaishou')

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8')) as unknown
}

function localTime(ms: number): string {
  const date = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

function withoutRaw(work: KuaishouWork): Omit<KuaishouWork, 'raw'> {
  const { raw: _raw, ...rest } = work
  return rest
}

describe('parseCount', () => {
  it('还原万 / w / 亿 / k，并吃掉末尾加号', () => {
    const cases: Array<[unknown, number]> = [
      ['1.2万', 12_000],
      ['74万', 740_000],
      ['3w', 30_000],
      ['3W', 30_000],
      [12345, 12345],
      ['10万+', 100_000],
      ['10万 +', 100_000],
      ['1,234', 1234],
      ['12.3k', 12_300],
      ['3亿', 300_000_000],
      ['', 0],
      [true, 0],
      [false, 0],
      [null, 0],
      [undefined, 0],
      ['abc', 0],
      [12.9, 12],
    ]
    expect(cases.map(([input]) => parseCount(input))).toEqual(cases.map(([, expected]) => expected))
    expect(parseCount('x', -1)).toBe(-1)
  })
})

describe('normalizeWork', () => {
  const rest = loadFixture('rest-feed.json')
  const detail = loadFixture('graphql-detail.json')
  const atlas = loadFixture('atlas-photo.json')
  const manifest = loadFixture('manifest-string.json')

  it('归一化 REST feed：数字计数、comment.us_c、photoUrl 优先于 manifest', () => {
    const work = normalizeWork(rest)
    expect(work.workId).toBe('3xphoto123')
    expect(work.workUrl).toBe('https://www.kuaishou.com/short-video/3xphoto123')
    expect(work.workType).toBe('video')
    expect(work.title).toBe('红烧肉教程 太香了')
    expect(work.caption).toBe(work.title)
    expect(work.desc).toBe(work.title)
    expect(work.duration).toBe(15230)
    expect(work.createTimestamp).toBe(1712345678901)
    expect(work.createTime).toBe(localTime(1712345678901))
    expect(work.likeCount).toBe(12345)
    expect(work.viewCount).toBe(12_000)
    expect(work.commentCount).toBe(88)
    expect(work.shareCount).toBe(30_000)
    expect(work.collectCount).toBe(25_000)
    expect(work.author).toEqual({
      userId: '3xauthor',
      nickname: '美食小当家',
      avatar: 'https://p1.a.yximgs.com/uhead/author.jpg',
      profileUrl: 'https://www.kuaishou.com/profile/3xauthor',
    })
    expect(work.coverUrl).toBe('https://p1.a.yximgs.com/upic/cover.jpg')
    expect(work.videoUrl).toBe('https://v1.kwaicdn.com/ksc1/nowm-h264.mp4')
    expect(work.videoH265Url).toBe('https://v1.kwaicdn.com/ksc1/h265.mp4')
    expect(work.bestManifestUrl).toBe('https://v1.kwaicdn.com/ksc1/1080.mp4')
    expect(work.imageUrls).toEqual([])
    expect(work.tags).toEqual([{ name: '美食', type: '1' }])
    expect(work.raw).toBe(rest)
    expect(normalizeWork(work)).toBe(work)
  })

  it('归一化 GraphQL visionVideoDetail：缩写计数、封面/头像列表、跳过 hidden 档', () => {
    const work = normalizeWork(detail)
    expect(work.workId).toBe('3xgqlphoto')
    expect(work.workType).toBe('video')
    expect(work.likeCount).toBe(740_000)
    expect(work.viewCount).toBe(300_000_000)
    expect(work.commentCount).toBe(100_000)
    expect(work.collectCount).toBe(1234)
    expect(work.shareCount).toBe(0)
    expect(work.duration).toBe(8000)
    expect(work.createTime).toBe(localTime(1700000000000))
    expect(work.coverUrl).toBe('https://p2.a.yximgs.com/upic/gql-cover.jpg')
    expect(work.author.avatar).toBe('https://p2.a.yximgs.com/uhead/gql.jpg')
    expect(work.author.nickname).toBe('旅行博主')
    expect(work.videoUrl).toBe('https://v1.kwaicdn.com/ksc1/gql-h264.mp4')
    expect(work.videoH265Url).toBe('https://v1.kwaicdn.com/ksc1/gql-h265.mp4')
    expect(work.bestManifestUrl).toBe('https://v1.kwaicdn.com/ksc1/gql-1080.mp4')
    expect(work.tags).toEqual([{ name: '旅行', type: 'topic' }, { name: '日常' }])

    const wrapped = normalizeWork({ data: { visionVideoDetail: detail } })
    expect(withoutRaw(wrapped)).toEqual(withoutRaw(work))
    expect(wrapped.raw).toEqual({ data: { visionVideoDetail: detail } })
  })

  it('从 ext_params.atlas 拼出图集地址，图文优先于 photoUrl', () => {
    const work = normalizeWork(atlas)
    expect(work.workType).toBe('image')
    expect(work.likeCount).toBe(12_000)
    expect(work.imageUrls).toEqual([
      'https://tx2.a.yximgs.com/bs2/photo/atlas/a1.jpg',
      'https://tx2.a.yximgs.com/bs2/photo/atlas/a2.webp',
      'https://full.example/a3.png',
    ])
    expect(work.videoUrl).toBe('https://v1.kwaicdn.com/ksc1/atlas-has-video.mp4')
    expect(work.tags).toEqual([{ name: '旅行' }, { name: '摄影' }])
    expect(work.author.profileUrl).toBe('https://www.kuaishou.com/profile/3xatlasuser')
  })

  it('photo.atlas、ext_params 优先，以及单图封面', () => {
    const fromAtlas = normalizeWork({
      photo: {
        id: 'atlas2',
        caption: '直出图集',
        atlas: {
          cdn: 'ali2.a.yximgs.com',
          list: ['bs2/photo/b1.jpg', { url: '/bs2/photo/b2.jpg' }],
        },
      },
      author: { id: 'u2', name: '乙' },
    })
    expect(fromAtlas.workType).toBe('image')
    expect(fromAtlas.imageUrls).toEqual([
      'https://ali2.a.yximgs.com/bs2/photo/b1.jpg',
      'https://ali2.a.yximgs.com/bs2/photo/b2.jpg',
    ])

    const preferExt = normalizeWork({
      photo: {
        id: 'both',
        ext_params: { atlas: { cdn: ['ext.example'], list: ['/e.jpg'] } },
        atlas: { cdn: ['photo.example'], list: ['/p.jpg'] },
      },
      author: { id: 'u', name: '甲' },
    })
    expect(preferExt.imageUrls).toEqual(['https://ext.example/e.jpg'])

    const single = normalizeWork({
      photo: {
        id: 'single1',
        singlePicture: true,
        coverUrl: 'https://p.example/only.jpg',
        caption: '单图',
      },
      author: { id: 'u3', name: '丙' },
    })
    expect(single.workType).toBe('image')
    expect(single.imageUrls).toEqual(['https://p.example/only.jpg'])
  })

  it('解析字符串 manifest，按码率选最高档，H265 不抢 H264 的 bestManifestUrl', () => {
    const work = normalizeWork(manifest)
    expect(work.videoUrl).toBe('https://cdn.example/high.mp4')
    expect(work.bestManifestUrl).toBe('https://cdn.example/high.mp4')
    expect(work.videoH265Url).toBe('https://cdn.example/h265-high.mp4')
    expect(work.workType).toBe('video')
  })

  it('清单兜底：m3u8 换 mp4、全 hidden 仍可用、坏 JSON 不抛错', () => {
    const m3u8 = normalizeWork({
      photo: {
        id: 'm3',
        manifest: {
          adaptationSet: [
            {
              representation: [
                { url: 'https://cdn.example/low.mp4', maxBitrate: 100 },
                {
                  url: 'https://cdn.example/high.m3u8',
                  backupUrl: ['https://cdn.example/high.mp4'],
                  maxBitrate: 5000,
                },
              ],
            },
          ],
        },
      },
      author: { id: 'u', name: 'n' },
    })
    expect(m3u8.videoUrl).toBe('https://cdn.example/high.mp4')

    const hiddenOnly = normalizeWork({
      photo: {
        id: 'h',
        manifest: {
          adaptationSet: [
            {
              representation: [
                { url: 'https://cdn.example/only.mp4', hidden: true, maxBitrate: 10 },
              ],
            },
          ],
        },
      },
      author: { id: 'u', name: 'n' },
    })
    expect(hiddenOnly.videoUrl).toBe('https://cdn.example/only.mp4')

    expect(
      normalizeWork({ photo: { id: 'bad', manifest: '{oops' }, author: { id: 'u', name: 'n' } })
        .videoUrl
    ).toBe('')

    expect(
      normalizeWork({
        photo: { id: 'list', manifest: ['https://cdn.example/a.mp4', 'https://cdn.example/b.mp4'] },
        author: { id: 'u', name: 'n' },
      }).videoUrl
    ).toBe('https://cdn.example/a.mp4')

    expect(
      normalizeWork({
        photo: {
          id: 'mv',
          photoUrl: '',
          mainMvUrls: [{ url: 'https://cdn.example/main.mp4' }],
        },
        author: { id: 'u', name: 'n' },
      }).videoUrl
    ).toBe('https://cdn.example/main.mp4')
  })

  it('计数字段的回退规则与空输入', () => {
    expect(
      normalizeWork({
        photo: { id: 'z', commentCount: 0 },
        comment: { us_c: 9 },
        author: { id: 'u', name: 'n' },
      }).commentCount
    ).toBe(0)
    expect(
      normalizeWork({
        photo: { id: 'z', likeCount: 0, realLikeCount: 5 },
        author: { id: 'u', name: 'n' },
      }).likeCount
    ).toBe(0)
    expect(
      normalizeWork({ photo: { id: 'z', realLikeCount: 5 }, author: { id: 'u', name: 'n' } })
        .likeCount
    ).toBe(5)
    expect(
      normalizeWork({ photo: { id: 'z', forwardCount: '4k' }, author: { id: 'u', name: 'n' } })
        .shareCount
    ).toBe(4000)
    expect(
      normalizeWork({ photo: { id: 99, duration: '15230' }, author: { kwaiId: 'kwai', name: 'n' } })
        .workId
    ).toBe('99')
    expect(
      normalizeWork({
        photo: { id: 't', timestamp: 1_700_000_000 },
        author: { id: 'u', name: 'n' },
      }).createTime
    ).toBe(localTime(1_700_000_000_000))

    const empty = normalizeWork(null)
    expect(empty.workId).toBe('')
    expect(empty.workType).toBe('video')
    expect(empty.likeCount).toBe(0)
    expect(empty.imageUrls).toEqual([])
    expect(normalizeWorks(null)).toEqual([])
    expect(normalizeWorks(undefined)).toEqual([])
  })

  it('normalizeWorks 展开 feeds 和 GraphQL 列表外壳', () => {
    const feeds = normalizeWorks({ feeds: [rest, atlas] })
    expect(feeds.map(item => item.workType)).toEqual(['video', 'image'])
    const page = normalizeWorks({
      data: { visionProfilePhotoList: { feeds: [rest], pcursor: 'no_more' } },
    })
    expect(page).toHaveLength(1)
    expect(page[0]?.workId).toBe('3xphoto123')
  })
})

describe('导出', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-export-'))

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('CSV 带 UTF-8 BOM 和 save_to_xlsx 的列名，JSON 保留结构', () => {
    const rest = normalizeWork(loadFixture('rest-feed.json'))
    const atlas = normalizeWork(loadFixture('atlas-photo.json'))
    const quoted = normalizeWork({
      photo: { id: 'q', caption: '他说"你好",世界' },
      author: { id: 'u', name: 'n' },
    })
    const csvPath = path.join(dir, 'works.csv')
    const jsonPath = path.join(dir, 'nested', 'works.json')
    exportWorksToCsv([rest, atlas, quoted], csvPath)
    exportWorksToJson([rest], jsonPath)

    const buf = fs.readFileSync(csvPath)
    expect(buf.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    const text = buf.toString('utf8').replace(/^\uFEFF/, '')
    expect(text.split(/\r?\n/)[0]).toBe(KUAISHOU_EXPORT_HEADERS.join(','))
    expect(text).toContain('视频')
    expect(text).toContain('图文')
    expect(text).toContain('1712345678901')
    expect(text).toContain('12000')
    expect(text).toContain('"他说""你好"",世界"')
    expect(text).not.toContain('1.2万')

    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as KuaishouWork[]
    expect(parsed[0]?.workId).toBe('3xphoto123')
    expect(parsed[0]?.bestManifestUrl).toBe('https://v1.kwaicdn.com/ksc1/1080.mp4')
  })
})

describe('KuaishouDownloader', () => {
  let dir = ''

  afterEach(() => {
    vi.unstubAllGlobals()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  function tempDir(): string {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-dl-'))
    return dir
  }

  function imageWork(): KuaishouWork {
    return normalizeWork({
      author: { id: 'uid9', name: '昵称甲', headerUrl: 'https://img.example/a.jpg' },
      photo: {
        id: 'wid1',
        caption: '图文标题',
        timestamp: 1712345678901,
        likeCount: 6,
        coverUrl: 'https://cdn.example/cover.jpg',
        ext_params: {
          atlas: {
            cdn: ['tx2.a.yximgs.com'],
            list: ['/bs2/photo/a1.jpg', '/bs2/photo/a2.webp', '/bs2/photo/a3.png'],
          },
        },
      },
    })
  }

  function videoWork(): KuaishouWork {
    return normalizeWork({
      author: { id: 'u 1', name: '张/三', headerUrl: 'https://img.example/a.jpg' },
      photo: {
        id: 'vid001',
        caption: '你好:世界',
        timestamp: 1712345678901,
        likeCount: 3,
        coverUrl: 'https://cdn.example/cover.jpg',
        photoUrl: 'https://cdn.example/clip.mp4',
      },
    })
  }

  function installFetch(): ReturnType<typeof vi.fn> {
    const table: Record<string, [string, string]> = {
      'a1.jpg': ['IMG0', 'image/jpeg'],
      'a2.webp': ['IMG1', 'image/webp'],
      'a3.png': ['IMG2', 'image/png'],
      'cover.jpg': ['COVER', 'image/jpeg'],
      'clip.mp4': ['VVV', 'video/mp4'],
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      for (const [key, [body, type]] of Object.entries(table)) {
        if (url.includes(key)) {
          return new Response(body, { status: 200, headers: { 'content-type': type } })
        }
      }
      return new Response('missing', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  function headerOf(fetchMock: ReturnType<typeof vi.fn>, index = 0): Headers {
    const call = fetchMock.mock.calls[index] as [RequestInfo | URL, RequestInit?]
    return new Headers(call[1]?.headers)
  }

  it('按序保存图文、跳过已存在文件，并写出 detail / info', async () => {
    const base = tempDir()
    const fetchMock = installFetch()
    const work = imageWork()
    const folder = path.join(base, '昵称甲_uid9', '图文标题_wid1')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'image_0.jpg'), 'KEEP')

    const downloader = new KuaishouDownloader({
      downloadPath: base,
      folderize: true,
      cover: true,
      desc: true,
      mediaType: 'all',
      maxConcurrency: 2,
      retries: 2,
      timeout: 5000,
      cookie: 'k=v',
      userAgent: 'TestUA/1.0',
      headers: { 'X-Test': '1' },
    })
    const results = await downloader.downloadWork(work)
    const images = results.filter(item => item.kind === 'image')
    expect(images.map(item => item.index)).toEqual([0, 1, 2])
    expect(images[0]).toMatchObject({ success: true, skipped: true })
    expect(fs.readFileSync(path.join(folder, 'image_0.jpg'), 'utf8')).toBe('KEEP')
    expect(fs.readFileSync(path.join(folder, 'image_1.webp'), 'utf8')).toBe('IMG1')
    expect(fs.readFileSync(path.join(folder, 'image_2.png'), 'utf8')).toBe('IMG2')
    expect(fs.readFileSync(path.join(folder, 'cover.jpg'), 'utf8')).toBe('COVER')
    expect(fs.existsSync(path.join(folder, 'video.mp4'))).toBe(false)

    const detail = fs.readFileSync(path.join(folder, 'detail.txt'), 'utf8')
    expect(detail).toContain('作品id: wid1')
    expect(detail).toContain('作品类型: 图文')
    expect(detail).toContain('作品标题: 图文标题')
    expect(detail).toContain('描述: 图文标题')
    expect(detail).toContain(`图片地址url列表: ${work.imageUrls.join(', ')}`)
    expect(detail).toContain(`上传时间: ${work.createTime}`)
    expect(detail).toContain('用户主页url: https://www.kuaishou.com/profile/uid9')
    expect(detail).toContain('用户id: uid9')
    expect(detail).toContain('昵称: 昵称甲')
    expect(detail).toContain('点赞数量: 6')
    expect(detail).not.toContain('收藏数量')
    expect(detail.endsWith('\n')).toBe(true)

    const info = JSON.parse(fs.readFileSync(path.join(folder, 'info.json'), 'utf8')) as KuaishouWork
    expect(info.workId).toBe('wid1')
    expect(info.raw).toBeUndefined()
    expect(info.author.nickname).toBe('昵称甲')

    const urls = fetchMock.mock.calls.map(call => String((call as [RequestInfo])[0]))
    expect(urls.some(url => url.includes('a1.jpg'))).toBe(false)
    expect(urls.some(url => url.includes('a2.webp'))).toBe(true)
    expect(urls.some(url => url.includes('a3.png'))).toBe(true)
    const headers = headerOf(fetchMock)
    expect(headers.get('referer')).toBe('https://www.kuaishou.com/')
    expect(headers.get('cookie')).toBe('k=v')
    expect(headers.get('user-agent')).toBe('TestUA/1.0')
    expect(headers.get('x-test')).toBe('1')
  })

  it('folderize 时按 Python 目录落视频，否则用命名模板', async () => {
    const base = tempDir()
    installFetch()
    const work = videoWork()
    const progress: KuaishouDownloadProgress[] = []
    const folderized = new KuaishouDownloader({
      downloadPath: base,
      folderize: true,
      onProgress: event => progress.push(event),
      retries: 1,
      timeout: 5000,
    })
    await folderized.downloadWork(work)
    const pythonDir = path.join(base, '张三_u1', '你好世界_vid001')
    expect(fs.readFileSync(path.join(pythonDir, 'video.mp4'), 'utf8')).toBe('VVV')
    expect(fs.readFileSync(path.join(pythonDir, 'cover.jpg'), 'utf8')).toBe('COVER')
    const detail = fs.readFileSync(path.join(pythonDir, 'detail.txt'), 'utf8')
    expect(detail).toContain('作品类型: 视频')
    expect(detail).toContain('作品标题: 你好:世界')
    expect(detail).toContain('视频地址url: https://cdn.example/clip.mp4')
    expect(progress.some(item => item.kind === 'video' && item.downloaded > 0)).toBe(true)

    const flatBase = path.join(base, 'flat')
    const flat = new KuaishouDownloader({
      downloadPath: flatBase,
      folderize: false,
      naming: '{nickname}_{work_id}',
      cover: false,
      retries: 1,
      timeout: 5000,
    })
    await flat.downloadWork(work)
    expect(fs.readFileSync(path.join(flatBase, '张三_vid001', 'video.mp4'), 'utf8')).toBe('VVV')
    expect(fs.existsSync(path.join(flatBase, '张三_vid001', 'cover.jpg'))).toBe(false)
  })

  it('失败会退避重试，耗尽后不留下临时文件', async () => {
    const base = tempDir()
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls += 1
      if (calls === 1) return new Response('no', { status: 503 })
      return new Response('OKVIDEO', { status: 200, headers: { 'content-type': 'video/mp4' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const work = videoWork()
    const downloader = new KuaishouDownloader({
      downloadPath: base,
      folderize: false,
      cover: false,
      desc: false,
      retries: 2,
      timeout: 5000,
    })
    const results = await downloader.downloadWork(work)
    expect(results).toEqual([
      expect.objectContaining({ success: true, kind: 'video', skipped: false }),
    ])
    expect(fs.readFileSync(path.join(base, '张三_vid001', 'video.mp4'), 'utf8')).toBe('OKVIDEO')
    expect(calls).toBe(2)

    calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 }))
    )
    const failed = await new KuaishouDownloader({
      downloadPath: path.join(base, 'fail'),
      folderize: false,
      cover: false,
      desc: true,
      retries: 2,
      timeout: 5000,
    }).downloadWork(work)
    const video = failed.find(item => item.kind === 'video') as KuaishouDownloadResult
    expect(video.success).toBe(false)
    expect(video.error).toContain('HTTP 500')
    const failDir = path.join(base, 'fail', '张三_vid001')
    expect(fs.readdirSync(failDir).filter(name => name.includes('.tmp'))).toEqual([])
    expect(fs.existsSync(path.join(failDir, 'detail.txt'))).toBe(true)
  })

  it('mediaType 过滤掉另一类作品，未知模板字段直接拒绝', async () => {
    const base = tempDir()
    const fetchMock = installFetch()
    const imagesOnly = new KuaishouDownloader({
      downloadPath: path.join(base, 'img'),
      folderize: true,
      mediaType: 'image',
      cover: false,
      desc: false,
      retries: 1,
      timeout: 5000,
    })
    await imagesOnly.downloadWork(videoWork())
    expect(fetchMock).not.toHaveBeenCalled()

    const videosOnly = new KuaishouDownloader({
      downloadPath: path.join(base, 'vid'),
      folderize: true,
      mediaType: 'video',
      cover: false,
      desc: false,
      retries: 1,
      timeout: 5000,
    })
    await videosOnly.downloadWork(imageWork())
    expect(fetchMock).not.toHaveBeenCalled()

    expect(() => new KuaishouDownloader({ naming: '{nope}' })).toThrow(/nope/)
  })

  it('downloadWorks 一次拉下多条', async () => {
    const base = tempDir()
    installFetch()
    const downloader = new KuaishouDownloader({
      downloadPath: base,
      folderize: false,
      cover: false,
      desc: false,
      maxConcurrency: 2,
      retries: 1,
      timeout: 5000,
    })
    const results = await downloader.downloadWorks([imageWork(), videoWork()])
    expect(results.filter(item => item.kind === 'image')).toHaveLength(3)
    expect(results.some(item => item.kind === 'video' && item.success)).toBe(true)
    expect(fs.readFileSync(path.join(base, '昵称甲_wid1', 'image_2.png'), 'utf8')).toBe('IMG2')
    expect(fs.readFileSync(path.join(base, '张三_vid001', 'video.mp4'), 'utf8')).toBe('VVV')
  })
})
