import { describe, it, expect, vi, afterEach } from 'vitest'
import { KuaishouRestClient, RemoteSigner } from './rest.js'
import type { KuaishouSigner } from './rest.js'

const signer: KuaishouSigner = {
  async sign() {
    return 'SIG123'
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('KuaishouRestClient', () => {
  it('用签名器产出的 __NS_hxfalcon 拼 URL，并带登录 Cookie 发请求', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: 1, pcursor: 'no_more', feeds: [] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new KuaishouRestClient({ cookie: 'kuaishou.server.webday7_st=TOKEN', signer })
    const res = await client.call<{ result: number }>('POST', '/rest/v/profile/feed', {
      user_id: 'u1',
      pcursor: '',
      page: 'profile',
    })

    expect(res.result).toBe(1)
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    const url = call[0]
    const init = call[1]
    expect(url).toBe('https://www.kuaishou.com/rest/v/profile/feed?__NS_hxfalcon=SIG123&caver=2')
    expect(init.method).toBe('POST')
    expect(init.headers.Cookie).toContain('kuaishou.server.webday7_st=TOKEN')
    expect(init.body).toBe('{"user_id":"u1","pcursor":"","page":"profile"}')
  })

  it('签名器收到与发送一致的 body 字符串', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ result: 1 }) }))
    )
    const seen: string[] = []
    const spySigner: KuaishouSigner = {
      async sign(req) {
        seen.push(req.body ?? '')
        return 'X'
      },
    }
    const client = new KuaishouRestClient({ cookie: 'c', signer: spySigner })
    await client.call('POST', '/rest/v/profile/feed', { a: 1 })
    expect(seen[0]).toBe('{"a":1}')
  })
})

describe('RemoteSigner', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POST 签名请求到远程服务并返回 hxfalcon', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ hxfalcon: 'HX_REMOTE' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const signer = new RemoteSigner({ endpoint: 'https://dym.test/sign', token: 'T' })
    const sig = await signer.sign({ method: 'POST', path: '/rest/v/profile/feed', body: '{"a":1}' })

    expect(sig).toBe('HX_REMOTE')
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string },
    ]
    expect(call[0]).toBe('https://dym.test/sign')
    expect(call[1].headers.Authorization).toBe('Bearer T')
    expect(JSON.parse(call[1].body)).toEqual({
      method: 'POST',
      path: '/rest/v/profile/feed',
      body: '{"a":1}',
    })
  })

  it('响应缺少 hxfalcon 时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    )
    const signer = new RemoteSigner({ endpoint: 'https://dym.test/sign' })
    await expect(signer.sign({ method: 'GET', path: '/rest/v/profile/get' })).rejects.toThrow(
      'hxfalcon'
    )
  })
})
