import { afterEach, describe, expect, it, vi } from 'vitest'

import { KuaishouWebApi } from '../src/platforms/kuaishou/api.js'
import { KuaishouLoginError, KuaishouRiskError } from '../src/platforms/kuaishou/errors.js'
import { GQL_VIDEO_DETAIL } from '../src/platforms/kuaishou/graphql.js'
import { KuaishouHandler } from '../src/platforms/kuaishou/handler.js'
import type { KuaishouSigner, SignRequest } from '../src/platforms/kuaishou/rest.js'
import {
  extractPhotoId,
  getLiveUserId,
  getPhotoId,
  getUserId,
  isShortUrl,
  parseKuaishouTarget,
  resolveShortUrl,
} from '../src/platforms/kuaishou/url-parser.js'

const CAPTCHA = 'https://captcha.zt.kuaishou.com/iframe/index.html?captchaSession=abc'
const COOKIE = 'kpf=PC_WEB; kwfv1=KTESTWVALUEF12; userId=9'

interface CallInit {
  method?: string
  headers: Record<string, string>
  body?: string
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function install(responses: unknown[]) {
  const calls: Array<{ url: string; init: CallInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: CallInit = { headers: {} }) => {
      calls.push({ url: String(url), init })
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next ?? ok({ result: 1 })
    })
  )
  return calls
}

function signerOf(sig = 'SIG$HE_1'): { signer: KuaishouSigner; reqs: SignRequest[] } {
  const reqs: SignRequest[] = []
  return {
    reqs,
    signer: {
      async sign(req) {
        reqs.push(req)
        return sig
      },
    },
  }
}

function apiWith(sig = 'SIG$HE_1') {
  const signed = signerOf(sig)
  const api = new KuaishouWebApi({ cookie: COOKIE, signer: signed.signer, kww: undefined })
  return { api, ...signed }
}

describe('KuaishouRestClient 请求形态', () => {
  it('白名单 POST 带 __NS_hxfalcon 与 caver=2，且 $ 不编码', async () => {
    const calls = install([ok({ result: 1, pcursor: 'no_more', feeds: [] })])
    const { api, reqs } = apiWith()
    await api.getProfileFeed('3xuser', '')

    expect(reqs).toHaveLength(1)
    expect(reqs[0].body).toBe('{"user_id":"3xuser","pcursor":"","page":"profile"}')
    expect(calls[0].init.body).toBe(reqs[0].body)
    expect(calls[0].url).toBe(
      'https://www.kuaishou.com/rest/v/profile/feed?__NS_hxfalcon=SIG$HE_1&caver=2'
    )
    expect(calls[0].url).not.toContain('%24')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers.cookie).toBe(COOKIE)
    expect(calls[0].init.headers.kww).toBe('KTESTWVALUEF12')
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/profile/3xuser')
    expect(calls[0].init.headers.origin).toBe('https://www.kuaishou.com')
    expect(calls[0].init.headers['content-type']).toBe('application/json')
    expect(calls[0].init.headers.profile_referer).toBe('')
    expect(Object.keys(calls[0].init.headers)).toEqual([
      'referer',
      'user-agent',
      'accept',
      'content-type',
      'kww',
      'accept-language',
      'cookie',
      'origin',
      'sec-fetch-dest',
      'sec-fetch-mode',
      'sec-fetch-site',
      'profile_referer',
    ])
  })

  it('config.kww 优先于 cookie 里的 kwfv1', async () => {
    const calls = install([ok({ result: 1 })])
    const { signer } = signerOf()
    const api = new KuaishouWebApi({ cookie: COOKIE, signer, kww: 'EXPLICIT' })
    await api.kconfGet()
    expect(calls[0].init.headers.kww).toBe('EXPLICIT')
  })

  it('不在白名单的评论接口不签名，body 键序与 Python 一致', async () => {
    const calls = install([ok({ result: 1, pcursor: 'no_more', rootCommentsV2: [] })])
    const { api, reqs } = apiWith()
    await api.getCommentList('p1', '')
    expect(reqs).toHaveLength(0)
    expect(calls[0].url).toBe('https://www.kuaishou.com/rest/v/photo/comment/list')
    expect(calls[0].init.body).toBe('{"photoId":"p1","pcursor":""}')
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/new-reco')
  })

  it('GET profile/get 签名且没有 content-type / origin', async () => {
    const calls = install([ok({ result: 1, eid: '3xself' })])
    const { api } = apiWith()
    const data = await api.getProfile()
    expect(data.eid).toBe('3xself')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toBe(
      'https://www.kuaishou.com/rest/v/profile/get?__NS_hxfalcon=SIG$HE_1&caver=2'
    )
    expect(calls[0].init.body).toBeUndefined()
    expect(calls[0].init.headers['content-type']).toBeUndefined()
    expect(calls[0].init.headers.origin).toBeUndefined()
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/new-reco')
  })

  it('未传入 signer 时用 LocalSigner，签名里带 $ 和 caver=2', async () => {
    const calls = install([ok({ result: 1, pcursor: 'no_more', feeds: [] })])
    const api = new KuaishouWebApi({ cookie: 'kwfv1=abc' })
    await api.getFeedHot('')
    expect(calls[0].url).toMatch(
      /^https:\/\/www\.kuaishou\.com\/rest\/v\/feed\/hot\?__NS_hxfalcon=.+\$HE_.+&caver=2$/
    )
    expect(calls[0].init.body).toBeUndefined()
    expect(calls[0].init.headers['content-type']).toBeUndefined()
    expect(calls[0].init.headers.kww).toBe('abc')
  })
})

describe('端点 body / referer', () => {
  it('feed/hot 翻页发送 {}', async () => {
    const calls = install([ok({ result: 1, pcursor: '1', feeds: [] })])
    const { api } = apiWith()
    await api.getFeedHot('1')
    expect(calls[0].init.body).toBe('{}')
    expect(calls[0].init.headers['content-type']).toBe('application/json')
    expect(calls[0].url).toContain('__NS_hxfalcon=')
  })

  it('搜索首页与翻页的 body 键不同，关键字按 quote 放进 referer', async () => {
    const calls = install([
      ok({ result: 1, pcursor: '1', searchSessionId: 'sess', feeds: [{ photo: { id: 'a' } }] }),
      ok({ result: 1, pcursor: 'no_more', feeds: [] }),
    ])
    const { api, reqs } = apiWith()
    await api.searchFeed('美食')
    await api.searchFeed('美食', '1', { searchSessionId: 'sess' })
    expect(calls[0].init.body).toBe(
      '{"keyword":"美食","page":"search","webPageArea":"","pcursor":""}'
    )
    expect(reqs[0].body).toBe(calls[0].init.body)
    expect(calls[0].init.headers.referer).toBe(
      'https://www.kuaishou.com/search/video?searchKey=%E7%BE%8E%E9%A3%9F'
    )
    expect(calls[1].init.body).toBe('{"keyword":"美食","pcursor":"1","searchSessionId":"sess"}')
    expect(calls[0].url).toContain('caver=2')
    expect(calls[1].url).toContain('caver=2')
  })

  it('search/user 三个键，且同样用 search/video referer', async () => {
    const calls = install([ok({ result: 1, pcursor: 'no_more' })])
    const { api } = apiWith()
    await api.searchUser('美食', '', '')
    expect(calls[0].url).toContain('/rest/v/search/user?__NS_hxfalcon=')
    expect(calls[0].init.body).toBe('{"keyword":"美食","pcursor":"","searchSessionId":""}')
    expect(calls[0].init.headers.referer).toContain('/search/video?searchKey=')
  })

  it('喜欢 / 私密 / 收藏 / 回放的 body 默认值', async () => {
    const calls = install([
      ok({ result: 1, pcursor: 'no_more' }),
      ok({ result: 1, pcursor: 'no_more' }),
      ok({ result: 1, pcursor: 'no_more' }),
      ok({ result: 1, pcursor: 'no_more' }),
    ])
    const { api } = apiWith()
    await api.getLikedList()
    await api.getPrivateList('', { profileId: '3xself' })
    await api.getCollectList('3xself')
    await api.getPlaybackList('3xself')
    expect(calls[0].init.body).toBe('{"pcursor":"","page":"profile"}')
    expect(calls[0].url).toContain('/rest/v/feed/liked?__NS_hxfalcon=')
    expect(calls[1].init.body).toBe('{"pcursor":"","page":"private"}')
    expect(calls[1].init.headers.referer).toBe('https://www.kuaishou.com/profile/3xself')
    expect(calls[1].url).toContain('caver=2')
    expect(calls[2].init.body).toBe('{"userId":"3xself","pcursor":"","page":"collect"}')
    expect(calls[3].url).toBe('https://www.kuaishou.com/rest/v/live/playBack/list')
    expect(calls[3].init.body).toBe('{"userId":"3xself","pcursor":""}')
  })

  it('关注列表先取本人 eid，relation/fol 本身不签名', async () => {
    const calls = install([
      ok({ result: 1, eid: '3xself' }),
      ok({ result: 1, pcursor: 'no_more', authors: [{ id: 'a' }] }),
    ])
    const { api } = apiWith()
    const page = await api.getRelation(2, '')
    expect(page.authors).toEqual([{ id: 'a' }])
    expect(calls[0].url).toContain('/rest/v/profile/get?__NS_hxfalcon=')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[1].url).toBe('https://www.kuaishou.com/rest/v/relation/fol')
    expect(calls[1].init.body).toBe('{"pcursor":"","ftype":2}')
    expect(calls[1].init.headers.referer).toBe('https://www.kuaishou.com/profile/3xself')
  })

  it('system/configs 与 kconf/get 是空 body POST', async () => {
    const calls = install([ok({ result: 1, a: 1 }), ok({ result: 1, b: 2 })])
    const { api, reqs } = apiWith()
    await api.systemStartup()
    await api.kconfGet({ profileId: '3xself' })
    expect(reqs).toHaveLength(0)
    expect(calls[0].url).toBe('https://www.kuaishou.com/rest/v/system/configs')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBeUndefined()
    expect(calls[0].init.headers['content-type']).toBeUndefined()
    expect(calls[0].init.headers.origin).toBe('https://www.kuaishou.com')
    expect(calls[1].url).toBe('https://www.kuaishou.com/rest/v/kconf/get')
    expect(calls[1].init.headers.referer).toBe('https://www.kuaishou.com/profile/3xself')
    expect(calls[1].init.body).toBeUndefined()
  })

  it('作品详情 GraphQL 只带 photoId 与 page，query 与 Python 一致', async () => {
    const calls = install([
      ok({
        data: {
          visionVideoDetail: {
            status: 1,
            author: { id: 'au', name: '作者' },
            photo: { id: 'ph1', caption: '标题', photoUrl: 'https://cdn/a.mp4' },
          },
        },
      }),
    ])
    const { api, reqs } = apiWith()
    const detail = await api.getWorkInfo('https://www.kuaishou.com/short-video/ph1?from=share')
    expect(detail.photo).toMatchObject({ id: 'ph1' })
    expect(reqs).toHaveLength(0)
    expect(calls[0].url).toBe('https://www.kuaishou.com/graphql')
    expect(calls[0].init.headers.accept).toBe('*/*')
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/short-video/ph1')
    expect(calls[0].init.headers.origin).toBe('https://www.kuaishou.com')
    const raw = calls[0].init.body ?? ''
    expect(
      raw.startsWith(
        '{"operationName":"visionVideoDetail","variables":{"photoId":"ph1","page":"detail"},"query":'
      )
    ).toBe(true)
    expect(JSON.parse(raw).query).toBe(GQL_VIDEO_DETAIL)
  })

  it('关注页 GraphQL 的 variables 键序', async () => {
    const calls = install([
      ok({ data: { kconf: { on: true } } }),
      ok({ data: { checkLogin: true } }),
      ok({ data: { visionProfilePhotoList: { pcursor: 'no_more', feeds: [] } } }),
      ok({ data: { likeData: { feeds: [] } } }),
    ])
    const { api } = apiWith()
    expect(await api.visionLoginConfig()).toEqual({ on: true })
    expect(await api.checkLogin()).toBe(true)
    await api.visionProfilePhotoList()
    await api.likeData({ token: 'abc', st: 7, page: 'follow' })
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/myFollow')
    expect(JSON.parse(calls[0].init.body ?? '').variables).toEqual({
      key: 'frontendExplore.vision.loginConfig',
    })
    expect(JSON.parse(calls[2].init.body ?? '').variables).toEqual({
      pcursor: '',
      page: 'follow',
      profile_referer: '',
    })
    const likeRaw = calls[3].init.body ?? ''
    expect(likeRaw).toContain('"variables":{"token":"abc","st":7,"page":"follow"}')
  })

  it('二级评论与表情 referer', async () => {
    const calls = install([
      ok({
        data: { visionSubCommentList: { pcursor: 'no_more', subComments: [{ commentId: 'c' }] } },
      }),
      ok({ data: { visionBaseEmoticons: { iconUrls: ['https://e/1'] } } }),
    ])
    const { api } = apiWith()
    const sub = await api.getSubCommentList('ph1', 'root1', '')
    expect(sub.subComments).toEqual([{ commentId: 'c' }])
    expect(JSON.parse(calls[0].init.body ?? '').variables).toEqual({
      photoId: 'ph1',
      rootCommentId: 'root1',
      pcursor: '',
    })
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/short-video/ph1')
    await expect(api.getBaseEmoticons('')).rejects.toThrow('Referer')
    const icons = await api.getBaseEmoticons('https://www.kuaishou.com/short-video/ph1')
    expect(icons.iconUrls).toEqual(['https://e/1'])
  })

  it('已下线的接口直接拒绝，不发请求', async () => {
    const calls = install([])
    const { api } = apiWith()
    await expect(api.getProfileUserV2('u')).rejects.toThrow('/rest/v/profile/user/v2')
    await expect(api.getHistoryList()).rejects.toThrow('history/list')
    await expect(api.likeData()).rejects.toThrow('token')
    expect(calls).toHaveLength(0)
  })
})

describe('翻页在 pcursor=no_more 停止', () => {
  it('getSomeFeedHot 满额即停', async () => {
    const calls = install([ok({ result: 1, pcursor: '1', feeds: [{ id: 1 }, { id: 2 }] })])
    const { api } = apiWith()
    const two = await api.getSomeFeedHot(2)
    expect(two).toEqual([{ id: 1 }, { id: 2 }])
    expect(calls).toHaveLength(1)
    expect(calls[0].init.body).toBeUndefined()
  })

  it('getSomeFeedHot 翻页发送 {}，并在 no_more 后截断', async () => {
    const calls = install([
      ok({ result: 1, pcursor: '1', feeds: [{ id: 1 }, { id: 2 }] }),
      ok({ result: 1, pcursor: 'no_more', feeds: [{ id: 3 }, { id: 4 }] }),
    ])
    const { api } = apiWith()
    const more = await api.getSomeFeedHot(3)
    expect(more).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(calls[0].init.body).toBeUndefined()
    expect(calls[1].init.body).toBe('{}')
    expect(calls).toHaveLength(2)
  })

  it('searchSomeFeed 把上一页 searchSessionId 带回，并在 no_more 停止', async () => {
    const calls = install([
      ok({
        result: 1,
        pcursor: '1',
        searchSessionId: 'sess',
        feeds: [{ photo: { id: 'a', caption: '甲' }, author: { id: 'u', name: 'n' } }],
      }),
      ok({ result: 1, pcursor: 'no_more', feeds: [] }),
    ])
    const { api } = apiWith()
    const items = await api.searchSomeFeed('美食', 10)
    expect(items).toHaveLength(1)
    expect(calls[1].init.body).toBe('{"keyword":"美食","pcursor":"1","searchSessionId":"sess"}')
    expect(calls).toHaveLength(2)
  })

  it('GraphQL 评论认 pcursorV2，no_more 后不再请求', async () => {
    const calls = install([
      ok({
        data: {
          visionCommentList: {
            pcursorV2: 'no_more',
            rootCommentsV2: [{ commentId: 'c1' }],
            rootComments: [],
          },
        },
      }),
    ])
    const { api } = apiWith()
    const comments = await api.getAllCommentGql('ph1', 50)
    expect(comments).toEqual([{ commentId: 'c1' }])
    expect(calls).toHaveLength(1)
    expect(calls[0].init.headers.referer).toBe('https://www.kuaishou.com/short-video/ph1')
  })
})

describe('风控与登录', () => {
  it('data.result=400002 抛 KuaishouRiskError', async () => {
    install([ok({ data: { result: 400002, url: CAPTCHA } })])
    const { api } = apiWith()
    await expect(api.getCommentList('p')).rejects.toBeInstanceOf(KuaishouRiskError)
    install([ok({ data: { result: 400002, url: CAPTCHA } })])
    await expect(api.getCommentList('p')).rejects.toMatchObject({ captchaUrl: CAPTCHA })
  })

  it('顶层 result=400002 同样是风控', async () => {
    install([ok({ result: 400002, url: CAPTCHA })])
    const { api } = apiWith()
    try {
      await api.systemConfigs()
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(KuaishouRiskError)
      expect((error as KuaishouRiskError).captchaUrl).toBe(CAPTCHA)
    }
  })

  it('GraphQL captcha.url + errors 映射成同一错误', async () => {
    install([
      ok({
        errors: [{ message: 'Need captcha' }],
        data: { captcha: { url: CAPTCHA } },
      }),
    ])
    const { api } = apiWith()
    await expect(api.getUserInfo()).rejects.toMatchObject({ captchaUrl: CAPTCHA })
  })

  it('result 109 与 No Login 抛 KuaishouLoginError', async () => {
    install([ok({ result: 109 }), ok({ errors: [{ message: 'No Login' }] })])
    const { api } = apiWith()
    await expect(api.getCommentList('p')).rejects.toBeInstanceOf(KuaishouLoginError)
    await expect(api.checkLogin()).rejects.toBeInstanceOf(KuaishouLoginError)
  })
})

describe('KuaishouHandler', () => {
  const fakeSigner: KuaishouSigner = {
    async sign() {
      return 'SIG$HE_1'
    },
  }

  it('用户作品走 REST，并归一化成 KuaishouWork', async () => {
    const calls = install([
      ok({
        result: 1,
        pcursor: 'no_more',
        feeds: [
          {
            author: { id: 'u1', name: '昵称', headerUrl: 'https://img/a.jpg' },
            photo: {
              id: 'p1',
              caption: '标题',
              photoUrl: 'https://v/a.mp4',
              likeCount: '1.2万',
              timestamp: 1700000000000,
            },
          },
        ],
      }),
    ])
    const handler = new KuaishouHandler({ cookie: COOKIE, signer: fakeSigner })
    const pages = []
    for await (const page of handler.fetchUserWorks('https://www.kuaishou.com/profile/u1', {
      maxCounts: 10,
    })) {
      pages.push(page)
    }
    expect(calls[0].url).toBe(
      'https://www.kuaishou.com/rest/v/profile/feed?__NS_hxfalcon=SIG$HE_1&caver=2'
    )
    expect(calls[0].init.headers.kww).toBe('KTESTWVALUEF12')
    expect(pages[0][0].workId).toBe('p1')
    expect(pages[0][0].workUrl).toBe('https://www.kuaishou.com/short-video/p1')
    expect(pages[0][0].likeCount).toBe(12000)
    expect(pages[0][0].author.nickname).toBe('昵称')
    expect(pages[0][0].videoUrl).toBe('https://v/a.mp4')
  })

  it('fetchUserPostVideos 仍可用，REST 失败时退回 GraphQL', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        n += 1
        if (n === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => {
              throw new Error('down')
            },
          }
        }
        expect(String(url)).toBe('https://www.kuaishou.com/graphql')
        return ok({
          data: {
            visionProfilePhotoList: {
              result: 1,
              pcursor: 'no_more',
              feeds: [{ author: { id: 'u', name: 'n' }, photo: { id: 'p', caption: 'c' } }],
            },
          },
        })
      })
    )
    const handler = new KuaishouHandler({ cookie: 'a=b', signer: fakeSigner })
    const pages = []
    for await (const page of handler.fetchUserPostVideos('u1')) pages.push(page)
    expect(pages[0].feeds[0].photo.id).toBe('p')
    expect(n).toBe(2)
  })

  it('fetchWork / searchWorks / fetchFeedHot / fetchComments 返回归一化或评论页', async () => {
    const calls = install([
      ok({
        data: {
          visionVideoDetail: {
            status: 1,
            author: { id: 'au', name: '作者' },
            photo: { id: 'ph1', caption: '标题', photoUrl: 'https://cdn/a.mp4', likeCount: 3 },
          },
        },
      }),
      ok({
        result: 1,
        pcursor: 'no_more',
        feeds: [
          {
            author: { id: 'u', name: '搜' },
            photo: { id: 's1', caption: '搜到', photoUrl: 'https://cdn/s.mp4' },
          },
        ],
      }),
      ok({
        result: 1,
        pcursor: 'no_more',
        feeds: [
          {
            author: { id: 'u', name: '热' },
            photo: { id: 'h1', caption: '热门', photoUrl: 'https://cdn/h.mp4' },
          },
        ],
      }),
      ok({
        data: {
          visionCommentList: {
            pcursorV2: 'no_more',
            rootCommentsV2: [{ commentId: 'c1', content: '嗨' }],
          },
        },
      }),
    ])
    const handler = new KuaishouHandler({ cookie: COOKIE, signer: fakeSigner })
    const work = await handler.fetchWork('ph1')
    expect(work.workId).toBe('ph1')
    expect(work.author.nickname).toBe('作者')
    expect(work.videoUrl).toBe('https://cdn/a.mp4')

    const searched = []
    for await (const page of handler.searchWorks('美食', { maxCounts: 5 })) searched.push(page)
    expect(searched[0][0].workId).toBe('s1')

    const hot = []
    for await (const page of handler.fetchFeedHot({ maxCounts: 5 })) hot.push(page)
    expect(hot[0][0].workId).toBe('h1')

    const comments = []
    for await (const page of handler.fetchComments('https://www.kuaishou.com/f/ph1', {
      maxCounts: 5,
    })) {
      comments.push(page)
    }
    expect(comments[0]).toEqual([{ commentId: 'c1', content: '嗨' }])
    expect(calls[0].url).toBe('https://www.kuaishou.com/graphql')
    expect(calls[1].url).toContain('/rest/v/search/feed?__NS_hxfalcon=')
    expect(calls[2].url).toContain('/rest/v/feed/hot?__NS_hxfalcon=')
  })

  it('直播主页链接能解析成用户 eid', async () => {
    const calls = install([
      ok({
        data: {
          visionProfile: {
            result: 1,
            userProfile: {
              ownerCount: { fan: 1 },
              profile: { user_id: '3xlive', user_name: '主播' },
            },
          },
        },
      }),
    ])
    const handler = new KuaishouHandler({ cookie: 'a=b', signer: fakeSigner })
    const profile = await handler.fetchUserProfile('https://live.kuaishou.com/u/3xlive')
    expect(profile.userProfile.profile.user_name).toBe('主播')
    expect(JSON.parse(calls[0].init.body ?? '').variables.userId).toBe('3xlive')
  })
})

describe('URL 解析', () => {
  it('覆盖 short-video、/f、profile、直播主页、短链和纯 ID', async () => {
    expect(parseKuaishouTarget('https://www.kuaishou.com/short-video/3xabc')).toEqual({
      kind: 'photo',
      id: '3xabc',
    })
    expect(parseKuaishouTarget('https://www.kuaishou.com/short-video/3xabc?foo=1')).toEqual({
      kind: 'photo',
      id: '3xabc',
    })
    expect(getPhotoId('https://www.kuaishou.com/short-video/3xabc/')).toBe('3xabc')
    expect(parseKuaishouTarget('https://www.kuaishou.com/f/3xfid')).toEqual({
      kind: 'photo',
      id: '3xfid',
    })
    expect(getUserId('https://www.kuaishou.com/profile/3xuser')).toBe('3xuser')
    expect(parseKuaishouTarget('https://www.kuaishou.com/profile/3xuser')).toEqual({
      kind: 'profile',
      id: '3xuser',
    })
    expect(getLiveUserId('https://live.kuaishou.com/u/3xlive')).toBe('3xlive')
    expect(parseKuaishouTarget('https://live.kuaishou.com/u/3xlive?x=1')).toEqual({
      kind: 'live-user',
      id: '3xlive',
    })
    expect(isShortUrl('https://v.kuaishou.com/Abc123')).toBe(true)
    expect(parseKuaishouTarget('https://v.kuaishou.com/Abc123')).toEqual({
      kind: 'short',
      id: 'Abc123',
    })
    expect(parseKuaishouTarget('3xplain')).toEqual({ kind: 'id', id: '3xplain' })
    expect(extractPhotoId('https://www.kuaishou.com/short-video/3xabc?foo=1')).toBe('3xabc')
    expect(extractPhotoId('3xplain')).toBe('3xplain')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        url: 'https://www.kuaishou.com/short-video/3xfromshort',
        ok: true,
      }))
    )
    const finalUrl = await resolveShortUrl('https://v.kuaishou.com/Abc123')
    expect(parseKuaishouTarget(finalUrl)).toEqual({ kind: 'photo', id: '3xfromshort' })
  })
})
