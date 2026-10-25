import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CAVER,
  CP_PROJECT_INFO,
  DEFAULT_SCRIPTS_LEN,
  DEFAULT_SECS_STACK,
  LIVE_URL_MAP,
  LocalSigner,
  Params,
  RAND_SPAN,
  SDK_VERSION_DEFAULT,
  SDK_VERSION_LIVE,
  Sig3Signer,
  axiosEncode,
  blakeHex,
  buildKwfv1,
  buildKwscode,
  buildSignInput,
  chacha,
  cpNeedSign,
  decodeSig3,
  devicePrefix,
  encodeSig3,
  encodeUri,
  encodeUriComponent,
  generateHxfalcon,
  jsJsonStringify,
  jsNumberToString,
  jsSorted,
  jsToString,
  liveNeedSign,
  liveSignUrl,
  loginNeedSign,
  looksLikeShell,
  needSig3,
  needSign,
  parseQuery,
  request2Md5,
  resetHxfalconSession,
  resetSig3Session,
  serializeSignInput,
  sig3Digest,
  weaponEncrypt,
  type FalconSignInput,
  type HxFalconSignerOptions,
} from '../src/platforms/kuaishou/sign/index.js'
import { HxFalconSigner } from '../src/platforms/kuaishou/sign/falcon.js'

const vectors = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures/kuaishou/sign-vectors.json'),
    'utf8'
  )
) as VectorFile

interface NumCase {
  value?: number
  negZero?: boolean
  intString?: string
  nan?: boolean
  inf?: number
  expected: string
}

interface HxCall {
  path: string
  method: string
  query: Record<string, unknown> | null
  body: unknown
  contentType: string
  projectInfo: Record<string, unknown> | null
  omitEmptyBody: boolean
  nowMs: number
  rand48: number
  expectedSerialize: string
  expected: string
}

interface HxCase extends HxCall {
  startupRandom: number
  count: number
  guardCount: number
  scriptsLen: number
  secsStack: string | null
  sdkVersion: number
}

interface VectorFile {
  defaults: {
    caver: string
    sdkVersion: number
    sdkVersionLive: number
    scriptsLen: number
    secsStack: string
    projectInfo: Record<string, unknown>
  }
  jsval: {
    numbers: NumCase[]
    strings: { value: unknown; expected: string }[]
    json: { value: unknown; expected: string }[]
    sorted: { value: string[]; expected: string[] }[]
    encodeUri: { value: string; expected: string }[]
    encodeUriComponent: { value: string; expected: string }[]
  }
  primitives: {
    blake: { text: string; expected: string }[]
    chacha: { inputHex: string; expectedHex: string }[]
    devicePrefix: {
      scriptsLen: number
      guardCount: number
      secsStack: string
      secsCount: number
      expected: string
    }[]
  }
  hxfalcon: {
    cases: HxCase[]
    sequential: (HxFalconSignerOptions & {
      startupRandom: number
      count: number
      guardCount: number
      scriptsLen: number
      secsStack: string | null
      sdkVersion: number
      calls: HxCall[]
      expectedCount: number
      expectedGuard: number
    })[]
  }
  sig3: {
    samples: {
      sig: string
      plainHex: string
      startupRandom: number
      count: number
      digestHex: string
      build: number
      checksumOk: boolean
      magicHex: string
      versionHex: string
      flagsHex: string
    }[]
    digests: { md5: string; expectedHex: string }[]
    md5: { query: Record<string, unknown> | null; body: unknown; type: string; expected: string; digestHex: string }[]
    sequential: {
      startupRandom: number
      count: number
      calls: { query: Record<string, unknown> | null; body: unknown; type: string; expectedMd5: string; expected: string }[]
      expectedCount: number
    }
    parseQuery: { url: string; expected: Record<string, string> }[]
  }
  kww: {
    weapon: { plain: string; key: string; expected: string }[]
    kwfv1: { href: string; did: string; productName: string; nowMs: number; nonce: string; expected: string }[]
    kwscode: { href: string; secToken: string; did: string; productName: string; nowMs: number; expected: string }[]
    looksLikeShell: { value: string; tag: string; expected: boolean }[]
  }
  axios: {
    values: { value: unknown; expected: string }[]
    query: { pairs: { key: string; value: unknown }[]; expected: string }[]
  }
  flags: {
    needSign: { url: string; expected: boolean }[]
    liveNeedSign: { url: string; expected: boolean }[]
    liveSignUrl: { url: string; expected: string }[]
    loginNeedSign: { url: string; expected: boolean }[]
    cpNeedSign: { url: string; expected: boolean }[]
    needSig3: { url: string; expected: boolean }[]
    whitelist: { sig4: string[]; login: string[]; cp: string[]; live: Record<string, string> }
  }
  meta: { hxfalconCases: number; sig3Calls: number }
}

function asNumber(item: NumCase): number {
  if (item.nan) return Number.NaN
  if (item.inf === 1) return Number.POSITIVE_INFINITY
  if (item.inf === -1) return Number.NEGATIVE_INFINITY
  if (item.negZero) return -0
  if (item.intString != null) return Number(item.intString)
  return item.value as number
}

function signInputOf(call: HxCall): FalconSignInput {
  return buildSignInput(
    call.path,
    call.method,
    call.query,
    call.body,
    call.contentType,
    call.projectInfo,
    call.omitEmptyBody
  )
}

function falconOf(state: {
  startupRandom: number
  count: number
  guardCount: number
  scriptsLen: number
  secsStack: string | null
  sdkVersion: number
}): HxFalconSigner {
  return new HxFalconSigner({
    startupRandom: state.startupRandom,
    count: state.count,
    guardCount: state.guardCount,
    scriptsLen: state.scriptsLen,
    secsStack: state.secsStack ?? vectors.defaults.secsStack,
    sdkVersion: state.sdkVersion,
  })
}

describe('常量与 Python 默认值一致', () => {
  it('caver / SDK / 环境串 / projectInfo', () => {
    expect(CAVER).toBe(vectors.defaults.caver)
    expect(SDK_VERSION_DEFAULT).toBe(vectors.defaults.sdkVersion)
    expect(SDK_VERSION_LIVE).toBe(vectors.defaults.sdkVersionLive)
    expect(DEFAULT_SCRIPTS_LEN).toBe(vectors.defaults.scriptsLen)
    expect(DEFAULT_SECS_STACK).toBe(vectors.defaults.secsStack)
    expect(CP_PROJECT_INFO).toEqual(vectors.defaults.projectInfo)
    expect(vectors.meta.hxfalconCases).toBeGreaterThanOrEqual(40)
  })
})

describe('jsval', () => {
  it('jsNumberToString', () => {
    for (const item of vectors.jsval.numbers) {
      expect(jsNumberToString(asNumber(item)), JSON.stringify(item)).toBe(item.expected)
    }
  })

  it('jsToString / jsJsonStringify / jsSorted / encodeURI', () => {
    for (const item of vectors.jsval.strings) {
      expect(jsToString(item.value)).toBe(item.expected)
    }
    for (const item of vectors.jsval.json) {
      expect(jsJsonStringify(item.value)).toBe(item.expected)
    }
    for (const item of vectors.jsval.sorted) {
      expect(jsSorted(item.value)).toEqual(item.expected)
    }
    for (const item of vectors.jsval.encodeUri) {
      expect(encodeUri(item.value)).toBe(item.expected)
    }
    for (const item of vectors.jsval.encodeUriComponent) {
      expect(encodeUriComponent(item.value)).toBe(item.expected)
    }
  })
})

describe('blake / chacha / devicePrefix', () => {
  it('逐条与 Python 一致', () => {
    for (const item of vectors.primitives.blake) {
      expect(blakeHex(item.text)).toBe(item.expected)
    }
    for (const item of vectors.primitives.chacha) {
      expect(Buffer.from(chacha(Buffer.from(item.inputHex, 'hex'))).toString('hex')).toBe(item.expectedHex)
    }
    for (const item of vectors.primitives.devicePrefix) {
      expect(devicePrefix(item.scriptsLen, item.guardCount, item.secsStack, item.secsCount)).toBe(
        item.expected
      )
    }
  })
})

describe('__NS_hxfalcon', () => {
  it('单次 encode 与序列化逐字节一致', () => {
    for (const item of vectors.hxfalcon.cases) {
      const input = signInputOf(item)
      expect(serializeSignInput(input), item.path).toBe(item.expectedSerialize)
      const signer = falconOf(item)
      expect(signer.encode(input, item.nowMs, item.rand48), item.path).toBe(item.expected)
    }
  })

  it('同一签名器连续调用时 count / guardCount 递增', () => {
    for (const group of vectors.hxfalcon.sequential) {
      const signer = falconOf(group)
      for (const call of group.calls) {
        const input = signInputOf(call)
        expect(serializeSignInput(input)).toBe(call.expectedSerialize)
        expect(signer.encode(input, call.nowMs, call.rand48)).toBe(call.expected)
      }
      expect(signer.count).toBe(group.expectedCount)
      expect(signer.guardCount).toBe(group.expectedGuard)
    }
  })
})

describe('__NS_sig3', () => {
  it('样本可逆、摘要与 md5 一致', () => {
    for (const sample of vectors.sig3.samples) {
      const decoded = decodeSig3(sample.sig)
      expect(decoded.checksumOk).toBe(sample.checksumOk)
      expect(decoded.plainHex).toBe(sample.plainHex)
      expect(decoded.startupRandom).toBe(sample.startupRandom)
      expect(decoded.count).toBe(sample.count)
      expect(decoded.digestHex).toBe(sample.digestHex)
      expect(decoded.build).toBe(sample.build)
      expect(decoded.magicHex).toBe(sample.magicHex)
      expect(decoded.versionHex).toBe(sample.versionHex)
      expect(decoded.flagsHex).toBe(sample.flagsHex)
      expect(encodeSig3(Buffer.from(decoded.plainHex, 'hex'))).toBe(sample.sig)
    }
    for (const item of vectors.sig3.digests) {
      expect(Buffer.from(sig3Digest(item.md5)).toString('hex')).toBe(item.expectedHex)
    }
    for (const item of vectors.sig3.md5) {
      const md5 = request2Md5(item.query, item.body, item.type)
      expect(md5).toBe(item.expected)
      expect(Buffer.from(sig3Digest(md5)).toString('hex')).toBe(item.digestHex)
    }
  })

  it('同一签名器连续 encode', () => {
    const group = vectors.sig3.sequential
    const signer = new Sig3Signer(group.startupRandom, group.count)
    for (const call of group.calls) {
      expect(request2Md5(call.query, call.body, call.type)).toBe(call.expectedMd5)
      expect(signer.encode({ query: call.query, body: call.body, type: call.type })).toBe(call.expected)
    }
    expect(signer.count).toBe(group.expectedCount)
  })

  it('parseQuery', () => {
    for (const item of vectors.sig3.parseQuery) {
      expect(parseQuery(item.url)).toEqual(item.expected)
    }
  })
})

describe('kww / axios', () => {
  it('AES、kwfv1、kwscode、外壳判断', () => {
    for (const item of vectors.kww.weapon) {
      expect(weaponEncrypt(item.plain, item.key)).toBe(item.expected)
    }
    for (const item of vectors.kww.kwfv1) {
      expect(buildKwfv1(item.href, item.did, item.productName, item.nowMs, item.nonce)).toBe(item.expected)
    }
    for (const item of vectors.kww.kwscode) {
      expect(buildKwscode(item.href, item.secToken, item.did, item.productName, item.nowMs)).toBe(
        item.expected
      )
    }
    for (const item of vectors.kww.looksLikeShell) {
      expect(looksLikeShell(item.value, item.tag)).toBe(item.expected)
    }
  })

  it('axios query 编码', () => {
    for (const item of vectors.axios.values) {
      expect(axiosEncode(item.value)).toBe(item.expected)
    }
    for (const row of vectors.axios.query) {
      const params = new Params()
      for (const pair of row.pairs) params.addParam(pair.key, pair.value)
      expect(params.toQueryString()).toBe(row.expected)
      expect(params.toString()).toBe(row.expected)
    }
  })
})

describe('白名单', () => {
  it('needSign / live / login / cp / sig3', () => {
    for (const item of vectors.flags.needSign) expect(needSign(item.url)).toBe(item.expected)
    for (const item of vectors.flags.liveNeedSign) expect(liveNeedSign(item.url)).toBe(item.expected)
    for (const item of vectors.flags.liveSignUrl) expect(liveSignUrl(item.url)).toBe(item.expected)
    for (const item of vectors.flags.loginNeedSign) expect(loginNeedSign(item.url)).toBe(item.expected)
    for (const item of vectors.flags.cpNeedSign) expect(cpNeedSign(item.url)).toBe(item.expected)
    for (const item of vectors.flags.needSig3) expect(needSig3(item.url)).toBe(item.expected)
    expect(LIVE_URL_MAP).toEqual(vectors.flags.whitelist.live)
  })
})

describe('LocalSigner 与 Params 门面', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetHxfalconSession()
    resetSig3Session()
  })

  it('LocalSigner 用 www 的 omitEmptyBody，并在多次 sign 间累加计数', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1735689700456)
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const startupRandom = 1735689600123
    const local = new LocalSigner({ startupRandom, count: 100, guardCount: 100 })
    const req = {
      method: 'POST' as const,
      path: '/rest/v/profile/get',
      body: '{"a":1}',
      query: { user: '中' },
    }
    const first = await local.sign(req)
    const direct = new HxFalconSigner({ startupRandom, count: 100, guardCount: 100 })
    const input = buildSignInput(req.path, req.method, req.query, req.body, 'application/json', null, true)
    const rand = Math.floor(0.25 * RAND_SPAN)
    expect(first).toBe(direct.encode(input, 1735689700456, rand))
    expect(local.falcon.count).toBe(101)
    expect(local.falcon.guardCount).toBe(101)

    const second = await local.sign({ method: 'GET', path: '/rest/v/feed/hot' })
    expect(second).not.toBe(first)
    expect(local.falcon.count).toBe(102)
    const again = new HxFalconSigner({ startupRandom, count: 101, guardCount: 101 })
    const empty = buildSignInput('/rest/v/feed/hot', 'GET', undefined, undefined, 'application/json', null, true)
    expect(second).toBe(again.encode(empty, 1735689700456, rand))
    expect(serializeSignInput(empty)).not.toContain('{}')
  })

  it('withHxfalcon 只给白名单或 force 注入，withCpSign 按接口选 sig3 / sig4', () => {
    const plain = new Params().addParam('a', '1').withHxfalcon('/not-signed')
    expect(plain.get()).toEqual({ a: '1' })

    const forced = new Params()
      .addParam('a', '1')
      .withHxfalcon('/not-signed', 'GET', null, 'application/json', true)
    expect(forced.get().caver).toBe('2')
    expect(String(forced.get().__NS_hxfalcon)).toMatch(/^HUDR_.*\$HE_/)

    const listed = new Params().withKpn().withHxfalcon('/rest/v/profile/get', 'POST', { user: '中文' })
    expect(listed.get().kpn).toBe('KUAISHOU_VISION')
    expect(listed.get().caver).toBe('2')
    expect(String(listed.toQueryString())).toContain('__NS_hxfalcon=')
    expect(String(listed.toQueryString())).toContain('$HE_')

    const sig3 = new Params().withCpSign('/rest/cp/works/v2/common/pc/current/user', { api_ph: 'abc' })
    expect(String(sig3.get().__NS_sig3)).toMatch(/^[0-9a-f]{56}$/)
    expect(sig3.get().__NS_hxfalcon).toBeUndefined()

    const sig4 = new Params().withCpSign('/rest/cp/works/v2/video/pc/submit', { a: 1 })
    expect(String(sig4.get().__NS_hxfalcon)).toMatch(/^HUDR_/)
    expect(sig4.get().caver).toBe('2')
    expect(sig4.get().__NS_sig3).toBeUndefined()
  })

  it('generateHxfalcon 各站默认值能跑通', () => {
    const www = generateHxfalcon({ path: '/rest/v/profile/get', site: 'www' })
    const live = generateHxfalcon({ path: '/rest/k/live/websocket/info', query: { liveStreamId: '1' }, site: 'live' })
    const login = generateHxfalcon({
      path: '/rest/c/infra/ks/qr/start',
      body: { sid: 'kuaishou.server.web' },
      site: 'login',
    })
    const cp = generateHxfalcon({ path: '/rest/cp/works/v2/video/pc/submit', body: { a: 1 }, site: 'cp' })
    for (const sig of [www, live, login, cp]) expect(sig).toMatch(/^HUDR_.*\$HE_/)
    expect(www).not.toBe(live)
  })
})
