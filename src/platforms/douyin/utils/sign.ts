import { getXBogus } from '../algorithm/xbogus.js'
import { getABogus, generateBrowserFingerprint } from '../algorithm/abogus.js'
import { getUserAgent, getEncryption } from '../config/index.js'

export function signWithXBogus(params: string, userAgent?: string): string {
  const ua = userAgent || getUserAgent()
  const result = getXBogus(params, ua)
  return result.params
}

export function signWithABogus(params: string, body: string = '', userAgent?: string): string {
  const ua = userAgent || getUserAgent()
  const fingerprint = generateBrowserFingerprint('Win32')
  const result = getABogus(params, body, {
    userAgent: ua,
    fingerprint,
  })
  return result.params
}

export function signEndpoint(baseEndpoint: string, params: Record<string, unknown>, body: string = ''): string {
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const encryption = getEncryption()
  const separator = baseEndpoint.includes('?') ? '&' : '?'

  if (encryption === 'xb') {
    const signedParams = signWithXBogus(paramStr)
    return `${baseEndpoint}${separator}${signedParams}`
  }

  const signedParams = signWithABogus(paramStr, body)
  return `${baseEndpoint}${separator}${signedParams}`
}

export function xbogusStr2Endpoint(userAgent: string, endpoint: string): string {
  const result = getXBogus(endpoint, userAgent)
  return result.params
}

export function xbogusModel2Endpoint(
  userAgent: string,
  baseEndpoint: string,
  params: Record<string, unknown>
): string {
  if (typeof params !== 'object' || params === null) {
    throw new TypeError('参数必须是对象类型')
  }

  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const result = getXBogus(paramStr, userAgent)
  const separator = baseEndpoint.includes('?') ? '&' : '?'

  return `${baseEndpoint}${separator}${paramStr}&X-Bogus=${result.xbogus}`
}

export function abogusStr2Endpoint(userAgent: string, params: string, body: string = ''): string {
  const fingerprint = generateBrowserFingerprint('Win32')
  const result = getABogus(params, body, {
    userAgent,
    fingerprint,
  })
  return result.params
}

export function abogusModel2Endpoint(
  userAgent: string,
  baseEndpoint: string,
  params: Record<string, unknown>,
  body: string = ''
): string {
  if (typeof params !== 'object' || params === null) {
    throw new TypeError('参数必须是对象类型')
  }

  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const fingerprint = generateBrowserFingerprint('Win32')
  const result = getABogus(paramStr, body, {
    userAgent,
    fingerprint,
  })

  const separator = baseEndpoint.includes('?') ? '&' : '?'

  return `${baseEndpoint}${separator}${paramStr}&a_bogus=${result.abogus}`
}
