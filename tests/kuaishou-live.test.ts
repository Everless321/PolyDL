import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'

import {
  KuaishouLiveClient,
  KuaishouLiveDanmaku,
  createLiveSigner,
  decodeFrame,
  decodeMessage,
  encodeMessage,
  enterRoomFrame,
  extractInitialState,
  heartbeatFrame,
  isRiskControlled,
  liveNeedSign,
  liveSignUrl,
  roomStateFromInitialState,
  roomsFromHomePayload,
  userExitFrame,
  zigzagDecode,
  type LiveHxfalconInput,
  type LiveWebSocketLike,
  type ProtoObject,
} from '../src/platforms/kuaishou/live/index.js'
import vectors from './fixtures/kuaishou/live-vectors.json'

const TS = vectors.timestamp

function hexToBuf(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

describe('live proto', () => {
  it('上行帧与 Python 黄金向量逐字节一致', () => {
    const enter = vectors.enterRoom
    expect(
      enterRoomFrame(enter.token, enter.liveStreamId, {
        pageId: enter.pageId,
        reconnectCount: enter.reconnectCount,
        expTag: enter.expTag,
        attach: enter.attach,
      }).toString('hex')
    ).toBe(enter.hex)
    expect(
      enterRoomFrame(
        vectors.enterRoomMinimal.token,
        vectors.enterRoomMinimal.liveStreamId
      ).toString('hex')
    ).toBe(vectors.enterRoomMinimal.hex)
    expect(heartbeatFrame(vectors.heartbeat.timestamp).toString('hex')).toBe(vectors.heartbeat.hex)
    expect(userExitFrame(vectors.userExit.timestamp).toString('hex')).toBe(vectors.userExit.hex)
  })

  it('SCWebFeedPush 编码与解码对齐 Python（gzip / raw deflate / AES / 明文）', () => {
    expect(encodeMessage(vectors.feedInput as ProtoObject, 'SCWebFeedPush').toString('hex')).toBe(
      vectors.feedBody
    )
    expect(
      encodeMessage(vectors.feedDecoded as unknown as ProtoObject, 'SCWebFeedPush').toString('hex')
    ).toBe(vectors.feedBody)
    for (const key of [
      'feedPushGzip',
      'feedPushAes',
      'feedPushNone',
      'feedPushRawDeflate',
    ] as const) {
      const sample = vectors[key]
      expect(decodeFrame(hexToBuf(sample.hex))).toEqual(sample.decoded)
    }
    expect(decodeFrame(hexToBuf(vectors.enterRoom.hex))).toEqual(vectors.enterRoom.decoded)
    expect(decodeFrame(hexToBuf(vectors.unknownType.hex))).toEqual(vectors.unknownType.decoded)
  })

  it('zigzag、重复字段和未知字段', () => {
    for (const row of vectors.zigzag) {
      expect(zigzagDecode(row.in)).toBe(row.out)
    }
    expect(decodeMessage(hexToBuf(vectors.duplicateTimestamp.hex), 'CSWebHeartbeat')).toEqual(
      vectors.duplicateTimestamp.decoded
    )
    expect(decodeMessage(hexToBuf(vectors.unknownField.hex), 'CSWebHeartbeat')).toEqual(
      vectors.unknownField.decoded
    )
  })
})

const ROOM_HTML = `<!doctype html><script>
window.__INITIAL_STATE__={"liveroom":{"playList":[{"liveStream":{"id":"d_5RccxXoFE","caption":"hello }; world","authToken":undefined,"user":{"name":"内嵌"}},"author":{"id":"3xabc","name":"主播"},"isLiving":true,"note":"brace { inside } string","label":"undefined"}],"extra":void 0},"flag":undefined};
</script>`

describe('initial state', () => {
  it('括号配平并替换裸 undefined / void 0', () => {
    expect(extractInitialState('<html>no state</html>')).toEqual({})
    expect(extractInitialState('window.__INITIAL_STATE__={broken')).toEqual({})
    const state = extractInitialState(ROOM_HTML)
    expect(state.flag).toBeNull()
    const liveroom = state.liveroom as { extra: unknown; playList: Array<Record<string, unknown>> }
    expect(liveroom.extra).toBeNull()
    const liveStream = liveroom.playList[0].liveStream as Record<string, unknown>
    expect(liveStream.caption).toBe('hello }; world')
    expect(liveStream.authToken).toBeNull()
    expect(liveroom.playList[0].label).toBe('undefined')
    expect(liveroom.playList[0].note).toBe('brace { inside } string')
    expect(roomStateFromInitialState(state)).toMatchObject({
      liveStreamId: 'd_5RccxXoFE',
      caption: 'hello }; world',
      isLiving: true,
      author: { id: '3xabc', name: '主播' },
    })
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('KuaishouLiveClient', () => {
  it('未配置 signer 时，需要签名的接口直接抛错', async () => {
    const client = new KuaishouLiveClient({ fetch: async () => jsonResponse({}) })
    await expect(client.websocketInfo('s1', { eid: 'e1' })).rejects.toThrow(/__NS_hxfalcon/)
    expect(liveNeedSign('/live_api/liveroom/websocketinfo?x=1')).toBe(true)
    expect(liveNeedSign('/live_api/liveroom/websocketinfo/extra')).toBe(false)
    expect(liveNeedSign('/live_api/home/list')).toBe(false)
    expect(liveSignUrl('/live_api/liveroom/websocketinfo')).toBe('/rest/k/live/websocket/info')
  })

  it('签名请求排序 query、保留 $，并带上 Referer / kww；GET 不带 Origin', async () => {
    const seen: LiveHxfalconInput[] = []
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return jsonResponse({ data: { result: 1 } })
    }
    const client = new KuaishouLiveClient({
      cookie: 'did=abc; userId=1',
      kww: 'KWW_SNAPSHOT',
      signer: input => {
        seen.push(input)
        return 'HUDR_abc$HE_def'
      },
      fetch: fetchImpl,
    })

    await client.profileFeed('3xabc', { pcursor: '', count: 12 })
    expect(seen[0].path).toBe('/rest/k/feed/profile')
    expect(seen[0].query).toEqual({
      count: 12,
      hasMore: 'true',
      pcursor: '',
      principalId: '3xabc',
      privacy: 'public',
    })
    expect(Object.keys(seen[0].query)).toEqual([
      'count',
      'hasMore',
      'pcursor',
      'principalId',
      'privacy',
    ])
    expect(calls[0].url).toBe(
      'https://live.kuaishou.com/live_api/profile/public?__NS_hxfalcon=HUDR_abc$HE_def&caver=2&count=12&hasMore=true&pcursor=&principalId=3xabc&privacy=public'
    )
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Referer).toBe('https://live.kuaishou.com/profile/3xabc')
    expect(headers.kww).toBe('KWW_SNAPSHOT')
    expect(headers.Cookie).toBe('did=abc; userId=1')
    expect(headers.Origin).toBeUndefined()
    expect(headers['Content-Type']).toBeUndefined()

    await client.websocketInfo('stream1', { eid: '3xabc' })
    expect(seen[1]).toEqual({
      path: '/rest/k/live/websocket/info',
      query: { liveStreamId: 'stream1' },
    })

    await client.commentList('stream1', { eid: '3xabc' })
    expect(seen[2].path).toBe('/rest/k/photo/comment/list')

    await client.playbackList('3xabc', { pcursor: 'next', count: 8 })
    expect(seen[3]).toEqual({
      path: '/rest/k/playback/product/list',
      query: { count: 8, pcursor: 'next', principalId: '3xabc' },
    })
    expect(Object.keys(seen[3].query)).toEqual(['count', 'pcursor', 'principalId'])
  })

  it('未签名接口保持调用方参数顺序，home/list 能抽出并挑出在播房间', async () => {
    const calls: string[] = []
    const home = {
      data: {
        list: [
          {
            gameLiveInfo: [
              {
                liveInfo: [
                  {
                    id: 's-off',
                    caption: 'off',
                    living: false,
                    author: { id: 'e-off', name: 'B', living: false },
                  },
                  {
                    id: '',
                    caption: 'skip',
                    living: true,
                    author: { id: 'no-stream', name: 'Z' },
                  },
                  {
                    id: 's-on',
                    caption: 'on',
                    living: true,
                    author: { id: 'e-on', name: 'A', living: true },
                  },
                ],
              },
            ],
          },
        ],
      },
    }
    const fetchImpl: typeof fetch = async input => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/u/')) return new Response(ROOM_HTML)
      if (url.endsWith('/live_api/home/list')) return jsonResponse(home)
      return jsonResponse({ result: 1, url })
    }
    const client = new KuaishouLiveClient({
      kww: 'KWW',
      fetch: fetchImpl,
      signer: () => 'SIG',
    })

    expect(await client.homeList()).toEqual(home)
    expect(calls[0]).toBe('https://live.kuaishou.com/live_api/home/list')
    const rooms = roomsFromHomePayload(home)
    expect(rooms.map(room => room.eid)).toEqual(['e-off', 'e-on'])
    expect((await client.findLiveRooms()).map(room => room.liveStreamId)).toEqual(['s-on', 's-off'])
    expect((await client.findLiveRoom())?.eid).toBe('e-on')
    expect(await client.findLiveRoom(false)).toMatchObject({ eid: 'e-on' })

    const empty = new KuaishouLiveClient({
      fetch: async () => jsonResponse({ data: { list: [] } }),
    })
    expect(await empty.findLiveRoom()).toBeNull()

    await client.categoryClassify()
    expect(calls.at(-1)).toBe(
      'https://live.kuaishou.com/live_api/category/classify?type=4&source=2&page=1&pageSize=20'
    )
    await client.giftList('s-on', { eid: 'e-on', sortType: 0 })
    expect(calls.at(-1)).toBe(
      'https://live.kuaishou.com/live_api/emoji/gift-list?liveStreamId=s-on&sortType=0'
    )
    await client.liveroomStatus('s-on', { eid: 'e-on' })
    expect(calls.at(-1)).toContain(
      '/live_api/liveroom/status?__NS_hxfalcon=SIG&caver=2&liveStreamId=s-on'
    )
    await client.userInfoById('3xabc')
    expect(calls.at(-1)).toContain(
      '/live_api/baseuser/userinfo/byid?__NS_hxfalcon=SIG&caver=2&principalId=3xabc'
    )

    const state = await client.getRoomState('3xabc')
    expect(state.liveStreamId).toBe('d_5RccxXoFE')
    expect(calls.at(-1)).toBe('https://live.kuaishou.com/u/3xabc')
    expect(isRiskControlled({ data: { result: 2 } })).toBe(true)
    expect(isRiskControlled({ data: { result: 2, token: 't' } })).toBe(false)
  })

  it('createLiveSigner 走 sign/ 的 live 站点（SDK 43469，空 form/requestBody 保留）', async () => {
    const signer = createLiveSigner()
    const calls: string[] = []
    const client = new KuaishouLiveClient({
      signer,
      fetch: async input => {
        calls.push(String(input))
        return jsonResponse({ data: { result: 1, token: 't', websocketUrls: [] } })
      },
    })
    await client.websocketInfo('stream1', { eid: 'e1' })
    const hxfalcon = new URL(calls[0]).searchParams.get('__NS_hxfalcon') ?? ''
    expect(hxfalcon.startsWith('HUDR_')).toBe(true)
    expect(hxfalcon.includes('$HE_')).toBe(true)
    expect(calls[0]).toContain('caver=2')
    expect(calls[0]).toContain('liveStreamId=stream1')
    expect(calls[0].indexOf('__NS_hxfalcon=')).toBeLessThan(calls[0].indexOf('caver=2'))
  })
})

class MockSocket extends EventEmitter implements LiveWebSocketLike {
  readyState = 0
  sent: Buffer[] = []

  constructor(
    readonly url: string,
    private readonly autoOpen: boolean
  ) {
    super()
    if (autoOpen) {
      queueMicrotask(() => {
        if (this.readyState !== 0) return
        this.readyState = 1
        this.emit('open')
      })
    }
  }

  send(data: Buffer | Uint8Array | ArrayBuffer): void {
    this.sent.push(Buffer.from(data instanceof ArrayBuffer ? Buffer.from(data) : data))
  }

  close(): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit('close', 1000, Buffer.alloc(0))
  }

  serverClose(): void {
    this.readyState = 3
    this.emit('close', 1000, Buffer.alloc(0))
  }

  push(data: Buffer): void {
    this.emit('message', data, true)
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > 2000) throw new Error('等待条件超时')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('KuaishouLiveDanmaku', () => {
  it('进房、拆弹幕事件、心跳，并在 stop 时发退房帧', async () => {
    const sockets: MockSocket[] = []
    const comments: string[] = []
    const gifts: number[] = []
    const likes: string[] = []
    const systems: string[] = []
    const raw: string[] = []
    const danmaku = new KuaishouLiveDanmaku({
      eid: '3xabc',
      room: { liveStreamId: 'stream1', isLiving: true },
      minHeartbeatMs: 20,
      now: () => TS,
      sleep: async () => {},
      client: {
        async getRoomState() {
          throw new Error('已有 room，不应再抓 HTML')
        },
        async websocketInfo() {
          return { data: { result: 1, token: 'tok', websocketUrls: ['wss://live.example/ws'] } }
        },
      },
      webSocketFactory: url => {
        const ws = new MockSocket(url, true)
        sockets.push(ws)
        return ws
      },
    })
    danmaku.on('comment', message => comments.push(String(message.payload.content)))
    danmaku.on('gift', message => gifts.push(Number(message.payload.giftId)))
    danmaku.on('like', message => likes.push(String(message.payload.id)))
    danmaku.on('system', message => systems.push(String(message.payload.content)))
    danmaku.on('*', message => raw.push(message.type))

    const running = danmaku.run({ maxReconnect: 0 })
    await waitFor(() => sockets.length === 1 && sockets[0].sent.length >= 1)
    expect(sockets[0].url).toBe('wss://live.example/ws')
    expect(sockets[0].sent[0].toString('hex')).toBe(vectors.enterRoomMinimal.hex)

    const ackBody = encodeMessage({ heartbeatIntervalMs: 20 }, 'SCWebEnterRoomAck')
    sockets[0].push(
      encodeMessage({ payloadType: 300, compressionType: 1, payload: ackBody }, 'SocketMessage')
    )
    sockets[0].push(hexToBuf(vectors.feedPushGzip.hex))
    await waitFor(() => comments.length === 1 && sockets[0].sent.length >= 2)

    expect(comments).toEqual(['你好，世界'])
    expect(gifts).toEqual([9])
    expect(likes).toEqual(['l1'])
    expect(systems).toEqual(['系统通知'])
    expect(raw).toEqual(['SC_ENTER_ROOM_ACK', 'SC_FEED_PUSH'])
    expect(danmaku.stats).toMatchObject({ frames: 2, comments: 1, likes: 1, gifts: 1 })
    expect(
      sockets[0].sent.some(buf => buf.toString('hex') === heartbeatFrame(TS).toString('hex'))
    ).toBe(true)

    danmaku.stop()
    const stats = await running
    expect(stats.comments).toBe(1)
    expect(sockets[0].sent.at(-1)?.toString('hex')).toBe(userExitFrame(TS).toString('hex'))
  })

  it('连不上就换接入点；断线按 reconnectCount 重连，超过上限停止', async () => {
    const sockets: MockSocket[] = []
    let n = 0
    const danmaku = new KuaishouLiveDanmaku({
      eid: '3xabc',
      room: { liveStreamId: 'stream1' },
      now: () => TS,
      sleep: async () => {},
      client: {
        async getRoomState() {
          return {
            liveStreamId: 'ignored',
            author: {},
            caption: '',
            isLiving: true,
            state: {},
          }
        },
        async websocketInfo() {
          return {
            data: { result: 1, token: 'tok', websocketUrls: ['wss://a', 'wss://b'] },
          }
        },
      },
      webSocketFactory: url => {
        n += 1
        const ws = new MockSocket(url, n !== 1)
        sockets.push(ws)
        if (n === 1) queueMicrotask(() => ws.emit('error', new Error('down')))
        return ws
      },
    })

    const running = danmaku.run({ maxReconnect: 1 })
    await waitFor(() => sockets.length >= 2 && sockets[1].sent.length >= 1)
    expect(sockets[0].url).toBe('wss://a')
    expect(sockets[1].url).toBe('wss://b')
    expect(sockets[1].sent[0].toString('hex')).toBe(vectors.enterRoomMinimal.hex)
    sockets[1].serverClose()
    await waitFor(() => sockets.length >= 3 && sockets[2].sent.length >= 1)
    expect(sockets[2].url).toBe('wss://b')
    expect(sockets[2].sent[0].toString('hex')).toBe(
      enterRoomFrame('tok', 'stream1', { reconnectCount: 1 }).toString('hex')
    )
    sockets[2].serverClose()
    await running
    expect(sockets).toHaveLength(3)
  })

  it('websocketinfo 被风控时不重试换票', async () => {
    let calls = 0
    const danmaku = new KuaishouLiveDanmaku({
      eid: '3xabc',
      room: { liveStreamId: 'stream1' },
      client: {
        async getRoomState() {
          throw new Error('不应抓房间')
        },
        async websocketInfo() {
          calls += 1
          return { data: { result: 2 } }
        },
      },
    })
    const stats = await danmaku.run()
    expect(stats.frames).toBe(0)
    expect(danmaku.riskControlled).toBe(true)
    expect(calls).toBe(1)
    expect(danmaku.token).toBe('')
  })
})
