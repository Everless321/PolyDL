import { describe, it, expect, afterEach } from 'vitest'

import { DouyinCrawler } from '../src/platforms/douyin/crawler/douyin.js'
import { DouyinHandler } from '../src/platforms/douyin/handler/index.js'
import { setConfig } from '../src/platforms/douyin/config/index.js'

const ENDPOINT = 'https://www.douyin.com/aweme/v1/web/aweme/post/'

/** 预置 msToken，签名时不走网络 */
async function sign(crawler: DouyinCrawler): Promise<URLSearchParams> {
  const internal = crawler as unknown as {
    msToken: string
    model2Endpoint: (base: string, params: Record<string, unknown>) => Promise<string>
  }
  internal.msToken = 'TEST_MS_TOKEN'
  const url = await internal.model2Endpoint(ENDPOINT, { sec_user_id: 'SEC', count: 20 })
  return new URL(url).searchParams
}

describe('uifid（ArgusSecurityPlugin 要求的设备参数）', () => {
  afterEach(() => setConfig({ encryption: 'xb' }))

  it.each([
    ['ab', 'a_bogus'],
    ['xb', 'X-Bogus'],
  ] as const)('Cookie 里有 UIFID 时带上同值的 uifid 并参与签名（%s）', async (encryption, signParam) => {
    setConfig({ encryption })
    const query = await sign(new DouyinCrawler({ cookie: 'sessionid=s; UIFID=abc123; UIFID_TEMP=tmp' }))
    expect(query.get('uifid')).toBe('abc123')
    expect(query.get(signParam)).toBeTruthy()
  })

  it('显式传入的 uifid 优先于 Cookie', async () => {
    const query = await sign(new DouyinCrawler({ cookie: 'UIFID=from_cookie', uifid: 'explicit' }))
    expect(query.get('uifid')).toBe('explicit')
  })

  it('既没传也不在 Cookie 里时不带 uifid，不能退而用 UIFID_TEMP', async () => {
    const query = await sign(new DouyinCrawler({ cookie: 'sessionid=s; UIFID_TEMP=tmp' }))
    expect(query.has('uifid')).toBe(false)
  })

  it('setUifid 之后的请求使用新值，传 null 恢复为读 Cookie', async () => {
    const crawler = new DouyinCrawler({ cookie: 'UIFID=from_cookie' })
    crawler.setUifid('sampled')
    expect((await sign(crawler)).get('uifid')).toBe('sampled')
    crawler.setUifid(null)
    expect((await sign(crawler)).get('uifid')).toBe('from_cookie')
  })

  it('DouyinHandler 把 uifid 透传给内部 crawler', async () => {
    const handler = new DouyinHandler({ cookie: 'sessionid=s', uifid: 'via_handler' })
    const crawler = (handler as unknown as { crawler: DouyinCrawler }).crawler
    expect((await sign(crawler)).get('uifid')).toBe('via_handler')
  })
})
