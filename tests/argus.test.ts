import { describe, it, expect, vi, beforeEach } from 'vitest'

// 拦截 crawler 实际发请求的函数，只看请求头，不走网络
const calls: { method: string; headers: Record<string, string> }[] = []
vi.mock('../src/platforms/douyin/client/http.js', () => {
  const respond = { status: 200, data: { status_code: 0 }, headers: new Headers(), url: '', cookies: new Map() }
  return {
    get: vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
      calls.push({ method: 'GET', headers: opts.headers })
      return respond
    }),
    post: vi.fn(async (_url: string, _body: unknown, opts: { headers: Record<string, string> }) => {
      calls.push({ method: 'POST', headers: opts.headers })
      return respond
    }),
  }
})

const { DouyinCrawler } = await import('../src/platforms/douyin/crawler/douyin.js')

/** 预置 msToken，签名时不走网络 */
function crawlerWith(config: ConstructorParameters<typeof DouyinCrawler>[0]): InstanceType<typeof DouyinCrawler> {
  const crawler = new DouyinCrawler(config)
  ;(crawler as unknown as { msToken: string }).msToken = 'TEST_MS_TOKEN'
  return crawler
}

describe('ArgusSecurityPlugin 请求头', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('GET 请求带 x-tt-argus 与 Cookie 里的 UIFID 作为 uifid 头', async () => {
    await crawlerWith({ cookie: 'sessionid=s; UIFID=real; UIFID_TEMP=tmp' }).fetchUserPost('SEC')
    expect(calls[0].headers['x-tt-argus']).toBe('1')
    expect(calls[0].headers.uifid).toBe('real')
  })

  it('POST 请求同样带上', async () => {
    await crawlerWith({ cookie: 'UIFID=real' }).fetchUserCollection()
    expect(calls[0].method).toBe('POST')
    expect(calls[0].headers['x-tt-argus']).toBe('1')
    expect(calls[0].headers.uifid).toBe('real')
  })

  it('没有 UIFID 时用 UIFID_TEMP（真实浏览器就是这么取的）', async () => {
    await crawlerWith({ cookie: 'sessionid=s; UIFID_TEMP=tmp' }).fetchPostDetail('1')
    expect(calls[0].headers.uifid).toBe('tmp')
  })

  it('都没有时不发 uifid 头（避免被当成「有但为空」），x-tt-argus 照发', async () => {
    await crawlerWith({ cookie: 'sessionid=s' }).fetchPostDetail('1')
    expect('uifid' in calls[0].headers).toBe(false)
    expect(calls[0].headers['x-tt-argus']).toBe('1')
  })

  it('setUifid 的值同样用于请求头', async () => {
    const crawler = crawlerWith({ cookie: 'UIFID=real' })
    crawler.setUifid('sampled')
    await crawler.fetchPostDetail('1')
    expect(calls[0].headers.uifid).toBe('sampled')
  })

  it('调用方显式传的同名头不被覆盖', async () => {
    await crawlerWith({ cookie: 'UIFID=real', headers: { 'x-tt-argus': 'custom', uifid: 'mine' } }).fetchPostDetail('1')
    expect(calls[0].headers['x-tt-argus']).toBe('custom')
    expect(calls[0].headers.uifid).toBe('mine')
  })
})
